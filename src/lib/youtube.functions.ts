import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cuesToPages, parseYouTubeId, type Cue } from "./youtube";

type Track = { baseUrl: string; languageCode: string; kind?: string };

const UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 14)";

async function getTracks(id: string): Promise<{ title: string; tracks: Track[] }> {
  // Ask YouTube's player API (Android client) for caption tracks.
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      videoId: id,
      context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en" } },
    }),
  });
  if (res.ok) {
    const j = (await res.json()) as any;
    const tracks = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks as Track[] | undefined;
    if (tracks?.length) return { title: j?.videoDetails?.title ?? `YouTube ${id}`, tracks };
    if (j?.playabilityStatus?.status && j.playabilityStatus.status !== "OK")
      throw new Error("This video is private, age-restricted or unavailable.");
  }
  // Fallback: read the watch page.
  const html = await (
    await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36", "Accept-Language": "en" },
    })
  ).text();
  const m = html.match(/"captionTracks":(\[.*?\])/);
  const title = html.match(/<title>(.*?)(?: - YouTube)?<\/title>/)?.[1] ?? `YouTube ${id}`;
  if (!m) throw new Error("This video has no captions, so it can't be summarized yet. Try a video with subtitles.");
  return { title, tracks: JSON.parse(m[1]!) as Track[] };
}

function pick(tracks: Track[]) {
  const en = (t: Track) => t.languageCode.startsWith("en");
  return (
    tracks.find((t) => en(t) && t.kind !== "asr") ??
    tracks.find(en) ??
    tracks.find((t) => t.kind !== "asr") ??
    tracks[0]!
  );
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getCues(track: Track): Promise<Cue[]> {
  const url = track.baseUrl.replace(/&fmt=[^&]*/, "") + "&fmt=json3";
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const body = await res.text();
  try {
    const j = JSON.parse(body) as { events?: { tStartMs?: number; segs?: { utf8?: string }[] }[] };
    const cues = (j.events ?? [])
      .filter((e) => e.segs)
      .map((e) => ({ start: (e.tStartMs ?? 0) / 1000, text: decode(e.segs!.map((s) => s.utf8 ?? "").join("")) }))
      .filter((c) => c.text);
    if (cues.length) return cues;
  } catch {
    /* maybe XML */
  }
  const cues: Cue[] = [];
  for (const m of body.matchAll(/<(?:text|p) [^>]*?(?:start="([\d.]+)"|t="(\d+)")[^>]*>([\s\S]*?)<\/(?:text|p)>/g)) {
    const start = m[1] ? Number(m[1]) : Number(m[2]) / 1000;
    const text = decode(m[3]!);
    if (text) cues.push({ start, text });
  }
  return cues;
}

export const fetchYouTube = createServerFn({ method: "POST" })
  .inputValidator(z.object({ url: z.string().min(1).max(500) }))
  .handler(async ({ data }) => {
    const id = parseYouTubeId(data.url);
    if (!id) throw new Error("That doesn't look like a YouTube link.");
    try {
      const { title, tracks } = await getTracks(id);
      const cues = await getCues(pick(tracks));
      if (!cues.length) throw new Error("Couldn't read the captions for this video.");
      return { id, title: decode(title), pages: cuesToPages(cues) };
    } catch (e) {
      console.error("YouTube fetch failed", id, e);
      throw e instanceof Error ? e : new Error("Couldn't load this YouTube video.");
    }
  });
