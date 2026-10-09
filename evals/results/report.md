# InterviewIQ — Evaluation Report

Run at 2026-10-09T10:26:56.756Z · 56 cases · LLM judge on · filter: all

## Summary

**56/56 passed (100%)**

| Agent | Passed | Pass rate |
|---|---|---|
| parseAgent | 10/10 | 100% |
| questionAgent | 13/13 | 100% |
| answerAgent | 11/11 | 100% |
| reportAgent | 11/11 | 100% |
| orchestrator | 10/10 | 100% |
| interviewMemory | 1/1 | 100% |

## Quality gates

| Gate | Result |
|---|---|
| Pass rate ≥ 80% | ✅ 100% |
| No regressions vs baseline | — no baseline yet |

## LLM-as-judge results

| Case | Method | Result | Detail |
|---|---|---|---|
| question-010 | free-form judge | pass | 9/10 |
| question-011 | rubric `question_bank` | pass | mean 4.6/5 — relevance 5, personalisation 4, difficulty_fit 5, coverage 5, clarity 4 |
| question-012 | pairwise vs reference (swapped) | tie | position-consistent: false |
| answer-011 | rubric `answer_evaluation` | pass | mean 3.67/5 — grade_agreement 3, justification 5, flag_accuracy 3 |
| report-010 | free-form judge | pass | 8/10 |
| report-011 | rubric `report` | pass | mean 5/5 — evidence 5, calibration 5, balance 5, usefulness 5 |
| orch-009 | rubric `followup_question` | pass | mean 4.67/5 — targets_gap 5, specificity 5, neutrality 4 |

## Failures and failure modes

No failing cases.

## Watch list (borderline signals in passing cases)

- **question-012** (pairwise): verdict flipped when A/B order was swapped → position bias detected; scored as **tie**, not as a win.
- **answer-011** (answer_evaluation): grade_agreement 3/5, flag_accuracy 3/5 — Agent scored 1/10, reference band is 2-4/10. Just outside the band. / Agent flagged 'vague' and 'no_examples' matching reference exactly, plus added 'overconfident' and 'evasive' which reference does not list.
