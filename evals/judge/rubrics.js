// ── Judge rubrics ─────────────────────────────────────────────────────────────
// Machine-readable version of evals/rubric.md. Each criterion is scored 1-5 by the
// LLM judge against the anchors below. A rubric passes when the mean score is at
// least `passMean` AND no single criterion falls below `minCriterion`.

export const RUBRICS = {
  question_bank: {
    title: "Interview question bank quality",
    passMean: 3.5,
    minCriterion: 2,
    criteria: {
      relevance:       { what: "Questions test the skills and responsibilities in the job description.", anchors: { 1: "Mostly generic or off-role", 3: "Relevant but some filler", 5: "Every question maps to a stated requirement" } },
      personalisation: { what: "Questions use the candidate's actual background (resume) to probe claims and gaps.", anchors: { 1: "Could be asked to anyone", 3: "One or two reference the resume", 5: "Several deliberately probe resume claims or gaps" } },
      difficulty_fit:  { what: "Depth matches the requested seniority level.", anchors: { 1: "Clearly too easy/hard", 3: "Mostly appropriate", 5: "Consistently calibrated to the level" } },
      coverage:        { what: "Mix of opening, technical, behavioural, scenario and closing with no near-duplicates.", anchors: { 1: "Repetitive or missing categories", 3: "Minor overlap", 5: "Distinct questions covering all categories" } },
      clarity:         { what: "Each question is a single, clear, answerable prompt.", anchors: { 1: "Confusing or multi-part tangles", 3: "Mostly clear", 5: "All crisp and answerable" } },
    },
  },

  followup_question: {
    title: "Follow-up question quality",
    passMean: 3.5,
    minCriterion: 2,
    criteria: {
      targets_gap:  { what: "The follow-up targets what was missing or vague in the candidate's answer.", anchors: { 1: "Unrelated to the answer", 3: "Loosely related", 5: "Precisely targets the gap" } },
      specificity:  { what: "Asks for concrete detail (an example, a number, a mechanism) rather than a restatement.", anchors: { 1: "Vague restatement", 3: "Somewhat specific", 5: "Demands a concrete, checkable detail" } },
      neutrality:   { what: "Not leading, not hostile, does not give away the answer.", anchors: { 1: "Leading or rude", 3: "Mostly neutral", 5: "Neutral and professional" } },
    },
  },

  report: {
    title: "Eligibility report quality",
    passMean: 3.5,
    minCriterion: 2,
    criteria: {
      evidence:    { what: "Claims (strengths, gaps, ratings) cite what the candidate actually said.", anchors: { 1: "Generic claims, no evidence", 3: "Some claims cite answers", 5: "Nearly every claim is grounded in an answer" } },
      calibration: { what: "Recommendation and scores are consistent with the per-answer scores provided.", anchors: { 1: "Contradicts the evidence", 3: "Roughly consistent", 5: "Tightly consistent and justified" } },
      balance:     { what: "Covers both strengths and gaps fairly; no unsupported praise or harshness.", anchors: { 1: "One-sided", 3: "Somewhat balanced", 5: "Fair and balanced" } },
      usefulness:  { what: "A hiring manager could act on it (clear verdict, concrete next steps).", anchors: { 1: "Not actionable", 3: "Partly actionable", 5: "Clear verdict and next steps" } },
    },
  },

  answer_evaluation: {
    title: "Answer evaluation quality (reference-guided)",
    passMean: 3.5,
    minCriterion: 2,
    criteria: {
      grade_agreement: { what: "The evaluator's overall score falls in or near the reference grade band.", anchors: { 1: "Far outside the band", 3: "Within ±2 of the band", 5: "Inside the band" } },
      justification:   { what: "The analysis names the concrete strengths/weaknesses that the reference notes.", anchors: { 1: "Misses the key points", 3: "Catches some", 5: "Catches all key points" } },
      flag_accuracy:   { what: "Flags raised (vague, evasive, contradicts_resume, …) match the reference.", anchors: { 1: "Wrong flags", 3: "Partially right", 5: "Exactly right" } },
    },
  },
};

export function renderRubric(id) {
  const r = RUBRICS[id];
  if (!r) throw new Error(`Unknown rubric '${id}'`);
  return Object.entries(r.criteria).map(([key, c]) =>
    `- ${key}: ${c.what}\n    1 = ${c.anchors[1]} | 3 = ${c.anchors[3]} | 5 = ${c.anchors[5]}`
  ).join("\n");
}
