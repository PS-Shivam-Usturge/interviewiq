import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fix = (f) => fs.readFileSync(path.join(__dirname, "../fixtures", f), "utf-8");

export default [
  {
    id: "parse-001",
    description: "Valid SWE JD extracts role_title",
    agent: "parseAgent",
    fn: "summariseJD",
    input: { text: fix("jd-software-engineer.txt") },
    assertions: [{ type: "field_exists", field: "role_title" }],
  },
  {
    id: "parse-002",
    description: "Valid SWE JD extracts required_skills array with ≥3 items",
    agent: "parseAgent",
    fn: "summariseJD",
    input: { text: fix("jd-software-engineer.txt") },
    assertions: [{ type: "array_min_length", field: "required_skills", min: 3 }],
  },
  {
    id: "parse-003",
    description: "Valid SWE JD extracts tech_stack",
    agent: "parseAgent",
    fn: "summariseJD",
    input: { text: fix("jd-software-engineer.txt") },
    assertions: [{ type: "field_exists", field: "tech_stack" }, { type: "array_min_length", field: "tech_stack", min: 2 }],
  },
  {
    id: "parse-004",
    description: "Valid SWE JD extracts seniority_level",
    agent: "parseAgent",
    fn: "summariseJD",
    input: { text: fix("jd-software-engineer.txt") },
    assertions: [{ type: "field_exists", field: "seniority_level" }],
  },
  {
    id: "parse-005",
    description: "Strong SWE resume extracts candidate_name",
    agent: "parseAgent",
    fn: "summariseResume",
    input: { text: fix("resume-strong-swe.txt") },
    assertions: [{ type: "field_exists", field: "candidate_name" }],
  },
  {
    id: "parse-006",
    description: "Strong SWE resume extracts years_total_experience ≥5",
    agent: "parseAgent",
    fn: "summariseResume",
    input: { text: fix("resume-strong-swe.txt") },
    assertions: [{ type: "number_gte", field: "years_total_experience", min: 5 }],
  },
  {
    id: "parse-007",
    description: "Strong SWE resume extracts skills array with ≥5 items",
    agent: "parseAgent",
    fn: "summariseResume",
    input: { text: fix("resume-strong-swe.txt") },
    assertions: [{ type: "array_min_length", field: "skills", min: 5 }],
  },
  {
    id: "parse-008",
    description: "Weak SWE resume still extracts candidate_name without crashing",
    agent: "parseAgent",
    fn: "summariseResume",
    input: { text: fix("resume-weak-swe.txt") },
    assertions: [{ type: "field_exists", field: "candidate_name" }, { type: "no_crash" }],
  },
  {
    id: "parse-009",
    description: "Very short text does not crash summariseJD — returns partial output",
    agent: "parseAgent",
    fn: "summariseJD",
    input: { text: "Senior Engineer needed." },
    assertions: [{ type: "no_crash" }],
  },
  {
    id: "parse-010",
    description: "Strong SWE resume extracts current_title",
    agent: "parseAgent",
    fn: "summariseResume",
    input: { text: fix("resume-strong-swe.txt") },
    assertions: [{ type: "field_exists", field: "current_title" }],
  },
];
