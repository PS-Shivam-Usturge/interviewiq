import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { initDb } from "./db/database.js";
dotenv.config();

import parseRoute      from "./routes/parse.js";
import sessionRoute    from "./routes/session.js";
import reportRoute     from "./routes/report.js";
import transcribeRoute from "./routes/transcribe.js";
import monitorRoute    from "./routes/monitor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3001;

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors({ origin: ["http://localhost:5173", "http://localhost:3000"] }));
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_, res) => res.json({
  status:   "ok",
  provider: process.env.LLM_PROVIDER || "groq",
  phase:    3,
}));

app.use("/api", parseRoute);
app.use("/api", sessionRoute);
app.use("/api", reportRoute);
app.use("/api", transcribeRoute);
app.use("/api", monitorRoute);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

await initDb();

app.listen(PORT, () => {
  console.log(`\n  Interview Agent API → http://localhost:${PORT}`);
  console.log(`  LLM provider  : ${process.env.LLM_PROVIDER || "groq"}`);
  console.log(`  Phase         : 3 — Voice (Groq Whisper + SSE monitor)`);
  console.log(`  Health        : http://localhost:${PORT}/api/health\n`);
});
