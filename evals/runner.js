#!/usr/bin/env node
// ── InterviewIQ eval runner ───────────────────────────────────────────────────
//
//   node evals/runner.js                     run everything, compare to baseline
//   node evals/runner.js --only orchestrator run one agent's cases (repeatable flag)
//   node evals/runner.js --no-judge          skip LLM-judge assertions (cheaper/faster)
//   node evals/runner.js --save-baseline     store this run as the new baseline
//   node evals/runner.js --concurrency 3     cases run in parallel (default 3)
//   node evals/runner.js --report-only       re-render report.md from the last results.json
//
// Quality gates (exit code 1 if any fails):
//   1. overall pass rate ≥ PASS_THRESHOLD (80%)
//   2. regression gate: no case that passed in evals/baseline.json may fail now,
//      and no agent's pass rate may drop by more than AGENT_DROP_TOLERANCE.
//
// Artifacts: evals/results/results.json (machine-readable) + evals/results/report.md

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// evals/ has no node_modules of its own — load backend/.env without importing dotenv
try { process.loadEnvFile?.(path.join(__dirname, "../backend/.env")); } catch { /* optional: local Claude login also works */ }
process.env.LOG_LEVEL ??= "warn"; // keep agent logs out of the eval output (set LOG_LEVEL=info to see them)

// Dynamic imports so LOG_LEVEL is applied before the backend logger is created
const { summariseJD, summariseResume } = await import("../backend/agents/parseAgent.js");
const { generateQuestionBank }         = await import("../backend/agents/questionAgent.js");
const { analyseAnswer }                = await import("../backend/agents/answerAgent.js");
const { buildReport }                  = await import("../backend/agents/reportAgent.js");
const { processAnswer }                = await import("../backend/agents/interviewAgent.js");
const { createMemory, recordTurn, renderMemory } = await import("../backend/agents/interviewMemory.js");
const { judgeWithLLM, judgeRubric, judgePairwise } = await import("./judge/evalAgent.js");

const { default: parseAgentCases }    = await import("./cases/parseAgent.cases.js");
const { default: questionAgentCases } = await import("./cases/questionAgent.cases.js");
const { default: answerAgentCases }   = await import("./cases/answerAgent.cases.js");
const { default: reportAgentCases }   = await import("./cases/reportAgent.cases.js");
const { default: orchestratorCases }  = await import("./cases/orchestrator.cases.js");

const PASS_THRESHOLD       = 0.8;
const AGENT_DROP_TOLERANCE = 0.2;   // an agent may lose at most 20 points of pass rate vs baseline
const RESULTS_DIR   = path.join(__dirname, "results");
const BASELINE_PATH = path.join(__dirname, "baseline.json");

const argv         = process.argv.slice(2);

// --report-only: re-render report.md from the last results.json without calling any model
if (argv.includes("--report-only")) {
  const last = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, "results.json"), "utf-8"));
  fs.writeFileSync(path.join(RESULTS_DIR, "report.md"), renderReport(last));
  console.log("Re-rendered evals/results/report.md from results.json");
  process.exit(0);
}
const only         = argv.flatMap((a, i) => (a === "--only" ? [argv[i + 1]] : []));
const noJudge      = argv.includes("--no-judge");
const saveBaseline = argv.includes("--save-baseline");

// ── Agent function registry ──────────────────────────────────────────────────

async function callAgent(agentName, fnName, input) {
  if (agentName === "parseAgent") {
    if (fnName === "summariseJD")     return summariseJD(input.text);
    if (fnName === "summariseResume") return summariseResume(input.text);
  }
  if (agentName === "questionAgent" && fnName === "generateQuestionBank") return generateQuestionBank(input);
  if (agentName === "answerAgent"   && fnName === "analyseAnswer")        return analyseAnswer(input);
  if (agentName === "reportAgent"   && fnName === "buildReport")          return buildReport(input);

  if (agentName === "orchestrator" && fnName === "decide") {
    // Real Claude Agent SDK tool loop, in-memory session, no DB / no session resume
    const r = await processAnswer({
      sessionId: "eval", session: input.session, transcript: input.transcript,
      previousAnswers: [], useSession: false,
    });
    return {
      action:           r.decision.action,
      verdict:          r.decision.verdict || r.decision.preliminary_verdict || null,
      reasoning:        r.decision.reasoning,
      followUpQuestion: r.decision.followUpQuestion || null,
      observations:     r.observations || [],
      flags:            r.evaluation.flags || [],
      overall:          r.evaluation.overall_score,
      askedQuestion:    r.askedQuestion,
      toolsCalled:      r.toolEvents.map(e => e.tool.replace("mcp__interview_tools__", "")),
    };
  }

  if (agentName === "interviewMemory" && fnName === "simulate") {
    let mem = createMemory({ focusAreas: ["idempotency", "Kafka"], strategy: "Probe payments depth." });
    for (let i = 0; i < input.turns; i++) {
      mem = recordTurn(mem, {
        index: i, category: "technical", isFollowUp: false,
        evaluation: { overall_score: 5, score_technical: 5, score_depth: 4, flags: i % 2 ? ["vague"] : [] },
        decision:   { action: "advance", verdict: "adequate", reasoning: "x".repeat(400) },
        observations: i === 1 ? [{ severity: "warning", observation: "Avoids specifics." }] : [],
      });
    }
    const text = renderMemory(mem);
    return {
      detailedTurns:  mem.turns.length,
      compactedTurns: mem.earlier?.count || 0,
      planKept:       mem.plan.focusAreas.length === 2 && text.includes("idempotency"),
      concernsKept:   mem.concerns.length === 1 && text.includes("Avoids specifics"),
      renderedChars:  text.length,
    };
  }

  throw new Error(`Unknown agent/fn: ${agentName}.${fnName}`);
}

// Identical (agent, fn, input) calls are made once per run and graded by several
// cases — e.g. one generated question bank checked for count, categories, quality.
const callCache = new Map();
function cachedCall(tc) {
  const key = JSON.stringify([tc.agent, tc.fn, tc.input]);
  if (!callCache.has(key)) callCache.set(key, callAgent(tc.agent, tc.fn, tc.input));
  return callCache.get(key);
}

// ── Assertion engine ─────────────────────────────────────────────────────────

function getField(obj, field) {
  if (field === "_root") return obj;
  return String(field).split(".").reduce((o, k) => o?.[k], obj);
}

async function runAssertions(result, assertions, caseId, judgeLog) {
  const failures = [];
  for (const assertion of assertions) {
    const value = getField(result, assertion.field);
    try {
      switch (assertion.type) {
        case "no_crash":
          break;
        case "field_exists":
          if (value === undefined || value === null) failures.push(`'${assertion.field}' missing`);
          break;
        case "field_equals":
          if (value !== assertion.value) failures.push(`'${assertion.field}' expected ${JSON.stringify(assertion.value)}, got ${JSON.stringify(value)}`);
          break;
        case "field_in_set":
          if (!assertion.values.includes(value)) failures.push(`'${assertion.field}' expected one of [${assertion.values}], got ${JSON.stringify(value)}`);
          break;
        case "array_min_length":
          if (!Array.isArray(value) || value.length < assertion.min) failures.push(`'${assertion.field}' expected array with ≥${assertion.min} items, got ${Array.isArray(value) ? value.length : typeof value}`);
          break;
        case "array_length":
          if (!Array.isArray(value) || value.length !== assertion.length) failures.push(`'${assertion.field}' expected array of length ${assertion.length}, got ${Array.isArray(value) ? value.length : typeof value}`);
          break;
        case "array_includes":
          if (!Array.isArray(value) || !value.includes(assertion.value)) failures.push(`'${assertion.field}' expected to include '${assertion.value}', got ${JSON.stringify(value)}`);
          break;
        case "array_has_item_with_field_value":
          if (!Array.isArray(value) || !value.some(item => item[assertion.itemField] === assertion.value)) failures.push(`'${assertion.field}' expected an item with ${assertion.itemField}='${assertion.value}'`);
          break;
        case "array_items_unique": {
          const vals = (value || []).map(item => item[assertion.itemField]);
          if (new Set(vals).size !== vals.length) failures.push(`'${assertion.field}' has duplicate ${assertion.itemField} values`);
          break;
        }
        case "every_item_has_nonempty_field":
          if (!Array.isArray(value) || !value.every(item => item[assertion.itemField] && String(item[assertion.itemField]).trim().length > 0)) failures.push(`not every item in '${assertion.field}' has a non-empty '${assertion.itemField}'`);
          break;
        case "number_gte":
          if (typeof value !== "number" || value < assertion.min) failures.push(`'${assertion.field}' expected ≥${assertion.min}, got ${value}`);
          break;
        case "number_lte":
          if (typeof value !== "number" || value > assertion.max) failures.push(`'${assertion.field}' expected ≤${assertion.max}, got ${value}`);
          break;
        case "number_between":
          if (typeof value !== "number" || value < assertion.min || value > assertion.max) failures.push(`'${assertion.field}' expected ${assertion.min}–${assertion.max}, got ${value}`);
          break;
        case "string_min_length":
          if (typeof value !== "string" || value.length < assertion.min) failures.push(`'${assertion.field}' expected string with ≥${assertion.min} chars, got ${typeof value === "string" ? value.length : typeof value}`);
          break;
        case "predicate":
          if (!assertion.fn(result)) failures.push(`predicate failed: ${assertion.label}`);
          break;

        // ── LLM-as-judge assertions ──────────────────────────────────────────
        case "llm_judge": {
          if (noJudge) break;
          const j = await judgeWithLLM(assertion.prompt(result));
          judgeLog.push({ type: "llm_judge", pass: !!j.pass, score: j.score, reason: j.reason });
          if (!j.pass) failures.push(`LLM judge failed (score ${j.score}/10): ${j.reason}`);
          break;
        }
        case "llm_judge_rubric": {
          if (noJudge) break;
          const j = await judgeRubric({
            rubric:    assertion.rubric,
            task:      assertion.task(result),
            output:    assertion.output(result),
            reference: assertion.reference,
          });
          judgeLog.push({ type: "rubric", ...j });
          if (!j.pass) failures.push(`rubric '${assertion.rubric}' failed: mean ${j.mean}/5 ${JSON.stringify(j.scores)}`);
          break;
        }
        case "llm_judge_pairwise": {
          if (noJudge) break;
          const j = await judgePairwise({
            task:      assertion.task,
            criteria:  assertion.criteria,
            candidate: assertion.candidate(result),
            baseline:  assertion.baseline(result),
          });
          judgeLog.push({ type: "pairwise", ...j });
          if (!assertion.allow.includes(j.outcome)) failures.push(`pairwise vs reference: ${j.outcome} (position-consistent: ${j.positionConsistent})`);
          break;
        }
        default:
          failures.push(`unknown assertion type '${assertion.type}'`);
      }
    } catch (err) {
      failures.push(`assertion '${assertion.type}' threw: ${err.message}`);
    }
  }
  return failures;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const allCases = [
  ...parseAgentCases, ...questionAgentCases, ...answerAgentCases,
  ...reportAgentCases, ...orchestratorCases,
].filter(tc => !only.length || only.includes(tc.agent) || (tc.agent === "interviewMemory" && only.includes("orchestrator")));

const concIdx     = argv.indexOf("--concurrency");
const CONCURRENCY = Math.max(1, Number(concIdx > -1 ? argv[concIdx + 1] : 3));

const byAgent = {};
const started = Date.now();

console.log(`\nInterviewIQ Eval Runner — ${allCases.length} test cases, concurrency ${CONCURRENCY}${noJudge ? " (LLM judge skipped)" : ""}\n${"─".repeat(78)}`);

async function runCase(tc) {
  const t0 = Date.now();
  const judgeLog = [];
  let failures = [];
  let result;
  try {
    result = await cachedCall(tc);
  } catch (err) {
    if (!tc.assertions.some(a => a.type === "no_crash")) failures = [`agent threw: ${err.message}`];
    result = {};
  }
  if (!failures.length) failures = await runAssertions(result, tc.assertions, tc.id, judgeLog);

  const pass = failures.length === 0;
  console.log(`  ${tc.id.padEnd(14)} ${tc.description.slice(0, 54).padEnd(56)} ${pass ? "PASS" : "FAIL"}`);
  for (const f of failures) console.log(`      ↳ ${f}`);
  return { id: tc.id, agent: tc.agent, description: tc.description, pass, failures, judge: judgeLog, ms: Date.now() - t0 };
}

// Small worker pool — results keep the original case order
const cases = new Array(allCases.length);
let next = 0;
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allCases.length) }, async () => {
  while (next < allCases.length) {
    const i = next++;
    cases[i] = await runCase(allCases[i]);
  }
}));

for (const c of cases) {
  byAgent[c.agent] ??= { total: 0, passed: 0 };
  byAgent[c.agent].total++;
  if (c.pass) byAgent[c.agent].passed++;
}

const total    = cases.length;
const passed   = cases.filter(c => c.pass).length;
const passRate = total ? passed / total : 0;
for (const s of Object.values(byAgent)) s.passRate = +(s.passed / s.total).toFixed(3);

// ── Regression gate vs baseline ──────────────────────────────────────────────
const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8")) : null;
const regressions = [];
const fixedSinceBaseline = [];
if (baseline) {
  const basePassed = new Set(baseline.passedIds || []);
  for (const c of cases) {
    if (basePassed.has(c.id) && !c.pass) regressions.push({ id: c.id, reason: "passed in baseline, fails now" });
    if (!basePassed.has(c.id) && c.pass && (baseline.caseIds || []).includes(c.id)) fixedSinceBaseline.push(c.id);
  }
  for (const [agent, s] of Object.entries(byAgent)) {
    const b = baseline.byAgent?.[agent];
    if (b && s.total === b.total && b.passRate - s.passRate > AGENT_DROP_TOLERANCE) {
      regressions.push({ id: agent, reason: `pass rate dropped ${Math.round(b.passRate * 100)}% → ${Math.round(s.passRate * 100)}%` });
    }
  }
}

const gates = {
  passThreshold: { required: PASS_THRESHOLD, actual: +passRate.toFixed(3), ok: passRate >= PASS_THRESHOLD },
  regression:    { baseline: baseline ? baseline.runAt : null, regressions: regressions.length, ok: regressions.length === 0 || saveBaseline },
};
const ok = gates.passThreshold.ok && gates.regression.ok;

// ── Console summary ──────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(78)}\nResults: ${passed}/${total} passed (${Math.round(passRate * 100)}%) in ${Math.round((Date.now() - started) / 1000)}s\n`);
for (const [agent, s] of Object.entries(byAgent)) console.log(`  ${agent.padEnd(18)} ${s.passed}/${s.total}`);
console.log(`\nGate 1 — pass rate ≥ ${PASS_THRESHOLD * 100}%: ${gates.passThreshold.ok ? "OK" : "FAILED"}`);
console.log(`Gate 2 — no regressions vs baseline: ${baseline ? (regressions.length ? `FAILED (${regressions.map(r => r.id).join(", ")})` : "OK") : "no baseline yet (run with --save-baseline)"}`);
if (fixedSinceBaseline.length) console.log(`Improved since baseline: ${fixedSinceBaseline.join(", ")}`);

// ── Artifacts ────────────────────────────────────────────────────────────────
fs.mkdirSync(RESULTS_DIR, { recursive: true });
const runAt = new Date().toISOString();
const results = {
  runAt, provider: "claude-agent-sdk", filter: only.length ? only : "all", judge: !noJudge,
  summary: { total, passed, passRate: +passRate.toFixed(3) },
  byAgent, gates, regressions, fixedSinceBaseline,
  failures: cases.filter(c => !c.pass).map(c => ({ id: c.id, description: c.description, reasons: c.failures })),
  cases,
};
fs.writeFileSync(path.join(RESULTS_DIR, "results.json"), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(RESULTS_DIR, "report.md"), renderReport(results));
console.log(`\nResults written to evals/results/results.json and evals/results/report.md`);

if (saveBaseline) {
  if (only.length) {
    console.log("Not saving baseline from a filtered run — run the full suite with --save-baseline.");
  } else {
    fs.writeFileSync(BASELINE_PATH, JSON.stringify({
      runAt, judge: !noJudge, summary: results.summary, byAgent,
      caseIds: cases.map(c => c.id), passedIds: cases.filter(c => c.pass).map(c => c.id),
    }, null, 2));
    console.log("Baseline saved to evals/baseline.json");
  }
}

process.exit(ok ? 0 : 1);

// ── Markdown report ──────────────────────────────────────────────────────────
function renderReport(r) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const judged = r.cases.flatMap(c => c.judge.map(j => ({ id: c.id, ...j })));
  return `# InterviewIQ — Evaluation Report

Run at ${r.runAt} · ${r.summary.total} cases · LLM judge ${r.judge ? "on" : "off"} · filter: ${Array.isArray(r.filter) ? r.filter.join(", ") : r.filter}

## Summary

**${r.summary.passed}/${r.summary.total} passed (${pct(r.summary.passRate)})**

| Agent | Passed | Pass rate |
|---|---|---|
${Object.entries(r.byAgent).map(([a, s]) => `| ${a} | ${s.passed}/${s.total} | ${pct(s.passRate)} |`).join("\n")}

## Quality gates

| Gate | Result |
|---|---|
| Pass rate ≥ ${pct(r.gates.passThreshold.required)} | ${r.gates.passThreshold.ok ? "✅" : "❌"} ${pct(r.gates.passThreshold.actual)} |
| No regressions vs baseline | ${r.gates.regression.baseline ? (r.regressions.length ? `❌ ${r.regressions.map(x => `${x.id} (${x.reason})`).join("; ")}` : `✅ (baseline ${r.gates.regression.baseline})`) : "— no baseline yet"} |

## LLM-as-judge results

| Case | Method | Result | Detail |
|---|---|---|---|
${judged.map(j => j.type === "rubric"
    ? `| ${j.id} | rubric \`${j.rubric}\` | ${j.pass ? "pass" : "fail"} | mean ${j.mean}/5 — ${Object.entries(j.scores).map(([k, v]) => `${k} ${v}`).join(", ")} |`
    : j.type === "pairwise"
      ? `| ${j.id} | pairwise vs reference (swapped) | ${j.outcome} | position-consistent: ${j.positionConsistent} |`
      : `| ${j.id} | free-form judge | ${j.pass ? "pass" : "fail"} | ${j.score}/10 |`).join("\n") || "| — | — | — | judge skipped |"}

## Failures and failure modes

${r.failures.length ? r.failures.map(f => `- **${f.id}** — ${f.description}\n${f.reasons.map(x => `  - ${x}`).join("\n")}`).join("\n") : "No failing cases."}

## Watch list (borderline signals in passing cases)

${watchList(judged).join("\n") || "Nothing borderline."}
`;
}

// Passing-but-weak signals worth tracking before they become failures
function watchList(judged) {
  const items = [];
  for (const j of judged) {
    if (j.type === "rubric") {
      const weak = Object.entries(j.scores).filter(([, v]) => v <= 3);
      if (weak.length) items.push(`- **${j.id}** (${j.rubric}): ${weak.map(([k, v]) => `${k} ${v}/5`).join(", ")} — ${weak.map(([k]) => j.reasons?.[k]).filter(Boolean).join(" / ")}`);
    }
    if (j.type === "pairwise" && !j.positionConsistent) {
      items.push(`- **${j.id}** (pairwise): verdict flipped when A/B order was swapped → position bias detected; scored as **${j.outcome}**, not as a win.`);
    }
    if (j.type === "llm_judge" && typeof j.score === "number" && j.score <= 6) {
      items.push(`- **${j.id}** (free-form judge): passed with a low score ${j.score}/10 — ${j.reason}`);
    }
  }
  return items;
}
