#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const program = new Command();

program
  .name("interview-agent")
  .description("InterviewIQ CLI — manage interview sessions from the terminal")
  .version("1.0.0")
  .option("--server <url>", "API server base URL", process.env.INTERVIEW_AGENT_SERVER || "http://localhost:3001")
  .option("--api-key <key>", "API key (or set INTERVIEW_AGENT_API_KEY)", process.env.INTERVIEW_AGENT_API_KEY || "");

// ── Helpers ───────────────────────────────────────────────────────────────────

function headers(opts) {
  const key = opts.apiKey || program.opts().apiKey;
  return key ? { "Content-Type": "application/json", "X-API-Key": key }
             : { "Content-Type": "application/json" };
}

function base(opts) {
  return opts.server || program.opts().server;
}

async function api(method, path, body, opts) {
  const url = `${base(opts)}${path}`;
  const res = await fetch(url, {
    method,
    headers: headers(opts),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) {
    process.stderr.write(`Error ${res.status}: ${data.error || JSON.stringify(data)}\n`);
    process.exit(1);
  }
  return data;
}

function readFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    process.stderr.write(`File not found: ${abs}\n`);
    process.exit(1);
  }
  return fs.readFileSync(abs, "utf-8");
}

function print(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

// ── Commands ──────────────────────────────────────────────────────────────────

program
  .command("health")
  .description("Check API server health")
  .action(async () => {
    const data = await api("GET", "/api/health", null, program.opts());
    print(data);
  });

program
  .command("parse")
  .description("Parse a JD and resume — returns structured summaries")
  .requiredOption("--jd <file>", "Path to job description file (PDF/DOCX/TXT)")
  .requiredOption("--resume <file>", "Path to resume file (PDF/DOCX/TXT)")
  .action(async (opts) => {
    const FormData = (await import("node:buffer")).Blob
      ? (await import("formdata-node")).FormData
      : globalThis.FormData;

    const jdBuf     = fs.readFileSync(path.resolve(opts.jd));
    const resumeBuf = fs.readFileSync(path.resolve(opts.resume));

    const form = new FormData();
    form.append("jd",     new Blob([jdBuf]),     path.basename(opts.jd));
    form.append("resume", new Blob([resumeBuf]), path.basename(opts.resume));

    const key  = program.opts().apiKey;
    const url  = `${base(program.opts())}/api/parse`;
    const res  = await fetch(url, {
      method:  "POST",
      headers: key ? { "X-API-Key": key } : {},
      body:    form,
    });
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) { process.stderr.write(`Error ${res.status}: ${data.error}\n`); process.exit(1); }
    print(data);
  });

const session = program.command("session").description("Session commands");

session
  .command("start")
  .description("Start a new interview session (server must have already parsed the JD + resume)")
  .requiredOption("--jd-text <file>", "Plain text JD (use a .txt export)")
  .requiredOption("--resume-text <file>", "Plain text resume")
  .option("--candidate <name>", "Candidate name", "Candidate")
  .option("--difficulty <level>", "junior | mid | senior | principal", "mid")
  .action(async (opts) => {
    const jdText     = readFile(opts.jdText);
    const resumeText = readFile(opts.resumeText);
    process.stderr.write("Parsing documents (this may take 20–40s)...\n");
    const data = await api("POST", "/api/session/start", {
      jdText, resumeText,
      jdSummary:     {},
      resumeSummary: { candidate_name: opts.candidate },
      difficulty:    opts.difficulty,
    }, program.opts());
    print(data);
  });

session
  .command("status <id>")
  .description("Get current state of a session")
  .action(async (id) => {
    const data = await api("GET", `/api/session/${id}`, null, program.opts());
    print(data);
  });

program
  .command("report <id>")
  .description("Fetch the eligibility report for a completed session")
  .action(async (id) => {
    const data = await api("GET", `/api/report/${id}`, null, program.opts());
    print(data);
  });

program
  .command("trace <id>")
  .description("View the agent decision trace for a session")
  .option("--summary", "Print a one-line summary per event instead of full JSON")
  .action(async (id, opts) => {
    const data = await api("GET", `/api/session/${id}/trace`, null, program.opts());

    if (!opts.summary) {
      print(data);
      return;
    }

    // Human-readable summary mode
    const { candidateName, role, difficulty, status, events = [] } = data;
    process.stdout.write(`\nTrace — ${candidateName} · ${role || "?"} · ${difficulty} · ${status}\n`);
    process.stdout.write(`${"─".repeat(60)}\n`);

    for (const ev of events) {
      const ts = ev.time ? new Date(ev.time * 1000).toLocaleTimeString() : "??:??:??";
      let line = `[${ts}] `;

      switch (ev.event) {
        case "session_started":
          line += `🚀  Session started — ${ev.totalQuestions} questions`;
          break;
        case "tool_call":
          line += `🔧  Tool: ${ev.tool}`;
          if (ev.reasoning) line += `  — "${ev.reasoning.slice(0, 60)}${ev.reasoning.length > 60 ? "…" : ""}"`;
          break;
        case "evaluation":
          line += `🔍  Q${ev.questionIndex + 1} evaluated — overall ${ev.scores?.overall ?? "?"}/10`;
          if (ev.flags?.length) line += `  flags: ${ev.flags.join(", ")}`;
          break;
        case "decision":
          line += `➡   Decision: ${ev.action}`;
          if (ev.verdict) line += ` (${ev.verdict})`;
          if (ev.reasoning) line += `  — "${ev.reasoning.slice(0, 60)}${ev.reasoning.length > 60 ? "…" : ""}"`;
          break;
        case "observation":
          line += `📋  Observation [${ev.severity}]: ${ev.observation}`;
          break;
        case "session_complete":
          line += `✅  Interview complete — ${ev.answeredCount} questions${ev.concludedEarly ? " (concluded early)" : ""}`;
          break;
        case "report_generated":
          line += `📝  Report: ${ev.recommendation?.replace("_", " ")} · score ${ev.overallScore}/100 · ${ev.confidence} confidence`;
          break;
        default:
          line += ev.event;
      }

      process.stdout.write(line + "\n");
    }
    process.stdout.write("\n");
  });

program.parseAsync(process.argv);
