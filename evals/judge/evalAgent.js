import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../backend/.env") });

// Uses agentQuery from the existing Claude Agent SDK wrapper — same OAuth token,
// same function the production sub-agents use. Always runs on Claude regardless
// of the LLM_PROVIDER setting for interview agents.
import { agentQuery } from "../../backend/agentClient.js";
import { safeJsonParse } from "../../backend/llm.js";

export async function judgeWithLLM(prompt) {
  const fullPrompt = `You are an evaluator assessing the quality of AI agent outputs.
Be fair, specific, and evidence-based.
Always respond with valid JSON only — no markdown, no explanation.

${prompt}`;

  const content = await agentQuery(fullPrompt);
  return safeJsonParse(content, "judge verdict");
}
