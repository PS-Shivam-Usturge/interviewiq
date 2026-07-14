import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { initDb } from "./db/database.js";
import { authMiddleware } from "./middleware/auth.js";
import { globalLimiter } from "./middleware/rateLimit.js";
import logger from "./logger.js";
dotenv.config();

const log = logger.child({ component: "Server" });

import parseRoute      from "./routes/parse.js";
import sessionRoute    from "./routes/session.js";
import reportRoute     from "./routes/report.js";
import transcribeRoute from "./routes/transcribe.js";
import monitorRoute    from "./routes/monitor.js";
import traceRoute      from "./routes/trace.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3001;

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors({ origin: ["http://localhost:5173", "http://localhost:3000"] }));
app.use(express.json({ limit: "4mb" }));
app.use(globalLimiter);
app.use(authMiddleware);

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
app.use("/api", traceRoute);

app.use((err, _req, res, _next) => {
  log.error({ err }, "Unhandled error");
  res.status(500).json({ error: err.message || "Internal server error" });
});

await initDb();

app.listen(PORT, () => {
  log.info({ port: PORT, provider: process.env.LLM_PROVIDER || "groq" }, "Interview Agent API started");
});
