import { agentQuery } from "../agentClient.js";
import { safeJsonParse } from "../llm.js";
import { sanitizeInput } from "../utils/sanitize.js";
import { checkContract } from "./contracts.js";
import { prompt, render } from "../prompts/index.js";

export async function analyseAnswer({ question, answer, questionCategory, jdSummary = {}, resumeSummary }) {
  // Deterministic guard (documented in README): empty or ~one-phrase answers need no LLM call
  const wordCount = (answer || "").trim().split(/\s+/).filter(Boolean).length;
  if (!answer || answer.trim().length < 10 || wordCount < 4) {
    return {
      score_technical:     0,
      score_communication: 0,
      score_depth:         0,
      overall_score:       0,
      flags:               ["no_answer"],
      analysis:            "Candidate did not provide a meaningful answer.",
      strength_points:     [],
      gap_points:          ["No answer given"],
    };
  }

  const safeAnswer   = sanitizeInput(answer, 2000);
  const safeQuestion = sanitizeInput(question, 500);

  // Prompts: backend/prompts/answerAgent/{system,user,resume-claims}.md
  const resumeClaims = resumeSummary?.skills?.length
    ? render("answerAgent/resume-claims", {
        current_title: resumeSummary.current_title || "",
        years:         resumeSummary.years_total_experience ?? "?",
        skills:        sanitizeInput(resumeSummary.skills.slice(0, 12).join(", "), 600),
      })
    : "";

  const content = await agentQuery(
    render("answerAgent/user", {
      role_title:    jdSummary?.role_title ?? "",
      seniority:     jdSummary?.seniority_level ?? "",
      resume_claims: resumeClaims,
      category:      questionCategory ?? "",
      question:      safeQuestion,
      answer:        safeAnswer,
    }),
    { label: "answerAgent", systemPrompt: prompt("answerAgent/system") },
  );
  return checkContract("answerAgent", safeJsonParse(content, "answer analysis"));
}