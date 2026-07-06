import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import fs from "fs";

async function extractPdfText(buffer) {
  // First attempt — default extraction
  try {
    const data = await pdfParse(buffer);
    const text = data.text.replace(/\s+/g, " ").trim();
    if (text.length >= 50) return text;
  } catch (_) {}

  // Second attempt — disable font rendering (bypasses some TT font table bugs)
  try {
    const data = await pdfParse(buffer, {
      pagerender: async (pageData) => {
        const textContent = await pageData.getTextContent({ normalizeWhitespace: true });
        return textContent.items.map((item) => item.str).join(" ");
      },
    });
    const text = data.text.replace(/\s+/g, " ").trim();
    if (text.length >= 50) return text;
  } catch (_) {}

  return "";
}

export async function extractText(filePath, mimetype) {
  const buffer = fs.readFileSync(filePath);

  if (
    mimetype === "application/pdf" ||
    filePath.toLowerCase().endsWith(".pdf")
  ) {
    return extractPdfText(buffer);
  }

  if (
    mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filePath.toLowerCase().endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.replace(/\s+/g, " ").trim();
  }

  // Plain text fallback
  return buffer.toString("utf-8").replace(/\s+/g, " ").trim();
}

export function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}
