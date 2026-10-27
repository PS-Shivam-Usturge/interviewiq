import { agentQuery, AGENT_CONFIG } from "../agentClient.js";
import { safeJsonParse } from "../llm.js";
import { sanitizeInput } from "../utils/sanitize.js";
import { checkContract } from "./contracts.js";
import { prompt, render } from "../prompts/index.js";
import logger from "../logger.js";

const log = logger.child({ component: "QuestionAgent" });

// ── Question bank generation ───────────────────────────────────────────────────

const DIFFICULTIES = ["junior", "mid", "senior", "principal"];
const list = (arr, n, sep = ", ") => (arr || []).slice(0, n).join(sep);

// Prompts: backend/prompts/questionAgent/{system,user,interviewer-plan}.md
// The difficulty guide and JSON format live in the system prompt; the user prompt carries only this call's data.

export async function generateQuestionBank({ jdSummary, resumeSummary, difficulty, focusAreas = [], strategy = "" }) {
  // Interview plan chosen by the orchestrating agent (generate_question_bank tool args)
  const safeFocus    = (focusAreas || []).slice(0, 5).map(f => sanitizeInput(String(f), 120)).filter(Boolean);
  const safeStrategy = sanitizeInput(strategy || "", 600);
  const interviewerPlan = safeFocus.length || safeStrategy
    ? render("questionAgent/interviewer-plan", {
        focus_areas: safeFocus.join("; ") || "n/a",
        strategy:    safeStrategy || "n/a",
      })
    : "";

  const content = await agentQuery(
    render("questionAgent/user", {
      role_title:       sanitizeInput(jdSummary.role_title || "", 200),
      seniority:        jdSummary.seniority_level ?? "",
      required_skills:  list(jdSummary.required_skills, 8),
      tech_stack:       list(jdSummary.tech_stack, 6),
      responsibilities: list(jdSummary.key_responsibilities, 3, "; "),
      candidate_name:   sanitizeInput(resumeSummary.candidate_name || "", 100),
      current_title:    sanitizeInput(resumeSummary.current_title || "", 100),
      years:            resumeSummary.years_total_experience ?? "unknown",
      candidate_skills: list(resumeSummary.skills, 10),
      difficulty:       DIFFICULTIES.includes(difficulty) ? difficulty : "mid",
      interviewer_plan: interviewerPlan,
    }),
    { label: "questionAgent", systemPrompt: prompt("questionAgent/system"), effort: AGENT_CONFIG.effort.generation },
  );
  const bank = safeJsonParse(content, "question bank");

  // Flatten into ordered array
  const ordered = [
    ...(bank.opening     || []),
    ...(bank.technical   || []),
    ...(bank.behavioural || []),
    ...(bank.scenario    || []),
    ...(bank.closing     || []),
  ].map((q, idx) => ({ ...q, index: idx }));

  if (ordered.length === 0) throw new Error("Question bank generation returned no questions");

  log.info({ count: ordered.length, focusAreas: safeFocus }, "Generated question bank");
  return checkContract("questionAgent", ordered);
}

