import { query } from "@anthropic-ai/claude-agent-sdk";
import dotenv from "dotenv";
dotenv.config();

/**
 * Single-turn text generation using the Claude Agent SDK.
 *
 * All sub-agents (parseAgent, questionAgent, answerAgent, reportAgent) use this
 * for prompt-in / text-out calls. Authentication goes through CLAUDE_CODE_OAUTH_TOKEN —
 * the same OAuth flow used by the interview orchestration agent in interviewAgent.js.
 *
 * maxTurns:1 + allowedTools:[] = one response, no tools, no agentic loop.
 */
export async function agentQuery(prompt) {
  let response = "";

  for await (const msg of query({
    prompt,
    options: {
      maxTurns:     1,
      allowedTools: [],         // text-only — block all built-in and MCP tools
      env:          { ...process.env }, // passes CLAUDE_CODE_OAUTH_TOKEN to CLI subprocess
    },
  })) {
    if (msg.type === "assistant") {
      for (const block of msg.message?.content || []) {
        if (block.type === "text") response += block.text;
      }
    }
  }

  return response;
}