import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fix = (f) => fs.readFileSync(path.join(__dirname, "../fixtures", f), "utf-8");

const jdSummary = {
  role_title: "Senior Software Engineer",
  seniority_level: "Senior",
  required_skills: ["Node.js", "distributed systems", "PostgreSQL", "Kafka"],
};

export default [
  {
    id: "answer-001",
    description: "Strong technical answer scores ≥7 on technical dimension",
    agent: "answerAgent",
    fn: "analyseAnswer",
    input: {
      question: "How have you ensured idempotency in a distributed payment system?",
      answer: fix("transcripts/answer-strong-technical.txt"),
      questionCategory: "technical",
      jdSummary,
    },
    assertions: [{ type: "number_gte", field: "score_technical", min: 7 }],
  },
  {
    id: "answer-002",
    description: "Strong technical answer scores ≥6 overall",
    agent: "answerAgent",
    fn: "analyseAnswer",
    input: {
      question: "How have you ensured idempotency in a distributed payment system?",
      answer: fix("transcripts/answer-strong-technical.txt"),
      questionCategory: "technical",
      jdSummary,
    },
    assertions: [{ type: "number_gte", field: "overall_score", min: 6 }],
  },
  {
    id: "answer-003",
    description: "Vague answer includes 'vague' in flags",
    agent: "answerAgent",
    fn: "analyseAnswer",
    input: {
      question: "How have you ensured idempotency in a distributed payment system?",
      answer: fix("transcripts/answer-weak-vague.txt"),
      questionCategory: "technical",
      jdSummary,
    },
    assertions: [{ type: "array_includes", field: "flags", value: "vague" }],
  },
  {
    id: "answer-004",
    description: "Vague answer scores ≤5 on technical dimension",
    agent: "answerAgent",
    fn: "analyseAnswer",
    input: {
      question: "How have you ensured idempotency in a distributed payment system?",
      answer: fix("transcripts/answer-weak-vague.txt"),
      questionCategory: "technical",
      jdSummary,
    },
    assertions: [{ type: "number_lte", field: "score_technical", max: 5 }],
  },
  {
    id: "answer-005",
    description: "Empty/minimal answer returns overall_score of 0 and flags no_answer",
    agent: "answerAgent",
    fn: "analyseAnswer",
    input: {
      question: "Tell me about yourself.",
      answer: "I don't know.",
      questionCategory: "opening",
      jdSummary,
    },
    assertions: [
      { type: "field_equals", field: "overall_score", value: 0 },
      { type: "array_includes", field: "flags", value: "no_answer" },
    ],
  },
  {
    id: "answer-006",
    description: "Evasive answer is flagged as evasive",
    agent: "answerAgent",
    fn: "analyseAnswer",
    input: {
      question: "How have you ensured idempotency in a distributed payment system?",
      answer: fix("transcripts/answer-evasive.txt"),
      questionCategory: "technical",
      jdSummary,
    },
    assertions: [{ type: "array_includes", field: "flags", value: "evasive" }],
  },
  {
    id: "answer-007",
    description: "Strong behavioural answer returns strength_points array with ≥1 item",
    agent: "answerAgent",
    fn: "analyseAnswer",
    input: {
      question: "Tell me about a time you handled a production incident involving a junior engineer's mistake.",
      answer: fix("transcripts/answer-strong-behavioural.txt"),
      questionCategory: "behavioural",
      jdSummary,
    },
    assertions: [{ type: "array_min_length", field: "strength_points", min: 1 }],
  },
  {
    id: "answer-008",
    description: "Result always contains required fields",
    agent: "answerAgent",
    fn: "analyseAnswer",
    input: {
      question: "How have you ensured idempotency in a distributed payment system?",
      answer: fix("transcripts/answer-strong-technical.txt"),
      questionCategory: "technical",
      jdSummary,
    },
    assertions: [
      { type: "field_exists", field: "score_technical" },
      { type: "field_exists", field: "score_communication" },
      { type: "field_exists", field: "score_depth" },
      { type: "field_exists", field: "overall_score" },
      { type: "field_exists", field: "analysis" },
      { type: "field_exists", field: "flags" },
    ],
  },
  {
    id: "answer-009",
    description: "Contradicting answer is flagged as contradicts_resume",
    agent: "answerAgent",
    fn: "analyseAnswer",
    input: {
      question: "Walk me through your career so far.",
      answer: fix("transcripts/answer-contradicts-resume.txt"),
      questionCategory: "opening",
      jdSummary,
      resumeSummary: {
        candidate_name: "Alex Johnson",
        current_title: "Software Developer",
        years_total_experience: 2,
        skills: ["JavaScript", "Node.js", "React"],
      },
    },
    assertions: [{ type: "array_includes", field: "flags", value: "contradicts_resume" }],
  },
  {
    id: "answer-010",
    description: "Score fields are all integers between 0 and 10",
    agent: "answerAgent",
    fn: "analyseAnswer",
    input: {
      question: "How have you ensured idempotency in a distributed payment system?",
      answer: fix("transcripts/answer-strong-technical.txt"),
      questionCategory: "technical",
      jdSummary,
    },
    assertions: [
      { type: "number_between", field: "score_technical",     min: 0, max: 10 },
      { type: "number_between", field: "score_communication", min: 0, max: 10 },
      { type: "number_between", field: "score_depth",         min: 0, max: 10 },
      { type: "number_between", field: "overall_score",       min: 0, max: 10 },
    ],
  },
];
