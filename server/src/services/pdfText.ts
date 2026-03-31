import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
type PdfParseFn = (data: Buffer) => Promise<{ text?: string }>;
const pdfParse = require("pdf-parse") as PdfParseFn;

async function extractTextWithPdfJs(buffer: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer);

  const loadingTask = pdfjs.getDocument({
    data,
    stopAtErrors: false,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    for (const item of content.items) {
      if (
        item &&
        typeof item === "object" &&
        "str" in item &&
        typeof (item as { str: unknown }).str === "string"
      ) {
        line += (item as { str: string }).str;
      }
    }
    if (line.trim()) pages.push(line.trim());
  }

  return pages.join("\n\n").trim();
}

/**
 * pdf-parse 1.x runs a broken self-test when loaded as ESM (module.parent is falsy).
 * Loading via createRequire forces a normal require() so that test path is skipped.
 *
 * Some PDFs (bad XRef, repaired generators) fail pdf-parse's older engine; we then retry
 * with pdfjs-dist, which uses a newer PDF.js parser and is often more tolerant.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  let pdfParseError: string | undefined;
  try {
    const data = await pdfParse(buffer);
    const text = String(data.text ?? "").trim();
    if (text.length > 0) return text;
  } catch (e) {
    pdfParseError = e instanceof Error ? e.message : String(e);
  }

  try {
    const fallback = await extractTextWithPdfJs(buffer);
    if (fallback.length > 0) return fallback;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (pdfParseError) {
      throw new Error(
        `PDF parse failed: ${msg} (pdf-parse also failed: ${pdfParseError})`
      );
    }
    throw new Error(`PDF parse failed: ${msg}`);
  }

  if (pdfParseError) {
    throw new Error(
      `PDF parse failed: no extractable text (${pdfParseError})`
    );
  }
  throw new Error(
    "PDF parse failed: no extractable text (empty or image-only document)."
  );
}
