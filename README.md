# InterviewIQ — AI Interview Agent

An end-to-end agentic AI system that conducts structured technical interviews. HR uploads a job description and resume; the agent parses both, generates a tailored question bank, conducts a live voice interview with the candidate, monitors progress in real time, and produces a full eligibility report — with visible reasoning at every step.

**Runs on free tiers** — Claude Agent SDK (via Claude Pro subscription) for all LLM reasoning, Groq Whisper (free tier) for speech-to-text, browser built-in SpeechSynthesis for text-to-speech.

---

## What makes it agentic

Most LLM integrations make a single API call and return a result. This system is different.

The agent runs a **tool-calling loop** using the `@anthropic-ai/claude-agent-sdk`. Each time a candidate submits an answer, the agent doesn't just call one function — it reasons step by step, calls tools in sequence, and makes an autonomous decision about what to do next. The loop continues until the agent has called the right tools and arrived at a decision.

**Every tool call includes a `reasoning` field** — the agent writes out its chain of thought before acting. This is logged to the backend terminal so you can see exactly why the agent made each decision.

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
- **Claude Pro or Claude Code subscription** — the agent authenticates via OAuth token, not a pay-per-use API key
- **Claude Code CLI** — install with `npm install -g @anthropic-ai/claude-code`, then run `claude setup-token` to generate your `CLAUDE_CODE_OAUTH_TOKEN`
- **A free Groq API key** — [console.groq.com](https://console.groq.com) — used only for speech-to-text (Whisper)
- A modern browser with microphone access (Chrome or Edge recommended)

### Optional (alternative LLM providers)

If you don't have Claude Pro, you can swap the LLM provider to Groq or Gemini (both free):

- **Groq API key** — [console.groq.com](https://console.groq.com) — uses Llama 3.3 70B
- **Gemini API key** — [aistudio.google.com](https://aistudio.google.com) — uses Gemini 2.5 Flash Lite

> Note: When using Groq or Gemini as the LLM provider, the agent still calls tools the same way — but through an OpenAI-compatible client instead of the Claude Agent SDK. The `CLAUDE_CODE_OAUTH_TOKEN` is only needed when `LLM_PROVIDER=claude-sdk`.

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

# Use Claude Agent SDK for all LLM reasoning (default)
LLM_PROVIDER=claude-sdk

PORT=3001
```

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

```
  Interview Agent API → http://localhost:3001
  LLM provider  : claude-sdk
  Health        : http://localhost:3001/api/health
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

## Using an alternative LLM provider (no Claude Pro required)

If you don't have a Claude Pro subscription, set `LLM_PROVIDER` to `groq` or `gemini` in `.env`:

```env
# Option A — Groq (Llama 3.3 70B, free tier)
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_your_key_here

# Option B — Gemini (Gemini 2.5 Flash Lite, free tier)
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza_your_key_here
```

No code changes needed. The Groq key is still needed for speech-to-text regardless of which LLM provider you choose — Groq Whisper is the only STT option.

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
                            │ HTTP + SSE
┌───────────────────────────▼─────────────────────────────────────┐
│                   Express API  :3001                             │
│  /api/parse   /api/session/start   /api/session/:id/answer       │
│  /api/transcribe   /api/report   /api/monitor/:id (SSE)          │
└───────────────────────────┬─────────────────────────────────────┘
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
               │  questionAgent│    │  - agent_history       │
               │  answerAgent  │    │  - agent_observations  │
               │  reportAgent  │    │  answers table         │
               └────────┬──────┘    │  reports table         │
                        │           └────────────────────────┘
               ┌────────▼──────┐
               │    llm.js     │
               │  Claude SDK   │
               │  or Groq/     │
               │  Gemini       │
               └───────────────┘
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

### How agent state persists across HTTP requests

Each HTTP request to `/api/session/:id/answer` is stateless from Express's point of view. The agent's continuity comes from SQLite:

1. On every answer submission, `getSession()` loads the full `agent_history` (the complete LLM conversation so far) from the database
2. The agent runs its tool-calling loop with that history as context — it knows everything that happened in prior turns
3. After the loop completes, the updated `agent_history` and any new observations are saved back to SQLite
4. The next answer submission starts the same way

This is what gives the agent genuine memory across the interview — not just the current answer, but every prior question, answer, score, and reasoning note.

### Follow-up enforcement

The agent can request a follow-up on any question, but only once. This rule is enforced at two levels:

1. **Prompt level** — the agent is instructed not to follow up a follow-up
2. **Tool level** — the `request_followup` tool handler checks `context.lastWasFollowup` and overrides the decision to `advance` if the limit is already reached, even if the agent calls the tool anyway

---

## Environment variables

All variables go in `backend/.env`.

| Variable | Required | Description |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes (if `LLM_PROVIDER=claude-sdk`) | Generated by `claude setup-token`. Authenticates via Claude Pro — no separate API billing. |
| `GROQ_API_KEY` | Yes | From [console.groq.com](https://console.groq.com). Used for Whisper STT on every interview. Also used as LLM if `LLM_PROVIDER=groq`. |
| `GEMINI_API_KEY` | Only if `LLM_PROVIDER=gemini` | From [aistudio.google.com](https://aistudio.google.com) |
| `LLM_PROVIDER` | No | `claude-sdk` (default), `groq`, or `gemini` |
| `PORT` | No | Backend port, defaults to `3001` |

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

### Tool permissions (allowedTools per phase)

The Claude Agent SDK enforces which tools the agent may call in each phase. If the agent tries to call a tool outside its allowed set, the SDK rejects the call rather than executing it. This is the least-privilege boundary — the setup agent cannot touch evaluation tools, and the interview agent cannot re-run document parsing.

| Phase | Allowed tools | Blocked tools |
|---|---|---|
| Setup | `parse_documents`, `generate_question_bank` | All interview and report tools |
| Per-answer (interview) | `evaluate_answer`, `request_followup`, `advance_to_next_question`, `conclude_interview_early`, `note_cumulative_concern` | Setup tools, report tools |
| Report | *(none — `generate_final_report` is a direct sub-agent call, not a tool-loop)* | All tools |

The `allowedTools` arrays are defined in `backend/agents/interviewAgent.js` and passed to `query()` at the start of each phase. The agent cannot escalate its own permissions at runtime.

---

## Sub-agents

The orchestration agent delegates four specific tasks to sub-agents — direct LLM calls (no tool loop) that return structured JSON. Sub-agents are called by the orchestration agent during its own tool-calling loop; they are not accessible via the HTTP API directly.

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

Receives both summaries and the chosen difficulty level. Returns exactly 8 questions with category distribution, intended depth, and the agent's stated interview strategy. The question bank is saved to SQLite and used for the entire interview.

**Input:** `{ jdSummary, resumeSummary, difficulty, candidateName }`  
**Output:** `{ questions: [{ id, category, question, intent, difficulty, follow_ups[] }], strategy, focusAreas[] }`

Category distribution: `opening` (1), `technical` (3), `behavioural` (2), `situational` (1), `closing` (1).

---

### `answerAgent` — per-answer evaluation

**File:** `backend/agents/answerAgent.js`  
**Called by:** `processAnswer()` via the `evaluate_answer` tool handler  
**When:** Once per submitted answer (including follow-ups)

Receives the question, the candidate's transcript, and a summary of prior answers for cross-question context. Returns three dimension scores, an overall score, flags, and a written analysis. The orchestration agent reads this output and then decides whether to follow up, advance, or conclude early.

**Input:** `{ question, answer, category, priorContext, jdSummary }`  
**Output:** `{ score_technical, score_communication, score_depth, overall_score, flags[], strength_points[], gap_points[], analysis }`

**Flags raised:** `vague` (non-specific answer), `evasive` (deflects the question), `contradicts_resume` (claims skills not in resume), `no_answer` (empty or one-word response), `very_short` (under 20 words).

---

### `reportAgent` — final assessment

**File:** `backend/agents/reportAgent.js`  
**Called by:** `generateAgentReport()` via the `generate_final_report` tool handler  
**When:** Once, after the interview is completed, when the HR user opens the report page

Receives all scored answers, JD and resume summaries, and any cross-question observations the agent recorded during the interview. Synthesizes everything into a holistic eligibility report. The result is cached in the `reports` table — loading the report page again returns the cached version without re-running the LLM.

**Input:** `{ sessionId, session, answers[], jdSummary, resumeSummary, agentObservations[] }`  
**Output:** `{ overall_score, recommendation, confidence, headline, strengths[], gaps[], red_flags[], skill_ratings[], narrative, suggested_next_steps[] }`

**Recommendation values:** `strong_hire` · `hire` · `maybe` · `no_hire`

---

## API endpoints

All endpoints served from `http://localhost:3001`.

### `GET /api/health`

```json
{ "status": "ok", "provider": "claude-sdk", "phase": 3 }
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
# { "status": "ok", "provider": "claude-sdk", "phase": 3 }
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
│   ├── server.js               # Express entry point, CORS, route registration
│   ├── llm.js                  # LLM routing — Claude SDK (default) or Groq/Gemini
│   ├── .env.example            # Copy to .env, fill in keys
│   ├── agents/
│   │   ├── interviewAgent.js   # Core agent — tool definitions, query() loop, all three phases
│   │   ├── sessionManager.js   # Session lifecycle — DB reads, API response shaping
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

SQLite database is created automatically at `backend/interview.db` on first run.

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
| `agent_history` | JSON — full LLM conversation history (replayed each request) |
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
sqlite3 backend/interview.db
sqlite> .tables
sqlite> SELECT id, candidate_name, status FROM sessions;
sqlite> SELECT question, score_technical, analysis FROM answers WHERE session_id = 'your-id';
sqlite> .quit
```

**To reset (delete all sessions):**
```bash
rm backend/interview.db
# Restart backend — schema recreates automatically
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6 |
| Backend | Node.js (ESM), Express 4 |
| Agent orchestration | `@anthropic-ai/claude-agent-sdk` — tool-calling loop via Claude Code OAuth |
| LLM (default) | Claude (via Claude Pro subscription + OAuth token) |
| LLM (alternative) | Groq `llama-3.3-70b-versatile` or Gemini `gemini-2.5-flash-lite` |
| Speech-to-text | Groq Whisper `whisper-large-v3-turbo` (always Groq, regardless of LLM provider) |
| Text-to-speech | Browser `SpeechSynthesis` API — no API key or internet required |
| Database | SQLite via `@libsql/client` |
| File parsing | `pdf-parse` (PDF), `mammoth` (DOCX) |
| Schema validation | Zod (tool parameter definitions) |

---

## Troubleshooting

**Backend won't start — `CLAUDE_CODE_OAUTH_TOKEN` error**
- Run `claude setup-token` to generate a fresh token
- Make sure `CLAUDE_CODE_OAUTH_TOKEN` is set in `backend/.env` (not `.env.example`)
- Token starts with `sk-ant-oat01-`

**`claude setup-token` not found**
- Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
- If you don't have Claude Pro, set `LLM_PROVIDER=groq` and skip the OAuth token

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

All user-controlled text (transcripts, JD content, resume content) is sanitized before being interpolated into LLM prompts. Stripped patterns include: `<|im_start|>`, `<|im_end|>`, `[INST]`, `IGNORE PREVIOUS INSTRUCTIONS`, `SYSTEM PROMPT:`, and triple-backtick injection blocks.

### Data handling

- All interview data (transcripts, scores, reports) is stored locally in `backend/interview.db` — a SQLite file on your machine
- No interview data is sent to any third party other than the LLM provider (Groq/Gemini/Anthropic) for processing
- The LLM provider receives the question and transcript text — never raw uploaded files
- Uploaded JD/resume files are deleted from disk immediately after text extraction
- `interview.db` is excluded from git via `.gitignore`

### Environment variable security

- Never commit `.env` — it is excluded by `.gitignore`
- Rotate `CLAUDE_CODE_OAUTH_TOKEN` via `claude setup-token` if it is ever exposed
- Rotate `GROQ_API_KEY` at https://console.groq.com if exposed

---

## Running evaluations

The eval suite tests all four agent functions (parseAgent, questionAgent, answerAgent, reportAgent) without running a full interview session. It uses your existing `.env` for LLM access.

**Requirements:** Backend `.env` must be configured (`CLAUDE_CODE_OAUTH_TOKEN` required for the LLM-as-judge; `GROQ_API_KEY` or another provider for the agent calls).

```bash
# From the project root
node evals/runner.js
```

Output:
```
InterviewIQ Eval Runner — 40 test cases
──────────────────────────────────────────────────
  parse-001        Valid SWE JD extracts role_title                          PASS
  parse-002        Valid SWE JD extracts required_skills array with ≥3 items PASS
  ...
──────────────────────────────────────────────────
Results: 37/40 passed (93%)

  parseAgent           10/10
  questionAgent        9/10
  answerAgent          9/10
  reportAgent          9/10

Results written to evals/results/results.json
```

The runner exits with code 0 if pass rate ≥ 80%, code 1 otherwise.

### Interpreting results

**Overall pass rate**

| Rate | Meaning |
|---|---|
| ≥ 90% | Healthy — agents are producing structurally correct, well-calibrated output |
| 80–89% | Acceptable — one or two edge cases are flaky; investigate before deploying |
| < 80% | Failing threshold — something is broken; check the failure list before using the system |

The runner writes `evals/results/results.json` every run. Open this file to see the exact failure reasons rather than reading the terminal output.

**Per-agent failures**

Each agent has 10 test cases. A single agent failing 3+ cases usually means a prompt regression or a changed output schema. Focus on which agent is failing — if `answerAgent` has 4 failures, check `backend/agents/answerAgent.js` rather than the others.

**`llm_judge` failures**

Two cases use an LLM-as-judge assertion: one for question diversity (questionAgent) and one for report narrative quality (reportAgent). These are the only cases that call Claude. A judge failure means:
- The output is structurally correct (fields exist, types match) but the quality is poor — e.g. all 8 questions are about the same topic, or the report narrative is a single sentence
- Judge verdicts can occasionally vary between runs because they are probabilistic; if a case alternates pass/fail across runs, the output is borderline and the prompt should be strengthened

**Flaky cases vs. broken cases**

Run the suite twice. A case that fails consistently is broken. A case that fails once in five runs is flaky. Flaky cases in `answerAgent` usually mean the LLM produced a score slightly outside the expected range — tighten the range assertion or update the fixture to be less ambiguous.

**Common failure patterns and fixes**

| Symptom | Likely cause | Fix |
|---|---|---|
| `field_exists` failures on all cases for one agent | Agent returned a string instead of JSON | Check `safeJsonParse` in `llm.js`; the prompt may be missing "respond with JSON only" |
| `number_gte` failure on a score assertion | LLM scored a "strong" answer lower than expected | Adjust the fixture answer to be more clearly strong, or widen the assertion range |
| `array_min_length` failure on `required_skills` | Short/vague JD fixture returned fewer skills | Update the fixture JD to be more detailed |
| LLM judge failure on narrative quality | Report narrative is too short or generic | Check `reportAgent.js` prompt; increase the minimum length instruction |

### Adding new test cases

Add entries to `evals/cases/<agent>.cases.js` following the same structure:

```js
{
  id: "answer-011",
  description: "Answer with specific metrics scores depth >= 7",
  agent: "answerAgent",
  fn: "analyseAnswer",
  input: {
    question: "Describe a system you scaled to handle 10x traffic.",
    answer: readFixture("transcripts/answer-strong-technical.txt"),
    category: "technical",
  },
  assertions: [
    { type: "number_gte", field: "score_depth", min: 7 },
    { type: "field_exists", field: "strength_points" },
  ],
}
```

Available assertion types: `field_exists`, `field_equals`, `field_in_set`, `array_min_length`, `array_length`, `array_includes`, `array_items_unique`, `every_item_has_nonempty_field`, `number_gte`, `number_lte`, `number_between`, `string_min_length`, `llm_judge`, `no_crash`.

For `llm_judge`, the assertion takes a `prompt` function that receives the agent output and returns the judge prompt string:

```js
{
  type: "llm_judge",
  prompt: (result) => `The following is an interview report narrative. Does it mention at least two specific technical skills with evidence from the candidate's answers? Respond with JSON: { "pass": true/false, "score": 0-10, "reason": "..." }\n\nNarrative:\n${result.narrative}`,
}
```

---

## Known limitations

- **Auth is off by default** — set `API_KEYS` in `.env` to enable it for non-local deployments.
- **No concurrent answer protection** — if two requests submit answers to the same session simultaneously, the agent history may be corrupted. Only one browser tab per candidate session is safe.
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
- **Database encryption** — encrypt `interview.db` at rest using SQLCipher or encrypt the sensitive columns (`jd_text`, `resume_text`, `agent_history`, `transcript`) before writing. Protects against an attacker gaining filesystem access.
- **Content Security Policy headers** — add `helmet.js` to the Express server to set CSP, HSTS, X-Frame-Options, and other security headers.

### Reliability

- **Concurrent answer protection** — wrap each `POST /session/:id/answer` handler in an optimistic lock: read the current `updated_at` timestamp, run the agent, then update only if `updated_at` hasn't changed. Reject with 409 if it has.
- **Persistent rate limiting** — replace in-memory `express-rate-limit` with a Redis store (`rate-limit-redis`) so limits survive restarts and work across multiple server instances.
- **Agent timeout recovery** — if the Claude SDK `query()` call times out mid-loop (the AbortController fires), the session is left in an inconsistent state. Add a `processing` status flag so the next request can detect and recover a stuck session.
- **Structured output validation in sub-agents** — currently sub-agents call `safeJsonParse` and return a partial result on parse failure. Replace with Zod validation so callers receive a typed object or a typed error, not an unpredictable partial.

### Scalability

- **Replace SQLite with PostgreSQL** — for multi-user or multi-instance deployments. The schema maps cleanly; `@libsql/client` can be swapped for `pg`.
- **Move audio transcription to a queue** — Groq Whisper calls block the answer submission request for 2–5 seconds. Offload to a background worker (BullMQ + Redis) and return a job ID; the frontend polls for the transcript.
- **SSE monitor scaling** — the `GET /monitor/:id` SSE connection holds a long-lived HTTP connection per HR user. Under many concurrent monitors, use a pub/sub layer (Redis Pub/Sub or a WebSocket server) instead of polling SQLite in a setInterval loop.

### Observability

- **Log aggregation** — pipe pino JSON output to a log aggregator (Loki, Datadog, CloudWatch). Add a `sessionId` field to every log line for per-interview filtering.
- **Distributed tracing** — instrument `agentQuery()` and each sub-agent call with OpenTelemetry spans so you can see end-to-end latency per interview step in a trace viewer.
- **Eval in CI** — run `node evals/runner.js` as a CI step (GitHub Actions, etc.) on every push to catch prompt regressions before deployment. Cache the OAuth token as a CI secret.