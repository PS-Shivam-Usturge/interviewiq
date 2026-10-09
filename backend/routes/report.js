import express from "express";
import { getOrGenerateReport } from "../agents/sessionManager.js";
import logger from "../logger.js";

const log = logger.child({ component: "ReportRoute" });

const router = express.Router();

// GET /api/report/:sessionId
// The agent reviews the completed interview and generates the eligibility report.
// Returns cached report if already generated.
router.get("/report/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  try {
    const report = await getOrGenerateReport(sessionId);
    res.json(report);
  } catch (err) {
    if (!err.status || err.status >= 500) log.error({ err }, "Report generation error");
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
