import express from "express";
import { generateAgentReport } from "../agents/interviewAgent.js";
import { getStoredReport } from "../agents/reportAgent.js";
import { getSession } from "../db/sessionStore.js";

const router = express.Router();

// GET /api/report/:sessionId
// The agent reviews the completed interview and generates the eligibility report.
// Returns cached report if already generated.
router.get("/report/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  try {
    // Return cached report immediately — report generation is expensive
    const cached = await getStoredReport(sessionId);
    if (cached) return res.json(cached);

    const session = await getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const result = await generateAgentReport({ sessionId, session });

    if (!result.report) {
      return res.status(500).json({ error: "Agent did not produce a report" });
    }

    res.json(result.report);
  } catch (err) {
    console.error("Report generation error:", err);
    const status = err.message.includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

export default router;