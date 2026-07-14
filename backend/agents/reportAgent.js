import { agentQuery } from "../agentClient.js";
import { safeJsonParse } from "../llm.js";
import { getSession, getAnswers } from "../db/sessionStore.js";
import db from "../db/database.js";
import { sanitizeInput } from "../utils/sanitize.js";
import logger from "../logger.js";

const log = logger.child({ component: "ReportAgent" });

// ── Generate report ────────────────────────────────────────────────────────────

export async function generateReport(sessionId) {
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session not found");

  // Return cached report if already generated
  const existing = await getStoredReport(sessionId);
  if (existing) {
    log.info({ sessionId }, "Returning cached report");
    return existing;
  }

  const answers = await getAnswers(sessionId);
  if (!answers.length) throw new Error("No answers found for this session");

  const jdS     = session.jd_summary;
  const resumeS = session.resume_summary;

  log.info({ sessionId, candidate: resumeS?.candidate_name, answers: answers.length }, "Generating report");

  const answerSummary = answers.map((a) => ({
    q:        a.question,
    category: a.question_category,
    answer:   sanitizeInput(a.transcript || "", 400),
    scores:   { technical: a.score_technical, communication: a.score_communication, depth: a.score_depth },
    flags:    safeJson(a.flags),
    analysis: a.analysis,
  }));

  const prompt = `You are a senior hiring manager writing a formal candidate eligibility report.
Be honest, balanced, and evidence-based. Every claim must reference something the candidate actually said.
Always respond with valid JSON only — no markdown, no explanation.

Generate a complete eligibility report for this candidate.

ROLE APPLIED FOR: ${jdS?.role_title} (${jdS?.seniority_level})
REQUIRED SKILLS: ${jdS?.required_skills?.join(", ")}

CANDIDATE: ${resumeS?.candidate_name}
CURRENT TITLE: ${resumeS?.current_title}
EXPERIENCE: ${resumeS?.years_total_experience} years

INTERVIEW ANSWERS (${answerSummary.length} questions):
${JSON.stringify(answerSummary, null, 1)}

Return this exact JSON (no extra fields):
{
  "overall_score": <0-100 integer>,
  "technical_score": <0-100>,
  "communication_score": <0-100>,
  "problem_solving_score": <0-100>,
  "culture_fit_score": <0-100>,
  "recommendation": "strong_hire | hire | maybe | no_hire",
  "confidence": "high | medium | low",
  "headline": "One sentence verdict (e.g. Strong mid-level candidate with solid React fundamentals but thin system design experience)",
  "strengths": ["specific strength with evidence", "..."],
  "gaps": ["specific gap with evidence", "..."],
  "red_flags": ["any concerning patterns, or empty array"],
  "skill_ratings": [
    { "skill": "skill name from JD", "rating": <1-5>, "evidence": "what the candidate said" }
  ],
  "narrative": "3-4 paragraph detailed evaluation. Be specific. Reference actual answers. First paragraph: overall impression. Second: technical assessment. Third: soft skills and culture fit. Fourth: recommendation and suggested next steps.",
  "suggested_next_steps": ["e.g. Technical test on system design", "Reference check", "..."]
}`;

  const content = await agentQuery(prompt);
  const report  = safeJsonParse(content, "eligibility report");

  await storeReport(sessionId, report);

  log.info({ sessionId, recommendation: report.recommendation, score: report.overall_score }, "Report generated");
  return { ...report, sessionId, candidateName: resumeS?.candidate_name, roleTitle: jdS?.role_title };
}

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function storeReport(sessionId, report) {
  await db.execute({
    sql: `INSERT OR REPLACE INTO reports
          (session_id, overall_score, technical_score, communication_score,
           problem_solving_score, culture_fit_score,
           strengths, gaps, red_flags, recommendation, narrative,
           headline, confidence, skill_ratings, suggested_next_steps)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      sessionId,
      report.overall_score,
      report.technical_score,
      report.communication_score,
      report.problem_solving_score,
      report.culture_fit_score,
      JSON.stringify(report.strengths           || []),
      JSON.stringify(report.gaps                || []),
      JSON.stringify(report.red_flags           || []),
      report.recommendation,
      report.narrative,
      report.headline                           || null,
      report.confidence                         || null,
      JSON.stringify(report.skill_ratings       || []),
      JSON.stringify(report.suggested_next_steps|| []),
    ],
  });
}

export async function getStoredReport(sessionId) {
  const res = await db.execute({
    sql:  "SELECT * FROM reports WHERE session_id = ?",
    args: [sessionId],
  });
  if (!res.rows[0]) return null;
  const r = res.rows[0];
  return {
    ...r,
    strengths:            safeJson(r.strengths),
    gaps:                 safeJson(r.gaps),
    red_flags:            safeJson(r.red_flags),
    skill_ratings:        safeJson(r.skill_ratings),
    suggested_next_steps: safeJson(r.suggested_next_steps),
  };
}

function safeJson(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}