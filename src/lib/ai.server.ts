import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output } from "ai";
import type { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

function provider() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured (missing key).");
  let runId: string | undefined;
  return createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get("X-Lovable-AIG-Run-ID") ?? undefined;
      if (!res.ok) {
        const body = await res.clone().text().catch(() => "");
        if (res.status === 402) throw new Error("AI credits are used up. Add credits in workspace billing to continue.");
        if (res.status === 429) throw new Error("Too many requests right now. Please wait a moment and try again.");
        if (res.status === 403) throw new Error("AI access was denied for this workspace.");
        console.error("AI gateway error", res.status, body.slice(0, 500));
      }
      return res;
    },
  });
}

const providerOptions = {
  openai: {
    forceReasoning: true,
    reasoningEffort: "low",
    reasoningSummary: "auto",
    store: false,
    include: ["reasoning.encrypted_content"],
  },
};

type Msg = { role: "user" | "assistant"; content: string };

export async function aiText(instructions: string, messages: Msg[]) {
  const result = streamText({
    model: provider().responses(MODEL),
    instructions,
    messages,
    providerOptions,
  });
  const text = await result.text;
  if (!text.trim()) throw new Error("The AI returned an empty answer. Please try again.");
  return text;
}

export async function aiObject<T>(instructions: string, prompt: string, schema: z.ZodType<T>) {
  const result = streamText({
    model: provider().responses(MODEL),
    instructions,
    messages: [{ role: "user", content: prompt }],
    output: Output.object({ schema }),
    providerOptions,
  });
  return (await result.output) as T;
}
