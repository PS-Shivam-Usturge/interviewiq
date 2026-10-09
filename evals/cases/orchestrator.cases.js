import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── Orchestrator decision evals ───────────────────────────────────────────────
// These exercise the lead interviewer agent's tool loop (Claude Agent SDK query()
// with the interview MCP tools) — the part of the system that makes autonomous
// decisions: follow up vs advance vs conclude early, and what to record as a concern.
// Each case builds an in-memory session (no DB) and calls processAnswer().

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fix = (f) => fs.readFileSync(path.join(__dirname, "../fixtures", f), "utf-8");

const jdSummary = {
  role_title: "Senior Software Engineer",
  seniority_level: "senior",
  required_skills: ["Node.js", "distributed systems", "PostgreSQL", "Kafka"],
  tech_stack: ["Node.js", "Go", "Kafka", "PostgreSQL", "Kubernetes"],
};

const resumeSummary = {
  candidate_name: "Priya Sharma",
  current_title: "Senior Software Engineer",
  years_total_experience: 7,
  skills: ["Go", "Node.js", "PostgreSQL", "Kafka", "Kubernetes", "gRPC"],
};

const QUESTIONS = [
  { id: "o1", category: "opening",     question: "Walk me through your current role and the systems you own." },
  { id: "o2", category: "opening",     question: "What drew you to payments infrastructure?" },
  { id: "t1", category: "technical",   question: "How have you ensured idempotency in a distributed payment system?" },
  { id: "t2", category: "technical",   question: "How would you guarantee exactly-once processing of payment events with Kafka?" },
  { id: "t3", category: "technical",   question: "How do you keep a PostgreSQL ledger consistent under concurrent writes?" },
  { id: "b1", category: "behavioural", question: "Tell me about a production incident you led and what you changed afterwards." },
  { id: "s1", category: "scenario",    question: "Design a settlement system that reconciles card network files nightly." },
  { id: "c1", category: "closing",     question: "Do you have any questions for us?" },
].map((q, index) => ({ ...q, index }));

function session({ index, lastWasFollowup = false, followupCount = 0, memory = null }) {
  return {
    question_bank: QUESTIONS,
    current_question_index: index,
    last_was_followup: lastWasFollowup ? 1 : 0,
    followup_count: followupCount,
    jd_summary: jdSummary,
    resume_summary: resumeSummary,
    interview_memory: memory,
    agent_session_id: null,
  };
}

// Interview memory for a candidate who has been consistently weak/evasive
const weakHistory = {
  version: 1,
  plan: { focusAreas: ["idempotency", "Kafka delivery semantics", "ledger consistency"], strategy: "Verify depth behind payments claims." },
  turns: [
    { q: 1, category: "opening",   followUp: false, overall: 4, tech: 3, depth: 3, flags: ["vague"],          action: "advance", verdict: "weak", note: "Generic description, no ownership details." },
    { q: 2, category: "opening",   followUp: false, overall: 3, tech: 2, depth: 2, flags: ["vague"],          action: "advance", verdict: "weak", note: "Could not say why payments." },
    { q: 3, category: "technical", followUp: false, overall: 2, tech: 2, depth: 1, flags: ["evasive"],        action: "followup", verdict: null, note: "Deflected the idempotency question." },
    { q: 3, category: "technical", followUp: true,  overall: 2, tech: 1, depth: 1, flags: ["evasive", "vague"], action: "advance", verdict: "concerning", note: "Still no mechanism after follow-up." },
    { q: 4, category: "technical", followUp: false, overall: 2, tech: 2, depth: 1, flags: ["no_examples"],    action: "advance", verdict: "weak", note: "No understanding of exactly-once." },
  ],
  earlier: null,
  concerns: [{ q: 4, severity: "warning", text: "Avoids specifics whenever implementation detail is probed (Q1, Q3, Q4)." }],
  pendingFollowUp: null,
};

const pendingFollowUpMemory = {
  version: 1,
  plan: { focusAreas: ["idempotency"], strategy: "" },
  turns: [{ q: 3, category: "technical", followUp: false, overall: 4, tech: 4, depth: 3, flags: ["vague"], action: "followup", verdict: null, note: "Needs a concrete mechanism." }],
  earlier: null,
  concerns: [],
  pendingFollowUp: { index: 2, question: "Can you describe exactly where the idempotency key was stored and how long it was retained?" },
};

const base = { agent: "orchestrator", fn: "decide" };

export default [
  {
    ...base,
    id: "orch-001",
    description: "Vague technical answer (first ask) → agent requests a follow-up",
    input: { session: session({ index: 2 }), transcript: fix("transcripts/answer-weak-vague.txt") },
    assertions: [{ type: "field_equals", field: "action", value: "followup" }],
  },
  {
    ...base,
    id: "orch-002",
    description: "Strong technical answer → agent advances with a positive verdict",
    input: { session: session({ index: 2 }), transcript: fix("transcripts/answer-strong-technical.txt") },
    assertions: [
      { type: "field_equals", field: "action", value: "advance" },
      { type: "field_in_set", field: "verdict", values: ["strong", "adequate"] },
    ],
  },
  {
    ...base,
    id: "orch-003",
    description: "Vague answer to a follow-up → agent must advance (one follow-up per question)",
    input: { session: session({ index: 2, lastWasFollowup: true, followupCount: 1, memory: pendingFollowUpMemory }), transcript: fix("transcripts/answer-weak-vague.txt") },
    assertions: [
      { type: "field_equals", field: "action", value: "advance" },
      { type: "field_in_set", field: "verdict", values: ["weak", "concerning", "adequate"] },
    ],
  },
  {
    ...base,
    id: "orch-004",
    description: "Closing question → agent advances, never follows up",
    input: { session: session({ index: 7 }), transcript: "What are the biggest reliability challenges the payments team is facing this year, and how is on-call organised?" },
    assertions: [{ type: "field_equals", field: "action", value: "advance" }],
  },
  {
    ...base,
    id: "orch-005",
    description: "Strong answer at Q2 → agent does not conclude early (insufficient evidence)",
    input: { session: session({ index: 1 }), transcript: fix("transcripts/answer-strong-technical.txt") },
    assertions: [{ type: "predicate", label: "action is not conclude_early", fn: (r) => r.action !== "conclude_early" }],
  },
  {
    ...base,
    id: "orch-006",
    description: "Evasive technical answer → agent requests a follow-up",
    input: { session: session({ index: 2 }), transcript: fix("transcripts/answer-evasive.txt") },
    assertions: [{ type: "field_equals", field: "action", value: "followup" }],
  },
  {
    ...base,
    id: "orch-007",
    description: "Context engineering: follow-up answer is evaluated against the follow-up the agent asked",
    input: { session: session({ index: 2, lastWasFollowup: true, followupCount: 1, memory: pendingFollowUpMemory }), transcript: "We stored the key in Postgres with a unique constraint and kept it for 24 hours, then a nightly job purged expired keys." },
    assertions: [
      { type: "field_equals", field: "askedQuestion", value: pendingFollowUpMemory.pendingFollowUp.question },
      { type: "field_equals", field: "action", value: "advance" },
    ],
  },
  {
    ...base,
    id: "orch-008",
    description: "Consistently weak candidate (memory) + another evasive answer → no positive verdict, concern or early stop",
    input: { session: session({ index: 5, memory: weakHistory }), transcript: fix("transcripts/answer-evasive.txt") },
    assertions: [
      { type: "predicate", label: "verdict is not strong/adequate", fn: (r) => !["strong", "adequate"].includes(r.verdict) },
      { type: "predicate", label: "agent uses cross-question evidence (concern, early stop or follow-up)",
        fn: (r) => r.action === "conclude_early" || r.action === "followup" || r.observations.length > 0 },
    ],
  },
  {
    ...base,
    id: "orch-009",
    description: "LLM-judge (rubric): follow-up question targets the gap in a vague answer",
    input: { session: session({ index: 2 }), transcript: fix("transcripts/answer-weak-vague.txt") },
    assertions: [
      { type: "field_equals", field: "action", value: "followup" },
      {
        type: "llm_judge_rubric",
        rubric: "followup_question",
        task: (r) => `Interview question: "${QUESTIONS[2].question}"\nCandidate's (vague) answer: "${fix("transcripts/answer-weak-vague.txt").trim()}"\nThe interviewer agent must write ONE follow-up question.`,
        output: (r) => r.followUpQuestion || "(no follow-up question was asked)",
      },
    ],
  },
  {
    ...base,
    id: "orch-010",
    description: "Answer contradicting the resume → flagged and acted on (follow-up or recorded concern)",
    input: {
      session: { ...session({ index: 0 }), resume_summary: { candidate_name: "Alex Johnson", current_title: "Software Developer", years_total_experience: 2, skills: ["JavaScript", "Node.js", "React"] } },
      transcript: fix("transcripts/answer-contradicts-resume.txt"),
    },
    assertions: [
      { type: "array_includes", field: "flags", value: "contradicts_resume" },
      { type: "predicate", label: "agent follows up or records a concern", fn: (r) => r.action === "followup" || r.observations.length > 0 || ["weak", "concerning"].includes(r.verdict) },
    ],
  },
  {
    agent: "interviewMemory",
    fn: "simulate",
    id: "memory-001",
    description: "Context engineering: memory compacts old turns but keeps plan + concerns (no LLM)",
    input: { turns: 9 },
    assertions: [
      { type: "number_lte", field: "detailedTurns", max: 6 },
      { type: "field_equals", field: "compactedTurns", value: 3 },
      { type: "field_equals", field: "planKept", value: true },
      { type: "field_equals", field: "concernsKept", value: true },
      { type: "number_lte", field: "renderedChars", max: 2500 },
    ],
  },
];
