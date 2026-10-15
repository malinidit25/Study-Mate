import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const pageSchema = z.object({ doc: z.string(), page: z.number(), text: z.string() });
const MAX_CHARS = 160_000;

function buildContext(pages: z.infer<typeof pageSchema>[]) {
  let out = "";
  for (const p of pages) {
    const block = `\n\n=== [${p.doc}, Page ${p.page}] ===\n${p.text}`;
    if (out.length + block.length > MAX_CHARS) break;
    out += block;
  }
  if (!out.trim()) throw new Error("No readable text in the selected sources.");
  return out;
}

export const summarize = createServerFn({ method: "POST" })
  .inputValidator(z.object({ pages: z.array(pageSchema).min(1), length: z.enum(["short", "detailed"]) }))
  .handler(async ({ data }) => {
    const { aiText } = await import("./ai.server");
    const ctx = buildContext(data.pages);
    const summary = await aiText(
      `You are Study Mate, a study assistant. Summarize ONLY the provided study material in clear markdown for a student.
Structure: "## Overview" (2-4 sentences), "## Key points" (bullets), "## Important terms" (bold term: short definition), "## Quick recap" (3 bullets).
${data.length === "short" ? "Keep it concise (about 200 words)." : "Be thorough and cover every section (up to ~800 words)."}
Cite pages inline like [file.pdf, Page 3]. Never invent facts not in the material.`,
      [{ role: "user", content: `Study material:${ctx}` }],
    );
    return { summary };
  });

export const ask = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      pages: z.array(pageSchema).min(1),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20),
      question: z.string().min(1).max(2000),
    }),
  )
  .handler(async ({ data }) => {
    const { aiText } = await import("./ai.server");
    const ctx = buildContext(data.pages);
    const answer = await aiText(
      `You are Study Mate, a friendly tutor. Answer the student's question using ONLY the study material below.
Explain simply, use markdown, and cite sources inline exactly like [file.pdf, Page 3].
If the material does not cover the question, say so clearly and suggest what to look up.

Study material:${ctx}`,
      [...data.history, { role: "user", content: data.question }],
    );
    return { answer };
  });

const quizSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number(),
      explanation: z.string(),
      topic: z.string(),
      source: z.string(),
    }),
  ),
});

export const generateQuiz = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      pages: z.array(pageSchema).min(1),
      count: z.number().int().min(3).max(15),
      difficulty: z.enum(["easy", "medium", "hard"]),
      focusTopics: z.array(z.string()).max(10),
    }),
  )
  .handler(async ({ data }) => {
    const { aiObject } = await import("./ai.server");
    const ctx = buildContext(data.pages);
    const focus = data.focusTopics.length
      ? `Focus extra questions on these weak topics: ${data.focusTopics.join(", ")}.`
      : "";
    const out = await aiObject(
      `You write multiple-choice quizzes strictly from provided study material.
Each question has exactly 4 options (plain text, no letter prefixes), one correct answer (correctIndex 0-3),
a one-to-two sentence explanation, a short topic label (2-4 words), and a source like "file.pdf, Page 3".
Vary which index is correct. Difficulty: ${data.difficulty}. ${focus}`,
      `Write ${data.count} questions from this material:${ctx}`,
      quizSchema,
    );
    const questions = out.questions
      .filter((q) => q.options.length >= 2 && q.correctIndex >= 0 && q.correctIndex < q.options.length)
      .slice(0, data.count);
    if (!questions.length) throw new Error("Couldn't create a quiz from this material. Try again.");
    return { questions };
  });
