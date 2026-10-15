// Browser-only text extraction. Libraries are imported lazily so SSR never loads them.
export type DocPage = { page: number; text: string };

export async function extractText(file: File): Promise<DocPage[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractPdf(file);
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return chunk(value);
  }
  if (/\.(txt|md|markdown)$/.test(name)) return chunk(await file.text());
  throw new Error("Unsupported file. Use PDF, DOCX, TXT or MD.");
}

async function extractPdf(file: File): Promise<DocPage[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: DocPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : ""))
      .join("")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (text) pages.push({ page: i, text });
  }
  return pages;
}

// Non-paged documents are split into ~3000-char "pages" so citations stay useful.
function chunk(text: string): DocPage[] {
  const clean = text.replace(/\r/g, "").trim();
  const out: DocPage[] = [];
  for (let i = 0; i < clean.length; i += 3000) out.push({ page: out.length + 1, text: clean.slice(i, i + 3000) });
  return out;
}
