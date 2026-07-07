import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { extractText, cleanupFile } from "../agents/parser.js";
import { summariseJD, summariseResume } from "../agents/parseAgent.js";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const upload = multer({
  dest: path.join(__dirname, "../uploads/"),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    cb(null, allowed.includes(file.mimetype) || file.originalname.endsWith(".pdf") || file.originalname.endsWith(".docx"));
  },
});

router.post(
  "/parse",
  upload.fields([{ name: "jd", maxCount: 1 }, { name: "resume", maxCount: 1 }]),
  async (req, res) => {
    const jdFile = req.files?.jd?.[0];
    const resumeFile = req.files?.resume?.[0];

    if (!jdFile || !resumeFile) {
      return res.status(400).json({ error: "Both JD and resume files are required." });
    }

    try {
      const [jdRaw, resumeRaw] = await Promise.all([
        extractText(jdFile.path, jdFile.mimetype),
        extractText(resumeFile.path, resumeFile.mimetype),
      ]);

      if (jdRaw.length < 50) {
        return res.status(400).json({
          error: "Could not extract text from the JD file. The PDF may be a scanned image or use non-standard fonts. Please try: (1) export as DOCX from Word, (2) save as plain .txt, or (3) copy-paste the text into a .txt file.",
        });
      }
      if (resumeRaw.length < 50) {
        return res.status(400).json({
          error: "Could not extract text from the resume. The PDF may be a scanned image or use non-standard fonts. Please try: (1) export as DOCX from Word, (2) save as plain .txt, or (3) copy-paste the resume text into a .txt file.",
        });
      }

      // Parallel calls — safe for claude-sdk and groq providers.
      // If using LLM_PROVIDER=gemini, free-tier rate limits may cause a 429;
      // the retry logic in llm.js will handle it with backoff.
      const [jdSummary, resumeSummary] = await Promise.all([
        summariseJD(jdRaw),
        summariseResume(resumeRaw),
      ]);

      res.json({
        jd: { raw: jdRaw, summary: jdSummary },
        resume: { raw: resumeRaw, summary: resumeSummary },
      });
    } catch (err) {
      console.error("Parse error:", err);
      res.status(500).json({ error: "Failed to parse files. " + err.message });
    } finally {
      cleanupFile(jdFile?.path);
      cleanupFile(resumeFile?.path);
    }
  }
);

export default router;
