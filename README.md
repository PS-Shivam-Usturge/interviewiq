# InterviewIQ — AI Interview Agent

An end-to-end agentic AI system that conducts structured technical interviews. HR uploads a job description and resume; the agent parses both, generates a tailored question bank, conducts a live voice interview with the candidate, monitors progress in real time, and produces a full eligibility report — with visible reasoning at every step.

**No pay-per-use APIs** — Claude Agent SDK (authenticated with a Claude Pro/Max subscription via OAuth) for all LLM reasoning, Groq Whisper (free tier) for speech-to-text, browser built-in SpeechSynthesis for text-to-speech. All libraries are open source except the Claude model itself.

**Access:** web UI · REST API · CLI · **A2A (Agent-to-Agent) JSON-RPC interface** for other agents.

---

## What makes it agentic

Most LLM integrations make a single API call and return a result. This system is different.

The agent runs a **tool-calling loop** using the `@anthropic-ai/claude-agent-sdk`. Each time a candidate submits an answer, the agent doesn't just call one function — it reasons step by step, calls tools in sequence, and makes an autonomous decision about what to do next. The loop continues until the agent has called the right tools and arrived at a decision.

**Every tool call includes a `reasoning` field** — the agent writes out its chain of thought before acting. This is logged to the backend terminal so you can see exactly why the agent made each decision.

**The agent's decisions change the outcome** — they are not decorative:

| Agent decision | Where it flows |
|---|---|
| `focus_areas` + strategy chosen in setup | Handed to the question-writing sub-agent; technical questions target them |
| Follow-up / advance / conclude early | Drives the interview flow (enforced limits: 1 follow-up per question, ≥3 answers before concluding) |
| Follow-up question text | Asked to the candidate, and the next answer is evaluated against *that* question |
| Cumulative concerns | Carried in interview memory and passed to the report-writing sub-agent |
| Final holistic assessment + preliminary recommendation | Passed to the report-writing sub-agent, which must justify any disagreement |

**It remembers across the whole interview** — the orchestrator resumes the same Claude Agent SDK session on every turn, and carries a compact *interview memory* (see [Context engineering](#context-engineering-interview-memory--sessions)). In testing, the agent noticed a candidate giving a word-for-word repeat of an earlier answer and recorded it as a concern.

The agent operates across three phases:

```
SETUP PHASE                     INTERVIEW PHASE              REPORT PHASE
─────────────────               ────────────────────         ────────────────
parse_documents                 evaluate_answer              generate_final_report
    ↓                               ↓                            (holistic review
generate_question_bank          request_followup             of full conversation)
    ↓                          OR advance_to_next_question
Question bank ready (8 Qs)     OR conclude_interview_early
                                PLUS (optionally)
                                note_cumulative_concern
```

The agent sees the **full interview history** on every answer submission — it doesn't process questions in isolation. This means it can notice patterns across questions, decide to probe a topic differently based on earlier answers, and build a holistic picture of the candidate.

---

## Prerequisites

### Required

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Claude Pro or Max subscription** — the agent authenticates via OAuth token, not a pay-per-use API key
- **Claude Code CLI** — install with `npm install -g @anthropic-ai/claude-code`, then run `claude setup-token` to generate your `CLAUDE_CODE_OAUTH_TOKEN` (if you are already logged in to Claude Code on the machine, the SDK can use that login instead)
- **A free Groq API key** — [console.groq.com](https://console.groq.com) — used only for speech-to-text (Whisper)
- A modern browser with microphone access (Chrome or Edge recommended)

> All LLM reasoning (orchestrator, sub-agents, eval judge) runs on the Claude Agent SDK. The older `LLM_PROVIDER=groq|gemini` switch in `llm.js` is legacy and is **not** used by the agents.
>
> **Usage limits:** Pro subscriptions have rolling usage limits. One full interview is ~20 Claude calls; one full eval run is ~60. Every call uses a lean configuration (no built-in tools, short system prompt) that strips the SDK's default ~33 tool definitions and long system prompt — a one-line test call dropped from ≈$0.13 to ≈$0.0005 of equivalent usage.

---

## Setup

### 1. Clone the project

```bash
git clone https://github.com/PS-Shivam-Usturge/interviewiq.git
cd interviewiq
```

You will see two folders: `backend/` and `frontend/`.

---

### 2. Backend

```bash
cd backend
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

Open `.env` and configure it. For the default Claude SDK setup:

```env
# Run `claude setup-token` in your terminal to generate this
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-your-token-here

# Free Groq key — used only for speech-to-text (Whisper)
GROQ_API_KEY=gsk_your_key_here

PORT=3001
```

All other settings (timeouts, retries, session resume, thinking effort, A2A URLs) are optional — see `backend/.env.example`.

> `backend/.npmrc` sets `legacy-peer-deps=true`: `openai@4` (used only for Groq Whisper) declares an optional peer of `zod@3`, while the Claude Agent SDK needs `zod@4`. Without it a fresh `npm install` fails with `ERESOLVE`.

**Generating the OAuth token:**

```bash
# Install Claude Code CLI if you haven't already
npm install -g @anthropic-ai/claude-code

# Log in and generate your token
claude setup-token
```

This opens a browser login flow with your Claude Pro / Claude Code account. Copy the `sk-ant-oat01-...` token it gives you into `.env`.

Start the backend:

```bash
npm run dev
```

You should see:

structured JSON log lines ending with:

```
{"component":"A2A","card":"http://localhost:3001/.well-known/agent-card.json","endpoint":"http://localhost:3001/a2a/jsonrpc","msg":"A2A interface mounted"}
{"component":"Server","port":3001,"provider":"claude-agent-sdk","msg":"Interview Agent API started"}
```

---

### 3. Frontend

Open a **second terminal**:

```bash
cd frontend
npm install
npm run dev
```

You should see:

```
  VITE ready
  ➜  Local: http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## Running a full interview

### Step 1 — HR setup

1. Open **http://localhost:5173**
2. Upload a **Job Description** file (PDF, DOCX, or TXT — max 10 MB)
3. Upload a **Resume / CV** file (PDF, DOCX, or TXT — max 10 MB)
4. Select difficulty: `junior`, `mid`, `senior`, or `principal`
5. Click **"Parse and Analyse"** — the agent reads both documents and shows a skills match preview
6. Click **"Generate Candidate Link"** — the agent plans its interview strategy and generates 8 tailored questions

You receive two links:
- **Candidate link** — send this to the person being interviewed (`/interview/:id`)
- **HR monitor link** — keep this open in a separate tab to watch the interview live (`/monitor/:id`)

---

### Step 2 — Candidate interview

1. Open the candidate link in a browser with microphone access
2. Read the welcome tips, then click **"Begin Interview"**
3. The browser reads each question aloud (browser text-to-speech)
4. Click **"Start Recording"**, speak the answer, the recording stops automatically after 4 seconds of silence
5. The agent receives the transcript and decides:
   - **Follow-up** — if the answer needs more depth (max once per question)
   - **Advance** — accept the answer and move to the next question
   - **Conclude early** — end the interview if there is strong enough evidence after 3+ questions
6. After all questions (or early conclusion), the candidate reaches the Thank You screen

---

### Step 3 — HR report

1. After the candidate finishes, open **http://localhost:5173/report/:sessionId**
   - The session ID is shown on the setup page after starting the interview
2. The agent reviews its full conversation history and generates a holistic eligibility report:
   - Overall score and four category scores (technical, communication, problem-solving, culture fit)
   - Recommendation: `strong_hire`, `hire`, `maybe`, or `no_hire`
   - Strengths and gaps with evidence from specific answers
   - Skill-by-skill ratings
   - Full narrative and suggested next steps

The report is generated once and cached — loading the page again does not re-run the LLM.

---

## Agentic architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (HR)                            │
│   Upload JD + Resume → Setup page → Monitor page → Report page  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP
┌───────────────────────────▼─────────────────────────────────────┐
│                    Browser (Candidate)                           │
│   /interview/:id — voice recording → Whisper STT → submit       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP + SSE                ┌──────────────────────┐
                            │                           │ Other agents / CLI   │
                            │                           │ (A2A JSON-RPC, CLI)  │
                            │                           └──────────┬───────────┘
┌───────────────────────────▼──────────────────────────────────────▼──┐
│                   Express API  :3001  (auth · rate limits · size)    │
│  /api/parse   /api/session/start   /api/session/:id/answer           │
│  /api/transcribe   /api/report   /api/monitor/:id (SSE)              │
│  /.well-known/agent-card.json   /a2a/jsonrpc  (A2A v1.0)             │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                 ┌──────────▼──────────┐
                 │   sessionManager    │
                 │  DB reads/writes,   │
                 │  API response shape │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────────────────────────────┐
                 │              interviewAgent.js               │
                 │                                              │
                 │  runAgentQuery()  →  Claude Agent SDK        │
                 │  query() loop — tool calls with reasoning    │
                 │  + interview memory + resumed SDK session    │
                 │                                              │
                 │  SETUP:     parse_documents                  │
                 │             generate_question_bank           │
                 │                                              │
                 │  INTERVIEW: evaluate_answer                  │
                 │             request_followup /               │
                 │             advance_to_next_question /       │
                 │             conclude_interview_early         │
                 │             note_cumulative_concern          │
                 │                                              │
                 │  REPORT:    generate_final_report            │
                 └──────────┬───────────────────┬──────────────┘
                            │                   │
               ┌────────────▼──┐    ┌───────────▼───────────┐
               │  Sub-agents   │    │      SQLite DB         │
               │               │    │  sessions table:       │
               │  parseAgent   │    │  - question_bank       │
               │  questionAgent│    │  - interview_memory    │
               │  answerAgent  │    │  - agent_observations  │
               │  reportAgent  │    │  answers table         │
               └────────┬──────┘    │  reports table         │
                        │           └────────────────────────┘
               ┌────────▼────────────┐
               │   agentClient.js    │
               │ Claude Agent SDK    │
               │ query(): no built-in│
               │ tools, timeout,     │
               │ retry, contracts    │
               └─────────────────────┘
```

## Agent trace

Every decision the agent makes during an interview is recorded as a structured trace — a timestamped, chronological log of what the agent called, what it scored, what it decided, and why. The trace is stored in the `sessions.trace` column and never includes candidate transcript text.

### Viewing the trace

**Visual timeline** — open `/trace/:sessionId` in the browser. Events are grouped into three sections (Setup, Interview, Report) and rendered as collapsible cards:

- **Setup cards** — show which tools ran and the agent's stated reasoning before acting
- **Evaluation cards** — show scores (technical / communication / depth / overall) as progress bars, plus any flags raised (`vague`, `evasive`, `contradicts_resume`)
- **Decision cards** — show the routing action (advance / follow-up / conclude early), the verdict, and the agent's written reasoning
- **Observation cards** — show cross-question concerns the agent noted, with severity (info / warning / critical)
- **Report card** — shows the final recommendation, score, confidence, and headline

**API** — the raw event array is available at `GET /api/session/:id/trace`.

**CLI** — two formats:

```bash
# Full JSON output (pipeable)
interview-agent trace <session-id>

# Human-readable one-liner per event
interview-agent trace <session-id> --summary
```

Example `--summary` output:
```
Trace — Jane Smith · Senior Backend Engineer · mid · completed
────────────────────────────────────────────────────────────
[10:34:21] 🚀  Session started — 8 questions
[10:34:22] 🔧  Tool: parse_documents  — "Extracting role requirements and candidate…"
[10:34:45] 🔧  Tool: generate_question_bank  — "Focusing on distributed systems and API…"
[10:35:40] 🔍  Q1 evaluated — overall 8/10
[10:35:41] ➡   Decision: advance (strong)  — "Candidate gave concrete examples with real…"
[10:36:30] 🔍  Q2 evaluated — overall 5/10  flags: vague
[10:36:31] ↩   Decision: followup  — "Answer lacked specifics on failure recovery…"
[10:41:20] ✅  Interview complete — 8 questions
[10:41:55] 📝  Report: hire · score 74/100 · high confidence
```

### What the trace captures vs. what it omits

| Captured | Omitted |
|---|---|
| Tool calls and the agent's stated reasoning | Candidate transcript text |
| Per-question scores (technical / communication / depth) | Full LLM conversation history |
| Flags raised on each answer | Uploaded JD/resume content |
| Routing decision and verdict per question | |
| Cross-question observations and severity | |
| Report recommendation, score, and headline | |

The trace is built for HR reviewers and hiring managers — it answers "how did the agent reach this recommendation?" without exposing raw interview content.

---

### Context engineering: interview memory + sessions

Each HTTP request to `/api/session/:id/answer` is stateless from Express's point of view. The agent keeps continuity in two complementary ways:

**1. Claude Agent SDK sessions (conversation continuity)** — the setup phase records the SDK `session_id` in `sessions.agent_session_id`. Every later turn (each answer, then the report) calls `query()` with `resume: <session_id>`, so the orchestrator continues *its own* conversation: it has seen its earlier tool calls and reasoning. If a session cannot be resumed (e.g. the server moved machines) the run automatically falls back to a fresh session — the interview never breaks. Disable with `AGENT_SESSION_RESUME=false`.

**2. Interview memory (compressed, carried-forward state)** — [`backend/agents/interviewMemory.js`](backend/agents/interviewMemory.js) keeps a small structured record in `sessions.interview_memory`, injected into every orchestrator prompt instead of raw transcripts:

| Kept in memory | Why |
|---|---|
| **Plan** — focus areas + strategy from setup | Never dropped; keeps later decisions aligned with the plan |
| **One line per answered turn** — scores, flags, decision, verdict, 160-char reason | Key decisions preserved, transcripts not repeated |
| **Compaction** — turns older than the last 6 are folded into one rolling line (avg score, flag counts, verdicts) | Prompt size stays bounded however long the interview runs |
| **Concerns** — cross-question observations | Never dropped; feed the final report |
| **Pending follow-up** — the exact follow-up the agent asked | The next answer is evaluated against the question actually asked |

Memory is updated deterministically (no extra LLM call) after each decision. Sessions created before memory existed fall back to the previous behaviour (recent answers from the `answers` table). The legacy `agent_history` column is no longer used.

Example of what the agent sees mid-interview:

```
Interview plan: focus on idempotency under retries; Kafka delivery semantics; ledger consistency — Verify depth behind payments claims.
Q1 [opening] overall 8/10 (tech 8, depth 7) → advance (strong) — Concrete Stripe example with real numbers.
Q2 [opening] overall 1/10 (tech 1, depth 1) flags: vague,no_examples → followup — Did not explain the latency work on the resume.
Q2 (follow-up answer) [opening] overall 2/10 (tech 1, depth 1) flags: evasive → advance (concerning) — Pivoted to an unrelated story.
Recorded concerns:
  - [warning] (Q3) Could not substantiate a named resume achievement across two attempts.
```

### Follow-up enforcement

The agent can request a follow-up on any question, but only once. This rule is enforced at two levels:

1. **Prompt level** — the agent is instructed not to follow up a follow-up
2. **Tool level** — the `request_followup` tool handler checks `context.lastWasFollowup` and overrides the decision to `advance` if the limit is already reached, even if the agent calls the tool anyway

---

## Environment variables

All variables go in `backend/.env`.

| Variable | Required | Description |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes* | Generated by `claude setup-token`. Authenticates via Claude Pro/Max — no separate API billing. *Optional if the machine is already logged in to Claude Code. |
| `GROQ_API_KEY` | Yes | From [console.groq.com](https://console.groq.com). Used only for Whisper STT. |
| `PORT` | No | Backend port, defaults to `3001` |
| `API_KEYS` | No | Comma-separated keys for `X-API-Key` auth on REST + A2A. Blank = auth off (local dev) |
| `AGENT_TIMEOUT_MS` / `AGENT_LONG_TIMEOUT_MS` | No | Per-attempt timeout for `query()` (180 s) / for setup + report phases (360 s) |
| `AGENT_RETRIES` | No | Retries per `query()` (default 1) |
| `AGENT_SESSION_RESUME` | No | `true` (default) resumes the orchestrator's SDK session each turn; `false` disables |
| `AGENT_MODEL` | No | Model override; default is the Claude Code CLI default |
| `SUBAGENT_EFFORT` / `GENERATION_EFFORT` / `ORCHESTRATOR_EFFORT` | No | Thinking effort `low`/`medium`/`high` (defaults low / medium / medium) |
| `PUBLIC_BASE_URL` | No | Base URL advertised in the A2A agent card (default `http://localhost:PORT`) |
| `FRONTEND_URL` | No | Used for candidate/monitor/report links returned over A2A (default `http://localhost:5173`) |
| `LOG_LEVEL` | No | pino log level (default `info`; the eval runner uses `warn`) |

---

## Agent tools reference

The agent has 8 tools across three phases. Each tool call includes a `reasoning` field — the agent's written explanation before it acts.

| Tool | Phase | What it does |
|---|---|---|
| `parse_documents` | Setup | Extracts structured information from the JD and resume — role requirements, required skills, candidate background, years of experience |
| `generate_question_bank` | Setup | Creates 8 tailored questions with a stated interview strategy, focus areas, and intended depth per question |
| `evaluate_answer` | Per answer | Scores the answer across technical (0–10), communication (0–10), and depth (0–10) dimensions; identifies flags like `vague`, `evasive`, `contradicts_resume` |
| `request_followup` | Per answer | Asks a follow-up when the answer needs more depth — limited to once per original question; overridden automatically if the limit is already reached |
| `advance_to_next_question` | Per answer | Accepts the answer with a verdict (`strong`, `adequate`, `weak`, or `concerning`) and moves to the next question |
| `conclude_interview_early` | Per answer | Ends the interview early when there is strong cross-question evidence — requires at least 3 answered questions, blocked otherwise |
| `note_cumulative_concern` | Per answer | Records a recurring pattern that spans multiple answers (e.g. "candidate avoids specifics whenever implementation is probed") for the final report |
| `generate_final_report` | Report | Reviews the entire interview conversation holistically and writes the eligibility report with scores, recommendation, strengths, gaps, and narrative |

### Tool permissions (least privilege)

Every `query()` call is built from `baseOptions()` in [`backend/agentClient.js`](backend/agentClient.js):

| Control | Setting | Effect |
|---|---|---|
| Built-in tools | `tools: []` | No Bash, file read/write, web fetch or any other Claude Code tool exists for the agent (verified: the SDK reports **0 tools** at init) |
| Host settings | `settingSources: []` | `~/.claude` settings, CLAUDE.md and project hooks on the server are ignored |
| MCP servers | `strictMcpConfig: true` | Only the in-process `interview_tools` server we pass is loaded |
| Per-phase allow-list | `allowedTools` | Only that phase's tools are auto-approved |
| Deny-by-default | `canUseTool` | Any other tool call is denied and logged (`Blocked tool outside the phase allow-list`) |
| In-tool guards | handler checks | Follow-up limit, closing-question rule and ≥3-answers-before-concluding are enforced in code even if the model ignores the prompt |

| Phase | Allowed tools | Everything else |
|---|---|---|
| Setup | `parse_documents`, `generate_question_bank` | denied |
| Per-answer (interview) | `evaluate_answer`, `request_followup`, `advance_to_next_question`, `conclude_interview_early`, `note_cumulative_concern` | denied |
| Report | `generate_final_report` | denied |
| Sub-agents & eval judge | *none* (`maxTurns: 1`, text only) | denied |

The agent cannot escalate its own permissions at runtime.

### Reliability controls

| Control | Where | Default |
|---|---|---|
| Timeout per `query()` attempt | `AGENT_TIMEOUT_MS` | 180 s (360 s for setup/report phases, whose tools run whole sub-agents) |
| Retries | `AGENT_RETRIES` | 1 retry with back-off; never retried once the agent has already committed a decision (no duplicate side effects) |
| Session resume fallback | `interviewAgent.js` | Failed resume → one fresh session |
| Safe failure modes | `interviewAgent.js` | Setup loop fails → sub-agents called directly; answer loop fails → advance with logged reason (candidate is never stuck); report loop fails → report generated directly |
| Output contracts | [`agents/contracts.js`](backend/agents/contracts.js) | Sub-agent JSON is validated with Zod; numbers coerced/clamped, missing arrays defaulted, violations logged instead of crashing the interview |
| Thinking effort | `SUBAGENT_EFFORT` / `GENERATION_EFFORT` / `ORCHESTRATOR_EFFORT` | low / medium / medium — keeps each candidate turn responsive |

---

## Sub-agents

The system is one **orchestrator agent** (the lead interviewer — a Claude Agent SDK tool loop) plus four **specialist sub-agents**. Each sub-agent is a single-turn Claude Agent SDK call with no tools that returns structured JSON. The orchestrator hands work to them through its tools; they are not accessible via the HTTP API directly.

Responsibilities and handoff criteria are declared in code in [`backend/agents/contracts.js`](backend/agents/contracts.js), and every sub-agent output is validated against its contract before the orchestrator continues:

| Sub-agent | Responsible for | Not responsible for | Handoff in (when the orchestrator delegates) | Handoff out (what must be true before continuing) |
|---|---|---|---|---|
| `parseAgent` | JD + resume → structured summaries | Judging or scoring | `parse_documents` in SETUP, when summaries are missing/empty | `role_title`, `required_skills`, `candidate_name`, `skills` present |
| `questionAgent` | 8-question bank, steered by the orchestrator's focus areas + strategy | Evaluating answers or flow | `generate_question_bank` after parsing | ≥1 question, each with `category` + `question` → session becomes active |
| `answerAgent` | Score one answer (0-10 ×3) + flags | Choosing follow-up vs advance | Each submitted answer, before the decision loop | Numeric scores + `flags[]` → read via `evaluate_answer` |
| `reportAgent` | Final report from answers, concerns and the orchestrator's assessment | Re-scoring answers | `generate_final_report` once the session is completed | `overall_score` 0-100 + valid `recommendation` → cached in `reports` |

The orchestrator owns every *decision* (plan, follow-up, advance, conclude, concerns, final recommendation); the sub-agents own *production* of structured artifacts.

### `parseAgent` — document understanding

**File:** `backend/agents/parseAgent.js`  
**Called by:** `setupInterview()` via the `parse_documents` tool handler  
**When:** Once per session during the setup phase

Receives raw JD and resume text (after sanitization). Makes two separate LLM calls — one for the JD, one for the resume — and returns structured summaries. These summaries drive every subsequent decision: question selection, difficulty calibration, and report framing.

| Function | Input | Output |
|---|---|---|
| `summariseJD(text)` | Raw JD text (up to 4000 chars) | `{ role_title, seniority_level, required_skills[], tech_stack[], responsibilities[], nice_to_haves[] }` |
| `summariseResume(text)` | Raw resume text (up to 4000 chars) | `{ candidate_name, years_total_experience, current_title, skills[], experience_highlights[], education }` |

---

### `questionAgent` — interview planning

**File:** `backend/agents/questionAgent.js`  
**Called by:** `setupInterview()` via the `generate_question_bank` tool handler  
**When:** Once per session, immediately after parsing

Receives both summaries, the chosen difficulty level, and the orchestrator's `focusAreas` + `strategy` (from its `generate_question_bank` tool call). Returns exactly 8 questions; technical questions target the focus areas. The question bank is saved to SQLite and used for the entire interview.

**Input:** `{ jdSummary, resumeSummary, difficulty, focusAreas?, strategy? }`  
**Output:** `{ questions: [{ id, category, question, intent, difficulty, follow_ups[] }], strategy, focusAreas[] }`

Category distribution: `opening` (1), `technical` (3), `behavioural` (2), `situational` (1), `closing` (1).

---

### `answerAgent` — per-answer evaluation

**File:** `backend/agents/answerAgent.js`  
**Called by:** `processAnswer()` via the `evaluate_answer` tool handler  
**When:** Once per submitted answer (including follow-ups)

Receives the question, the candidate's transcript, and a summary of prior answers for cross-question context. Returns three dimension scores, an overall score, flags, and a written analysis. The orchestration agent reads this output and then decides whether to follow up, advance, or conclude early.

**Input:** `{ question, answer, questionCategory, jdSummary, resumeSummary? }` — `question` is the follow-up text when answering a follow-up; `resumeSummary` lets it detect `contradicts_resume`. Answers under 4 words are flagged `no_answer` deterministically (no LLM call).  
**Output:** `{ score_technical, score_communication, score_depth, overall_score, flags[], strength_points[], gap_points[], analysis }`

**Flags raised:** `vague` (non-specific answer), `evasive` (deflects the question), `contradicts_resume` (claims skills not in resume), `no_answer` (empty or one-word response), `very_short` (under 20 words).

---

### `reportAgent` — final assessment

**File:** `backend/agents/reportAgent.js`  
**Called by:** `generateAgentReport()` via the `generate_final_report` tool handler  
**When:** Once, after the interview is completed, when the HR user opens the report page

Receives all scored answers, JD and resume summaries, the cross-question observations the agent recorded during the interview, and the orchestrator's own holistic assessment + preliminary recommendation. Synthesizes everything into a holistic eligibility report. The result is cached in the `reports` table — loading the report page again returns the cached version without re-running the LLM. `buildReport()` is the pure (no-DB) core, also used by the eval suite.

**Input:** `buildReport({ jdSummary, resumeSummary, answers[], observations[], agentAssessment? })`  
**Output:** `{ overall_score, recommendation, confidence, headline, strengths[], gaps[], red_flags[], skill_ratings[], narrative, suggested_next_steps[] }`

**Recommendation values:** `strong_hire` · `hire` · `maybe` · `no_hire`

---

## Prompt design: system and user prompts

Every prompt lives in a Markdown template in [`backend/prompts/`](backend/prompts/), never inline in agent code. Each agent has its own pair:

| Part | Holds | Changes per call? |
|---|---|---|
| **System prompt** (`system.md`) | The agent's role, rules, output format, and for the orchestrator the **tool-usage policy for every phase** (which tool to call when) | No: fixed standing instructions |
| **User prompt template** (`*.user.md`) | Only the task and data for this call, written with `{{placeholders}}` | Yes: filled at runtime |
| **Partial blocks** (other `.md`) | Optional sections inserted into a user prompt only when relevant (e.g. the orchestrator's plan, resume claims, recorded concerns) | Included or left out |

```
backend/prompts/
├── index.js                      prompt(name) + render(name, vars): fills {{placeholders}}, throws if one is missing
├── orchestrator/                 system.md (role + tool policy) · setup/answer/report .user.md · memory, follow-up warning, report blocks
├── parseAgent/                   jd.system/.user · resume.system/.user
├── questionAgent/                system.md (role, difficulty guide, JSON format) · user.md · interviewer-plan.md
├── answerAgent/                  system.md (scoring rules, JSON format) · user.md · resume-claims.md
└── reportAgent/                  system.md (report rules, JSON format) · user.md · observations.md · assessment.md
```

How a call is built (example: the answer scorer):

```js
agentQuery(
  render("answerAgent/user", { role_title, seniority, resume_claims, category, question, answer }),  // user prompt
  { systemPrompt: prompt("answerAgent/system") },                                                    // system prompt
);
```

- Templates are loaded once at startup, so a missing file fails immediately, not mid-interview.
- A leading `<!-- … -->` comment documents each file's variables and is never sent to the model.
- Values are inserted once and never re-scanned, so candidate text containing `{{…}}` stays literal.
- The orchestrator steers sub-agents through **tool arguments**, not by writing their prompts: its `focus_areas`/strategy fill `questionAgent/interviewer-plan.md`, and its final assessment fills `reportAgent/assessment.md`.
- Untrusted text (JD, resume, answers) only ever appears in user prompts; the system prompts state that it is data, never instructions (prompt-injection defence).

---

## API endpoints

All endpoints served from `http://localhost:3001`.

### `GET /api/health`

```json
{ "status": "ok", "provider": "claude-agent-sdk", "phase": 3, "a2a": "/.well-known/agent-card.json" }
```

---

### `POST /api/parse`

Parses uploaded JD and resume files. Accepts `multipart/form-data`.

**Fields:** `jd` (file), `resume` (file) — PDF, DOCX, or TXT, max 10 MB each

**Response:**
```json
{
  "jd": {
    "raw": "full extracted text...",
    "summary": {
      "role_title": "Senior Backend Engineer",
      "required_skills": ["Node.js", "PostgreSQL"],
      "tech_stack": ["AWS", "Docker"]
    }
  },
  "resume": {
    "raw": "full extracted text...",
    "summary": {
      "candidate_name": "Jane Smith",
      "years_total_experience": 5,
      "skills": ["Node.js", "React"]
    }
  }
}
```

---

### `POST /api/session/start`

Runs the agent's setup phase — parses documents, generates the question bank.

**Body:**
```json
{
  "jdText": "...",
  "resumeText": "...",
  "jdSummary": { ... },
  "resumeSummary": { ... },
  "difficulty": "mid"
}
```

**Response:**
```json
{
  "sessionId": "uuid",
  "candidateName": "Jane Smith",
  "totalQuestions": 8,
  "currentIndex": 0,
  "currentQuestion": {
    "category": "opening",
    "question": "Walk me through your experience with..."
  },
  "status": "active",
  "agentSetup": {
    "focusAreas": ["distributed systems", "API design"],
    "agentSummary": "Interview ready — candidate claims strong backend experience..."
  }
}
```

---

### `POST /api/session/:id/answer`

Submits a candidate's transcript. The agent evaluates it and decides the next step.

**Body:** `{ "transcript": "I have worked with Node.js for three years..." }`

**Response:**
```json
{
  "answerAnalysis": {
    "scores": { "technical": 7, "communication": 8, "depth": 6 },
    "flags": [],
    "analysis": "Solid overview with concrete examples..."
  },
  "agentDecision": {
    "action": "request_followup",
    "reasoning": "Candidate described the concept correctly but gave no real-world failure example",
    "followUpQuestion": "Can you describe a specific incident where a service failed and how you recovered it?"
  },
  "isFollowUp": true,
  "isComplete": false,
  "nextQuestion": { "category": "follow_up", "question": "Can you describe..." },
  "progress": { "current": 1, "total": 8, "percent": 0 }
}
```

`agentDecision.action` is one of:
- `"request_followup"` — agent wants more depth
- `"advance"` — agent accepted the answer and moved on
- `"conclude_early"` — agent ended the interview with sufficient cross-question evidence

---

### `POST /api/transcribe`

Transcribes an audio recording using Groq Whisper.

**Field:** `audio` (WebM/OGG from MediaRecorder)

**Response:** `{ "transcript": "I have been working with React for two years..." }`

---

### `GET /api/report/:sessionId`

Generates (or returns cached) the final eligibility report.

**Response:**
```json
{
  "overall_score": 72,
  "technical_score": 68,
  "communication_score": 80,
  "problem_solving_score": 70,
  "culture_fit_score": 75,
  "recommendation": "hire",
  "headline": "Solid mid-level candidate with strong communication but gaps in system design",
  "strengths": ["Clear communicator", "Solid React fundamentals"],
  "gaps": ["Thin on distributed systems", "No mention of testing practices"],
  "red_flags": [],
  "skill_ratings": [
    { "skill": "Node.js", "rating": 4, "evidence": "Described async patterns correctly in Q3" }
  ],
  "narrative": "Jane demonstrated..."
}
```

---

### `GET /api/monitor/:sessionId` (SSE)

Server-Sent Events stream for the HR live monitor — pushes session state every 2 seconds.

```js
const es = new EventSource(`http://localhost:3001/api/monitor/${sessionId}`);
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

Each event includes: current question, progress, all completed answers with scores, and the candidate's live transcript as they speak.

### `POST /api/monitor/:sessionId/live`

Called by the interview frontend after Whisper transcription to push the candidate's words to the HR monitor in real time.

---

### `GET /api/session/:sessionId/trace`

Returns the agent's full decision trace for a session — every tool call, evaluation score, routing decision, observation, and report event in chronological order. Does not include candidate transcripts.

**Response:**
```json
{
  "sessionId": "uuid",
  "candidateName": "Jane Smith",
  "role": "Senior Backend Engineer",
  "difficulty": "mid",
  "status": "completed",
  "createdAt": 1720000000,
  "events": [
    {
      "time": 1720000001, "phase": "setup", "event": "session_started",
      "candidate": "Jane Smith", "role": "Senior Backend Engineer",
      "difficulty": "mid", "totalQuestions": 8
    },
    {
      "time": 1720000003, "phase": "setup", "event": "tool_call",
      "tool": "parse_documents",
      "reasoning": "Extracting role requirements and candidate background before planning questions",
      "focusAreas": []
    },
    {
      "time": 1720000040, "phase": "interview", "event": "evaluation",
      "questionIndex": 0, "category": "technical",
      "scores": { "technical": 8, "communication": 7, "depth": 6, "overall": 7 },
      "flags": [], "analysis": "Solid answer with concrete examples..."
    },
    {
      "time": 1720000041, "phase": "interview", "event": "decision",
      "questionIndex": 0, "action": "advance", "verdict": "strong",
      "reasoning": "Candidate demonstrated clear understanding with real-world examples"
    },
    {
      "time": 1720000300, "phase": "report", "event": "report_generated",
      "recommendation": "hire", "overallScore": 74,
      "confidence": "high", "headline": "Strong backend engineer with solid fundamentals"
    }
  ]
}
```

**Event types:**

| Event | Phase | Key fields |
|---|---|---|
| `session_started` | setup | `candidate`, `role`, `difficulty`, `totalQuestions` |
| `tool_call` | setup | `tool`, `reasoning`, `focusAreas` |
| `evaluation` | interview | `questionIndex`, `scores` (technical/communication/depth/overall), `flags`, `analysis` |
| `decision` | interview | `questionIndex`, `action` (advance/followup/conclude_early), `verdict`, `reasoning`, `followUpQuestion` |
| `observation` | interview | `severity` (info/warning/critical), `observation` (the concern text) |
| `session_complete` | interview | `answeredCount`, `concludedEarly` |
| `report_generated` | report | `recommendation`, `overallScore`, `confidence`, `headline` |

---

## A2A interface

InterviewIQ is also exposed as an **A2A (Agent-to-Agent protocol v1.0)** agent, so other agents and agent platforms can discover it and run interviews without knowing its REST API. It is built with the official open-source [`@a2a-js/sdk`](https://github.com/a2aproject/a2a-js) (Apache-2.0) in [`backend/a2a/`](backend/a2a/) and calls the same session functions as the web UI — identical agent behaviour.

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /.well-known/agent-card.json` | Agent card: name, skills, interface URL, security scheme | Public |
| `POST /a2a/jsonrpc` | JSON-RPC: `SendMessage`, `GetTask`, `CancelTask`, `ListTasks` | `X-API-Key` when `API_KEYS` is set; same rate limits as the REST API |

### Skills

| Skill | Input (data part) | Result |
|---|---|---|
| `start_interview` | `{ skill, jdText, resumeText, difficulty }` | Task **`INPUT_REQUIRED`** with the first question; `interview-session` artifact (sessionId, focus areas, candidate/monitor/report/trace links) |
| `submit_answer` | Plain-text reply **on the same task**, or `{ skill, sessionId, answer }` | `INPUT_REQUIRED` + next question (or follow-up), or **`COMPLETED`** when the interview ends; `answer-result` artifact with scores and the agent's decision |
| `get_report` | `{ skill, sessionId }` | `COMPLETED`; `eligibility-report` artifact |
| `get_trace` | `{ skill, sessionId }` | `COMPLETED`; `decision-trace` artifact (no transcripts) |
| `get_session_status` | `{ skill, sessionId }` | `COMPLETED`; `session-status` artifact |

An interview maps naturally onto one multi-turn A2A **task**: the task stays in `INPUT_REQUIRED` (the agent is waiting for the candidate) until the agent advances past the last question or concludes early. Bad input returns `REJECTED` with a helpful message; agent errors return `FAILED`.

### Example requests (curl)

```bash
# 1. Discover the agent
curl http://localhost:3001/.well-known/agent-card.json

# 2. Start an interview (takes ~1-2 minutes: parse → plan → write questions)
curl -X POST http://localhost:3001/a2a/jsonrpc -H "Content-Type: application/json" -H "A2A-Version: 1.0" -d '{
  "jsonrpc": "2.0", "id": 1, "method": "SendMessage",
  "params": { "message": { "messageId": "m1", "role": "ROLE_USER", "parts": [
    { "data": { "skill": "start_interview", "difficulty": "senior",
                "jdText": "Senior Software Engineer — Payments Platform ... (≥50 chars)",
                "resumeText": "Priya Sharma, Senior Software Engineer at Stripe ... (≥50 chars)" } } ] } } }'
# → result.task.status.state = "TASK_STATE_INPUT_REQUIRED", status.message = first question,
#   result.task.id = <TASK_ID>, result.task.contextId = <CONTEXT_ID>

# 3. Answer on the same task
curl -X POST http://localhost:3001/a2a/jsonrpc -H "Content-Type: application/json" -H "A2A-Version: 1.0" -d '{
  "jsonrpc": "2.0", "id": 2, "method": "SendMessage",
  "params": { "message": { "messageId": "m2", "role": "ROLE_USER",
    "taskId": "<TASK_ID>", "contextId": "<CONTEXT_ID>",
    "parts": [ { "text": "We used idempotency keys stored in Postgres with a unique constraint..." } ] } } }'

# 4. Get the report once the task is COMPLETED
curl -X POST http://localhost:3001/a2a/jsonrpc -H "Content-Type: application/json" -H "A2A-Version: 1.0" -d '{
  "jsonrpc": "2.0", "id": 3, "method": "SendMessage",
  "params": { "message": { "messageId": "m3", "role": "ROLE_USER",
    "parts": [ { "data": { "skill": "get_report", "sessionId": "<SESSION_ID>" } } ] } } }'
```

Add `-H "X-API-Key: <key>"` when `API_KEYS` is set.

### Demo client (another agent talking to InterviewIQ)

[`backend/a2a/demoClient.js`](backend/a2a/demoClient.js) uses only the generic `@a2a-js/sdk` client: it discovers the agent card, starts an interview, answers every question on the same task with scripted answers of mixed quality, then fetches the report.

```bash
cd backend
npm run a2a:demo                       # uses evals/fixtures JD + resume
node a2a/demoClient.js --difficulty mid --jd ./my-jd.txt --resume ./my-cv.txt --api-key <key>
```

Sample output (abridged, from a real run):

```
1) Discovering agent at http://localhost:3001/.well-known/agent-card.json
   InterviewIQ Interview Agent v1.0.0 — skills: start_interview, submit_answer, get_report, get_trace, get_session_status
2) start_interview (senior) …
   state=TASK_STATE_INPUT_REQUIRED
   agent: Interview started for Priya Sharma. Question 1 of 8 [opening]: Your resume mentions processing 50M transactions/day. Walk me through the single hardest distributed systems problem you personally owned at that scale…
3.1) candidate answers (Sure. When I was at Stripe, we had a critical issue…)
   scores {"technical":8,"communication":9,"depth":7,"overall":8} flags=[] → advance (strong)
3.2) candidate answers (Yeah I've worked with distributed systems before…)
   scores {"technical":1,"communication":2,"depth":1,"overall":1} flags=[vague,no_examples,evasive,contradicts_resume] → followup
   agent: Follow-up: Let me anchor this more specifically to your resume. It states you reduced p99 latency from 450ms to 180ms…
…
3.5) → conclude_early
   state=TASK_STATE_COMPLETED — Interview complete (concluded early by the agent).
4) get_report
   state=TASK_STATE_COMPLETED — no_hire · 19/100 — Candidate with a highly polished resume demonstrated genuine command of only one technical topic…
```

---

## CLI reference

The `interview-agent` CLI lets you drive sessions from a terminal without opening a browser. The backend server must already be running (`npm run dev` in `backend/`).

**Install:**
```bash
cd backend
npm install     # installs commander along with other deps
npm link        # makes `interview-agent` available globally
# or run without linking:
node backend/cli.js <command>
```

**Global options** (apply to every command):

| Option | Env var | Default | Description |
|---|---|---|---|
| `--server <url>` | `INTERVIEW_AGENT_SERVER` | `http://localhost:3001` | Base URL of the backend API |
| `--api-key <key>` | `INTERVIEW_AGENT_API_KEY` | *(none)* | Sent as `X-API-Key` header; required if `API_KEYS` is set in `.env` |

Errors are written to stderr and exit with code 1. All successful output is JSON on stdout.

---

### `interview-agent health`

Checks that the backend is reachable and returns its current provider.

```bash
interview-agent health
# { "status": "ok", "provider": "claude-agent-sdk", "phase": 3, "a2a": "/.well-known/agent-card.json" }
```

---

### `interview-agent parse --jd <file> --resume <file>`

Uploads a JD and resume, runs the parse agent, and returns structured summaries. Accepts PDF, DOCX, or TXT files.

```bash
interview-agent parse --jd ./job-description.pdf --resume ./cv.pdf
```

Output: the same JSON returned by `POST /api/parse` — JD summary and resume summary side by side.

---

### `interview-agent session start --jd-text <file> --resume-text <file>`

Starts a new interview session. Reads plain-text files (use a `.txt` export of your JD/resume). The agent parses both documents, generates the question bank, and returns the session ID and first question. This call typically takes 20–40 seconds.

```bash
interview-agent session start \
  --jd-text ./jd.txt \
  --resume-text ./resume.txt \
  --difficulty senior
```

Options: `--candidate <name>` (default: extracted from resume), `--difficulty junior|mid|senior|principal` (default: `mid`).

Output includes `sessionId`, `candidateName`, `totalQuestions`, and `currentQuestion`.

---

### `interview-agent session status <id>`

Returns the current state of a session — current question index, progress, and the last three scored answers.

```bash
interview-agent session status 550e8400-e29b-41d4-a716-446655440000
```

---

### `interview-agent report <id>`

Generates (or returns the cached) eligibility report for a completed session. The interview must be finished before this will succeed.

```bash
interview-agent report 550e8400-e29b-41d4-a716-446655440000
```

Output is the full report JSON: scores, recommendation, narrative, skill ratings, strengths, and gaps.

---

### `interview-agent trace <id> [--summary]`

Returns the agent's decision trace for a session.

```bash
# Full JSON (machine-readable, pipeable)
interview-agent trace 550e8400-e29b-41d4-a716-446655440000

# Human-readable one-liner per event
interview-agent trace 550e8400-e29b-41d4-a716-446655440000 --summary
```

`--summary` output:
```
Trace — Jane Smith · Senior Backend Engineer · mid · completed
────────────────────────────────────────────────────────────
[10:34:21] 🚀  Session started — 8 questions
[10:34:22] 🔧  Tool: parse_documents  — "Extracting role requirements and candidate…"
[10:34:45] 🔧  Tool: generate_question_bank  — "Focusing on distributed systems and API…"
[10:35:40] 🔍  Q1 evaluated — overall 8/10
[10:35:41] ➡   Decision: advance (strong)  — "Candidate gave concrete examples…"
[10:36:30] 🔍  Q2 evaluated — overall 5/10  flags: vague
[10:36:31] ↩   Decision: followup  — "Answer lacked specifics on failure recovery…"
[10:41:20] ✅  Interview complete — 8 questions
[10:41:55] 📝  Report: hire · score 74/100 · high confidence
```

---

## Project structure

```
interviewiq/
├── backend/
│   ├── server.js               # Express entry point, CORS, route registration, A2A mount
│   ├── agentClient.js          # Claude Agent SDK runner — least-privilege options, timeout, retry, permission guard
│   ├── llm.js                  # safeJsonParse() (+ legacy OpenAI-compat client, unused by agents)
│   ├── cli.js                  # `interview-agent` CLI
│   ├── .env.example            # Copy to .env, fill in keys
│   ├── .npmrc                  # legacy-peer-deps (openai@4 vs zod@4 peer conflict)
│   ├── prompts/                # system + user prompt templates (Markdown) per agent, render() formatter
│   ├── a2a/
│   │   ├── agentCard.js        # A2A agent card (skills, interface, security scheme)
│   │   ├── executor.js         # A2A AgentExecutor → same session functions as the UI
│   │   ├── index.js            # mounts /.well-known/agent-card.json + /a2a/jsonrpc
│   │   └── demoClient.js       # another agent driving a full interview over A2A
│   ├── agents/
│   │   ├── interviewAgent.js   # Orchestrator — tool definitions, query() loop, all three phases
│   │   ├── interviewMemory.js  # Context engineering — compact carried-forward interview state
│   │   ├── contracts.js        # Sub-agent responsibilities, handoff criteria, output schemas
│   │   ├── sessionManager.js   # Session lifecycle — DB reads, API response shaping, shared report flow
│   │   ├── parseAgent.js       # Summarises JD and resume into structured JSON
│   │   ├── questionAgent.js    # Generates 8 tailored questions with metadata
│   │   ├── answerAgent.js      # Scores answers (technical/communication/depth) + flags
│   │   ├── reportAgent.js      # Generates and caches eligibility report
│   │   └── parser.js           # File text extraction (pdf-parse + mammoth)
│   ├── db/
│   │   ├── database.js         # LibSQL init, 3-table schema, auto-migration on startup
│   │   └── sessionStore.js     # All DB CRUD: createSession, getSession, saveAnswer, etc.
│   └── routes/
│       ├── parse.js            # POST /api/parse
│       ├── session.js          # POST /api/session/start, POST /api/session/:id/answer
│       ├── report.js           # GET /api/report/:sessionId
│       ├── transcribe.js       # POST /api/transcribe (Groq Whisper)
│       ├── monitor.js          # GET /api/monitor/:sessionId (SSE) + POST live transcript
│       └── trace.js            # GET /api/session/:id/trace
│
├── evals/                      # eval dataset, runner, judge, rubric, baseline, results (see Running evaluations)
│
└── frontend/
    └── src/
        ├── main.jsx                 # React Router — 6 routes
        ├── index.css                # Dark design system with CSS variables
        ├── pages/
        │   ├── SetupPage.jsx        # HR: upload → parse preview → generate session → share links
        │   ├── InterviewPage.jsx    # Candidate: TTS question → voice recording → submit loop
        │   ├── MonitorPage.jsx      # HR: SSE live feed — transcript, running scores, flag tally
        │   ├── ReportPage.jsx       # HR: score rings, strengths/gaps, skill ratings, print export
        │   ├── TracePage.jsx        # HR: agent decision timeline — tool calls, scores, decisions
        │   └── ThankYouPage.jsx     # Candidate: end screen (no scores shown)
        ├── components/
        │   ├── FileDropZone.jsx     # Drag-and-drop file upload
        │   └── ParsePreview.jsx     # JD + resume preview cards with skills match bar
        └── hooks/
            └── useVoiceRecorder.js  # MediaRecorder + silence detection (4s / RMS 0.01) + Whisper call
```

---

## Database

SQLite database is created automatically at `backend/db/interview.db` on first run. New columns are added by an idempotent migration on startup, so existing databases keep working.

### `sessions` table — one row per interview

| Column | Description |
|---|---|
| `id` | UUID, primary key |
| `candidate_name` | Extracted from resume |
| `jd_text` / `resume_text` | Raw uploaded text |
| `jd_summary` / `resume_summary` | JSON — agent's parsed understanding |
| `difficulty` | junior / mid / senior / principal |
| `status` | ready → active → completed |
| `question_bank` | JSON array of 8 questions |
| `current_question_index` | Index of the active question |
| `last_was_followup` | 1 if the current turn is answering a follow-up |
| `followup_count` | Follow-ups used on the current question |
| `interview_memory` | JSON — compact carried-forward state: plan, per-turn decisions, compacted history, concerns, pending follow-up |
| `agent_session_id` | Claude Agent SDK session id, resumed on every orchestrator turn |
| `agent_history` | *(legacy, unused)* |
| `agent_observations` | JSON — cross-question concerns noted by the agent |
| `concluded_early` | 1 if the agent ended the interview before all questions |
| `trace` | JSON array — chronological agent decision events (tool calls, evaluations, decisions, report) |

### `answers` table — one row per question answered

| Column | Description |
|---|---|
| `session_id` | Foreign key to sessions |
| `question_index` | Which question this is for |
| `transcript` | What the candidate said |
| `score_technical` / `score_communication` / `score_depth` | 0–10 scores |
| `flags` | JSON array — `vague`, `evasive`, `contradicts_resume`, etc. |
| `analysis` | Agent's written evaluation and decision reasoning |

### `reports` table — one row per completed session

| Column | Description |
|---|---|
| `session_id` | Foreign key to sessions |
| `overall_score` | 0–100 |
| `recommendation` | strong_hire / hire / maybe / no_hire |
| `strengths` / `gaps` / `red_flags` | JSON arrays |
| `narrative` | Agent's full written assessment |

**To inspect the database:**
```bash
sqlite3 backend/db/interview.db
sqlite> .tables
sqlite> SELECT id, candidate_name, status FROM sessions;
sqlite> SELECT question, score_technical, analysis FROM answers WHERE session_id = 'your-id';
sqlite> .quit
```

**To reset (delete all sessions):**
```bash
rm backend/db/interview.db
# Restart backend — schema recreates automatically
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6 |
| Backend | Node.js (ESM), Express 4 |
| Agent orchestration | `@anthropic-ai/claude-agent-sdk` — tool-calling loop, in-process MCP tools, sessions, permissions |
| LLM | Claude (via Claude Pro/Max subscription + OAuth token) |
| Agent-to-agent | `@a2a-js/sdk` (Apache-2.0) — A2A protocol v1.0, JSON-RPC transport |
| Speech-to-text | Groq Whisper `whisper-large-v3-turbo` (free tier) |
| Text-to-speech | Browser `SpeechSynthesis` API — no API key or internet required |
| Database | SQLite via `@libsql/client` |
| File parsing | `pdf-parse` (PDF), `mammoth` (DOCX) |
| Schema validation | Zod (tool parameter definitions + sub-agent output contracts) |
| Logging | pino (structured JSON) |

---

## Troubleshooting

**Backend won't start — `CLAUDE_CODE_OAUTH_TOKEN` error**
- Run `claude setup-token` to generate a fresh token
- Make sure `CLAUDE_CODE_OAUTH_TOKEN` is set in `backend/.env` (not `.env.example`)
- Token starts with `sk-ant-oat01-`

**`claude setup-token` not found**
- Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`

**`npm install` fails with `ERESOLVE` (zod peer conflict)**
- Make sure `backend/.npmrc` exists (it sets `legacy-peer-deps=true`), or run `npm install --legacy-peer-deps`

**An answer takes a long time / "timed out" in the logs**
- Each answer runs two Claude calls (scoring + the orchestrator's decision loop); 30-90 s is normal
- Lower `ORCHESTRATOR_EFFORT` / `SUBAGENT_EFFORT`, or raise `AGENT_TIMEOUT_MS`
- If the orchestrator fails, the candidate is advanced automatically and the reason is logged — the interview never gets stuck

**Claude usage limit reached**
- Pro/Max subscriptions have rolling limits; wait for the window to reset. Avoid running the full eval suite right before a demo (`npm run eval:quick` is lighter)

**Backend won't start — `GROQ_API_KEY` missing**
- Get a free key at [console.groq.com](https://console.groq.com)
- Groq is always required for Whisper STT, even when using Claude as the LLM

**`npm run dev` fails with ES module error**
- You need Node.js 18 or higher: `node --version`

**Microphone not working**
- Use Chrome or Edge
- The page must be served from `localhost` (not a file path)
- Click "Allow" when the browser prompts for mic access

**Speech not playing**
- The interview uses your browser's built-in text-to-speech — check system volume
- On Linux: `sudo apt install espeak` may be needed

**Interview page shows blank after an answer**
- Check the browser console for errors
- Ensure the backend is running and `GROQ_API_KEY` is valid (Whisper needs it to transcribe)

**Interview page shows "Session not found"**
- If you restarted the backend, old session IDs are still valid (SQLite persists across restarts)
- The candidate URL must match a session created from the setup page

**Report page errors**
- The interview must be fully completed (candidate reaches the Thank You screen) before the report can be generated
- Check the backend terminal for error details

**Rate limit errors from Groq (429)**
- Groq free tier has per-minute limits; the backend retries automatically up to 4 times with backoff
- If retries are exhausted, wait 60 seconds and try again
- Running multiple interviews simultaneously will hit limits faster

---

## Security considerations

### API key authentication

Set `API_KEYS` in `backend/.env` to enable authentication:

```
API_KEYS=your-secret-key-1,your-secret-key-2
```

All endpoints (except `GET /api/health`) require the `X-API-Key: <key>` header. If `API_KEYS` is not set, auth is disabled (dev mode).

### Rate limiting

Three rate limiters are active by default (in-memory, per-IP):

| Endpoint | Limit |
|---|---|
| All routes | 100 req / 15 min |
| `POST /api/transcribe` | 20 req / 15 min |
| `POST /api/session/:id/answer` | 30 req / 15 min |

### Prompt injection protection

Defence in depth:

1. **Sanitisation** — all user-controlled text (transcripts, JD content, resume content) is cleaned before being interpolated into LLM prompts. Stripped patterns include: `<|im_start|>`, `<|im_end|>`, `[INST]`, `IGNORE PREVIOUS INSTRUCTIONS`, `SYSTEM PROMPT:`, and triple-backtick injection blocks. Lengths are capped.
2. **Delimiting** — the orchestrator receives documents and answers inside `<job_description>`, `<resume>` and `<candidate_answer>` tags, and its system prompt states that content inside them is untrusted evidence, never instructions.
3. **No dangerous capabilities** — even a successful injection has nothing to abuse: the agent has no shell, file or web tools (`tools: []`), and can only call the current phase's interview tools, whose effects are bounded by code-level guards.

### Data handling

- All interview data (transcripts, scores, reports) is stored locally in `backend/db/interview.db` — a SQLite file on your machine
- No interview data is sent to any third party other than Anthropic (Claude, for reasoning) and Groq (Whisper, audio only)
- The LLM receives the question and transcript text — never raw uploaded files
- Uploaded JD/resume files are deleted from disk immediately after text extraction
- **Claude Agent SDK session transcripts:** with `AGENT_SESSION_RESUME=true` (default) the orchestrator's conversation (which includes answer text) is persisted by the SDK under `~/.claude/projects/` on the server so it can be resumed. Sub-agent and eval calls use `persistSession: false`. Set `AGENT_SESSION_RESUME=false` if transcripts must not be written there, and clean that folder as part of data-retention.
- The decision trace (`/trace/:id`, A2A `get_trace`) never includes transcript text
- `interview.db` is excluded from git via `.gitignore`

### Environment variable security

- Never commit `.env` — it is excluded by `.gitignore`
- Rotate `CLAUDE_CODE_OAUTH_TOKEN` via `claude setup-token` if it is ever exposed
- Rotate `GROQ_API_KEY` at https://console.groq.com if exposed

---

## Running evaluations

**What evals are:** normal unit tests check exact outputs, but an LLM's output is different every run. Evals are repeatable test cases that check *properties* of the output instead — "a vague answer is flagged `vague`", "a strong answer scores ≥7", "the agent follows up on an evasive answer" — plus an **LLM judge** that grades quality against a written rubric. Run them after every prompt or code change to see whether the agent got better or worse.

The suite covers every agent **and the orchestrator's decisions** without needing the web server or a real interview. It uses Claude through the same Agent SDK path as production.

```
evals/
├── runner.js               # eval runner + quality gates
├── baseline.json           # saved "known good" run used by the regression gate
├── rubric.md               # human-readable judge rubric (machine copy: judge/rubrics.js)
├── judge/
│   ├── evalAgent.js        # LLM-as-judge: free-form, rubric, reference-guided, pairwise (position-swapped)
│   └── rubrics.js
├── cases/                  # test dataset — 56 cases
│   ├── parseAgent.cases.js       (10)
│   ├── questionAgent.cases.js    (13)
│   ├── answerAgent.cases.js      (11)
│   ├── reportAgent.cases.js      (11)
│   └── orchestrator.cases.js     (10 decision cases + 1 memory case)
├── fixtures/               # JD, resumes, answer transcripts, golden reference question bank
└── results/
    ├── results.json        # machine-readable results of the latest run (committed sample)
    └── report.md           # human-readable evaluation report of the latest run
```

```bash
cd backend
npm run eval            # full suite incl. LLM judge, compared against evals/baseline.json
npm run eval:quick      # skip LLM-judge assertions (faster, cheaper)
npm run eval:baseline   # run the full suite and save it as the new baseline
node ../evals/runner.js --only orchestrator --concurrency 2   # one agent, custom parallelism
```

### Quality gates

The runner exits with code **1** (failing CI) if either gate fails:

| Gate | Rule |
|---|---|
| **1. Pass rate** | ≥ 80% of cases pass |
| **2. Regression gate** | No case that passed in `evals/baseline.json` may fail now, and no agent's pass rate may drop by more than 20 points |

Workflow: make a change → `npm run eval` → if both gates pass and the result is better, `npm run eval:baseline` to lock in the new baseline → commit `baseline.json` with the change.

### What is evaluated

| Agent | Example checks | Judge |
|---|---|---|
| parseAgent | role title, skills, seniority, candidate name, no crash on junk input | — |
| questionAgent | exactly 8, all categories, unique, non-empty intent, **focus areas from the orchestrator steer the questions** | rubric `question_bank`; **pairwise vs golden bank (A/B swapped)**; free-form relevance |
| answerAgent | strong ≥7, vague ≤5 + flagged, evasive flagged, contradicts-resume flagged, empty → `no_answer` | **reference-guided** rubric `answer_evaluation` |
| reportAgent | score ranges, high scores → hire, low → no_hire, headline/confidence/skill ratings | rubric `report` on a mixed interview with agent observations |
| orchestrator | vague → follow-up, strong → advance, no 2nd follow-up, closing → advance, no early stop at Q2, evasive → follow-up, follow-up answer judged against the follow-up asked, weak history → no positive verdict, contradiction acted on; memory compaction | rubric `followup_question` |

See [`evals/rubric.md`](evals/rubric.md) for the rubric anchors and the judge-bias mitigations (position swap, verbosity instruction, evidence-before-score, reference anchoring).

### Interpreting results

**Overall pass rate**

| Rate | Meaning |
|---|---|
| ≥ 90% | Healthy — agents are producing structurally correct, well-calibrated output |
| 80–89% | Acceptable — one or two edge cases are flaky; investigate before deploying |
| < 80% | Failing threshold — something is broken; check the failure list before using the system |

Every run writes `evals/results/results.json` (all cases, failure reasons, judge scores, timings) and `evals/results/report.md` — the human-readable **evaluation report**: summary, gates, LLM-judge table, failures, and a **watch list** of borderline signals in passing cases (rubric criteria ≤3/5, pairwise verdicts that flipped when A/B were swapped, low free-form scores). Re-render the report without calling any model: `node ../evals/runner.js --report-only`.

**Latest committed run:** 56/56 (100%), see [`evals/results/report.md`](evals/results/report.md). Key findings on the watch list:
- `answer-011` — the answer evaluator is slightly **harsher than the answer key** on vague answers (1/10 vs expected 2-4) and **over-flags** (adds `evasive` to a merely vague answer). Candidate prompt tweak: calibrate "vague but correct definition" to 2-3.
- `question-012` — the pairwise judge preferred whichever bank it read first, so the A/B swap scored it a **tie** instead of a win: position bias detected and neutralised.

**Per-agent failures**

A single agent failing 3+ cases usually means a prompt regression or a changed output schema. Focus on which agent is failing — if `answerAgent` has 4 failures, check `backend/agents/answerAgent.js` rather than the others. Orchestrator failures point at `interviewAgent.js` (prompt, tool descriptions or guards).

**LLM-judge failures**

A judge failure means the output is structurally correct but the quality is poor against the rubric (e.g. all questions on one topic, a generic report, a follow-up that does not target the gap). Judge verdicts are probabilistic; if a case alternates pass/fail across runs the output is borderline — strengthen the prompt rather than loosening the rubric.

**Flaky cases vs. broken cases**

Run the suite twice. A case that fails consistently is broken. A case that fails once in five runs is flaky. Flaky cases in `answerAgent` usually mean the LLM produced a score slightly outside the expected range — tighten the range assertion or update the fixture to be less ambiguous.

**Common failure patterns and fixes**

| Symptom | Likely cause | Fix |
|---|---|---|
| `field_exists` failures on all cases for one agent | Agent returned a string instead of JSON | Check `safeJsonParse` in `llm.js` and the contract warnings in the logs (`Sub-agent output violated its contract`) |
| Orchestrator `action` wrong | Prompt/tool descriptions changed, or memory text misleading | Run `--only orchestrator` with `LOG_LEVEL=info` to see each tool call and its `reasoning` |
| `number_gte` failure on a score assertion | LLM scored a "strong" answer lower than expected | Adjust the fixture answer to be more clearly strong, or widen the assertion range |
| `array_min_length` failure on `required_skills` | Short/vague JD fixture returned fewer skills | Update the fixture JD to be more detailed |
| LLM judge failure on narrative quality | Report narrative is too short or generic | Check `reportAgent.js` prompt; increase the minimum length instruction |

### Adding new test cases

Add entries to `evals/cases/<agent>.cases.js` following the same structure:

```js
{
  id: "answer-012",
  description: "Answer with specific metrics scores depth >= 7",
  agent: "answerAgent",
  fn: "analyseAnswer",
  input: {
    question: "Describe a system you scaled to handle 10x traffic.",
    answer: fix("transcripts/answer-strong-technical.txt"),
    questionCategory: "technical",
    jdSummary,
  },
  assertions: [
    { type: "number_gte", field: "score_depth", min: 7 },
    { type: "field_exists", field: "strength_points" },
  ],
}
```

Deterministic assertion types: `field_exists`, `field_equals`, `field_in_set`, `array_min_length`, `array_length`, `array_includes`, `array_has_item_with_field_value`, `array_items_unique`, `every_item_has_nonempty_field`, `number_gte`, `number_lte`, `number_between`, `string_min_length`, `predicate` (`{ fn: (result) => boolean, label }`), `no_crash`. Fields support dotted paths (`"decision.verdict"`).

Judge assertion types:

```js
// Single-answer grading against a rubric (optionally reference-guided)
{ type: "llm_judge_rubric", rubric: "report",
  task: (result) => "what the agent was asked to do",
  output: (result) => result.narrative,
  reference: "optional answer key" }

// Pairwise vs a golden output — runs twice with A/B swapped
{ type: "llm_judge_pairwise", task: "…", criteria: "…",
  candidate: (result) => "our output", baseline: () => "golden output", allow: ["win", "tie"] }

// Free-form yes/no (legacy)
{ type: "llm_judge", prompt: (result) => `… Respond with JSON: { "pass": true/false, "score": 0-10, "reason": "..." }` }
```

Orchestrator cases use `agent: "orchestrator", fn: "decide"` with an in-memory `session` object (question bank, index, follow-up state, optional `interview_memory`) and a `transcript` — see `evals/cases/orchestrator.cases.js`.

---

## Known limitations

- **Auth is off by default** — set `API_KEYS` in `.env` to enable it for non-local deployments.
- **No concurrent answer protection** — if two requests submit answers to the same session simultaneously, the interview memory and SDK session may diverge. Only one browser tab per candidate session is safe.
- **Latency** — each answer takes roughly 30-90 s (answer scoring + the orchestrator's tool loop, each a Claude Agent SDK subprocess); setup ~1-2 min. Lower `*_EFFORT` settings trade depth for speed.
- **Subscription usage limits** — runs on a Claude Pro/Max subscription via OAuth, which has rolling usage limits; heavy eval runs and many interviews in a short window can hit them. For multi-user production use an Anthropic API key instead (Anthropic does not allow offering claude.ai login/limits in third-party products without approval).
- **LLM judge is Claude judging Claude** — self-preference bias is mitigated (rubric anchors, reference answers, deterministic assertions) but not eliminated. A second judge model would strengthen it.
- **A2A task store is in-memory** — A2A task IDs are lost on restart, but the interview itself is not: continue with `{"skill":"submit_answer","sessionId":…}`. No streaming or push notifications yet.
- **Rate limiting is in-memory** — the express-rate-limit counters reset on every backend restart and are not shared across multiple server processes. Not suitable for multi-instance deployments without a Redis store.
- **8-question limit** — the question bank is always 8 questions. The agent may conclude early but cannot go beyond 8.
- **Browser TTS quality varies** — Windows and macOS have natural-sounding voices; Linux may sound robotic without additional voices installed.
- **Files not stored on disk** — uploaded JD/resume files are processed in memory and not saved. The extracted text is stored in SQLite.
- **No candidate link expiry** — the candidate interview URL remains valid indefinitely once created. There is no expiry, one-time-use enforcement, or revocation mechanism.
- **Single-user SQLite** — `interview.db` is a local file with no connection pooling. Concurrent interviews from multiple HR users against the same backend instance can cause write contention under load.

---

## Future hardening steps

These are the highest-priority items to address before running this system in a production or multi-user environment.

### Security

- **Candidate link expiry** — add a `valid_until` timestamp to the session and reject interview submissions once it has passed. One-time-use enforcement (mark the link used after the first answer) prevents replay.
- **Persistent API key store** — replace the comma-separated `API_KEYS` env var with a hashed key table in SQLite (or a secrets manager). Support key rotation and per-key audit logs.
- **Database encryption** — encrypt `interview.db` at rest using SQLCipher or encrypt the sensitive columns (`jd_text`, `resume_text`, `interview_memory`, `transcript`) before writing. Protects against an attacker gaining filesystem access.
- **Content Security Policy headers** — add `helmet.js` to the Express server to set CSP, HSTS, X-Frame-Options, and other security headers.

### Reliability

- **Concurrent answer protection** — wrap each `POST /session/:id/answer` handler in an optimistic lock: read the current `updated_at` timestamp, run the agent, then update only if `updated_at` hasn't changed. Reject with 409 if it has.
- **Persistent rate limiting** — replace in-memory `express-rate-limit` with a Redis store (`rate-limit-redis`) so limits survive restarts and work across multiple server instances.
- **Agent timeout recovery** — timeouts, retries and safe fallbacks exist (see [Reliability controls](#reliability-controls)); a `processing` status flag would additionally let a second request detect an in-flight turn.
- **Stricter output contracts** — contracts currently coerce and log; a strict mode could reject and re-ask the sub-agent with the validation errors.
- **Persistent A2A task store** — use `DatabaseTaskStore` from `@a2a-js/sdk/server/database` (SQLite) and enable streaming (`SendStreamingMessage`) for live progress during the 1-2 minute setup.

### Scalability

- **Replace SQLite with PostgreSQL** — for multi-user or multi-instance deployments. The schema maps cleanly; `@libsql/client` can be swapped for `pg`.
- **Move audio transcription to a queue** — Groq Whisper calls block the answer submission request for 2–5 seconds. Offload to a background worker (BullMQ + Redis) and return a job ID; the frontend polls for the transcript.
- **SSE monitor scaling** — the `GET /monitor/:id` SSE connection holds a long-lived HTTP connection per HR user. Under many concurrent monitors, use a pub/sub layer (Redis Pub/Sub or a WebSocket server) instead of polling SQLite in a setInterval loop.

### Observability

- **Log aggregation** — pipe pino JSON output to a log aggregator (Loki, Datadog, CloudWatch). Add a `sessionId` field to every log line for per-interview filtering.
- **Distributed tracing** — instrument `agentQuery()` and each sub-agent call with OpenTelemetry spans so you can see end-to-end latency per interview step in a trace viewer.
- **Eval in CI** — run `npm run eval` (exit code 1 on a failed gate) as a CI step on every push to catch prompt regressions before deployment. Store the OAuth token as a CI secret.