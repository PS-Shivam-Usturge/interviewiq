const jdSummary = {
  role_title: "Senior Software Engineer",
  seniority_level: "Senior",
  required_skills: ["Node.js", "distributed systems", "PostgreSQL", "Kafka"],
};

const resumeSummary = {
  candidate_name: "Priya Sharma",
  current_title: "Senior Software Engineer",
  years_total_experience: 7,
};

function makeAnswers(overrideScore) {
  const s = overrideScore;
  return [
    { question: "Tell me about yourself.", question_category: "opening", transcript: "I have 7 years of experience in backend systems.", score_technical: s, score_communication: s, score_depth: s, flags: "[]", analysis: "Test answer." },
    { question: "How have you ensured idempotency?", question_category: "technical", transcript: "I used idempotency keys with Redis.", score_technical: s, score_communication: s, score_depth: s, flags: "[]", analysis: "Test answer." },
    { question: "Tell me about a production incident.", question_category: "behavioural", transcript: "I led a blameless post-mortem.", score_technical: s, score_communication: s, score_depth: s, flags: "[]", analysis: "Test answer." },
    { question: "Design a payment settlement system.", question_category: "scenario", transcript: "I would use event sourcing with Kafka.", score_technical: s, score_communication: s, score_depth: s, flags: "[]", analysis: "Test answer." },
    { question: "Do you have any questions for us?", question_category: "closing", transcript: "What are the biggest technical challenges ahead?", score_technical: s, score_communication: s, score_depth: s, flags: "[]", analysis: "Test answer." },
  ];
}

export default [
  {
    id: "report-001",
    description: "Report returns overall_score field (0–100)",
    agent: "reportAgent",
    fn: "generateReportFromAnswers",
    input: { jdSummary, resumeSummary, answers: makeAnswers(8) },
    assertions: [{ type: "number_between", field: "overall_score", min: 0, max: 100 }],
  },
  {
    id: "report-002",
    description: "All-high scores produce hire or strong_hire recommendation",
    agent: "reportAgent",
    fn: "generateReportFromAnswers",
    input: { jdSummary, resumeSummary, answers: makeAnswers(9) },
    assertions: [{ type: "field_in_set", field: "recommendation", values: ["hire", "strong_hire"] }],
  },
  {
    id: "report-003",
    description: "All-low scores produce no_hire recommendation",
    agent: "reportAgent",
    fn: "generateReportFromAnswers",
    input: { jdSummary, resumeSummary, answers: makeAnswers(1) },
    assertions: [{ type: "field_equals", field: "recommendation", value: "no_hire" }],
  },
  {
    id: "report-004",
    description: "Report contains strengths array with ≥1 item for high-scoring candidate",
    agent: "reportAgent",
    fn: "generateReportFromAnswers",
    input: { jdSummary, resumeSummary, answers: makeAnswers(8) },
    assertions: [{ type: "array_min_length", field: "strengths", min: 1 }],
  },
  {
    id: "report-005",
    description: "Report contains gaps array with ≥1 item for low-scoring candidate",
    agent: "reportAgent",
    fn: "generateReportFromAnswers",
    input: { jdSummary, resumeSummary, answers: makeAnswers(1) },
    assertions: [{ type: "array_min_length", field: "gaps", min: 1 }],
  },
  {
    id: "report-006",
    description: "Report contains headline string",
    agent: "reportAgent",
    fn: "generateReportFromAnswers",
    input: { jdSummary, resumeSummary, answers: makeAnswers(7) },
    assertions: [{ type: "field_exists", field: "headline" }, { type: "string_min_length", field: "headline", min: 10 }],
  },
  {
    id: "report-007",
    description: "Report contains confidence field",
    agent: "reportAgent",
    fn: "generateReportFromAnswers",
    input: { jdSummary, resumeSummary, answers: makeAnswers(7) },
    assertions: [{ type: "field_in_set", field: "confidence", values: ["high", "medium", "low"] }],
  },
  {
    id: "report-008",
    description: "Report contains skill_ratings array",
    agent: "reportAgent",
    fn: "generateReportFromAnswers",
    input: { jdSummary, resumeSummary, answers: makeAnswers(7) },
    assertions: [{ type: "field_exists", field: "skill_ratings" }, { type: "array_min_length", field: "skill_ratings", min: 1 }],
  },
  {
    id: "report-009",
    description: "Report contains narrative with ≥100 characters",
    agent: "reportAgent",
    fn: "generateReportFromAnswers",
    input: { jdSummary, resumeSummary, answers: makeAnswers(7) },
    assertions: [{ type: "string_min_length", field: "narrative", min: 100 }],
  },
  {
    id: "report-010",
    description: "LLM-judge: narrative is coherent and references the candidate and role",
    agent: "reportAgent",
    fn: "generateReportFromAnswers",
    input: { jdSummary, resumeSummary, answers: makeAnswers(7) },
    assertions: [{
      type: "llm_judge",
      prompt: (result) => `The following is a candidate eligibility report narrative:\n\n"${result.narrative}"\n\nIs this narrative coherent, specific, and does it reference the candidate and role? Return JSON: { "pass": true/false, "score": 0-10, "reason": "..." }`,
    }],
  },
];
