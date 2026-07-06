import { agentQuery } from "../agentClient.js";
import { safeJsonParse } from "../llm.js";

export async function summariseJD(rawText) {
  const prompt = `You are a recruitment analyst. Extract structured information from job descriptions.
Always respond with valid JSON only — no markdown, no explanation.

Extract the following from this job description and return as JSON:
{
  "role_title": "string",
  "seniority_level": "junior|mid|senior|principal",
  "required_skills": ["skill1", "skill2", ...],
  "nice_to_have_skills": ["skill1", ...],
  "key_responsibilities": ["responsibility1", ...],
  "years_experience_required": "string or null",
  "tech_stack": ["tech1", ...],
  "summary": "2-3 sentence plain English summary of the role"
}

Job Description:
${rawText.slice(0, 6000)}`;

  const content = await agentQuery(prompt);
  return safeJsonParse(content, "JD summary");
}

export async function summariseResume(rawText) {
  const prompt = `You are a recruitment analyst. Extract structured information from resumes/CVs.
Always respond with valid JSON only — no markdown, no explanation.

Extract the following from this resume and return as JSON:
{
  "candidate_name": "string",
  "current_title": "string",
  "years_total_experience": "number or null",
  "skills": ["skill1", "skill2", ...],
  "tech_stack": ["tech1", ...],
  "notable_achievements": ["achievement1", ...],
  "education": ["degree1", ...],
  "red_flags": ["anything suspicious or inconsistent"],
  "summary": "2-3 sentence plain English summary of the candidate"
}

Resume:
${rawText.slice(0, 6000)}`;

  const content = await agentQuery(prompt);
  return safeJsonParse(content, "resume summary");
}