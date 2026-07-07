import { agentQuery } from "../agentClient.js";
import { safeJsonParse } from "../llm.js";

export async function analyseAnswer({ question, answer, questionCategory, jdSummary }) {
  if (!answer || answer.trim().length < 10) {
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

  const prompt = `You are an expert technical interviewer scoring a candidate's answer.
Be fair but rigorous. Base scores on the evidence in the answer only.
Always respond with valid JSON only — no markdown, no explanation.

Score this interview answer.

ROLE: ${jdSummary.role_title} (${jdSummary.seniority_level})
QUESTION CATEGORY: ${questionCategory}
QUESTION: "${question}"
CANDIDATE ANSWER: "${answer.slice(0, 2000)}"

Return JSON with this exact structure:
{
  "score_technical": <0-10, technical correctness and accuracy>,
  "score_communication": <0-10, clarity, structure, conciseness>,
  "score_depth": <0-10, depth of understanding, not just surface level>,
  "overall_score": <0-10, weighted average>,
  "strength_points": ["what the candidate did well"],
  "gap_points": ["what was missing or weak"],
  "flags": <array of zero or more: "vague", "inaccurate", "contradicts_resume", "no_examples", "overconfident", "underconfident", "evasive">,
  "analysis": "2-3 sentence plain English evaluation of this answer"
}`;

  const content = await agentQuery(prompt);
  return safeJsonParse(content, "answer analysis");
}