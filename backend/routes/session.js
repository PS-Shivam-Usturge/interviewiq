import express from "express";
import { startSession, submitAnswer, getSessionState } from "../agents/sessionManager.js";

const router = express.Router();

// ── POST /api/session/start ───────────────────────────────────────────────────
// Body: { jdText, resumeText, jdSummary, resumeSummary, difficulty }
// Returns: { sessionId, candidateName, totalQuestions, currentQuestion, status }

router.post("/session/start", async (req, res) => {
  const { jdText, resumeText, jdSummary, resumeSummary, difficulty } = req.body;

  if (!jdText || !resumeText || !jdSummary || !resumeSummary) {
    return res.status(400).json({ error: "Missing required fields: jdText, resumeText, jdSummary, resumeSummary" });
  }

  try {
    const result = await startSession({ jdText, resumeText, jdSummary, resumeSummary, difficulty });
    res.json(result);
  } catch (err) {
    console.error("Session start error:", err);
    res.status(500).json({ error: "Failed to start session: " + err.message });
  }
});

// ── POST /api/session/:id/answer ──────────────────────────────────────────────
// Body: { transcript }
// Returns: { answerAnalysis, nextQuestion, isComplete, progress, ... }

router.post("/session/:id/answer", async (req, res) => {
  const { id } = req.params;
  const { transcript } = req.body;

  if (!transcript || transcript.trim().length === 0) {
    return res.status(400).json({ error: "transcript is required" });
  }

  try {
    const result = await submitAnswer({ sessionId: id, transcript });
    res.json(result);
  } catch (err) {
    console.error("Answer submit error:", err);
    const status = err.message.includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ── GET /api/session/:id ──────────────────────────────────────────────────────
// Returns current session state — used by HR monitor and interview room

router.get("/session/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const state = await getSessionState(id);
    if (!state) return res.status(404).json({ error: "Session not found" });
    res.json(state);
  } catch (err) {
    console.error("Get session error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
