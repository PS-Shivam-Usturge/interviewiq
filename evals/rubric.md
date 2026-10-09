# InterviewIQ — Evaluation Rubric

This is the scoring guide used by the **LLM-as-judge** in `evals/judge/`. The machine-readable copy lives in [`judge/rubrics.js`](judge/rubrics.js); keep the two in sync.

## How judging works

| Method | What it does | Used in |
|---|---|---|
| **Single-answer grading** | The judge scores one output against fixed 1/3/5 anchors per criterion. | `question-011`, `report-011`, `orch-009` |
| **Reference-guided grading** | Same as above, but the judge also gets an *answer key* (expected grade band, flags, key points). | `answer-011` |
| **Pairwise comparison** | The judge compares our output with a hand-written golden output and picks the better one. | `question-012` |
| **Free-form judge** (legacy) | Yes/no question with a 0-10 score. | `question-010`, `report-010` |

**Pass rule for rubric grading:** mean score ≥ **3.5 / 5** and no single criterion below **2**.
**Pass rule for pairwise:** our output must **win or tie** against the reference.

### Judge bias mitigations

| Known judge bias | Mitigation |
|---|---|
| **Position bias** (prefers whichever answer it reads first) | Every pairwise comparison runs twice with A/B swapped. A win only counts if both orderings agree; otherwise it is a tie. |
| **Verbosity bias** (prefers longer answers) | The judge's system prompt states that length is not quality; criteria are about relevance/evidence, not volume. |
| **Vague scoring** | Fixed 1/3/5 anchors per criterion, and the judge must give evidence *before* each score. |
| **Self-preference** (Claude judging Claude) | Judge scores are only one signal: most cases use deterministic assertions, and reference-guided/pairwise checks anchor the judge to human-written expectations. Listed as a known limitation. |
| **Non-determinism** | Identical agent calls are cached within a run so all assertions grade the same output; flaky cases are identified by re-running (see README). |

---

## Rubric: `question_bank` — interview question bank quality

| Criterion | What is judged | 1 | 3 | 5 |
|---|---|---|---|---|
| relevance | Questions test the JD's skills and responsibilities | Mostly generic / off-role | Relevant, some filler | Every question maps to a requirement |
| personalisation | Questions use the candidate's resume to probe claims and gaps | Could be asked to anyone | 1-2 reference the resume | Several deliberately probe resume claims |
| difficulty_fit | Depth matches the seniority level | Clearly too easy/hard | Mostly appropriate | Consistently calibrated |
| coverage | Opening/technical/behavioural/scenario/closing mix, no near-duplicates | Repetitive or missing categories | Minor overlap | Distinct, all categories |
| clarity | Each question is one clear, answerable prompt | Confusing / multi-part tangles | Mostly clear | All crisp |

## Rubric: `followup_question` — follow-up question quality

| Criterion | What is judged | 1 | 3 | 5 |
|---|---|---|---|---|
| targets_gap | Targets what was missing/vague in the answer | Unrelated | Loosely related | Precisely targets the gap |
| specificity | Asks for a concrete, checkable detail | Vague restatement | Somewhat specific | Demands a concrete detail |
| neutrality | Not leading, hostile or answer-revealing | Leading or rude | Mostly neutral | Neutral and professional |

## Rubric: `report` — eligibility report quality

| Criterion | What is judged | 1 | 3 | 5 |
|---|---|---|---|---|
| evidence | Claims cite what the candidate actually said | Generic, no evidence | Some claims cite answers | Nearly all claims grounded |
| calibration | Recommendation/scores consistent with per-answer scores | Contradicts evidence | Roughly consistent | Tightly consistent |
| balance | Fair coverage of strengths and gaps | One-sided | Somewhat balanced | Fair and balanced |
| usefulness | Clear verdict and actionable next steps | Not actionable | Partly | Clear verdict + next steps |

## Rubric: `answer_evaluation` — answer scoring quality (reference-guided)

| Criterion | What is judged | 1 | 3 | 5 |
|---|---|---|---|---|
| grade_agreement | Overall score falls in the reference grade band | Far outside | Within ±2 | Inside the band |
| justification | Analysis names the key strengths/weaknesses in the answer key | Misses key points | Catches some | Catches all |
| flag_accuracy | Raised flags match the reference flags | Wrong flags | Partially right | Exactly right |
