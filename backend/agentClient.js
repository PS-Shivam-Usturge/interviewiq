import { query } from "@anthropic-ai/claude-agent-sdk";
import dotenv from "dotenv";
import logger from "./logger.js";
dotenv.config();

const log = logger.child({ component: "AgentClient" });

// ── Runtime configuration (all optional, see .env.example) ────────────────────
export const AGENT_CONFIG = {
  timeoutMs:      Number(process.env.AGENT_TIMEOUT_MS       || 180_000), // per query() attempt
  // Orchestrator phases whose tools run whole sub-agents (setup → question bank, report → report writer)
  longTimeoutMs:  Number(process.env.AGENT_LONG_TIMEOUT_MS  || 360_000),
  retries:   Number(process.env.AGENT_RETRIES   ?? 1),        // extra attempts after the first
  model:     process.env.AGENT_MODEL || undefined,            // undefined = CLI default model
  // Thinking effort per role (low | medium | high). Lower = faster replies for the candidate.
  effort: {
    extraction:   process.env.SUBAGENT_EFFORT     || "low",    // parseAgent, answerAgent, eval judge
    generation:   process.env.GENERATION_EFFORT   || "medium", // questionAgent, reportAgent
    orchestrator: process.env.ORCHESTRATOR_EFFORT || "medium", // lead interviewer decisions
  },
};

/**
 * Least-privilege baseline shared by every query() in the app.
 *
 * - tools: []            → no built-in Claude Code tools (Bash, Read, Edit, WebFetch, …)
 * - settingSources: []   → ignore ~/.claude and project settings/CLAUDE.md on the host
 * - strictMcpConfig      → only MCP servers we pass explicitly
 * - custom systemPrompt  → replaces the large Claude Code prompt (a one-line test call went from ≈$0.13 to ≈$0.0005)
 *
 * Auth still comes from CLAUDE_CODE_OAUTH_TOKEN (or the local Claude login).
 */
export function baseOptions(extra = {}) {
  return {
    tools:           [],
    settingSources:  [],
    strictMcpConfig: true,
    env:             { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "interviewiq/1.0.0" },
    ...(AGENT_CONFIG.model ? { model: AGENT_CONFIG.model } : {}),
    ...extra,
  };
}

/**
 * Deny-by-default permission handler. Tools listed in `allowedTools` are auto-approved
 * by the SDK and never reach this callback, so anything that does reach it is outside
 * the phase's allow-list — log it and refuse.
 */
export function denyUnlistedTools(label) {
  return async (toolName) => {
    log.warn({ label, toolName }, "Blocked tool outside the phase allow-list");
    return { behavior: "deny", message: `Tool ${toolName} is not permitted in this phase.` };
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run one query() with a hard timeout and bounded retries.
 *
 * onMessage(msg) is called for every streamed SDK message.
 * shouldRetry() lets the caller veto a retry (e.g. the agent already made its decision
 * before the failure, so re-running would duplicate side effects).
 * Returns { sessionId, result } where result is the final SDK result message.
 */
export async function runQuery({ prompt, options, label = "query", onMessage, shouldRetry = () => true, timeoutMs = AGENT_CONFIG.timeoutMs, retries = AGENT_CONFIG.retries }) {
  const attempts = 1 + Math.max(0, retries);
  let lastErr;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutMs);
    const started = Date.now();
    let sessionId = null;
    let result    = null;

    try {
      for await (const msg of query({ prompt, options: { ...options, abortController } })) {
        if (msg.type === "system" && msg.subtype === "init") sessionId = msg.session_id;
        if (msg.type === "result") result = msg;
        onMessage?.(msg);
      }
      // An aborted stream can end quietly instead of throwing — treat it as a timeout
      if (abortController.signal.aborted) throw new Error("aborted");
      log.info({
        label, attempt, sessionId,
        ms:     Date.now() - started,
        turns:  result?.num_turns,
        status: result?.subtype,
      }, "Agent query finished");
      return { sessionId, result };
    } catch (err) {
      const timedOut = abortController.signal.aborted;
      lastErr = timedOut ? new Error(`${label} timed out after ${timeoutMs / 1000}s`) : err;
      log.warn({ label, attempt, attempts, timedOut, err: lastErr.message }, "Agent query failed");
      if (attempt >= attempts || !shouldRetry()) break;
      await sleep(1000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/**
 * Single-turn text generation used by the sub-agents (parse, question, answer, report)
 * and the eval judge: one response, no tools, no agentic loop.
 */
export async function agentQuery(prompt, { label = "subagent", systemPrompt, effort = AGENT_CONFIG.effort.extraction } = {}) {
  let response = "";

  await runQuery({
    prompt,
    label,
    options: baseOptions({
      maxTurns:       1,
      allowedTools:   [],
      persistSession: false,
      effort,
      systemPrompt:   systemPrompt || "You are a specialised sub-agent inside InterviewIQ, an AI interview system. Follow the instructions in the user message exactly and return only what is asked for.",
    }),
    onMessage: (msg) => {
      if (msg.type === "assistant") {
        for (const block of msg.message?.content || []) {
          if (block.type === "text") response += block.text;
        }
      }
    },
    // A partial response is useless for JSON parsing — reset before each retry
    shouldRetry: () => { response = ""; return true; },
  });

  return response;
}
