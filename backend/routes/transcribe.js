import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const router     = express.Router();
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const uploadDir  = path.join(__dirname, "../uploads");

// Groq client specifically for Whisper — uses Groq regardless of LLM_PROVIDER
const groq = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey:  process.env.GROQ_API_KEY || "placeholder",
});

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max — Groq Whisper limit
  fileFilter: (_, file, cb) => {
    // Accept any audio format the browser might send
    const ok = file.mimetype.startsWith("audio/") ||
               file.originalname.match(/\.(webm|wav|mp4|m4a|ogg|mp3)$/i);
    cb(null, !!ok);
  },
});

// POST /api/transcribe
// Body: multipart form — field "audio" with audio blob
// Returns: { transcript: string }

router.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file received" });
  }

  const filePath = req.file.path;

  try {
    // Groq Whisper requires a proper file extension to detect format
    // Rename the multer temp file to have .webm extension
    const renamedPath = filePath + ".webm";
    fs.renameSync(filePath, renamedPath);

    console.log(`  [Whisper] Transcribing ${(req.file.size / 1024).toFixed(0)}KB audio...`);

    const transcription = await groq.audio.transcriptions.create({
      file:  fs.createReadStream(renamedPath),
      model: "whisper-large-v3-turbo", // fast + accurate, free on Groq
      response_format: "text",
      language: "en",
    });

    const transcript = typeof transcription === "string"
      ? transcription.trim()
      : (transcription?.text || "").trim();

    console.log(`  [Whisper] Transcript: "${transcript.slice(0, 80)}..."`);

    fs.unlinkSync(renamedPath);
    res.json({ transcript });

  } catch (err) {
    console.error("Whisper transcription error:", err?.message || err);
    // Clean up file
    try { fs.unlinkSync(filePath); } catch (_) {}
    try { fs.unlinkSync(filePath + ".webm"); } catch (_) {}

    // Friendly error messages
    if (err?.status === 401) {
      return res.status(401).json({ error: "Invalid Groq API key. Check GROQ_API_KEY in .env" });
    }
    if (err?.status === 413) {
      return res.status(413).json({ error: "Audio too large. Max 25MB." });
    }
    res.status(500).json({ error: "Transcription failed: " + (err?.message || "unknown error") });
  }
});

export default router;
