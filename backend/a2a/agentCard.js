import { AgentCard } from "@a2a-js/sdk";

// ── A2A Agent Card ────────────────────────────────────────────────────────────
// The public "business card" other agents fetch from /.well-known/agent-card.json
// to discover what InterviewIQ can do and how to call it (A2A protocol v1.0).

export const A2A_PATH = "/a2a/jsonrpc";

export function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, "");
}

const skill = (id, name, description, examples, tags) => ({
  id, name, description, tags, examples,
  inputModes:  ["application/json", "text/plain"],
  outputModes: ["application/json", "text/plain"],
});

export function buildAgentCard() {
  const authEnabled = !!process.env.API_KEYS?.trim();

  return AgentCard.fromJSON({
    name: "InterviewIQ Interview Agent",
    description:
      "Conducts structured, adaptive technical interviews. Given a job description and resume it plans an interview, " +
      "asks tailored questions, evaluates each answer, decides on follow-ups, and produces an evidence-based hiring report. " +
      "A started interview is a multi-turn A2A task: the task stays in INPUT_REQUIRED with the next question until the interview completes.",
    version: "1.0.0",
    provider: { organization: "InterviewIQ", url: publicBaseUrl() },
    documentationUrl: "https://github.com/PS-Shivam-Usturge/interviewiq#a2a-interface",
    supportedInterfaces: [
      { url: `${publicBaseUrl()}${A2A_PATH}`, protocolBinding: "JSONRPC", protocolVersion: "1.0" },
    ],
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes:  ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    ...(authEnabled ? {
      securitySchemes: {
        apiKey: { apiKeySecurityScheme: { location: "header", name: "X-API-Key", description: "Same keys as the REST API (API_KEYS in backend/.env)" } },
      },
      securityRequirements: [{ schemes: { apiKey: { list: [] } } }],
    } : {}),
    skills: [
      skill(
        "start_interview",
        "Start interview",
        "Parse a JD + resume, let the lead interviewer agent plan focus areas, generate the question bank and return the first question. " +
        'Send a data part: { "skill": "start_interview", "jdText": "...", "resumeText": "...", "difficulty": "junior|mid|senior|principal" }. ' +
        "Returns task state INPUT_REQUIRED with the first question and an `interview-session` artifact containing the sessionId.",
        ['{"skill":"start_interview","jdText":"Senior Backend Engineer…","resumeText":"Jane Smith…","difficulty":"senior"}'],
        ["interview", "hiring", "planning"],
      ),
      skill(
        "submit_answer",
        "Submit candidate answer",
        "Send the candidate's answer for the current question. Either reply on the same task (plain text part) or send " +
        '{ "skill": "submit_answer", "sessionId": "...", "answer": "..." }. The agent scores the answer and decides to follow up, ' +
        "advance or conclude. Returns INPUT_REQUIRED with the next question, or COMPLETED when the interview ends.",
        ["I designed an idempotent payment API using idempotency keys stored in Postgres…"],
        ["interview", "evaluation"],
      ),
      skill(
        "get_report",
        "Get hiring report",
        'Generate (or return cached) eligibility report for a completed interview: { "skill": "get_report", "sessionId": "..." }.',
        ['{"skill":"get_report","sessionId":"<uuid>"}'],
        ["report", "hiring"],
      ),
      skill(
        "get_trace",
        "Get decision trace",
        'Return the agent decision trace (tool calls, scores, decisions — no transcripts): { "skill": "get_trace", "sessionId": "..." }.',
        ['{"skill":"get_trace","sessionId":"<uuid>"}'],
        ["observability"],
      ),
      skill(
        "get_session_status",
        "Get session status",
        'Current question, progress and recent scores: { "skill": "get_session_status", "sessionId": "..." }.',
        ['{"skill":"get_session_status","sessionId":"<uuid>"}'],
        ["status"],
      ),
    ],
  });
}
