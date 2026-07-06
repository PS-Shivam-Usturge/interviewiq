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
│       └── monitor.js          # GET /api/monitor/:sessionId (SSE) + POST live transcript
│
└── frontend/
    └── src/
        ├── main.jsx                 # React Router — 5 routes
        ├── index.css                # Dark design system with CSS variables
        ├── pages/
        │   ├── SetupPage.jsx        # HR: upload → parse preview → generate session → share links
        │   ├── InterviewPage.jsx    # Candidate: TTS question → voice recording → submit loop
        │   ├── MonitorPage.jsx      # HR: SSE live feed — transcript, running scores, flag tally
        │   ├── ReportPage.jsx       # HR: score rings, strengths/gaps, skill ratings, print export
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

## Known limitations

- **No authentication** — anyone with the session URL can view or interact with the session. Suitable for local and demo use only.
- **No concurrent answer protection** — if two requests submit answers to the same session simultaneously, the agent history may be corrupted.
- **8-question limit** — the question bank is always 8 questions. The agent may conclude early but cannot go beyond 8.
- **Browser TTS quality varies** — Windows and macOS have natural-sounding voices; Linux may sound robotic.
- **Files not stored on disk** — uploaded JD/resume files are processed in memory and not saved. The extracted text is stored in SQLite.