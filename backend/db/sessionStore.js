import db from "./database.js";
import { v4 as uuidv4 } from "uuid";

// ── Create ────────────────────────────────────────────────────────────────────

export async function createSession({ candidateName, jdText, resumeText, jdSummary, resumeSummary, difficulty }) {
  const id = uuidv4();
  await db.execute({
    sql: `INSERT INTO sessions
          (id, candidate_name, jd_text, resume_text, jd_summary, resume_summary, difficulty, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'ready')`,
    args: [
      id,
      candidateName || "Candidate",
      jdText,
      resumeText,
      JSON.stringify(jdSummary),
      JSON.stringify(resumeSummary),
      difficulty || "mid",
    ],
  });
  return id;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getSession(id) {
  const result = await db.execute({
    sql: "SELECT * FROM sessions WHERE id = ?",
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    jd_summary:         safeJson(row.jd_summary),
    resume_summary:     safeJson(row.resume_summary),
    question_bank:      safeJson(row.question_bank),
    agent_observations: safeJsonArray(row.agent_observations),
    last_was_followup:  Number(row.last_was_followup || 0),
    followup_count:     Number(row.followup_count    || 0),
  };
}

export async function getAnswers(sessionId) {
  const result = await db.execute({
    sql: "SELECT * FROM answers WHERE session_id = ? ORDER BY question_index ASC",
    args: [sessionId],
  });
  return result.rows.map((r) => ({ ...r, flags: safeJson(r.flags) }));
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function saveQuestionBank(sessionId, questions) {
  await db.execute({
    sql: "UPDATE sessions SET question_bank = ?, total_questions = ?, status = 'active' WHERE id = ?",
    args: [JSON.stringify(questions), questions.length, sessionId],
  });
}

export async function advanceQuestion(sessionId, nextIndex) {
  await db.execute({
    sql: `UPDATE sessions
          SET current_question_index = ?,
              last_was_followup = 0,
              followup_count    = 0
          WHERE id = ?`,
    args: [nextIndex, sessionId],
  });
}

export async function markFollowUp(sessionId, newCount) {
  await db.execute({
    sql: `UPDATE sessions
          SET last_was_followup = 1,
              followup_count    = ?
          WHERE id = ?`,
    args: [newCount, sessionId],
  });
}

export async function completeSession(sessionId) {
  await db.execute({
    sql: "UPDATE sessions SET status = 'completed' WHERE id = ?",
    args: [sessionId],
  });
}

export async function saveAnswer({
  sessionId, questionIndex, question, questionCategory,
  transcript, scoreTechnical, scoreCommunication, scoreDepth,
  overallScore, strengthPoints, gapPoints,
  flags, analysis,
}) {
  await db.execute({
    sql: `INSERT INTO answers
          (session_id, question_index, question, question_category,
           transcript, score_technical, score_communication, score_depth,
           overall_score, strength_points, gap_points, flags, analysis)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      sessionId, questionIndex, question, questionCategory || "general",
      transcript,
      scoreTechnical     || 0,
      scoreCommunication || 0,
      scoreDepth         || 0,
      overallScore       || 0,
      JSON.stringify(strengthPoints || []),
      JSON.stringify(gapPoints      || []),
      JSON.stringify(flags          || []),
      analysis || "",
    ],
  });
}

export async function appendAgentObservations(sessionId, newObservations) {
  if (!newObservations?.length) return;
  const result = await db.execute({
    sql: "SELECT agent_observations FROM sessions WHERE id = ?",
    args: [sessionId],
  });
  const existing = safeJsonArray(result.rows[0]?.agent_observations);
  const merged = [...existing, ...newObservations];
  await db.execute({
    sql: "UPDATE sessions SET agent_observations = ? WHERE id = ?",
    args: [JSON.stringify(merged), sessionId],
  });
}

export async function appendTrace(sessionId, events) {
  if (!events?.length) return;
  const result = await db.execute({
    sql: "SELECT trace FROM sessions WHERE id = ?",
    args: [sessionId],
  });
  const existing = safeJsonArray(result.rows[0]?.trace);
  await db.execute({
    sql: "UPDATE sessions SET trace = ? WHERE id = ?",
    args: [JSON.stringify([...existing, ...events]), sessionId],
  });
}

export async function getTrace(sessionId) {
  const result = await db.execute({
    sql: "SELECT trace, candidate_name, jd_summary, difficulty, status, created_at FROM sessions WHERE id = ?",
    args: [sessionId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    events:        safeJsonArray(row.trace),
    candidateName: row.candidate_name,
    jdSummary:     safeJson(row.jd_summary),
    difficulty:    row.difficulty,
    status:        row.status,
    createdAt:     row.created_at,
  };
}

export async function getAgentObservations(sessionId) {
  const result = await db.execute({
    sql: "SELECT agent_observations FROM sessions WHERE id = ?",
    args: [sessionId],
  });
  return safeJsonArray(result.rows[0]?.agent_observations);
}

export async function markConcludedEarly(sessionId) {
  await db.execute({
    sql: "UPDATE sessions SET concluded_early = 1 WHERE id = ?",
    args: [sessionId],
  });
}

export async function updateParsedSummaries(sessionId, jdSummary, resumeSummary, candidateName) {
  await db.execute({
    sql: "UPDATE sessions SET jd_summary = ?, resume_summary = ?, candidate_name = ? WHERE id = ?",
    args: [JSON.stringify(jdSummary), JSON.stringify(resumeSummary), candidateName || "Candidate", sessionId],
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeJson(val) {
  if (!val) return null;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return val; }
}

function safeJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
