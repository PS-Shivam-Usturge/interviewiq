import express from "express";
import { generateAgentReport } from "../agents/interviewAgent.js";
import { getStoredReport } from "../agents/reportAgent.js";
import { getSession, appendTrace } from "../db/sessionStore.js";
import logger from "../logger.js";

const log = logger.child({ component: "ReportRoute" });

const router = express.Router();

// GET /api/report/:sessionId
// The agent reviews the completed interview and generates the eligibility report.
// Returns cached report if already generated.
router.get("/report/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  try {
    const session = await getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "completed") {
      return res.status(400).json({ error: "Interview is not yet completed — report cannot be generated until the candidate finishes." });
    }

    // Return cached report immediately — report generation is expensive
    const cached = await getStoredReport(sessionId);
    if (cached) return res.json(cached);

    const result = await generateAgentReport({ sessionId, session });

    if (!result.report) {
      return res.status(500).json({ error: "Agent did not produce a report" });
    }

    await appendTrace(sessionId, [{
      time: Math.floor(Date.now() / 1000), phase: "report", event: "report_generated",
      recommendation: result.report.recommendation,
      overallScore:   result.report.overall_score,
      confidence:     result.report.confidence,
      headline:       result.report.headline,
    }]);

    res.json(result.report);
  } catch (err) {
    log.error({ err }, "Report generation error");
    const status = err.message.includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

export default router;