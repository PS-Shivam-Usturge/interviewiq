const INJECTION_PATTERNS = [
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /<\|system\|>/gi,
  /<\|endoftext\|>/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /IGNORE\s+(ALL\s+)?PREVIOUS\s+INSTRUCTIONS?/gi,
  /SYSTEM\s*PROMPT\s*:/gi,
  /```[\s\S]*?```/g,
];

export function sanitizeInput(text, maxLen = 4000) {
  if (!text || typeof text !== "string") return text;
  let cleaned = text;
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned.slice(0, maxLen);
}
