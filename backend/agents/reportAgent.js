import { agentQuery, AGENT_CONFIG } from "../agentClient.js";
import { safeJsonParse } from "../llm.js";
import { getSession, getAnswers } from "../db/sessionStore.js";
import db from "../db/database.js";
import { sanitizeInput } from "../utils/sanitize.js";
import logger from "../logger.js";
import { checkContract } from "./contracts.js";
import { prompt, render } from "../prompts/index.js";

const log = logger.child({ component: "ReportAgent" });

// ── Generate report ────────────────────────────────────────────────────────────
// agentAssessment (optional): the orchestrator's own holistic view, passed through
// from the generate_final_report tool call — { reasoning, preliminary_recommendation }.

export async function generateReport(sessionId, { agentAssessment } = {}) {
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

  const report = await buildReport({
    jdSummary:     jdS,
    resumeSummary: resumeS,
    answers,
    observations:  session.agent_observations || [],
    agentAssessment,
  });

  await storeReport(sessionId, report);

  log.info({ sessionId, recommendation: report.recommendation, score: report.overall_score }, "Report generated");
  return { ...report, sessionId, candidateName: resumeS?.candidate_name, roleTitle: jdS?.role_title };
}

// ── buildReport ────────────────────────────────────────────────────────────────
// Pure sub-agent call (no DB): used by generateReport() and by the eval suite.

export async function buildReport({ jdSummary: jdS, resumeSummary: resumeS, answers, observations = [], agentAssessment }) {
  const answerSummary = answers.map((a) => ({
    q:        a.question,
    category: a.question_category,
    answer:   sanitizeInput(a.transcript || "", 400),
    scores:   { technical: a.score_technical, communication: a.score_communication, depth: a.score_depth },
    flags:    safeJson(a.flags),
    analysis: a.analysis,
  }));

  // Prompts: backend/prompts/reportAgent/{system,user,observations,assessment}.md
  const observationsBlock = observations.length
    ? render("reportAgent/observations", {
        observation_lines: observations.map(o => `- [${o.severity}] ${sanitizeInput(o.observation || "", 400)}`).join("\n"),
      })
    : "";
  const assessmentBlock = agentAssessment?.reasoning
    ? render("reportAgent/assessment", {
        recommendation: agentAssessment.preliminary_recommendation || "n/a",
        reasoning:      sanitizeInput(agentAssessment.reasoning, 1500),
      })
    : "";

  const content = await agentQuery(
    render("reportAgent/user", {
      role_title:      jdS?.role_title ?? "",
      seniority:       jdS?.seniority_level ?? "",
      required_skills: (jdS?.required_skills || []).join(", "),
      candidate_name:  resumeS?.candidate_name ?? "the candidate",
      current_title:   resumeS?.current_title ?? "",
      years:           resumeS?.years_total_experience ?? "unknown",
      answer_count:    answerSummary.length,
      answers_json:    JSON.stringify(answerSummary, null, 1),
      observations:    observationsBlock,
      assessment:      assessmentBlock,
    }),
    { label: "reportAgent", systemPrompt: prompt("reportAgent/system"), effort: AGENT_CONFIG.effort.generation },
  );
  return checkContract("reportAgent", safeJsonParse(content, "eligibility report"));
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