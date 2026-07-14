import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fix = (f) => fs.readFileSync(path.join(__dirname, "../fixtures", f), "utf-8");

const jdSummary = {
  role_title: "Senior Software Engineer",
  seniority_level: "Senior",
  required_skills: ["Node.js", "Go", "distributed systems", "Kafka", "PostgreSQL", "Kubernetes"],
  tech_stack: ["Node.js", "Go", "Kafka", "PostgreSQL", "Kubernetes", "Docker"],
  key_responsibilities: ["Design microservices", "Own reliability", "Mentor junior engineers"],
};

const strongResume = {
  candidate_name: "Priya Sharma",
  current_title: "Senior Software Engineer",
  years_total_experience: 7,
  skills: ["Go", "Node.js", "PostgreSQL", "Kafka", "Kubernetes", "gRPC", "AWS"],
};

const weakResume = {
  candidate_name: "Alex Johnson",
  current_title: "Software Developer",
  years_total_experience: 2,
  skills: ["JavaScript", "Node.js", "React", "MySQL"],
};

export default [
  {
    id: "question-001",
    description: "Generates exactly 8 questions for a strong SWE candidate",
    agent: "questionAgent",
    fn: "generateQuestionBank",
    input: { jdSummary, resumeSummary: strongResume, difficulty: "senior" },
    assertions: [{ type: "array_length", field: "_root", length: 8 }],
  },
  {
    id: "question-002",
    description: "Question bank includes at least one 'technical' category question",
    agent: "questionAgent",
    fn: "generateQuestionBank",
    input: { jdSummary, resumeSummary: strongResume, difficulty: "senior" },
    assertions: [{ type: "array_has_item_with_field_value", field: "_root", itemField: "category", value: "technical" }],
  },
  {
    id: "question-003",
    description: "Question bank includes at least one 'behavioural' category question",
    agent: "questionAgent",
    fn: "generateQuestionBank",
    input: { jdSummary, resumeSummary: strongResume, difficulty: "senior" },
    assertions: [{ type: "array_has_item_with_field_value", field: "_root", itemField: "category", value: "behavioural" }],
  },
  {
    id: "question-004",
    description: "Question bank includes at least one 'opening' category question",
    agent: "questionAgent",
    fn: "generateQuestionBank",
    input: { jdSummary, resumeSummary: strongResume, difficulty: "senior" },
    assertions: [{ type: "array_has_item_with_field_value", field: "_root", itemField: "category", value: "opening" }],
  },
  {
    id: "question-005",
    description: "Question bank includes a 'closing' question",
    agent: "questionAgent",
    fn: "generateQuestionBank",
    input: { jdSummary, resumeSummary: strongResume, difficulty: "senior" },
    assertions: [{ type: "array_has_item_with_field_value", field: "_root", itemField: "category", value: "closing" }],
  },
  {
    id: "question-006",
    description: "Every question has a non-empty 'question' field",
    agent: "questionAgent",
    fn: "generateQuestionBank",
    input: { jdSummary, resumeSummary: strongResume, difficulty: "senior" },
    assertions: [{ type: "every_item_has_nonempty_field", field: "_root", itemField: "question" }],
  },
  {
    id: "question-007",
    description: "Every question has a non-empty 'intent' field",
    agent: "questionAgent",
    fn: "generateQuestionBank",
    input: { jdSummary, resumeSummary: strongResume, difficulty: "senior" },
    assertions: [{ type: "every_item_has_nonempty_field", field: "_root", itemField: "intent" }],
  },
  {
    id: "question-008",
    description: "Generates questions for a weak candidate without crashing",
    agent: "questionAgent",
    fn: "generateQuestionBank",
    input: { jdSummary, resumeSummary: weakResume, difficulty: "junior" },
    assertions: [{ type: "no_crash" }, { type: "array_min_length", field: "_root", min: 5 }],
  },
  {
    id: "question-009",
    description: "Questions are not duplicates — all question texts are unique",
    agent: "questionAgent",
    fn: "generateQuestionBank",
    input: { jdSummary, resumeSummary: strongResume, difficulty: "senior" },
    assertions: [{ type: "array_items_unique", field: "_root", itemField: "question" }],
  },
  {
    id: "question-010",
    description: "LLM-judge: questions are relevant to the payments/distributed-systems role",
    agent: "questionAgent",
    fn: "generateQuestionBank",
    input: { jdSummary, resumeSummary: strongResume, difficulty: "senior" },
    assertions: [{
      type: "llm_judge",
      prompt: (result) => `The following interview questions were generated for a Senior Software Engineer role at a fintech payments company.\n\nQuestions:\n${result.map((q, i) => `${i + 1}. [${q.category}] ${q.question}`).join("\n")}\n\nAre these questions relevant to payments, distributed systems, or backend engineering? Are they appropriately difficult for a senior engineer? Return JSON: { "pass": true/false, "score": 0-10, "reason": "..." }`,
    }],
  },
];
