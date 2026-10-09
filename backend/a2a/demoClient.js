#!/usr/bin/env node
// ── A2A demo client ───────────────────────────────────────────────────────────
// Acts as "another agent": discovers InterviewIQ via its agent card, starts an
// interview over A2A, answers every question on the same task, then asks for the
// report. Uses the official @a2a-js/sdk client — no InterviewIQ-specific code.
//
//   node a2a/demoClient.js [--server http://localhost:3001] [--api-key KEY]
//                          [--jd file] [--resume file] [--difficulty mid] [--max-answers 20]

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { ClientFactory } from "@a2a-js/sdk/client";
import { Role, TaskState } from "@a2a-js/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES  = path.join(__dirname, "../../evals/fixtures");

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};

const SERVER      = arg("server", process.env.INTERVIEW_AGENT_SERVER || "http://localhost:3001");
const API_KEY     = arg("api-key", process.env.INTERVIEW_AGENT_API_KEY || "");
const DIFFICULTY  = arg("difficulty", "mid");
const MAX_ANSWERS = Number(arg("max-answers", 20));
const jdText      = fs.readFileSync(arg("jd", path.join(FIXTURES, "jd-software-engineer.txt")), "utf-8");
const resumeText  = fs.readFileSync(arg("resume", path.join(FIXTURES, "resume-strong-swe.txt")), "utf-8");

// Scripted candidate: cycles through realistic answers of mixed quality
const ANSWERS = [
  "answer-strong-technical.txt", "answer-weak-vague.txt", "answer-strong-behavioural.txt",
  "answer-evasive.txt", "answer-strong-technical.txt", "answer-contradicts-resume.txt",
].map(f => fs.readFileSync(path.join(FIXTURES, "transcripts", f), "utf-8").trim());

const opts = API_KEY ? { serviceParameters: { "X-API-Key": API_KEY } } : undefined;
const stateName = (s) => TaskState[s] || s;
const textOf = (msg) => (msg?.parts || []).map(p => p.content?.$case === "text" ? p.content.value : "").join("");
const dataOf = (task, name) => task.artifacts?.find(a => a.name === name)?.parts?.[0]?.content?.value;

function message(parts, { taskId, contextId } = {}) {
  return {
    message: {
      messageId: uuidv4(), role: Role.ROLE_USER, taskId: taskId || "", contextId: contextId || "",
      parts, metadata: undefined, extensions: [], referenceTaskIds: [],
    },
  };
}
const data = (value) => ({ content: { $case: "data", value }, mediaType: "application/json", filename: "", metadata: undefined });
const text = (value) => ({ content: { $case: "text", value }, mediaType: "text/plain", filename: "", metadata: undefined });

async function main() {
  console.log(`\n1) Discovering agent at ${SERVER}/.well-known/agent-card.json`);
  const client = await new ClientFactory().createFromUrl(SERVER);
  const card   = await client.getAgentCard();
  console.log(`   ${card.name} v${card.version} — skills: ${card.skills.map(s => s.id).join(", ")}`);

  console.log(`\n2) start_interview (${DIFFICULTY}) — the agent parses, plans and writes questions (≈30-60s)…`);
  let task = await client.sendMessage(message([data({ skill: "start_interview", jdText, resumeText, difficulty: DIFFICULTY })]), opts);
  const session = dataOf(task, "interview-session");
  console.log(`   state=${stateName(task.status.state)} sessionId=${session?.sessionId}`);
  console.log(`   focus areas: ${(session?.focusAreas || []).join("; ") || "-"}`);
  console.log(`   agent: ${textOf(task.status.message)}`);

  let n = 0;
  while (task.status.state === TaskState.TASK_STATE_INPUT_REQUIRED && n < MAX_ANSWERS) {
    const answer = ANSWERS[n % ANSWERS.length];
    n++;
    console.log(`\n3.${n}) candidate answers (${answer.slice(0, 70).replace(/\s+/g, " ")}…)`);
    // Plain-text reply on the same task → interpreted as submit_answer for this session
    task = await client.sendMessage(message([text(answer)], { taskId: task.id, contextId: task.contextId }), opts);
    const r = task.artifacts?.filter(a => a.name === "answer-result").pop()?.parts?.[0]?.content?.value;
    if (r) console.log(`   scores ${JSON.stringify(r.answerAnalysis.scores)} flags=[${r.answerAnalysis.flags}] → ${r.agentDecision.action}${r.agentDecision.verdict ? ` (${r.agentDecision.verdict})` : ""}`);
    console.log(`   state=${stateName(task.status.state)} — agent: ${textOf(task.status.message)}`);
  }

  if (task.status.state !== TaskState.TASK_STATE_COMPLETED) {
    console.log(`\nStopped after ${n} answers (state ${stateName(task.status.state)}).`);
    return;
  }

  console.log(`\n4) get_report (new task)`);
  const rep = await client.sendMessage(message([data({ skill: "get_report", sessionId: session.sessionId })]), opts);
  const report = dataOf(rep, "eligibility-report");
  console.log(`   state=${stateName(rep.status.state)} — ${textOf(rep.status.message)}`);
  if (report) console.log(`   strengths: ${(report.strengths || []).slice(0, 2).join(" | ")}\n   gaps: ${(report.gaps || []).slice(0, 2).join(" | ")}`);
  console.log(`\nDone. Trace: ${session.links?.trace}\n`);
}

main().catch((err) => { console.error("A2A demo failed:", err.message); process.exit(1); });
