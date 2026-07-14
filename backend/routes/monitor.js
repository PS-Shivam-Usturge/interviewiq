import express from "express";
import { getSession, getAnswers } from "../db/sessionStore.js";
import logger from "../logger.js";

const log = logger.child({ component: "MonitorRoute" });

const router = express.Router();

// In-memory store of live transcripts being spoken right now
// { sessionId: { liveTranscript: string, updatedAt: number } }
const liveTranscripts = new Map();

// Called by the interview frontend to push live transcript as candidate speaks
// POST /api/monitor/:sessionId/live
router.post("/monitor/:sessionId/live", (req, res) => {
  const { sessionId } = req.params;
  const { transcript } = req.body;
  liveTranscripts.set(sessionId, {
    liveTranscript: transcript || "",
    updatedAt: Date.now(),
  });
  res.json({ ok: true });
});

// GET /api/monitor/:sessionId — SSE stream for HR dashboard
// Sends session state + live transcript every 2 seconds
router.get("/monitor/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  async function pushUpdate() {
    try {
      const session = await getSession(sessionId);
      if (!session) { send({ error: "Session not found" }); return; }

      const answers  = await getAnswers(sessionId);
      const live     = liveTranscripts.get(sessionId);
      const questions = session.question_bank || [];
      const currentQ  = questions[session.current_question_index] || null;

      send({
        sessionId,
        candidateName:    session.candidate_name,
        difficulty:       session.difficulty,
        status:           session.status,
        currentQuestion:  currentQ?.question || null,
        currentCategory:  currentQ?.category || null,
        currentIndex:     session.current_question_index,
        totalQuestions:   session.total_questions,
        progress: {
          current: session.current_question_index + 1,
          total:   session.total_questions,
          percent: session.total_questions > 0
            ? Math.round((session.current_question_index / session.total_questions) * 100)
            : 0,
        },
        liveTranscript: live?.liveTranscript || "",
        answers: answers.map((a) => ({
          question:      a.question,
          category:      a.question_category,
          transcript:    a.transcript,
          scores: {
            technical:     a.score_technical,
            communication: a.score_communication,
            depth:         a.score_depth,
          },
          analysis:  a.analysis,
          flags:     a.flags,
        })),
      });
    } catch (err) {
      log.error({ err: err.message }, "Monitor SSE error");
    }
  }

  // Send immediately on connect
  await pushUpdate();

  // Then every 2 seconds
  const interval = setInterval(pushUpdate, 2000);

  // Clean up on disconnect
  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});

export default router;
