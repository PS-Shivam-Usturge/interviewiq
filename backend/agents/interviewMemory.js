// ── Interview memory (context engineering) ────────────────────────────────────
// A compact, structured record of what the orchestrator has learned so far.
// It is carried forward into every agent prompt instead of raw transcripts, so the
// context stays small and stable however long the interview runs:
//
//   - plan:      focus areas + strategy chosen during setup (never dropped)
//   - turns:     one line per answered turn — scores, flags, decision, short reason
//   - earlier:   older turns compacted into a single rolling summary line
//   - concerns:  cross-question observations (never dropped)
//   - pendingFollowUp: the follow-up question currently awaiting an answer
//
// Pure functions only — persistence lives in sessionStore.js.

const MAX_DETAILED_TURNS = 6;   // older turns are folded into `earlier`
const NOTE_CHARS         = 160;

const trim = (s, n) => {
  const str = String(s || "").replace(/\s+/g, " ").trim();
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
};

export function createMemory({ focusAreas = [], strategy = "" } = {}) {
  return {
    version: 1,
    plan: { focusAreas: focusAreas.slice(0, 5), strategy: trim(strategy, 400) },
    turns: [],
    earlier: null,
    concerns: [],
    pendingFollowUp: null,
  };
}

/** Normalise whatever is stored in the DB (null, legacy, partial) into a memory object. */
export function loadMemory(raw) {
  const base = createMemory();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    plan:     { ...base.plan, ...(raw.plan || {}) },
    turns:    Array.isArray(raw.turns) ? raw.turns : [],
    concerns: Array.isArray(raw.concerns) ? raw.concerns : [],
  };
}

/** Append one answered turn and compact older turns. Returns a new memory object. */
export function recordTurn(memory, { index, category, isFollowUp, evaluation, decision, observations = [] }) {
  const mem = loadMemory(memory);

  const turn = {
    q:        index + 1,
    category,
    followUp: !!isFollowUp,
    overall:  Number(evaluation?.overall_score ?? 0),
    tech:     Number(evaluation?.score_technical ?? 0),
    depth:    Number(evaluation?.score_depth ?? 0),
    flags:    (evaluation?.flags || []).slice(0, 4),
    action:   decision?.action || "advance",
    verdict:  decision?.verdict || decision?.preliminary_verdict || null,
    note:     trim(decision?.reasoning, NOTE_CHARS),
  };

  let turns   = [...mem.turns, turn];
  let earlier = mem.earlier;

  // Compaction: fold the oldest turns into a rolling summary, keep the latest N verbatim
  if (turns.length > MAX_DETAILED_TURNS) {
    const folded = turns.slice(0, turns.length - MAX_DETAILED_TURNS);
    turns = turns.slice(-MAX_DETAILED_TURNS);
    earlier = mergeEarlier(earlier, folded);
  }

  const concerns = [
    ...mem.concerns,
    ...observations.map(o => ({ q: index + 1, severity: o.severity, text: trim(o.observation, 200) })),
  ].slice(-8);

  const pendingFollowUp = decision?.action === "followup"
    ? { index, question: trim(decision.followUpQuestion, 400) }
    : null;

  return { ...mem, turns, earlier, concerns, pendingFollowUp };
}

function mergeEarlier(prev, folded) {
  const count   = (prev?.count || 0) + folded.length;
  const sum     = (prev?.overallSum || 0) + folded.reduce((s, t) => s + (t.overall || 0), 0);
  const flags   = { ...(prev?.flagCounts || {}) };
  for (const t of folded) for (const f of t.flags || []) flags[f] = (flags[f] || 0) + 1;
  const verdicts = [...(prev?.verdicts || []), ...folded.map(t => `Q${t.q}${t.followUp ? "f" : ""}:${t.verdict || t.action}`)].slice(-12);
  return { count, overallSum: sum, flagCounts: flags, verdicts };
}

/** Render memory as a compact text block for the agent prompt. */
export function renderMemory(memory) {
  const mem = loadMemory(memory);
  const lines = [];

  if (mem.plan.focusAreas.length || mem.plan.strategy) {
    lines.push(`Interview plan: focus on ${mem.plan.focusAreas.join("; ") || "n/a"}${mem.plan.strategy ? ` — ${mem.plan.strategy}` : ""}`);
  }
  if (mem.earlier) {
    const avg   = (mem.earlier.overallSum / Math.max(1, mem.earlier.count)).toFixed(1);
    const flags = Object.entries(mem.earlier.flagCounts).map(([f, n]) => `${f}×${n}`).join(", ") || "none";
    lines.push(`Earlier turns (compacted, ${mem.earlier.count}): avg overall ${avg}/10; flags ${flags}; verdicts ${mem.earlier.verdicts.join(" ")}`);
  }
  for (const t of mem.turns) {
    lines.push(`Q${t.q}${t.followUp ? " (follow-up answer)" : ""} [${t.category}] overall ${t.overall}/10 (tech ${t.tech}, depth ${t.depth})` +
      `${t.flags.length ? ` flags: ${t.flags.join(",")}` : ""} → ${t.action}${t.verdict ? ` (${t.verdict})` : ""}${t.note ? ` — ${t.note}` : ""}`);
  }
  if (mem.concerns.length) {
    lines.push("Recorded concerns:");
    for (const c of mem.concerns) lines.push(`  - [${c.severity}] (Q${c.q}) ${c.text}`);
  }

  return lines.length ? lines.join("\n") : "No answers yet.";
}

/** Score trend across all turns (including compacted ones) — used by the report phase. */
export function memoryStats(memory) {
  const mem   = loadMemory(memory);
  const count = (mem.earlier?.count || 0) + mem.turns.length;
  const sum   = (mem.earlier?.overallSum || 0) + mem.turns.reduce((s, t) => s + (t.overall || 0), 0);
  return { answeredTurns: count, avgOverall: count ? +(sum / count).toFixed(1) : null };
}
