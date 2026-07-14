import express from "express";
import { getTrace } from "../db/sessionStore.js";
import logger from "../logger.js";

const router = express.Router();
const log    = logger.child({ component: "TraceRoute" });

// GET /api/session/:id/trace
// Returns the full agent decision trace for a session.
router.get("/session/:id/trace", async (req, res) => {
  const { id } = req.params;
  try {
    const data = await getTrace(id);
    if (!data) return res.status(404).json({ error: "Session not found" });
    res.json({
      sessionId:     id,
      candidateName: data.candidateName,
      role:          data.jdSummary?.role_title || null,
      difficulty:    data.difficulty,
      status:        data.status,
      createdAt:     data.createdAt,
      events:        data.events,
    });
  } catch (err) {
    log.error({ err }, "Trace fetch error");
    res.status(500).json({ error: err.message });
  }
});

export default router;
