# InterviewIQ — Codebase Context

> Paste this file at the start of a new chat to give a quick, accurate picture of the project.
> The README is the full reference; this is the short version.

## What it is

An agentic AI interviewer. HR uploads a JD + resume; a **lead interviewer agent** (Claude Agent SDK tool loop) plans the interview, delegates to specialist sub-agents, runs a voice interview with the candidate (follow-up / advance / conclude early decisions), and produces an evidence-based hiring report. Built for the L3 AI certification capstone.

## Stack

| Layer | Technology |
|---|---|
| Agent runtime | `@anthropic-ai/claude-agent-sdk` `query()` — in-process MCP tools, per-phase allow-lists, SDK sessions |
| LLM | Claude via Claude Pro/Max OAuth (`CLAUDE_CODE_OAUTH_TOKEN`) — no pay-per-use API |
| A2A | `@a2a-js/sdk` — A2A protocol v1.0 (`/.well-known/agent-card.json`, `/a2a/jsonrpc`) |
| STT / TTS | Groq Whisper (free tier) / browser SpeechSynthesis |
| Backend | Node.js ESM, Express 4, SQLite (`@libsql/client`), pino, Zod |
| Frontend | React 18 + Vite |

## Agents

- **Orchestrator** — `backend/agents/interviewAgent.js`. Three phases, each a `query()` with its own tools:
  - SETUP: `parse_documents` → `generate_question_bank` (its `focus_areas` + strategy steer the questions)
  - INTERVIEW (per answer): `evaluate_answer` → one of `request_followup` / `advance_to_next_question` / `conclude_interview_early`, optional `note_cumulative_concern`
  - REPORT: `generate_final_report` (its assessment is passed to the report writer)
- **Sub-agents** (single-turn, no tools; contracts in `backend/agents/contracts.js`): `parseAgent`, `questionAgent`, `answerAgent`, `reportAgent`.
- **Context engineering** — `backend/agents/interviewMemory.js`: compact per-turn decisions, compaction after 6 turns, plan + concerns never dropped, pending follow-up tracked. Plus SDK session resume across turns (`sessions.agent_session_id`).
- **Least privilege** — `backend/agentClient.js`: `tools: []`, `settingSources: []`, `strictMcpConfig`, per-phase `allowedTools`, deny-by-default `canUseTool`, timeout + retry, safe fallbacks.

## Access

Web UI (setup, candidate interview, live monitor, report, trace) · REST API (`/api/...`) · CLI (`backend/cli.js`) · A2A (`backend/a2a/`, demo: `npm run a2a:demo`). Optional `X-API-Key` auth (`API_KEYS`), rate limits, 4 MB body limit.

## Evals

`evals/` — 56 cases across all agents + orchestrator decisions; LLM-as-judge (rubric, reference-guided, pairwise with A/B swap); quality gates: pass rate ≥80% and no regressions vs `evals/baseline.json`. Run from `backend/`: `npm run eval`, `npm run eval:quick`, `npm run eval:baseline`. Results: `evals/results/results.json` + `report.md`.

## Run

```bash
cd backend && npm install && cp .env.example .env && npm run dev   # :3001
cd frontend && npm install && npm run dev                          # :5173
```
