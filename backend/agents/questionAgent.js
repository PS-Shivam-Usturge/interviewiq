import { agentQuery, AGENT_CONFIG } from "../agentClient.js";
import { safeJsonParse } from "../llm.js";
import { sanitizeInput } from "../utils/sanitize.js";
import { checkContract } from "./contracts.js";
import logger from "../logger.js";

const log = logger.child({ component: "QuestionAgent" });

// ── Question bank generation ───────────────────────────────────────────────────

export async function generateQuestionBank({ jdSummary, resumeSummary, difficulty, focusAreas = [], strategy = "" }) {
  const difficultyGuide = {
    junior:    "Focus on fundamentals, basic concepts, and learning mindset. Avoid deep architecture questions.",
    mid:       "Mix of applied skills, problem-solving, and some design decisions. Expect solid hands-on experience.",
    senior:    "Deep technical depth, system design, trade-offs, mentoring, and past ownership of complex problems.",
    principal: "Architecture decisions at scale, org-wide technical strategy, cross-team influence, and industry-level thinking.",
  };

  const safeRole        = sanitizeInput(jdSummary.role_title || "", 200);
  const safeCandidate   = sanitizeInput(resumeSummary.candidate_name || "", 100);
  const safeTitle       = sanitizeInput(resumeSummary.current_title || "", 100);

  // Interview plan chosen by the orchestrating agent (generate_question_bank tool args)
  const safeFocus    = (focusAreas || []).slice(0, 5).map(f => sanitizeInput(String(f), 120)).filter(Boolean);
  const safeStrategy = sanitizeInput(strategy || "", 600);
  const planBlock = safeFocus.length || safeStrategy
    ? `
INTERVIEWER'S PLAN (decided by the lead interviewer agent — follow it):
${safeFocus.length ? `- Focus areas to probe: ${safeFocus.join("; ")}` : ""}
${safeStrategy ? `- Strategy: ${safeStrategy}` : ""}
- Each technical question should target one of the focus areas; the scenario question should combine two of them.
`
    : "";

  const prompt = `You are an expert technical interviewer at a top-tier tech company.
You create precise, relevant interview questions tailored to the specific role and candidate.
Always respond with valid JSON only — no markdown, no preamble, no explanation.
Keep each string field concise — under 200 characters where possible.

Create an interview question bank for this candidate.

ROLE: ${safeRole} (${jdSummary.seniority_level})
REQUIRED SKILLS: ${jdSummary.required_skills?.slice(0, 8).join(", ")}
TECH STACK: ${jdSummary.tech_stack?.slice(0, 6).join(", ")}
KEY RESPONSIBILITIES: ${jdSummary.key_responsibilities?.slice(0, 3).join("; ")}

CANDIDATE: ${safeCandidate}
CURRENT TITLE: ${safeTitle}
EXPERIENCE: ${resumeSummary.years_total_experience} years
CANDIDATE SKILLS: ${resumeSummary.skills?.slice(0, 10).join(", ")}

DIFFICULTY: ${difficulty} — ${difficultyGuide[difficulty] || difficultyGuide.mid}
${planBlock}
Return this exact JSON structure (no extra fields):
{
  "opening": [
    { "id": "o1", "category": "opening", "question": "...", "intent": "...", "good_answer_signals": ["s1","s2"], "follow_ups": ["harder follow-up","clarifying follow-up"] },
    { "id": "o2", "category": "opening", "question": "...", "intent": "...", "good_answer_signals": ["s1"], "follow_ups": ["follow-up"] }
  ],
  "technical": [
    { "id": "t1", "category": "technical", "skill_tested": "...", "question": "...", "intent": "...", "good_answer_signals": ["s1","s2"], "follow_ups": ["harder","clarifying"] },
    { "id": "t2", "category": "technical", "skill_tested": "...", "question": "...", "intent": "...", "good_answer_signals": ["s1"], "follow_ups": ["harder","clarifying"] },
    { "id": "t3", "category": "technical", "skill_tested": "...", "question": "...", "intent": "...", "good_answer_signals": ["s1"], "follow_ups": ["harder","clarifying"] }
  ],
  "behavioural": [
    { "id": "b1", "category": "behavioural", "question": "...", "intent": "...", "good_answer_signals": ["s1"], "follow_ups": ["deeper","clarifying"] }
  ],
  "scenario": [
    { "id": "s1", "category": "scenario", "question": "...", "intent": "...", "good_answer_signals": ["s1"], "follow_ups": ["harder","clarifying"] }
  ],
  "closing": [
    { "id": "c1", "category": "closing", "question": "...", "intent": "...", "good_answer_signals": [], "follow_ups": [] }
  ]
}

Rules:
- Make questions specific to THIS role and candidate — not generic templates
- Reference their actual background where relevant
- Total: 2 opening + 3 technical + 1 behavioural + 1 scenario + 1 closing = 8 questions`;

  const content = await agentQuery(prompt, { label: "questionAgent", effort: AGENT_CONFIG.effort.generation });
  const bank = safeJsonParse(content, "question bank");

  // Flatten into ordered array
  const ordered = [
    ...(bank.opening     || []),
    ...(bank.technical   || []),
    ...(bank.behavioural || []),
    ...(bank.scenario    || []),
    ...(bank.closing     || []),
  ].map((q, idx) => ({ ...q, index: idx }));

  if (ordered.length === 0) throw new Error("Question bank generation returned no questions");

  log.info({ count: ordered.length, focusAreas: safeFocus }, "Generated question bank");
  return checkContract("questionAgent", ordered);
}

