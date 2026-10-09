import { z } from "zod";
import logger from "../logger.js";

const log = logger.child({ component: "Contracts" });

// ── Sub-agent contracts ───────────────────────────────────────────────────────
// One entry per sub-agent: what it is responsible for, what it must NOT do,
// when the orchestrator hands work to it (handoffIn) and what must be true of
// its output before the orchestrator continues (handoffOut).
// The outputSchema is enforced leniently by checkContract(): values are coerced
// and defaulted where possible, and violations are logged rather than thrown so a
// slightly malformed LLM response never stops a live interview.

const clampedScore = (max) => z.coerce.number().catch(0).transform(n => Math.max(0, Math.min(max, n)));
const score10  = clampedScore(10);
const score100 = clampedScore(100);
const strList = z.array(z.coerce.string()).catch([]);

export const CONTRACTS = {
  parseAgent: {
    file: "backend/agents/parseAgent.js",
    responsibility: "Turn raw JD and resume text into structured JSON summaries.",
    outOfScope: "Does not judge the candidate, score anything or generate questions.",
    tools: [],
    handoffIn: "Orchestrator SETUP phase calls parse_documents when summaries are missing or empty.",
    handoffOut: "Returns jd.role_title + required_skills and resume.candidate_name + skills; orchestrator then plans the interview.",
    outputSchema: {
      jd: z.looseObject({
        role_title:      z.coerce.string().catch("the role"),
        seniority_level: z.coerce.string().catch("mid"),
        required_skills: strList,
        tech_stack:      strList,
      }),
      resume: z.looseObject({
        candidate_name:  z.coerce.string().catch("Candidate"),
        current_title:   z.coerce.string().catch(""),
        skills:          strList,
      }),
    },
  },

  questionAgent: {
    file: "backend/agents/questionAgent.js",
    responsibility: "Write the 8-question bank, steered by the orchestrator's focus areas and strategy.",
    outOfScope: "Does not evaluate answers or decide interview flow.",
    tools: [],
    handoffIn: "Orchestrator SETUP phase calls generate_question_bank after parsing, passing focus_areas + reasoning.",
    handoffOut: "Returns ≥1 question, each with category + question text; the session becomes active.",
    outputSchema: z.array(z.looseObject({
      id:       z.coerce.string().catch(""),
      category: z.coerce.string().catch("technical"),
      question: z.string().min(1),
      intent:   z.coerce.string().catch(""),
    })).min(1),
  },

  answerAgent: {
    file: "backend/agents/answerAgent.js",
    responsibility: "Score one answer (technical / communication / depth) and raise flags.",
    outOfScope: "Does not choose follow-up vs advance — that decision belongs to the orchestrator.",
    tools: [],
    handoffIn: "Called once per submitted answer, before the orchestrator's decision loop.",
    handoffOut: "Returns numeric scores 0-10 + flags[]; the orchestrator reads them via evaluate_answer.",
    outputSchema: z.looseObject({
      score_technical:     score10,
      score_communication: score10,
      score_depth:         score10,
      overall_score:       score10,
      flags:               strList,
      strength_points:     strList,
      gap_points:          strList,
      analysis:            z.coerce.string().catch(""),
    }),
  },

  reportAgent: {
    file: "backend/agents/reportAgent.js",
    responsibility: "Write the final eligibility report from all scored answers, observations and the orchestrator's assessment.",
    outOfScope: "Does not re-score individual answers or contact the candidate.",
    tools: [],
    handoffIn: "Orchestrator REPORT phase calls generate_final_report once the session is completed.",
    handoffOut: "Returns overall_score 0-100 + recommendation in {strong_hire, hire, maybe, no_hire}; cached in the reports table.",
    outputSchema: z.looseObject({
      overall_score:  score100,
      recommendation: z.enum(["strong_hire", "hire", "maybe", "no_hire"]).catch("maybe"),
      confidence:     z.enum(["high", "medium", "low"]).catch("low"),
      headline:       z.coerce.string().catch(""),
      strengths:      strList,
      gaps:           strList,
      red_flags:      strList,
      narrative:      z.coerce.string().catch(""),
    }),
  },
};

/**
 * Validate a sub-agent output against its contract.
 * Returns the coerced value on success; on failure logs the issues and returns the
 * original value unchanged (callers keep their existing error handling).
 */
export function checkContract(agent, data, part) {
  const schema = part ? CONTRACTS[agent].outputSchema[part] : CONTRACTS[agent].outputSchema;
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  log.warn({
    agent, part,
    issues: parsed.error.issues.slice(0, 5).map(i => `${i.path.join(".") || "(root)"}: ${i.message}`),
  }, "Sub-agent output violated its contract");
  return data;
}
