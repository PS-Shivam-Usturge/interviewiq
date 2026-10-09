// Uses agentQuery from the existing Claude Agent SDK wrapper — same OAuth token,
// same function the production sub-agents use (no tools, single turn).
import { agentQuery } from "../../backend/agentClient.js";
import { safeJsonParse } from "../../backend/llm.js";
import { RUBRICS, renderRubric } from "./rubrics.js";

// ── Bias mitigations applied to every judge call ──────────────────────────────
// - Rubric anchors: the judge scores against fixed 1/3/5 descriptions, not "vibes".
// - Reason-before-score: the JSON asks for evidence first, then the number.
// - Verbosity bias: the judge is told length is not quality.
// - Position bias (pairwise): every comparison runs twice with A/B swapped; a win
//   only counts if it survives the swap, otherwise it is scored as a tie.
// - Self-preference bias: the judge is Claude judging Claude; we keep criteria
//   objective/checkable and treat judge scores as one signal next to the
//   deterministic assertions (documented as a known limitation).
const JUDGE_SYSTEM = `You are a strict, impartial evaluator of AI agent outputs for an interview-assessment product.
Score only against the rubric you are given. Longer or more confident text is NOT better by default.
Quote or point to concrete evidence before giving any score. Respond with valid JSON only — no markdown.`;

const ask = (prompt) => agentQuery(prompt, { label: "evalJudge", systemPrompt: JUDGE_SYSTEM });

/** Free-form judge used by legacy `llm_judge` assertions. Returns { pass, score, reason }. */
export async function judgeWithLLM(prompt) {
  const content = await ask(prompt);
  return safeJsonParse(content, "judge verdict");
}

/**
 * Single-answer grading against a rubric (optionally reference-guided).
 * Returns { pass, mean, scores: {criterion: n}, reasons, rubric }.
 */
export async function judgeRubric({ rubric, task, output, reference }) {
  const r = RUBRICS[rubric];
  const keys = Object.keys(r.criteria);

  const prompt = `RUBRIC: ${r.title}
Score each criterion from 1 to 5 using these anchors:
${renderRubric(rubric)}

TASK GIVEN TO THE AGENT:
${task}
${reference ? `\nREFERENCE (what a correct output should reflect — use it as the answer key):\n${reference}\n` : ""}
AGENT OUTPUT TO GRADE:
${typeof output === "string" ? output : JSON.stringify(output, null, 1)}

Return JSON exactly like:
{ "evidence": { ${keys.map(k => `"${k}": "<short evidence>"`).join(", ")} },
  "scores":   { ${keys.map(k => `"${k}": <1-5>`).join(", ")} } }`;

  const verdict = safeJsonParse(await ask(prompt), "rubric verdict");
  const scores  = Object.fromEntries(keys.map(k => [k, clamp(Number(verdict?.scores?.[k]))]));
  const values  = Object.values(scores);
  const mean    = +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
  const pass    = mean >= r.passMean && Math.min(...values) >= r.minCriterion;
  return { pass, mean, scores, reasons: verdict?.evidence || {}, rubric };
}

/**
 * Pairwise comparison with position swap. `candidate` is the output under test,
 * `baseline` is the reference/golden output. Runs A/B then B/A.
 * Returns { outcome: "win"|"tie"|"loss", rounds: [...] } — a win/loss only counts
 * when both orderings agree (mitigates position bias).
 */
export async function judgePairwise({ task, criteria, candidate, baseline }) {
  const round = async (first, second) => {
    const prompt = `Compare two outputs for the same task and decide which better satisfies the criteria.

TASK: ${task}
CRITERIA: ${criteria}

OUTPUT A:
${fmt(first)}

OUTPUT B:
${fmt(second)}

Return JSON: { "reason": "<evidence-based comparison>", "winner": "A" | "B" | "tie" }`;
    const v = safeJsonParse(await ask(prompt), "pairwise verdict");
    return { winner: ["A", "B", "tie"].includes(v?.winner) ? v.winner : "tie", reason: v?.reason || "" };
  };

  const r1 = await round(candidate, baseline); // candidate = A
  const r2 = await round(baseline, candidate); // candidate = B
  const c1 = r1.winner === "A" ? "win" : r1.winner === "B" ? "loss" : "tie";
  const c2 = r2.winner === "B" ? "win" : r2.winner === "A" ? "loss" : "tie";
  const outcome = c1 === c2 ? c1 : "tie"; // disagreement between orderings = position bias → tie
  return { outcome, positionConsistent: c1 === c2, rounds: [{ order: "candidate-first", ...r1 }, { order: "baseline-first", ...r2 }] };
}

const clamp = (n) => (Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 1);
const fmt   = (o) => (typeof o === "string" ? o : JSON.stringify(o, null, 1));
