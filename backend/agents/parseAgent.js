import { agentQuery } from "../agentClient.js";
import { safeJsonParse } from "../llm.js";
import { checkContract } from "./contracts.js";
import { prompt, render } from "../prompts/index.js";

// Prompts: backend/prompts/parseAgent/{jd,resume}.{system,user}.md

export async function summariseJD(rawText) {
  const content = await agentQuery(
    render("parseAgent/jd.user", { jd_text: rawText.slice(0, 6000) }),
    { label: "parseAgent.jd", systemPrompt: prompt("parseAgent/jd.system") },
  );
  return checkContract("parseAgent", safeJsonParse(content, "JD summary"), "jd");
}

export async function summariseResume(rawText) {
  const content = await agentQuery(
    render("parseAgent/resume.user", { resume_text: rawText.slice(0, 6000) }),
    { label: "parseAgent.resume", systemPrompt: prompt("parseAgent/resume.system") },
  );
  return checkContract("parseAgent", safeJsonParse(content, "resume summary"), "resume");
}
