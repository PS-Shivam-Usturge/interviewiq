import { setupInterview, processAnswer, generateAgentReport } from "./interviewAgent.js";
import { getStoredReport } from "./reportAgent.js";
import {
  createSession, getSession, getAnswers,
  saveQuestionBank, updateParsedSummaries,
  advanceQuestion, markFollowUp, saveAnswer, completeSession,
  appendAgentObservations, markConcludedEarly, appendTrace,
  saveInterviewMemory, saveAgentSessionId,
} from "../db/sessionStore.js";
import logger from "../logger.js";

const log = logger.child({ component: "SessionManager" });
const now = () => Math.floor(Date.now() / 1000);

// ── startSession ──────────────────────────────────────────────────────────────
// Called by POST /api/session/start
// The agent drives document parsing + question generation, then returns the first question.

export async function startSession({ jdText, resumeText, jdSummary, resumeSummary, difficulty }) {
  // Create the session immediately so we have an ID for the agent
  const sessionId = await createSession({
    candidateName: resumeSummary?.candidate_name || "Candidate",
    jdText, resumeText,
    jdSummary:    jdSummary    || {},
    resumeSummary: resumeSummary || {},
    difficulty,
  });

  log.info({ sessionId }, "Agent starting session");

  // Hand off to the interview agent — it reasons about the candidate and generates questions
  const result = await setupInterview({
    sessionId,
    jdText,
    resumeText,
    jdSummary,       // pre-parsed by /api/parse (agent reuses, no duplicate LLM call)
    resumeSummary,
    difficulty,
  });

  if (!result.questionBank?.length) {
    throw new Error("Agent failed to generate question bank");
  }

  // Persist the agent's work
  await updateParsedSummaries(
    sessionId,
    result.jdSummary,
    result.resumeSummary,
    result.resumeSummary?.candidate_name,
  );
  await saveQuestionBank(sessionId, result.questionBank);
  await saveInterviewMemory(sessionId, result.memory);
  await saveAgentSessionId(sessionId, result.agentSessionId);

  // Persist agent setup trace
  const setupTrace = [
    { time: now(), phase: "setup", event: "session_started",
      candidate: result.resumeSummary?.candidate_name || "Candidate",
      role: result.jdSummary?.role_title || "Unknown role",
      difficulty, totalQuestions: result.questionBank.length },
    ...(result.toolEvents || []).map(ev => ({
      time: now(), phase: "setup", event: "tool_call",
      tool: ev.tool, reasoning: ev.reasoning || "",
      focusAreas: ev.focusAreas || [],
    })),
  ];
  await appendTrace(sessionId, setupTrace);

  const candidateName = result.resumeSummary?.candidate_name || "Candidate";

  log.info({ sessionId, candidateName, questions: result.questionBank.length }, "Agent ready");
  if (result.agentSummary) {
    log.info({ sessionId, notes: result.agentSummary.slice(0, 120) }, "Agent setup notes");
  }

  for (const ev of result.toolEvents || []) {
    log.info({ tool: ev.tool, reasoning: (ev.reasoning || "").slice(0, 80) }, "Setup tool called");
  }

  return {
    sessionId,
    candidateName,
    totalQuestions: result.questionBank.length,
    currentIndex:   0,
    currentQuestion: result.questionBank[0],
    status: "active",
    agentSetup: {
      // SDK reports MCP tools as mcp__interview_tools__<name>
      focusAreas:   result.toolEvents?.find(e => e.tool.endsWith("generate_question_bank"))?.focusAreas || [],
      agentSummary: result.agentSummary,
      toolEvents:   result.toolEvents,
    },
  };
}

// ── submitAnswer ──────────────────────────────────────────────────────────────
// Called by POST /api/session/:id/answer
// The agent evaluates the answer and decides: follow-up or advance.

export async function submitAnswer({ sessionId, transcript }) {
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status === "completed") throw new Error("Interview already completed");

  const questions       = session.question_bank;
  const currentIndex    = session.current_question_index;
  const currentQuestion = questions[currentIndex];

  if (!currentQuestion) throw new Error("No current question found");

  log.info({ sessionId, questionIndex: currentIndex, category: currentQuestion.category }, "Agent evaluating answer");

  const result = await processAnswer({ sessionId, session, transcript });

  const { evaluation, decision, observations } = result;

  if (!evaluation) throw new Error("Agent did not evaluate the answer");
  if (!decision)   throw new Error("Agent did not make a decision (advance/followup/conclude_early)");

  log.info({ sessionId, action: decision.action, verdict: decision.verdict, reasoning: (decision.reasoning || "").slice(0, 100) }, "Agent decision");

  // Persist any cross-question observations the agent noted
  if (observations?.length) {
    await appendAgentObservations(sessionId, observations);
    log.info({ sessionId, count: observations.length }, "Saved cumulative observations");
  }

  // Persist carried-forward state for the next turn (context engineering + SDK session)
  await saveInterviewMemory(sessionId, result.memory);
  await saveAgentSessionId(sessionId, result.agentSessionId);

  // Persist the answer with agent reasoning embedded in the analysis field
  await saveAnswer({
    sessionId,
    questionIndex:     currentIndex,
    question:          result.askedQuestion || currentQuestion.question,
    questionCategory:  currentQuestion.category,
    transcript,
    scoreTechnical:     evaluation.score_technical     || 0,
    scoreCommunication: evaluation.score_communication || 0,
    scoreDepth:         evaluation.score_depth         || 0,
    overallScore:       evaluation.overall_score       || 0,
    strengthPoints:     evaluation.strength_points     || [],
    gapPoints:          evaluation.gap_points          || [],
    flags:              evaluation.flags               || [],
    analysis:           buildAnalysisText(evaluation, decision),
  });

  // Apply the agent's decision to the session state
  let nextQuestion = null;
  let nextIndex    = currentIndex;
  let isFollowUp   = false;

  if (decision.action === "followup") {
    isFollowUp   = true;
    nextQuestion = {
      id:       `followup_${currentIndex}`,
      index:    currentIndex,
      category: "follow_up",
      question: decision.followUpQuestion,
      intent:   decision.reasoning,
      follow_ups: [],
    };
    await markFollowUp(sessionId, (session.followup_count || 0) + 1);

  } else if (decision.action === "conclude_early") {
    // Agent decided it has seen enough — end the interview now
    nextIndex = questions.length; // signal completion
    await advanceQuestion(sessionId, nextIndex);
    await markConcludedEarly(sessionId);
    log.info({ sessionId, verdict: decision.preliminary_verdict, reasoning: (decision.reasoning || "").slice(0, 80) }, "Agent concluded early");

  } else {
    // advance normally
    nextIndex = currentIndex + 1;
    await advanceQuestion(sessionId, nextIndex);
    nextQuestion = questions[nextIndex] || null;
  }

  const isComplete = !isFollowUp && nextIndex >= questions.length;
  if (isComplete) {
    await completeSession(sessionId);
    log.info({ sessionId }, "Session completed");
  }

  // Persist agent decision trace for this answer
  const answerTrace = [
    { time: now(), phase: "interview", event: "evaluation",
      questionIndex: currentIndex,
      question: result.askedQuestion || currentQuestion.question,
      category: currentQuestion.category,
      scores: {
        technical:     evaluation.score_technical,
        communication: evaluation.score_communication,
        depth:         evaluation.score_depth,
        overall:       evaluation.overall_score,
      },
      flags:    evaluation.flags    || [],
      analysis: evaluation.analysis || "",
    },
    { time: now(), phase: "interview", event: "decision",
      questionIndex: currentIndex,
      action:          decision.action,
      verdict:         decision.verdict          || null,
      reasoning:       decision.reasoning        || "",
      followUpQuestion: decision.action === "followup" ? decision.followUpQuestion : null,
      preliminaryVerdict: decision.preliminary_verdict || null,
    },
    ...(result.observations || []).map(obs => ({
      time: now(), phase: "interview", event: "observation",
      questionIndex: currentIndex,
      severity:    obs.severity,
      observation: obs.observation,
    })),
    ...(isComplete ? [{ time: now(), phase: "interview", event: "session_complete",
      answeredCount: nextIndex, concludedEarly: decision.action === "conclude_early" }] : []),
  ];
  await appendTrace(sessionId, answerTrace);

  return {
    answeredQuestion: currentQuestion.question,
    answerAnalysis: {
      scores: {
        technical:     evaluation.score_technical,
        communication: evaluation.score_communication,
        depth:         evaluation.score_depth,
        overall:       evaluation.overall_score,
      },
      flags:          evaluation.flags,
      analysis:       evaluation.analysis,
      strengthPoints: evaluation.strength_points,
      gapPoints:      evaluation.gap_points,
    },
    agentDecision: {
      action:             decision.action,
      verdict:            decision.verdict            || null,
      reasoning:          decision.reasoning          || null,
      preliminaryVerdict: decision.preliminary_verdict || null,
      followUpQuestion:   decision.action === "followup" ? decision.followUpQuestion : null,
      observations:       observations || [],
      toolEvents:         result.toolEvents,
    },
    isFollowUp,
    isComplete,
    concludedEarly: decision.action === "conclude_early",
    nextQuestion,
    nextIndex,
    progress: {
      current: nextIndex + 1,
      total:   questions.length,
      percent: Math.round((nextIndex / questions.length) * 100),
    },
  };
}

// ── getOrGenerateReport ───────────────────────────────────────────────────────
// Shared by GET /api/report/:id and the A2A get_report skill.
// Throws errors with a `status` property so callers can map them to HTTP/A2A errors.

// Concurrent requests for the same report (e.g. React StrictMode double effects, two HR tabs)
// share one in-flight generation instead of running the agent twice.
const reportsInFlight = new Map();

export function getOrGenerateReport(sessionId) {
  if (!reportsInFlight.has(sessionId)) {
    const job = loadOrGenerateReport(sessionId).finally(() => reportsInFlight.delete(sessionId));
    reportsInFlight.set(sessionId, job);
  }
  return reportsInFlight.get(sessionId);
}

async function loadOrGenerateReport(sessionId) {
  const session = await getSession(sessionId);
  if (!session) throw Object.assign(new Error("Session not found"), { status: 404 });
  if (session.status !== "completed") {
    throw Object.assign(
      new Error("Interview is not yet completed — report cannot be generated until the candidate finishes."),
      { status: 400 },
    );
  }

  // Return cached report immediately — report generation is expensive.
  // The reports table has no name/role columns, so add them from the session.
  const cached = await getStoredReport(sessionId);
  if (cached) {
    return {
      ...cached,
      sessionId,
      candidateName: session.resume_summary?.candidate_name || session.candidate_name,
      roleTitle:     session.jd_summary?.role_title,
    };
  }

  const result = await generateAgentReport({ sessionId, session });
  if (!result.report) throw Object.assign(new Error("Agent did not produce a report"), { status: 500 });

  await appendTrace(sessionId, [
    ...(result.toolEvents || []).map(ev => ({
      time: now(), phase: "report", event: "tool_call",
      tool: ev.tool, reasoning: ev.reasoning || "", focusAreas: [],
    })),
    { time: now(), phase: "report", event: "report_generated",
      recommendation: result.report.recommendation,
      overallScore:   result.report.overall_score,
      confidence:     result.report.confidence,
      headline:       result.report.headline },
  ]);

  return result.report;
}

// ── getSessionState ───────────────────────────────────────────────────────────
// Called by GET /api/session/:id (HR monitor + interview room)

export async function getSessionState(sessionId) {
  const session = await getSession(sessionId);
  if (!session) return null;

  const answers         = await getAnswers(sessionId);
  const questions       = session.question_bank || [];
  // On a page refresh during a follow-up, resume with the follow-up the agent asked
  const pending         = session.interview_memory?.pendingFollowUp;
  const currentQuestion = session.last_was_followup === 1 && pending?.index === session.current_question_index
    ? { id: `followup_${pending.index}`, index: pending.index, category: "follow_up", question: pending.question, follow_ups: [] }
    : questions[session.current_question_index] || null;

  return {
    sessionId:      session.id,
    candidateName:  session.candidate_name,
    roleTitle:      session.jd_summary?.role_title || null,
    difficulty:     session.difficulty,
    status:         session.status,
    totalQuestions: session.total_questions,
    currentIndex:   session.current_question_index,
    currentQuestion,
    answeredCount:  answers.length,
    progress: {
      current: session.current_question_index + 1,
      total:   session.total_questions,
      percent: session.total_questions > 0
        ? Math.round((session.current_question_index / session.total_questions) * 100)
        : 0,
    },
    recentAnswers: answers.slice(-3).map((a) => ({
      question:  a.question,
      category:  a.question_category,
      scores: {
        technical:     a.score_technical,
        communication: a.score_communication,
        depth:         a.score_depth,
      },
      flags: a.flags,
    })),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAnalysisText(evaluation, decision) {
  const base     = evaluation.analysis || "";
  const reasoning = decision?.reasoning ? `\n\n[Agent decision: ${decision.action}${decision.verdict ? ` — ${decision.verdict}` : ""}]\n${decision.reasoning}` : "";
  return base + reasoning;
}