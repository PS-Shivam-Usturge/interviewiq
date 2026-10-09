import { v4 as uuidv4 } from "uuid";
import { Role, TaskState } from "@a2a-js/sdk";
import { AgentEvent } from "@a2a-js/sdk/server";
import { summariseJD, summariseResume } from "../agents/parseAgent.js";
import { startSession, submitAnswer, getSessionState, getOrGenerateReport } from "../agents/sessionManager.js";
import { getTrace } from "../db/sessionStore.js";
import logger from "../logger.js";

const log = logger.child({ component: "A2A" });

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
const MAX_DOC_CHARS    = 50_000;
const MAX_ANSWER_CHARS = 10_000;
const DIFFICULTIES     = ["junior", "mid", "senior", "principal"];

// ── A2A message helpers ───────────────────────────────────────────────────────

const textPart = (text) => ({ content: { $case: "text", value: text }, mediaType: "text/plain", filename: "", metadata: undefined });
const dataPart = (data) => ({ content: { $case: "data", value: data }, mediaType: "application/json", filename: "", metadata: undefined });

function agentMessage({ taskId, contextId, text }) {
  return {
    messageId: uuidv4(), taskId, contextId, role: Role.ROLE_AGENT,
    parts: [textPart(text)], metadata: undefined, extensions: [], referenceTaskIds: [],
  };
}

function artifact(name, description, data) {
  return { artifactId: uuidv4(), name, description, parts: [dataPart(data)], metadata: undefined, extensions: [] };
}

/** Extract { skill, args, text } from the incoming user message (data part preferred, JSON text accepted). */
function parseInput(message) {
  let data = null;
  const texts = [];
  for (const part of message?.parts || []) {
    if (part.content?.$case === "data" && part.content.value && typeof part.content.value === "object") data = part.content.value;
    if (part.content?.$case === "text") texts.push(part.content.value);
  }
  const text = texts.join("\n").trim();
  if (!data && text.startsWith("{")) {
    try { data = JSON.parse(text); } catch { /* plain text answer */ }
  }
  return { skill: data?.skill || null, args: data || {}, text };
}

class InputError extends Error {}

const formatQuestion = (q, progress) =>
  `Question ${progress ? `${progress.current} of ${progress.total} ` : ""}[${q.category}]: ${q.question}`;

// ── Skill handlers ────────────────────────────────────────────────────────────
// Each returns { state, text, artifacts?, sessionId? }. They only call the same
// session functions the web UI uses, so A2A clients get identical agent behaviour.

async function startInterview({ jdText, resumeText, difficulty = "mid" }) {
  if (typeof jdText !== "string" || jdText.trim().length < 50)         throw new InputError("start_interview needs `jdText` (≥50 characters).");
  if (typeof resumeText !== "string" || resumeText.trim().length < 50) throw new InputError("start_interview needs `resumeText` (≥50 characters).");
  if (jdText.length > MAX_DOC_CHARS || resumeText.length > MAX_DOC_CHARS) throw new InputError(`jdText/resumeText must be under ${MAX_DOC_CHARS} characters.`);
  if (!DIFFICULTIES.includes(difficulty)) throw new InputError(`difficulty must be one of ${DIFFICULTIES.join(", ")}.`);

  const [jdSummary, resumeSummary] = await Promise.all([summariseJD(jdText), summariseResume(resumeText)]);
  const session = await startSession({ jdText, resumeText, jdSummary, resumeSummary, difficulty });

  return {
    state: TaskState.TASK_STATE_INPUT_REQUIRED,
    sessionId: session.sessionId,
    text: `Interview started for ${session.candidateName}. ${formatQuestion(session.currentQuestion, { current: 1, total: session.totalQuestions })}`,
    artifacts: [artifact("interview-session", "Session created by the lead interviewer agent", {
      sessionId:       session.sessionId,
      candidateName:   session.candidateName,
      totalQuestions:  session.totalQuestions,
      currentQuestion: { category: session.currentQuestion.category, question: session.currentQuestion.question },
      focusAreas:      session.agentSetup?.focusAreas || [],
      links: {
        candidate: `${FRONTEND_URL}/interview/${session.sessionId}`,
        monitor:   `${FRONTEND_URL}/monitor/${session.sessionId}`,
        report:    `${FRONTEND_URL}/report/${session.sessionId}`,
        trace:     `${FRONTEND_URL}/trace/${session.sessionId}`,
      },
    })],
  };
}

async function answer({ sessionId, answer: transcript }) {
  if (!sessionId) throw new InputError("submit_answer needs `sessionId` (or reply on the interview task).");
  if (typeof transcript !== "string" || !transcript.trim()) throw new InputError("submit_answer needs a non-empty `answer`.");
  if (transcript.length > MAX_ANSWER_CHARS) throw new InputError(`answer must be under ${MAX_ANSWER_CHARS} characters.`);

  const r = await submitAnswer({ sessionId, transcript });
  const result = artifact("answer-result", "Evaluation and decision for the submitted answer", {
    sessionId,
    answerAnalysis: r.answerAnalysis,
    agentDecision: {
      action: r.agentDecision.action, verdict: r.agentDecision.verdict,
      reasoning: r.agentDecision.reasoning, followUpQuestion: r.agentDecision.followUpQuestion,
    },
    isFollowUp: r.isFollowUp, isComplete: r.isComplete, concludedEarly: r.concludedEarly, progress: r.progress,
  });

  if (r.isComplete) {
    return {
      state: TaskState.TASK_STATE_COMPLETED, sessionId, artifacts: [result],
      text: `Interview complete${r.concludedEarly ? " (concluded early by the agent)" : ""}. Request the report with {"skill":"get_report","sessionId":"${sessionId}"}.`,
    };
  }
  const prefix = r.isFollowUp ? "Follow-up" : formatQuestion(r.nextQuestion, r.progress).split(":")[0];
  return {
    state: TaskState.TASK_STATE_INPUT_REQUIRED, sessionId, artifacts: [result],
    text: `${prefix}: ${r.nextQuestion.question}`,
  };
}

async function report({ sessionId }) {
  if (!sessionId) throw new InputError("get_report needs `sessionId`.");
  const rep = await getOrGenerateReport(sessionId);
  return {
    state: TaskState.TASK_STATE_COMPLETED, sessionId,
    text: `${rep.recommendation} · ${rep.overall_score}/100 — ${rep.headline || ""}`.trim(),
    artifacts: [artifact("eligibility-report", "Final hiring report", rep)],
  };
}

async function trace({ sessionId }) {
  if (!sessionId) throw new InputError("get_trace needs `sessionId`.");
  const t = await getTrace(sessionId);
  if (!t) throw Object.assign(new Error("Session not found"), { status: 404 });
  return {
    state: TaskState.TASK_STATE_COMPLETED, sessionId,
    text: `${t.events.length} trace events for ${t.candidateName} (${t.status}).`,
    artifacts: [artifact("decision-trace", "Agent decision trace (no transcripts)", { sessionId, ...t, jdSummary: undefined })],
  };
}

async function status({ sessionId }) {
  if (!sessionId) throw new InputError("get_session_status needs `sessionId`.");
  const s = await getSessionState(sessionId);
  if (!s) throw Object.assign(new Error("Session not found"), { status: 404 });
  return {
    state: TaskState.TASK_STATE_COMPLETED, sessionId,
    text: `${s.candidateName}: ${s.status}, question ${Math.min(s.progress.current, s.totalQuestions)} of ${s.totalQuestions}.`,
    artifacts: [artifact("session-status", "Session state", s)],
  };
}

const SKILLS = {
  start_interview:    startInterview,
  submit_answer:      answer,
  get_report:         report,
  get_trace:          trace,
  get_session_status: status,
};

// ── AgentExecutor ─────────────────────────────────────────────────────────────

export class InterviewAgentExecutor {
  async execute(requestContext, eventBus) {
    const { taskId, contextId, task: existing, userMessage } = requestContext;
    const { skill, args, text } = parseInput(userMessage);

    // A reply on an open interview task with no explicit skill is the candidate's answer
    const taskSessionId = existing?.metadata?.sessionId;
    const skillId = skill || (taskSessionId && text ? "submit_answer" : null);
    const skillArgs = skillId === "submit_answer"
      ? { sessionId: args.sessionId || taskSessionId, answer: args.answer ?? text }
      : args;

    const metadata = { ...(existing?.metadata || {}), ...(skillId ? { lastSkill: skillId } : {}) };
    const now = () => new Date().toISOString();

    // Every execute() must publish a Task first (also on follow-up turns)
    eventBus.publish(AgentEvent.task({
      id: taskId, contextId,
      status: { state: TaskState.TASK_STATE_WORKING, message: undefined, timestamp: now() },
      artifacts: existing?.artifacts || [],
      history:   existing ? existing.history : [userMessage],
      metadata,
    }));

    const finish = (state, msg, artifacts = [], extraMeta = {}) => {
      for (const a of artifacts) {
        eventBus.publish(AgentEvent.artifactUpdate({ taskId, contextId, artifact: a, append: false, lastChunk: true, metadata: undefined }));
      }
      eventBus.publish(AgentEvent.statusUpdate({
        taskId, contextId,
        status: { state, message: agentMessage({ taskId, contextId, text: msg }), timestamp: now() },
        metadata: { ...metadata, ...extraMeta },
      }));
      eventBus.finished();
    };

    if (!skillId || !SKILLS[skillId]) {
      log.info({ taskId, skill }, "A2A request rejected — unknown skill");
      return finish(TaskState.TASK_STATE_REJECTED,
        `Unknown or missing skill. Send a data part with "skill" set to one of: ${Object.keys(SKILLS).join(", ")}. See /.well-known/agent-card.json.`);
    }

    const started = Date.now();
    try {
      const out = await SKILLS[skillId](skillArgs);
      log.info({ taskId, skill: skillId, sessionId: out.sessionId, state: TaskState[out.state], ms: Date.now() - started }, "A2A skill completed");
      // sessionId is kept on the task so later replies on the same task continue the interview
      metadata.sessionId = out.sessionId || metadata.sessionId;
      finish(out.state, out.text, out.artifacts || []);
    } catch (err) {
      const rejected = err instanceof InputError || err.status === 400 || err.status === 404 || /not found|already completed/i.test(err.message);
      log.warn({ taskId, skill: skillId, err: err.message, rejected }, "A2A skill failed");
      finish(rejected ? TaskState.TASK_STATE_REJECTED : TaskState.TASK_STATE_FAILED,
        rejected ? err.message : `The interview agent failed: ${err.message}`);
    }
  }

  async cancelTask(taskId, eventBus) {
    // Interview turns are short and transactional; cancellation simply marks the task canceled.
    eventBus.publish(AgentEvent.statusUpdate({
      taskId, contextId: "",
      status: { state: TaskState.TASK_STATE_CANCELED, message: undefined, timestamp: new Date().toISOString() },
      metadata: undefined,
    }));
    eventBus.finished();
  }
}
