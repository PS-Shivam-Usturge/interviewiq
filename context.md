# InterviewIQ — AI Interview Agent · Codebase Context

> Paste this file at the start of a new chat to give full context of what has been built.
> Last updated: Phase 4 complete.

---

## What this project is

An AI-powered interview agent system. HR uploads a job description and resume. The AI parses both, generates a tailored question bank, and conducts a voice interview with the candidate. HR watches a live monitor. After the interview, the AI generates a full eligibility report with scores, strengths, gaps, and a hire/no-hire verdict.

**Completely free to run** — uses Groq free tier for both LLM (Llama 3.3 70B) and STT (Whisper). No paid APIs.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, React Router v6 |
| Backend | Node.js (ESM), Express 4 |
| LLM | Groq API — `llama-3.3-70b-versatile` (primary) |
| STT | Groq Whisper — `whisper-large-v3-turbo` |
| TTS | Browser `SpeechSynthesis` API (free, built-in) |
| Database | SQLite via `@libsql/client` (local file `interview.db`) |
| File parsing | `pdf-parse` + `mammoth` |
| LLM client | `openai` npm package (OpenAI-compatible, works with Groq + Gemini) |

---

## Project structure

```
interview-agent/
├── backend/
│   ├── agents/
│   │   ├── parser.js         # PDF/DOCX text extraction (pdf-parse + mammoth)
│   │   ├── parseAgent.js     # LLM extracts structured JSON from JD + resume text
│   │   ├── questionAgent.js  # Generates question bank + adaptive follow-up logic
│   │   ├── answerAgent.js    # Scores each answer (technical/communication/depth/flags)
│   │   ├── orchestrator.js   # Session state machine — coordinates all agents
│   │   └── reportAgent.js    # Generates full eligibility report from all answers
│   ├── db/
│   │   ├── database.js       # SQLite schema init + migration
│   │   └── sessionStore.js   # All DB read/write operations
│   ├── routes/
│   │   ├── parse.js          # POST /api/parse
│   │   ├── session.js        # POST /api/session/start, POST /api/session/:id/answer, GET /api/session/:id
│   │   ├── report.js         # GET /api/report/:sessionId
│   │   ├── transcribe.js     # POST /api/transcribe (Groq Whisper)
│   │   └── monitor.js        # GET /api/monitor/:sessionId (SSE), POST /api/monitor/:sessionId/live
│   ├── llm.js                # OpenAI-compat LLM client (Groq/Gemini), chat(), safeJsonParse()
│   ├── server.js             # Express entry point, registers all routes
│   ├── .env.example          # Copy to .env
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── FileDropZone.jsx    # Drag-drop file upload component
    │   │   └── ParsePreview.jsx    # HR-only: parsed JD + resume cards + skills match bar
    │   ├── hooks/
    │   │   └── useVoiceRecorder.js # MediaRecorder + silence detection + Groq Whisper call
    │   ├── pages/
    │   │   ├── SetupPage.jsx       # HR: upload JD+resume, parse preview, generate candidate link
    │   │   ├── InterviewPage.jsx   # Candidate: welcome screen → voice interview → completion
    │   │   ├── MonitorPage.jsx     # HR: SSE live transcript + running scores
    │   │   ├── ReportPage.jsx      # HR: full eligibility report + PDF export
    │   │   └── ThankYouPage.jsx    # Candidate: clean end screen, no scores shown
    │   ├── main.jsx                # React Router routes
    │   └── index.css               # Dark design system (CSS variables)
    ├── index.html
    ├── vite.config.js              # Proxies /api → localhost:3001
    └── package.json
```

---

## Environment variables

```env
# backend/.env
GROQ_API_KEY=your_groq_key       # console.groq.com — free, no card needed
GEMINI_API_KEY=your_gemini_key   # aistudio.google.com — optional fallback
LLM_PROVIDER=groq                # "groq" or "gemini"
PORT=3001
```

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/parse` | Upload JD + resume files → structured JSON summaries |
| POST | `/api/session/start` | Start session → question bank + first question |
| POST | `/api/session/:id/answer` | Submit transcript → scores + next question |
| GET | `/api/session/:id` | Get current session state |
| GET | `/api/report/:sessionId` | Generate (or return cached) eligibility report |
| POST | `/api/transcribe` | Upload audio blob → Groq Whisper → transcript |
| GET | `/api/monitor/:sessionId` | SSE stream — session state every 2s for HR monitor |
| POST | `/api/monitor/:sessionId/live` | Push live transcript from candidate page to monitor |

---

## Database schema

### sessions
```sql
id TEXT PRIMARY KEY
created_at INTEGER
candidate_name TEXT
jd_text TEXT
resume_text TEXT
jd_summary TEXT           -- JSON
resume_summary TEXT       -- JSON
difficulty TEXT           -- junior | mid | senior | principal
status TEXT               -- setup | ready | active | completed
question_bank TEXT        -- JSON array of question objects
current_question_index INTEGER
total_questions INTEGER
last_was_followup INTEGER -- 0 or 1, persisted to prevent infinite follow-up loops
followup_count INTEGER    -- resets to 0 on each new question
```

### answers
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
session_id TEXT
question_index INTEGER
question TEXT
question_category TEXT    -- opening | technical | behavioural | scenario | closing | follow_up
transcript TEXT
score_technical INTEGER   -- 0-10
score_communication INTEGER
score_depth INTEGER
flags TEXT                -- JSON array: ["vague", "contradicts_resume", "evasive", ...]
analysis TEXT             -- plain English sentence
```

### reports
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
session_id TEXT UNIQUE
overall_score INTEGER     -- 0-100
technical_score INTEGER
communication_score INTEGER
problem_solving_score INTEGER
culture_fit_score INTEGER
strengths TEXT            -- JSON array
gaps TEXT                 -- JSON array
red_flags TEXT            -- JSON array
recommendation TEXT       -- strong_hire | hire | maybe | no_hire
narrative TEXT            -- 3-4 paragraph written evaluation
```

---

## Agent system — how it works

### 5 agents

**1. Parse Agent (`parseAgent.js`)**
Called once per session setup. Takes raw JD text → returns structured JSON (role title, seniority, required skills, tech stack, responsibilities). Takes raw resume text → returns structured JSON (candidate name, experience, skills, achievements, red flags). Uses `temperature: 0.2` for consistency.

**2. Question Generator (`questionAgent.js`)**
Called once per session. Takes JD summary + resume summary + difficulty level → generates ordered question bank of 8 questions: 2 opening, 3 technical, 1 behavioural, 1 scenario, 1 closing. Each question has `intent`, `good_answer_signals`, and two pre-generated `follow_ups` (one harder, one clarifying). Uses `safeJsonParse` for truncation resilience.

**3. Answer Analyser (`answerAgent.js`)**
Called after every answer submission. Scores the transcript on `score_technical` (0-10), `score_communication` (0-10), `score_depth` (0-10), `overall_score` (0-10). Detects flags: `vague`, `inaccurate`, `contradicts_resume`, `no_examples`, `overconfident`, `underconfident`, `evasive`. Returns `follow_up_needed: true/false` and `follow_up_reason`.

**4. Orchestrator (`orchestrator.js`)**
The session state machine. Coordinates all agents. Key follow-up rules:
- `MAX_FOLLOWUPS_PER_QUESTION = 1` — hard cap, always move on after 1 follow-up
- `last_was_followup` and `followup_count` persisted to SQLite — never in-memory only
- Never follow-up a `follow_up` category question
- Never follow-up `closing` questions
- Resets `last_was_followup` and `followup_count` to 0 on every `advanceQuestion` call

**5. Report Agent (`reportAgent.js`)**
Called once after interview completion. Reads all answers from DB, sends compact summary to LLM, generates full report: `overall_score` (0-100), 4 dimension scores, `recommendation` (strong_hire/hire/maybe/no_hire), `confidence`, `headline`, `strengths[]`, `gaps[]`, `red_flags[]`, `skill_ratings[]` (star ratings per JD skill with evidence), `narrative` (4 paragraphs), `suggested_next_steps[]`. Report is cached in DB — subsequent calls return the stored version.

---

## LLM client (`llm.js`)

```js
chat(messages, opts, retries)
// opts: { temperature, maxTokens, json }
// Retries up to 4x on 429 with exponential backoff: 1.5s → 3s → 6s → 12s
// Default max_tokens: 8192

safeJsonParse(raw, label)
// Strips markdown fences, attempts JSON.parse
// On failure: counts open brackets, trims to last clean position, closes structures
// Logs warning if repair was needed, throws only if repair also fails
```

Switch provider by changing `.env`:
```env
LLM_PROVIDER=groq    # uses llama-3.3-70b-versatile
LLM_PROVIDER=gemini  # uses gemini-2.5-flash-lite (fallback)
```
No code changes needed — same OpenAI-compat client, different `baseURL`.

---

## Frontend routes

| Path | Portal | Page | Description |
|---|---|---|---|
| `/` | HR | SetupPage | Upload JD + resume, see parse analysis (HR only), generate candidate link |
| `/report/:sessionId` | HR | ReportPage | Full eligibility report, score rings, skill ratings, PDF export |
| `/monitor/:sessionId` | HR | MonitorPage | Live SSE feed — transcript, running scores, flag tally |
| `/interview/:id` | Candidate | InterviewPage | Welcome screen → voice interview → completion |
| `/thankyou` | Candidate | ThankYouPage | Clean end screen, zero scores, zero report link |

**Security separation:** Candidates never see `/report` or `/monitor`. The setup page shows the parse analysis with an "HR only" label. After session creation, HR gets a shareable link panel — they copy the candidate URL and send it separately.

---

## Voice flow (Phase 3)

```
Candidate clicks "Begin interview"
        ↓
Agent reads question aloud (browser SpeechSynthesis)
        ↓
Candidate clicks "Start speaking"
        ↓
MediaRecorder captures mic audio (WebM/Opus)
AudioContext AnalyserNode monitors RMS for silence
        ↓
4 seconds of silence (RMS < 0.01) → auto-stop
OR candidate clicks "Done speaking"
        ↓
Audio blob → POST /api/transcribe → Groq Whisper → transcript
        ↓
transcript → POST /api/session/:id/answer → orchestrator → analyser
        ↓
Scores stored in DB, next question returned
        ↓
Agent reads next question aloud → loop
```

`useVoiceRecorder.js` hook manages: mic permission, MediaRecorder lifecycle, AudioContext silence detection, Groq Whisper API call, error states (`idle | listening | processing | error`), silence countdown display.

---

## HR monitor (Phase 3)

SSE endpoint at `GET /api/monitor/:sessionId`. Sends JSON every 2 seconds:
```json
{
  "candidateName": "...",
  "status": "active",
  "currentQuestion": "...",
  "currentCategory": "technical",
  "progress": { "current": 3, "total": 8, "percent": 37 },
  "liveTranscript": "...",
  "answers": [{ "question": "...", "scores": {...}, "analysis": "...", "flags": [...] }]
}
```

Live transcript is pushed from `InterviewPage.jsx` via `POST /api/monitor/:sessionId/live` as the candidate speaks (after Whisper returns the transcript).

MonitorPage layout: two columns — left shows current question + live transcript + answered questions with scores; right shows sticky running average score bars (technical/communication/depth) + flag tally.

---

## Known issues resolved

| Issue | Fix |
|---|---|
| `gemini-2.0-flash` deprecated (Jun 1 2026) | Switched to `gemini-2.5-flash-lite` |
| 429 rate limit on parallel JD+resume parse | Sequential calls in `parse.js` + retry in `llm.js` |
| Question bank JSON truncated at 2048 tokens | Raised `max_tokens` to 8192, added `safeJsonParse` repair |
| Infinite follow-up loop | `last_was_followup` + `followup_count` persisted to DB, hard cap of 1 |
| Candidate seeing scores | Removed `AnswerFeedback` component from `InterviewPage.jsx` entirely |
| Candidate could see HR analysis | Separated portals — setup page never navigates to candidate URL |

---

## How to run locally

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env        # add GROQ_API_KEY from console.groq.com
npm run dev                  # → http://localhost:3001

# 2. Frontend
cd frontend
npm install
npm run dev                  # → http://localhost:5173

# 3. Verify
curl http://localhost:3001/api/health
# → {"status":"ok","provider":"groq","phase":3}
```

---

## What's not built yet (future work)

- **Deployment** — Vercel (frontend) + Railway/Render (backend) + Turso (cloud SQLite)
- **Session dashboard** — list of all past interviews with status + quick report links
- **Auth / RBAC** — HR login, candidate link expiry, prevent report access without login
- **Teams integration** — Azure Bot Framework hook, `/start-interview` slash command
- **Multi-tenant** — multiple HR teams, separate question banks per org
- **Better TTS** — swap `SpeechSynthesis` for ElevenLabs for more natural agent voice
- **Email candidate link** — send shareable link directly from the setup page