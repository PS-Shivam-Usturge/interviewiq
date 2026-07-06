import { createClient } from "@libsql/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const db = createClient({
  url: `file:${path.join(__dirname, "interview.db")}`,
});

export async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at INTEGER DEFAULT (unixepoch()),
      candidate_name TEXT,
      jd_text TEXT,
      resume_text TEXT,
      jd_summary TEXT,
      resume_summary TEXT,
      difficulty TEXT DEFAULT 'mid',
      status TEXT DEFAULT 'setup',
      question_bank TEXT,
      current_question_index INTEGER DEFAULT 0,
      total_questions INTEGER DEFAULT 0,
      last_was_followup INTEGER DEFAULT 0,
      followup_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      question_index INTEGER NOT NULL,
      question TEXT NOT NULL,
      question_category TEXT,
      transcript TEXT,
      score_technical INTEGER,
      score_communication INTEGER,
      score_depth INTEGER,
      flags TEXT,
      analysis TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      overall_score INTEGER,
      technical_score INTEGER,
      communication_score INTEGER,
      problem_solving_score INTEGER,
      culture_fit_score INTEGER,
      strengths TEXT,
      gaps TEXT,
      red_flags TEXT,
      recommendation TEXT,
      narrative TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);

  // Add columns to existing DBs created before this schema version
  const cols = [
    "last_was_followup INTEGER DEFAULT 0",
    "followup_count INTEGER DEFAULT 0",
    "agent_history TEXT",        // full LLM conversation history for the agentic session manager
    "agent_observations TEXT",   // cross-question concerns noted by the agent
    "concluded_early INTEGER DEFAULT 0", // 1 if agent called conclude_interview_early
  ];
  for (const col of cols) {
    const name = col.split(" ")[0];
    try {
      await db.execute(`ALTER TABLE sessions ADD COLUMN ${col}`);
      console.log(`  DB migrated: added ${name}`);
    } catch (_) { /* column already exists — fine */ }
  }

  console.log("  DB initialised");
}

export default db;
