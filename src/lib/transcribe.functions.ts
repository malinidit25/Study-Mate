import { createServerFn } from "@tanstack/react-start";

const MAX_BYTES = 24 * 1024 * 1024;

// Receives one audio segment (WAV) extracted from a video in the browser and returns its transcript.
export const transcribeAudio = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data.");
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("No audio found in this video.");
    if (file.size > MAX_BYTES) throw new Error("Audio segment is too large.");
    return { file };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured (missing key).");
    const form = new FormData();
    form.append("model", "openai/gpt-transcribe");
    form.append("file", data.file, data.file.name || "audio.wav");
    form.append("response_format", "json");
    form.append("stream", "true");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: form,
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      console.error("Transcription error", res.status, body.slice(0, 500));
      if (res.status === 402) throw new Error("AI credits are used up. Add credits in workspace billing to continue.");
      if (res.status === 429) throw new Error("Too many requests right now. Please wait a moment and try again.");
      if (res.status === 403) throw new Error("AI access was denied for this workspace.");
      throw new Error("Couldn't transcribe this video. Please try another file.");
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let deltas = "";
    let final = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload) as { type?: string; delta?: string; text?: string };
          if (ev.type === "transcript.text.delta" && ev.delta) deltas += ev.delta;
          if (ev.type === "transcript.text.done" && ev.text) final = ev.text;
        } catch {
          /* ignore partial */
        }
      }
    }
    return { text: (final || deltas).trim() };
  });
