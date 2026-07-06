import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { summariseJD, summariseResume } from "./parseAgent.js";
import { generateQuestionBank } from "./questionAgent.js";
import { analyseAnswer } from "./answerAgent.js";
import { generateReport } from "./reportAgent.js";
import { getAnswers } from "../db/sessionStore.js";

// ── Tool factories ─────────────────────────────────────────────────────────────
// Each factory closes over a mutable context object.
// Tool handlers mutate context; the caller reads it after query() completes.

function createSetupTools(context) {
  return [
    tool(
      "parse_documents",
      "Parse the job description and resume to extract structured information about the role requirements and candidate background. Always call this first during setup.",
      { reasoning: z.string().describe("Your initial observations about the role and candidate, and what you plan to focus on") },
      async ({ reasoning: _reasoning }) => {
        const jdSummary     = context.jdSummary     || await summariseJD(context.jdText);
        const resumeSummary = context.resumeSummary  || await summariseResume(context.resumeText);
        context.jdSummary     = jdSummary;
        context.resumeSummary = resumeSummary;
        return { content: [{ type: "text", text: JSON.stringify({ jdSummary, resumeSummary }) }] };
      },
      { annotations: { readOnlyHint: true } }
    ),

    tool(
      "generate_question_bank",
      "Generate 8 tailored interview questions for this specific candidate and role. Call after parse_documents.",
      {
        reasoning:    z.string().describe("Your interview strategy — which skills to probe, which gaps to explore, what the candidate needs to prove"),
        focus_areas:  z.array(z.string()).describe("3-5 specific areas you want to probe (e.g. 'React state management', 'system design at scale')"),
      },
      async ({ reasoning: _reasoning, focus_areas: _focus_areas }) => {
        const questions = await generateQuestionBank({
          jdSummary:     context.jdSummary,
          resumeSummary: context.resumeSummary,
          difficulty:    context.difficulty,
        });
        context.questionBank = questions;
        return { content: [{ type: "text", text: JSON.stringify({ count: questions.length, questions }) }] };
      }
    ),
  ];
}

function createInterviewTools(context) {
  return [
    tool(
      "evaluate_answer",
      "Score and analyse the candidate's answer to the current question. Always call this first when processing an answer.",
      { reasoning: z.string().describe("Your immediate, specific assessment — what the candidate demonstrated and what was missing") },
      async ({ reasoning: _reasoning }) => {
        try {
          const evaluation = await analyseAnswer({
            question:         context.currentQuestion.question,
            answer:           context.transcript,
            questionCategory: context.currentQuestion.category,
            jdSummary:        context.jdSummary,
            resumeSummary:    context.resumeSummary,
          });
          context.evaluation = evaluation;
          return { content: [{ type: "text", text: JSON.stringify(evaluation) }] };
        } catch (err) {
          const fallback = {
            score_technical: 0, score_communication: 0, score_depth: 0, overall_score: 0,
            flags: ["evaluation_error"], analysis: `Evaluation failed: ${err.message}`,
            follow_up_needed: false, follow_up_reason: null,
            strength_points: [], gap_points: [],
          };
          context.evaluation = fallback;
          return { content: [{ type: "text", text: JSON.stringify(fallback) }] };
        }
      },
      { annotations: { readOnlyHint: true } }
    ),

    tool(
      "request_followup",
      "Ask a follow-up question. Use when the answer is vague, incomplete, or contradictory. Can only be used ONCE per original question.",
      {
        reasoning:          z.string().describe("Specific evidence from the answer that justifies a follow-up"),
        follow_up_question: z.string().describe("The exact follow-up question to ask the candidate"),
      },
      async ({ reasoning, follow_up_question }) => {
        // Guard: enforce no-double-followup even if agent ignores the instruction
        if (context.lastWasFollowup || context.followupCount >= 1) {
          console.warn("  [InterviewAgent] Follow-up overridden — limit reached, forcing advance");
          context.decision = { action: "advance", verdict: "weak", reasoning: "Follow-up limit reached" };
          return { content: [{ type: "text", text: JSON.stringify({ overridden: true, reason: "follow-up limit already reached — you must call advance_to_next_question instead" }) }] };
        }
        if (context.currentQuestion?.category === "closing") {
          console.warn("  [InterviewAgent] Follow-up overridden — closing question");
          context.decision = { action: "advance", verdict: "adequate", reasoning: "Closing question — no follow-up" };
          return { content: [{ type: "text", text: JSON.stringify({ overridden: true, reason: "closing questions cannot have follow-ups — call advance_to_next_question" }) }] };
        }
        context.decision = { action: "followup", followUpQuestion: follow_up_question, reasoning };
        return { content: [{ type: "text", text: JSON.stringify({ status: "followup_queued", question: follow_up_question }) }] };
      }
    ),

    tool(
      "advance_to_next_question",
      "Accept this answer and move to the next question. Use when the answer is sufficient — strong, adequate, or even weak (you have enough information).",
      {
        reasoning: z.string().describe("Why you are accepting this answer — what you learned and any concerns noted"),
        verdict:   z.enum(["strong", "adequate", "weak", "concerning"]).describe("Your one-word quality assessment"),
      },
      async ({ reasoning, verdict }) => {
        context.decision = { action: "advance", verdict, reasoning };
        return { content: [{ type: "text", text: JSON.stringify({ status: "advancing", verdict }) }] };
      }
    ),

    tool(
      "conclude_interview_early",
      "End the interview before all questions if you have strong cross-question evidence to make a confident hiring decision. Requires at least 3 answered questions. Do NOT use lightly.",
      {
        reasoning:           z.string().describe("Cross-question evidence — must reference at least 2 specific answers"),
        preliminary_verdict: z.enum(["strong_hire", "hire", "no_hire"]).describe("Your confident hiring recommendation"),
      },
      async ({ reasoning, preliminary_verdict }) => {
        const answeredSoFar = context.currentIndex ?? 0;
        if (answeredSoFar < 2) {
          console.warn("  [InterviewAgent] Early conclusion blocked — fewer than 3 questions answered");
          context.decision = { action: "advance", verdict: "weak", reasoning: "Early conclusion overridden — not enough evidence yet" };
          return { content: [{ type: "text", text: JSON.stringify({ overridden: true, reason: "need at least 3 answered questions before concluding early" }) }] };
        }
        context.decision = { action: "conclude_early", reasoning, preliminary_verdict };
        console.log(`  [InterviewAgent] 🏁 Early conclusion (${preliminary_verdict}): "${reasoning.slice(0, 100)}"`);
        return { content: [{ type: "text", text: JSON.stringify({ status: "concluded_early" }) }] };
      }
    ),

    tool(
      "note_cumulative_concern",
      "Record a pattern that spans multiple answers for the final report. Use only for recurring cross-question issues, not isolated single-answer observations.",
      {
        observation: z.string().describe("The specific cross-question pattern with evidence from multiple answers"),
        severity:    z.enum(["info", "warning", "critical"]),
      },
      async ({ observation, severity }) => {
        if (!context.observations) context.observations = [];
        context.observations.push({ observation, severity, questionIndex: context.currentIndex ?? null });
        console.log(`  [InterviewAgent] 📋 Concern (${severity}): "${observation.slice(0, 100)}"`);
        return { content: [{ type: "text", text: JSON.stringify({ recorded: true }) }] };
      }
    ),
  ];
}

function createReportTools(context) {
  return [
    tool(
      "generate_final_report",
      "Generate the final candidate eligibility report. Call only when explicitly asked to produce the report after the interview is complete.",
      {
        reasoning:                z.string().describe("Holistic assessment of the candidate based on the entire interview — reference specific answers and patterns"),
        preliminary_recommendation: z.enum(["strong_hire", "hire", "maybe", "no_hire"]),
      },
      async ({ reasoning: _reasoning, preliminary_recommendation }) => {
        console.log(`  [InterviewAgent] 📝 Generating final report (${preliminary_recommendation})...`);
        const report = await generateReport(context.sessionId);
        context.report = report;
        return { content: [{ type: "text", text: JSON.stringify({ status: "report_generated", sessionId: context.sessionId }) }] };
      }
    ),
  ];
}

// ── Core runner ───────────────────────────────────────────────────────────────
// Creates an SDK MCP server from the tool set, runs query(), collects events.

async function runAgentQuery({ prompt, tools, allowedTools, maxTurns = 10 }) {
  const server = createSdkMcpServer({ name: "interview_tools", version: "1.0.0", tools });
  const toolEvents = [];
  let agentSummary = null;

  for await (const msg of query({
    prompt,
    options: {
      mcpServers: {
        interview_tools: server,
      },
      allowedTools,
      maxTurns,
      // Pass the full process env so CLAUDE_CODE_OAUTH_TOKEN reaches the CLI subprocess
      env: { ...process.env },
    },
  })) {
    if (msg.type === "assistant") {
      const content = msg.message?.content || [];
      for (const block of content) {
        if (block.type === "tool_use") {
          const reasoning = block.input?.reasoning || "";
          toolEvents.push({ tool: block.name, reasoning });
          console.log(`  [InterviewAgent] ▶ ${block.name} — "${reasoning.slice(0, 100)}"`);
        }
        if (block.type === "text" && block.text) {
          agentSummary = block.text;
        }
      }
    }
    if (msg.type === "result" && msg.subtype !== "success") {
      console.warn(`  [InterviewAgent] Query ended early: ${msg.subtype}`);
    }
  }

  return { toolEvents, agentSummary };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * SETUP PHASE: agent parses documents and generates the question bank.
 * Returns { jdSummary, resumeSummary, questionBank, toolEvents, agentSummary }
 */
export async function setupInterview({ sessionId, jdText, resumeText, jdSummary, resumeSummary, difficulty }) {
  const context = { sessionId, jdText, resumeText, jdSummary, resumeSummary, difficulty, questionBank: null };

  const { toolEvents, agentSummary } = await runAgentQuery({
    prompt: `You are an expert AI interviewer agent.

SETUP PHASE: Parse the job description and resume, then generate a tailored ${difficulty || "mid"}-level interview question bank.

Instructions:
1. Call mcp__interview_tools__parse_documents — understand the role requirements and candidate background
2. Call mcp__interview_tools__generate_question_bank — create 8 tailored questions with your interview strategy

Include a "reasoning" field in every tool call explaining your decision.

Job Description:
${jdText.slice(0, 4000)}

Resume / CV:
${resumeText.slice(0, 4000)}`,
    tools: createSetupTools(context),
    allowedTools: [
      "mcp__interview_tools__parse_documents",
      "mcp__interview_tools__generate_question_bank",
    ],
    maxTurns: 5,
  });

  if (!context.questionBank?.length) throw new Error("Agent did not generate question bank");

  return {
    jdSummary:    context.jdSummary,
    resumeSummary: context.resumeSummary,
    questionBank:  context.questionBank,
    toolEvents,
    agentSummary,
  };
}

/**
 * INTERVIEW PHASE: agent evaluates an answer and decides the next action.
 * Returns { evaluation, decision, observations, toolEvents, agentSummary }
 */
export async function processAnswer({ sessionId, session, transcript }) {
  const questions       = session.question_bank;
  const currentIndex    = session.current_question_index;
  const currentQuestion = questions[currentIndex];
  const lastWasFollowup = session.last_was_followup === 1;
  const followupCount   = session.followup_count || 0;

  // Load previous answers from DB to provide full interview context
  const previousAnswers = await getAnswers(sessionId);

  const context = {
    sessionId, transcript, currentQuestion, currentIndex,
    lastWasFollowup, followupCount,
    jdSummary:     session.jd_summary,
    resumeSummary: session.resume_summary,
    decision:     null,
    evaluation:   null,
    observations: [],
  };

  const prevContext = previousAnswers.length > 0
    ? `\nPrevious answers:\n${previousAnswers.map((a, i) =>
        `Q${i + 1} [${a.question_category}]: "${a.question}"\n  Scores: tech=${a.score_technical} comm=${a.score_communication} depth=${a.score_depth} | Flags: ${JSON.stringify(a.flags || [])}\n  Transcript: "${(a.transcript || "").slice(0, 200)}"`
      ).join("\n\n")}`
    : "";

  const followupWarning = lastWasFollowup
    ? "\n⚠️ IMPORTANT: You already asked a follow-up for this question. You MUST call advance_to_next_question — do NOT call request_followup again."
    : "";

  const { toolEvents, agentSummary } = await runAgentQuery({
    prompt: `You are an expert AI interviewer agent managing a structured technical interview.

Interview context:
- Role: ${session.jd_summary?.job_title || "the position"}
- Progress: Question ${currentIndex + 1} of ${questions.length} (${currentQuestion?.category || "unknown"} category)
${prevContext}

Current question (Q${currentIndex + 1}): "${currentQuestion?.question}"
Candidate's answer: "${transcript}"${followupWarning}

Your task (in order):
1. Call mcp__interview_tools__evaluate_answer to score this answer
2. Based on the evaluation, call exactly ONE of:
   - mcp__interview_tools__request_followup — if the answer needs more detail AND no follow-up was given yet
   - mcp__interview_tools__advance_to_next_question — if you have enough information (regardless of quality)
   - mcp__interview_tools__conclude_interview_early — ONLY if question index >= 2 AND there is strong cross-question evidence
3. Optionally call mcp__interview_tools__note_cumulative_concern if you notice a recurring pattern across multiple answers`,
    tools: createInterviewTools(context),
    allowedTools: [
      "mcp__interview_tools__evaluate_answer",
      "mcp__interview_tools__request_followup",
      "mcp__interview_tools__advance_to_next_question",
      "mcp__interview_tools__conclude_interview_early",
      "mcp__interview_tools__note_cumulative_concern",
    ],
    maxTurns: 8,
  });

  // Fallbacks if agent failed to complete expected actions
  if (!context.evaluation) {
    context.evaluation = {
      score_technical: 5, score_communication: 5, score_depth: 5, overall_score: 5,
      flags: [], analysis: "Evaluation not completed",
      follow_up_needed: false, strength_points: [], gap_points: [],
    };
  }
  if (!context.decision) {
    context.decision = { action: "advance", verdict: "adequate", reasoning: "No decision made — advancing by default" };
  }

  return {
    evaluation:   context.evaluation,
    decision:     context.decision,
    observations: context.observations,
    toolEvents,
    agentSummary,
  };
}

/**
 * REPORT PHASE: agent reviews the completed interview and generates the eligibility report.
 * Returns { report, toolEvents, agentSummary }
 */
export async function generateAgentReport({ sessionId, session }) {
  const context = { sessionId, session, report: null };

  const observations = session.agent_observations || [];
  const obsText = observations.length > 0
    ? `\nObservations noted during interview:\n${observations.map(o => `[${o.severity}] ${o.observation}`).join("\n")}`
    : "";

  const { toolEvents, agentSummary } = await runAgentQuery({
    prompt: `You are an expert AI interviewer agent.

REPORT PHASE: The interview for ${session.candidate_name || "the candidate"} applying for ${session.jd_summary?.job_title || "the role"} is complete.
${obsText}

Review the completed interview and call mcp__interview_tools__generate_final_report with your holistic assessment and recommendation.`,
    tools: createReportTools(context),
    allowedTools: ["mcp__interview_tools__generate_final_report"],
    maxTurns: 3,
  });

  return { report: context.report, toolEvents, agentSummary };
}