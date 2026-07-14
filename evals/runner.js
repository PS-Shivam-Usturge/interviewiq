#!/usr/bin/env node
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../backend/.env") });

import { summariseJD, summariseResume } from "../backend/agents/parseAgent.js";
import { generateQuestionBank } from "../backend/agents/questionAgent.js";
import { analyseAnswer } from "../backend/agents/answerAgent.js";
import { judgeWithLLM } from "./judge/evalAgent.js";

import parseAgentCases   from "./cases/parseAgent.cases.js";
import questionAgentCases from "./cases/questionAgent.cases.js";
import answerAgentCases  from "./cases/answerAgent.cases.js";
import reportAgentCases  from "./cases/reportAgent.cases.js";

// ── Agent function registry ──────────────────────────────────────────────────

async function callAgent(agentName, fnName, input) {
  if (agentName === "parseAgent") {
    if (fnName === "summariseJD")     return summariseJD(input.text);
    if (fnName === "summariseResume") return summariseResume(input.text);
  }
  if (agentName === "questionAgent") {
    if (fnName === "generateQuestionBank") return generateQuestionBank(input);
  }
  if (agentName === "answerAgent") {
    if (fnName === "analyseAnswer") return analyseAnswer(input);
  }
  if (agentName === "reportAgent" && fnName === "generateReportFromAnswers") {
    // Inline report generation using the same prompt logic as reportAgent.js
    // but without requiring a real session ID in the DB
    const { agentQuery } = await import("../backend/agentClient.js");
    const { safeJsonParse } = await import("../backend/llm.js");
    const { jdSummary, resumeSummary, answers } = input;
    const answerSummary = answers.map((a) => ({
      q: a.question, category: a.question_category,
      answer: (a.transcript || "").slice(0, 400),
      scores: { technical: a.score_technical, communication: a.score_communication, depth: a.score_depth },
      flags: a.flags, analysis: a.analysis,
    }));
    const prompt = `You are a senior hiring manager writing a formal candidate eligibility report.
Be honest, balanced, and evidence-based.
Always respond with valid JSON only — no markdown, no explanation.

ROLE: ${jdSummary.role_title} (${jdSummary.seniority_level})
CANDIDATE: ${resumeSummary.candidate_name} — ${resumeSummary.years_total_experience} years experience

ANSWERS:
${JSON.stringify(answerSummary, null, 1)}

Return JSON with fields: overall_score (0-100), recommendation (strong_hire|hire|maybe|no_hire), confidence (high|medium|low), headline (string), strengths (array), gaps (array), red_flags (array), skill_ratings (array of {skill,rating,evidence}), narrative (string), suggested_next_steps (array)`;
    const content = await agentQuery(prompt);
    return safeJsonParse(content, "eval report");
  }
  throw new Error(`Unknown agent/fn: ${agentName}.${fnName}`);
}

// ── Assertion engine ─────────────────────────────────────────────────────────

function getField(obj, field) {
  return field === "_root" ? obj : obj?.[field];
}

async function runAssertions(result, assertions, caseId) {
  const failures = [];
  for (const assertion of assertions) {
    const value = getField(result, assertion.field);
    try {
      switch (assertion.type) {
        case "no_crash":
          // If we got here, no crash
          break;
        case "field_exists":
          if (value === undefined || value === null) failures.push(`${caseId}: field '${assertion.field}' missing`);
          break;
        case "field_equals":
          if (value !== assertion.value) failures.push(`${caseId}: '${assertion.field}' expected ${assertion.value}, got ${value}`);
          break;
        case "field_in_set":
          if (!assertion.values.includes(value)) failures.push(`${caseId}: '${assertion.field}' expected one of [${assertion.values}], got ${value}`);
          break;
        case "array_min_length":
          if (!Array.isArray(value) || value.length < assertion.min) failures.push(`${caseId}: '${assertion.field}' expected array with ≥${assertion.min} items, got ${Array.isArray(value) ? value.length : typeof value}`);
          break;
        case "array_length":
          if (!Array.isArray(value) || value.length !== assertion.length) failures.push(`${caseId}: '${assertion.field}' expected array of length ${assertion.length}, got ${Array.isArray(value) ? value.length : typeof value}`);
          break;
        case "array_includes":
          if (!Array.isArray(value) || !value.includes(assertion.value)) failures.push(`${caseId}: '${assertion.field}' expected to include '${assertion.value}', got ${JSON.stringify(value)}`);
          break;
        case "array_has_item_with_field_value":
          if (!Array.isArray(value) || !value.some(item => item[assertion.itemField] === assertion.value)) failures.push(`${caseId}: '${assertion.field}' expected an item with ${assertion.itemField}='${assertion.value}'`);
          break;
        case "array_items_unique": {
          const vals = (value || []).map(item => item[assertion.itemField]);
          const unique = new Set(vals);
          if (unique.size !== vals.length) failures.push(`${caseId}: '${assertion.field}' has duplicate ${assertion.itemField} values`);
          break;
        }
        case "every_item_has_nonempty_field":
          if (!Array.isArray(value) || !value.every(item => item[assertion.itemField] && String(item[assertion.itemField]).trim().length > 0)) failures.push(`${caseId}: not every item in '${assertion.field}' has a non-empty '${assertion.itemField}'`);
          break;
        case "number_gte":
          if (typeof value !== "number" || value < assertion.min) failures.push(`${caseId}: '${assertion.field}' expected ≥${assertion.min}, got ${value}`);
          break;
        case "number_lte":
          if (typeof value !== "number" || value > assertion.max) failures.push(`${caseId}: '${assertion.field}' expected ≤${assertion.max}, got ${value}`);
          break;
        case "number_between":
          if (typeof value !== "number" || value < assertion.min || value > assertion.max) failures.push(`${caseId}: '${assertion.field}' expected ${assertion.min}–${assertion.max}, got ${value}`);
          break;
        case "string_min_length":
          if (typeof value !== "string" || value.length < assertion.min) failures.push(`${caseId}: '${assertion.field}' expected string with ≥${assertion.min} chars, got ${typeof value === "string" ? value.length : typeof value}`);
          break;
        case "llm_judge": {
          const judgement = await judgeWithLLM(assertion.prompt(result));
          if (!judgement.pass) failures.push(`${caseId}: LLM judge failed (score ${judgement.score}/10): ${judgement.reason}`);
          break;
        }
        default:
          failures.push(`${caseId}: unknown assertion type '${assertion.type}'`);
      }
    } catch (err) {
      failures.push(`${caseId}: assertion '${assertion.type}' threw: ${err.message}`);
    }
  }
  return failures;
}

// ── Main runner ───────────────────────────────────────────────────────────────

const allCases = [
  ...parseAgentCases,
  ...questionAgentCases,
  ...answerAgentCases,
  ...reportAgentCases,
];

const byAgent = {};
const failures = [];
let passed = 0;

console.log(`\nInterviewIQ Eval Runner — ${allCases.length} test cases\n${"─".repeat(50)}`);

for (const tc of allCases) {
  process.stdout.write(`  ${tc.id.padEnd(16)} ${tc.description.slice(0, 60).padEnd(62)} `);
  const agentKey = tc.agent;
  if (!byAgent[agentKey]) byAgent[agentKey] = { total: 0, passed: 0 };
  byAgent[agentKey].total++;

  let result;
  try {
    result = await callAgent(tc.agent, tc.fn, tc.input);
  } catch (err) {
    const hasCrashAssertion = tc.assertions.some(a => a.type === "no_crash");
    if (!hasCrashAssertion) {
      const msg = `${tc.id}: agent threw: ${err.message}`;
      failures.push({ id: tc.id, description: tc.description, reason: msg });
      process.stdout.write("FAIL\n");
      continue;
    }
    result = {};
  }

  const assertionFailures = await runAssertions(result, tc.assertions, tc.id);
  if (assertionFailures.length === 0) {
    byAgent[agentKey].passed++;
    passed++;
    process.stdout.write("PASS\n");
  } else {
    failures.push({ id: tc.id, description: tc.description, reasons: assertionFailures });
    process.stdout.write("FAIL\n");
    for (const f of assertionFailures) console.log(`    ↳ ${f}`);
  }
}

const total     = allCases.length;
const passRate  = total > 0 ? (passed / total) : 0;
const runAt     = new Date().toISOString();
const provider  = process.env.LLM_PROVIDER || "claude-sdk";

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed}/${total} passed (${Math.round(passRate * 100)}%)\n`);

for (const [agent, stats] of Object.entries(byAgent)) {
  console.log(`  ${agent.padEnd(20)} ${stats.passed}/${stats.total}`);
}

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  ✗ ${f.id}: ${f.description}`);
    for (const r of f.reasons || [f.reason]) console.log(`      ${r}`);
  }
}

// Write results artifact
const resultsDir = path.join(__dirname, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

const results = { runAt, provider, summary: { total, passed, passRate }, byAgent, failures };
fs.writeFileSync(path.join(resultsDir, "results.json"), JSON.stringify(results, null, 2));
console.log(`\nResults written to evals/results/results.json`);

process.exit(passRate >= 0.8 ? 0 : 1);
