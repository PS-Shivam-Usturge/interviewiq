import OpenAI from "openai";
import { query } from "@anthropic-ai/claude-agent-sdk";
import dotenv from "dotenv";
dotenv.config();

const PROVIDER = process.env.LLM_PROVIDER || "claude-sdk";

// ── OpenAI-compat providers (Groq + Gemini — fallback options) ─────────────────

const OA_PROVIDERS = {
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey:  process.env.GEMINI_API_KEY,
    model:   "gemini-2.5-flash-lite",
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    apiKey:  process.env.GROQ_API_KEY,
    model:   "llama-3.3-70b-versatile",
  },
};

// Initialise OpenAI-compat client only when a non-Claude provider is selected
let llm = null;
export let MODEL = "claude-sdk";

if (PROVIDER !== "claude-sdk") {
  const oaProvider = OA_PROVIDERS[PROVIDER];
  if (!oaProvider) {
    throw new Error(`Unknown LLM_PROVIDER: "${PROVIDER}". Valid options: claude-sdk, groq, gemini`);
  }
  llm   = new OpenAI({ baseURL: oaProvider.baseURL, apiKey: oaProvider.apiKey || "placeholder" });
  MODEL = oaProvider.model;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Claude Agent SDK: single-turn text generation ─────────────────────────────
// Sub-agents (parseAgent, questionAgent, answerAgent, reportAgent) need simple
// one-shot LLM calls — no agentic loop required.
// query() with maxTurns:1 and allowedTools:[] is a plain text call that
// authenticates through the same CLAUDE_CODE_OAUTH_TOKEN OAuth flow.

async function claudeAgentChat(messages) {
  // Combine system + user messages into a single prompt string
  const systemMsg = messages.find(m => m.role === "system");
  const userMsgs  = messages.filter(m => m.role !== "system");

  let prompt = "";
  if (systemMsg) {
    const txt = typeof systemMsg.content === "string"
      ? systemMsg.content
      : (systemMsg.content || []).map(b => b.text || "").join("");
    prompt += txt + "\n\n";
  }
  prompt += userMsgs.map(m => {
    if (typeof m.content === "string") return m.content;
    return (m.content || []).map(b => b.text || "").join("");
  }).join("\n\n");

  let response = "";

  for await (const msg of query({
    prompt,
    options: {
      maxTurns:     1,
      allowedTools: [],         // text-only — no built-in or MCP tools
      env:          { ...process.env }, // passes CLAUDE_CODE_OAUTH_TOKEN to CLI subprocess
    },
  })) {
    if (msg.type === "assistant") {
      const content = msg.message?.content || [];
      for (const block of content) {
        if (block.type === "text") response += block.text;
      }
    }
  }

  return response;
}

// ── chat() ─────────────────────────────────────────────────────────────────────
// Used by all sub-agents (parseAgent, questionAgent, answerAgent, reportAgent).
// Routes to Claude Agent SDK (default) or OpenAI-compat client.

export async function chat(messages, opts = {}, retries = 4) {
  if (PROVIDER === "claude-sdk") {
    return claudeAgentChat(messages);
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await llm.chat.completions.create({
        model:           MODEL,
        messages,
        temperature:     opts.temperature ?? 0.7,
        max_tokens:      opts.maxTokens  ?? 8192,
        response_format: opts.json ? { type: "json_object" } : undefined,
      });
      return res.choices[0].message.content;
    } catch (err) {
      const isRateLimit = err?.status === 429;
      const isLast      = attempt === retries;
      if (!isRateLimit || isLast) throw err;
      const delay = Math.pow(2, attempt) * 1500;
      console.warn(`Rate limited — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${retries})`);
      await sleep(delay);
    }
  }
}

// ── chatWithTools() ────────────────────────────────────────────────────────────
// Legacy OpenAI-compat tool-calling path — no longer called now that
// interviewAgent.js uses the Claude Agent SDK directly.

export async function chatWithTools(messages, tools, opts = {}, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await llm.chat.completions.create({
        model:       MODEL,
        messages,
        tools,
        tool_choice: opts.toolChoice ?? "auto",
        temperature: opts.temperature ?? 0.4,
        max_tokens:  opts.maxTokens  ?? 8192,
      });
      return res.choices[0].message;
    } catch (err) {
      const isRateLimit = err?.status === 429;
      const isLast      = attempt === retries;
      if (!isRateLimit || isLast) throw err;
      const delay = Math.pow(2, attempt) * 1500;
      console.warn(`Rate limited — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${retries})`);
      await sleep(delay);
    }
  }
}

// ── safeJsonParse() ────────────────────────────────────────────────────────────
// Safely parse JSON that may be wrapped in markdown fences or preceded by text.
// Claude models sometimes prefix JSON with a sentence — this handles that too.

export function safeJsonParse(raw, label = "JSON") {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  // Happy path
  try { return JSON.parse(cleaned); } catch (_) {}

  // Find the first JSON structure if there is leading prose (common with Claude)
  const jsonStart = cleaned.search(/[{[]/);
  const fromJson  = jsonStart > 0 ? cleaned.slice(jsonStart) : cleaned;

  try { return JSON.parse(fromJson); } catch (_) {}

  // Attempt repair: close any open arrays/objects by counting brackets
  let repaired = fromJson;
  const opens  = (repaired.match(/[{[]/g) || []).length;
  const closes = (repaired.match(/[}\]]/g) || []).length;
  const diff   = opens - closes;

  if (diff > 0) {
    const lastClean = Math.max(
      repaired.lastIndexOf("},"),
      repaired.lastIndexOf("}"),
      repaired.lastIndexOf("],"),
      repaired.lastIndexOf("]")
    );
    if (lastClean > 0) repaired = repaired.slice(0, lastClean + 1);
    for (let i = 0; i < diff; i++) repaired += "}";
  }

  try {
    const result = JSON.parse(repaired);
    console.warn(`  [safeJsonParse] Repaired truncated ${label} response`);
    return result;
  } catch (e) {
    throw new SyntaxError(`${label} could not be parsed even after repair: ${e.message}`);
  }
}
