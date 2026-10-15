// Pure helpers for YouTube links (safe in browser and server).
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
    if (host === "youtu.be") return valid(u.pathname.slice(1).split("/")[0]);
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v");
      if (v) return valid(v);
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[2]!;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

function valid(id: string | undefined) {
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export type Cue = { start: number; text: string };

// Group caption cues into ~3000-char "pages" labelled with their start time.
export function cuesToPages(cues: Cue[], size = 3000) {
  const pages: { page: number; text: string }[] = [];
  let buf = "";
  let startAt = 0;
  for (const c of cues) {
    if (!buf) startAt = c.start;
    buf += (buf ? " " : "") + c.text;
    if (buf.length >= size) {
      pages.push({ page: pages.length + 1, text: `[from ${fmtTime(startAt)}] ${buf}` });
      buf = "";
    }
  }
  if (buf) pages.push({ page: pages.length + 1, text: `[from ${fmtTime(startAt)}] ${buf}` });
  return pages;
}

export function fmtTime(sec: number) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
