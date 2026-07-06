# InterviewIQ — AI Interview Agent

An agentic AI system that conducts structured technical interviews end-to-end. HR uploads a job description and resume; the agent parses both, generates a tailored question bank, conducts a voice interview with the candidate, makes reasoned decisions at every step, and produces a full eligibility report.

**Runs entirely free** — Groq free tier for LLM and speech-to-text, browser built-in for text-to-speech.

---

## How it works

```
HR uploads JD + Resume
        ↓
  Agent parses documents
  Agent plans interview strategy
  Agent generates 8 tailored questions
        ↓
  Candidate answers each question (voice)
        ↓
  Agent evaluates each answer
  Agent decides: follow-up? advance? end early?
  Agent notes cross-question patterns
        ↓
  Agent writes final eligibility report
```

The agent drives every decision using tool calls with visible reasoning — it is not hardcoded logic.

---

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **A free Groq API key** — [console.groq.com](https://console.groq.com) (sign up, go to API Keys, create one)
- A modern browser with microphone access (Chrome or Edge recommended)

> **Optional:** A free Gemini API key from [aistudio.google.com](https://aistudio.google.com) if you want to use Gemini as the LLM provider instead.

---

## Setup

### 1. Clone / open the project

```bash
cd interview-agent
```

You should see two folders: `backend/` and `frontend/`.

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

Open `.env` and fill in your Groq API key:

```env
GROQ_API_KEY=gsk_your_key_here
LLM_PROVIDER=groq
PORT=3001
```

Start the backend:

```bash
npm run dev
```

You should see:

```
  Interview Agent API → http://localhost:3001
  LLM provider  : groq
  Health        : http://localhost:3001/api/health
```

Verify it is running:

```bash
curl http://localhost:3001/api/health
# → {"status":"ok","provider":"groq","phase":3}
```

---

### 3. Frontend

Open a **second terminal**, then:

```bash
cd frontend
npm install
npm run dev
```

You should see:

```
  VITE ready in ~300ms
  ➜  Local: http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## Running a full interview

### Step 1 — Setup (HR side)

1. Open **http://localhost:5173**
2. Upload a **Job Description** file (PDF, DOCX, or TXT)
3. Upload a **Resume / CV** file (PDF, DOCX, or TXT)
4. Select difficulty: `junior`, `mid`, `senior`, or `principal`
5. Click **"Parse and Analyse"** — the agent reads both documents and shows a preview
6. Click **"Start Interview"** — the agent generates 8 tailored questions

You will get two links:
- **Candidate link** — send this to the person being interviewed (`/interview/:id`)
- **Monitor link** — keep this open to watch the interview live (`/monitor/:id`)

---

### Step 2 — Interview (candidate side)

1. Open the candidate link in a browser **with microphone access**
2. Read the welcome tips, then click **"Start Interview"**
3. The browser reads each question aloud (text-to-speech)
4. Click **"Start Recording"**, speak your answer, click **"Stop"**
5. The agent evaluates the answer and either:
   - Asks a follow-up question (if the answer needs more depth)
   - Moves to the next question
   - Ends the interview early (if it has gathered enough signal)
6. After all questions, you reach the **Thank You** screen

---

### Step 3 — Report (HR side)

1. Open the monitor link to watch scores and flags live during the interview
2. After the interview completes, open **http://localhost:5173/report/:sessionId**
   - The session ID is shown on the setup page after starting the interview
3. The agent reviews the entire interview conversation and generates a full eligibility report with:
   - Overall score and category scores
   - Recommendation (strong hire / hire / maybe / no hire)
   - Strengths and gaps with evidence from actual answers
   - Skill ratings
   - Narrative and suggested next steps

---

## Environment variables

All variables go in `backend/.env`.

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes (if using Groq) | From [console.groq.com](https://console.groq.com) |
| `GEMINI_API_KEY` | Yes (if using Gemini) | From [aistudio.google.com](https://aistudio.google.com) |
| `LLM_PROVIDER` | Yes | `groq` or `gemini` |
| `PORT` | No | Backend port, defaults to `3001` |

**Which provider should I use?**

Use `groq` — it is faster and the free tier is generous. Groq also powers the speech-to-text (Whisper) regardless of which LLM provider you choose.

---

## Project structure

```
interview-agent/
├── backend/
│   ├── server.js                 # Express entry point, routes, health check
│   ├── llm.js                    # LLM client — chat() and chatWithTools() for Groq/Gemini
│   ├── .env.example              # Copy to .env
│   ├── agents/
│   │   ├── interviewAgent.js     # Master agent — tool-calling loop, all decisions
│   │   ├── sessionManager.js     # Session lifecycle — DB persistence, API responses
│   │   ├── parseAgent.js         # Tool: parse JD and resume into structured JSON
│   │   ├── questionAgent.js      # Tool: generate tailored question bank
│   │   ├── answerAgent.js        # Tool: score and evaluate candidate answers
│   │   ├── reportAgent.js        # Tool: generate eligibility report
│   │   └── parser.js             # File text extraction (PDF, DOCX, TXT)
│   ├── db/
│   │   ├── database.js           # SQLite schema and migrations
│   │   └── sessionStore.js       # All database read/write operations
│   └── routes/
│       ├── parse.js              # POST /api/parse
│       ├── session.js            # POST /api/session/start, POST /api/session/:id/answer
│       ├── report.js             # GET /api/report/:sessionId
│       ├── transcribe.js         # POST /api/transcribe (Groq Whisper STT)
│       └── monitor.js            # GET /api/monitor/:sessionId (SSE live feed)
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── SetupPage.jsx     # HR: upload files, start interview, get links
        │   ├── InterviewPage.jsx # Candidate: voice interview loop
        │   ├── MonitorPage.jsx   # HR: live scores and transcript feed
        │   ├── ReportPage.jsx    # HR: final eligibility report
        │   └── ThankYouPage.jsx  # Candidate: end screen
        ├── components/
        │   ├── FileDropZone.jsx  # Drag-and-drop file upload
        │   └── ParsePreview.jsx  # Parsed JD + resume preview cards
        └── hooks/
            └── useVoiceRecorder.js  # MediaRecorder + silence detection
```

---

## Agent tools reference

The interview agent has 8 tools it can call. Each call includes a `reasoning` field — the agent's visible chain of thought.

| Tool | Phase | What it does |
|---|---|---|
| `parse_documents` | Setup | Extracts structured info from JD and resume |
| `generate_question_bank` | Setup | Creates 8 tailored questions with a stated interview strategy |
| `evaluate_answer` | Per answer | Scores the answer (technical / communication / depth) and identifies flags |
| `request_followup` | Per answer | Asks a follow-up when the answer needs more depth (max once per question) |
| `advance_to_next_question` | Per answer | Accepts the answer and moves on, with a verdict |
| `conclude_interview_early` | Per answer | Ends the interview when enough signal is gathered across 3+ questions |
| `note_cumulative_concern` | Per answer | Records a cross-question pattern to highlight in the report |
| `generate_final_report` | Report | Writes the final eligibility report with holistic reasoning |

---

## Switching LLM provider

In `backend/.env`:

```env
# Groq (recommended — faster, free)
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...

# Gemini (alternative — also free)
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...
```

No code changes needed. Speech-to-text always uses Groq Whisper regardless of `LLM_PROVIDER`.

---

## Troubleshooting

**Backend won't start — `GROQ_API_KEY` error**
- Make sure you created `backend/.env` (not just `.env.example`)
- Check the key starts with `gsk_`

**`npm run dev` fails with ES module error**
- You need Node.js 18 or higher: `node --version`

**Microphone not working in interview**
- Use Chrome or Edge
- The page must be served from `localhost` (not a file path)
- Allow microphone access when the browser prompts

**Speech is not playing (no audio)**
- The interview uses your browser's built-in text-to-speech
- Check your system volume and that the browser is not muted
- On some Linux systems, install `espeak`: `sudo apt install espeak`

**Interview page shows "Session not found"**
- The session ID in the URL must match one created in the current run
- If you restarted the backend, old session IDs are still valid (SQLite persists to `backend/interview.db`)

**Report page is empty or errors**
- The interview must be fully completed (candidate reaches Thank You screen) before the report can be generated
- Check backend terminal for error details

**Rate limit errors from Groq (429)**
- Groq free tier has per-minute limits; the backend retries automatically up to 4 times with backoff
- If it keeps failing, wait 60 seconds and try again
- Running multiple interviews simultaneously will hit limits faster

---

## API endpoints

All endpoints are served from `http://localhost:3001`.

### `GET /api/health`
Returns server status and active LLM provider.
```json
{ "status": "ok", "provider": "groq", "phase": 3 }
```

---

### `POST /api/parse`
Parses uploaded JD and resume files. Accepts `multipart/form-data`.

**Fields:** `jd` (file), `resume` (file)
**Accepted formats:** PDF, DOCX, TXT — max 10 MB each

**Response:**
```json
{
  "jdText": "raw text...",
  "resumeText": "raw text...",
  "jdSummary": {
    "role_title": "Senior Backend Engineer",
    "seniority_level": "senior",
    "required_skills": ["Node.js", "PostgreSQL"],
    "tech_stack": ["AWS", "Docker"],
    "summary": "..."
  },
  "resumeSummary": {
    "candidate_name": "Jane Smith",
    "current_title": "Software Engineer",
    "years_total_experience": 5,
    "skills": ["Node.js", "React"],
    "summary": "..."
  }
}
```

---

### `POST /api/session/start`
Starts a new interview session. The agent parses documents, plans its strategy, and generates the question bank.

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
    "id": "o1",
    "category": "opening",
    "question": "Walk me through your experience with...",
    "intent": "Assess depth of hands-on experience"
  },
  "status": "active",
  "agentSetup": {
    "focusAreas": ["distributed systems", "API design"],
    "agentSummary": "Interview ready. Candidate claims strong backend experience..."
  }
}
```

---

### `POST /api/session/:id/answer`
Submits a candidate's answer. The agent evaluates it and decides the next step.

**Body:**
```json
{ "transcript": "I have worked with Node.js for three years..." }
```

**Response:**
```json
{
  "answeredQuestion": "Walk me through...",
  "answerAnalysis": {
    "scores": { "technical": 7, "communication": 8, "depth": 6, "overall": 7 },
    "flags": [],
    "analysis": "Solid overview with concrete examples...",
    "strengthPoints": ["Clear structure", "Mentioned specific tools"],
    "gapPoints": ["Did not address error handling"]
  },
  "agentDecision": {
    "action": "request_followup",
    "reasoning": "Candidate described the concept correctly but gave no real-world example of handling failures at scale",
    "followUpQuestion": "Can you describe a specific incident where a service failed and how you recovered it?",
    "observations": [],
    "toolEvents": [ ... ]
  },
  "isFollowUp": true,
  "isComplete": false,
  "concludedEarly": false,
  "nextQuestion": { "category": "follow_up", "question": "Can you describe..." },
  "nextIndex": 0,
  "progress": { "current": 1, "total": 8, "percent": 0 }
}
```

**`agentDecision.action`** can be:
- `"request_followup"` — agent wants more depth on this question
- `"advance"` — agent accepted the answer and moved on
- `"conclude_early"` — agent ended the interview early with sufficient evidence

---

### `GET /api/session/:id`
Returns current session state. Used by the interview room and HR monitor to poll progress.

---

### `POST /api/transcribe`
Transcribes an audio recording using Groq Whisper. Accepts `multipart/form-data`.

**Fields:** `audio` (file — WebM/OGG from MediaRecorder)

**Response:**
```json
{ "transcript": "I have been working with React for two years..." }
```

---

### `GET /api/report/:sessionId`
Generates (or returns cached) the final eligibility report. The agent reviews its full interview conversation history and writes a holistic report.

**Response:**
```json
{
  "overall_score": 72,
  "technical_score": 68,
  "communication_score": 80,
  "problem_solving_score": 70,
  "culture_fit_score": 75,
  "recommendation": "hire",
  "confidence": "medium",
  "headline": "Solid mid-level candidate with strong communication but gaps in system design",
  "strengths": ["Clear communicator", "Solid React fundamentals"],
  "gaps": ["Thin on distributed systems", "No mention of testing practices"],
  "red_flags": [],
  "skill_ratings": [
    { "skill": "Node.js", "rating": 4, "evidence": "Described async patterns correctly in Q3" }
  ],
  "narrative": "Jane demonstrated...",
  "suggested_next_steps": ["Technical assessment on system design", "Reference check"]
}
```

---

### `GET /api/monitor/:sessionId`
Server-Sent Events (SSE) stream for the HR live monitor. Pushes session state every 2 seconds.

Connect with:
```js
const es = new EventSource(`http://localhost:3001/api/monitor/${sessionId}`);
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

---

## Database

The backend creates a SQLite database at `backend/interview.db` automatically on first run. You do not need to set anything up.

**Three tables:**

**`sessions`** — one row per interview
| Column | Description |
|---|---|
| `id` | UUID, primary key |
| `candidate_name` | Extracted from resume |
| `jd_text` / `resume_text` | Raw uploaded text |
| `jd_summary` / `resume_summary` | JSON — agent's parsed understanding |
| `difficulty` | junior / mid / senior / principal |
| `status` | ready → active → completed |
| `question_bank` | JSON array of 8 questions |
| `current_question_index` | Which question is active |
| `last_was_followup` | 1 if current turn is a follow-up answer |
| `followup_count` | Follow-ups used on current question |
| `agent_history` | JSON — full LLM conversation history |
| `agent_observations` | JSON — cross-question concerns noted by agent |
| `concluded_early` | 1 if agent ended the interview before all questions |

**`answers`** — one row per question answered
| Column | Description |
|---|---|
| `session_id` | Foreign key to sessions |
| `question_index` | Which question this answer is for |
| `transcript` | What the candidate said |
| `score_technical` / `score_communication` / `score_depth` | 0–10 scores |
| `flags` | JSON array — vague, evasive, contradicts_resume, etc. |
| `analysis` | Agent's written evaluation + decision reasoning |

**`reports`** — one row per completed session
| Column | Description |
|---|---|
| `session_id` | Foreign key to sessions |
| `overall_score` | 0–100 |
| `recommendation` | strong_hire / hire / maybe / no_hire |
| `strengths` / `gaps` / `red_flags` | JSON arrays |
| `narrative` | Agent's full written assessment |

To inspect the database directly:
```bash
# Install sqlite3 if needed: brew install sqlite3 / apt install sqlite3
sqlite3 backend/interview.db

sqlite> .tables
sqlite> SELECT id, candidate_name, status FROM sessions;
sqlite> SELECT question, score_technical, analysis FROM answers WHERE session_id = 'your-id';
sqlite> .quit
```

To reset the database (delete all sessions):
```bash
rm backend/interview.db
# Restart the backend — it will recreate the schema automatically
```

---

## Architecture overview

```
Browser (candidate)          Browser (HR)
      │                           │
      │ voice recording           │ file upload / monitor
      ▼                           ▼
┌─────────────────────────────────────────┐
│           Express API  :3001            │
│  /transcribe  /session  /parse  /report │
└─────────────────┬───────────────────────┘
                  │
          sessionManager.js
          (DB reads/writes,
           response shaping)
                  │
          interviewAgent.js  ◄── agent_history (SQLite)
          (tool-calling loop,
           all decisions)
                  │
     ┌────────────┼──────────────┐
     │            │              │
parseAgent   answerAgent    reportAgent
questionAgent               (cached)
     │
  llm.js
  (Groq / Gemini via
   OpenAI-compat API)
```

**Key design decisions:**
- The agent's entire conversation history is persisted in SQLite between HTTP requests. This is what makes it stateful — each answer submission loads the full history, adds to it, and saves it back.
- Speech-to-text is always Groq Whisper regardless of `LLM_PROVIDER`, because Whisper is only available on Groq.
- Text-to-speech uses the browser's built-in `SpeechSynthesis` API — no API key or internet required.
- The report is generated lazily (only when HR requests it) and cached — requesting it twice does not run the LLM twice.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6 |
| Backend | Node.js (ESM), Express 4 |
| LLM | Groq (`llama-3.3-70b-versatile`) or Gemini (`gemini-2.5-flash-lite`) |
| Speech-to-text | Groq Whisper (`whisper-large-v3-turbo`) |
| Text-to-speech | Browser `SpeechSynthesis` API |
| Database | SQLite via `@libsql/client` |
| File parsing | `pdf-parse` (PDF), `mammoth` (DOCX) |

---

## Known limitations

- **Single user per session** — there is no authentication. Anyone with the session URL can submit answers or view the report. Suitable for local/demo use only.
- **No concurrent session protection** — if two people submit answers to the same session simultaneously, the agent history may get corrupted.
- **Groq free tier rate limits** — heavy use (multiple simultaneous interviews) will hit rate limits. The backend retries automatically but very high volume is not supported.
- **Browser TTS quality** — the built-in speech synthesis voice varies by OS. Windows and macOS have good voices; Linux may sound robotic. Consider ElevenLabs or similar for production use.
- **8-question limit** — the question bank is always 8 questions. The agent may conclude early but cannot extend beyond 8.
- **No file storage** — uploaded files are processed in memory and not saved to disk. The extracted text is stored in the database.