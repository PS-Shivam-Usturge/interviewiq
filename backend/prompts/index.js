import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── Prompt templates ──────────────────────────────────────────────────────────
// Every prompt the agents send lives in a Markdown file in this folder:
//
//   prompts/<agent>/<name>.md       e.g. prompts/answerAgent/system.md
//
// - *.system.md / system.md  → the agent's system prompt (role, rules, output format, tool policy)
// - *.user.md   / user.md    → the user prompt template for one call (only the task + data)
// - other files               → optional partial blocks rendered into a user prompt
//
// Templates use {{placeholder}} variables, filled by render(). A leading <!-- … -->
// comment in a file is documentation only and is never sent to the model.

const PROMPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

function loadTemplates(dir, prefix = "") {
  const templates = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      Object.assign(templates, loadTemplates(path.join(dir, entry.name), `${prefix}${entry.name}/`));
    } else if (entry.name.endsWith(".md")) {
      const raw = fs.readFileSync(path.join(dir, entry.name), "utf-8").replace(/\r\n/g, "\n");
      templates[`${prefix}${entry.name.slice(0, -3)}`] = raw.replace(/^\s*<!--[\s\S]*?-->\s*/, "").trim();
    }
  }
  return templates;
}

// Loaded once at startup — a missing or misnamed file fails fast, not mid-interview
const TEMPLATES = loadTemplates(PROMPTS_DIR);

/** Return a template exactly as written (used for system prompts with no variables). */
export function prompt(name) {
  const text = TEMPLATES[name];
  if (text === undefined) throw new Error(`Prompt template '${name}' not found in backend/prompts`);
  return text;
}

/**
 * Fill a template's {{placeholders}} with values.
 * Every placeholder must be provided (an empty string is fine for an omitted optional block);
 * a missing one throws, so a broken prompt is never sent silently.
 * Values are inserted once and never re-scanned, so candidate text containing "{{…}}" stays literal.
 */
export function render(name, vars = {}) {
  const filled = prompt(name).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    if (value === undefined || value === null) throw new Error(`Prompt '${name}' is missing value for {{${key}}}`);
    return String(value);
  });
  // Omitted optional blocks leave blank lines behind — collapse them
  return filled.replace(/\n{3,}/g, "\n\n").trim();
}

/** Names of all loaded templates (for docs/tests). */
export function listPrompts() {
  return Object.keys(TEMPLATES).sort();
}
