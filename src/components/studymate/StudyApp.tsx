import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, FileText, HelpCircle, ListChecks, Loader2, Trash2, Upload, Send, RotateCcw, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractText } from "@/lib/extract";
import { isVideo, videoToWavSegments } from "@/lib/video";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { fetchYouTube } from "@/lib/youtube.functions";
import { parseYouTubeId } from "@/lib/youtube";
import { Youtube } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ask, generateQuiz, summarize } from "@/lib/study.functions";
import { Markdown } from "./Markdown";
import { useStudyStore, type StudyDoc } from "./store";
import { cn } from "@/lib/utils";

type Tab = "sources" | "summary" | "ask" | "quiz";
const TABS: { id: Tab; label: string; icon: typeof Upload }[] = [
  { id: "sources", label: "Add sources", icon: Upload },
  { id: "summary", label: "Summary", icon: BookOpen },
  { id: "ask", label: "Ask a doubt", icon: HelpCircle },
  { id: "quiz", label: "Take a quiz", icon: ListChecks },
];

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

export function StudyApp() {
  const store = useStudyStore();
  const [tab, setTab] = useState<Tab>("sources");
  const hasSources = store.activePages.length > 0;

  return (
    <div className="grid min-h-screen md:grid-cols-[280px_1fr]">
      <aside className="flex flex-col gap-7 bg-sidebar p-6 text-sidebar-foreground md:sticky md:top-0 md:h-screen md:overflow-auto">
        <div>
          <h1 className="text-3xl">Study Mate</h1>
          <p className="mt-1 text-sm text-sidebar-muted">Your sources in. Summaries, cited answers and quizzes out.</p>
        </div>
        <nav className="flex flex-row flex-wrap gap-1 md:flex-col" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left font-medium transition-colors",
                tab === t.id ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-sidebar-accent",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>
        <div>
          <h3 className="mb-2 text-base">Your library</h3>
          {store.docs.length === 0 ? (
            <p className="text-sm text-sidebar-muted">Nothing yet. Add a PDF first.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {store.docs.map((d) => (
                <li key={d.id} className="break-words rounded-r-md border-l-[3px] border-sidebar-primary bg-sidebar-accent px-2.5 py-2">
                  {d.name}
                  <small className="block text-sidebar-muted">
                    {d.pages.length} pages · {d.selected ? "in use" : "not used"}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-auto flex items-center gap-2 text-xs text-sidebar-muted">
          <span className={cn("h-2.5 w-2.5 rounded-full", hasSources ? "bg-success" : "bg-sidebar-muted")} />
          {hasSources ? `${store.activePages.length} pages ready to study` : "Add a source to begin"}
        </div>
      </aside>

      <main className="w-full max-w-4xl px-5 py-10 md:px-14">
        {tab === "sources" && <Sources store={store} onDone={() => setTab("summary")} />}
        {tab !== "sources" && !hasSources ? (
          <EmptyState onAdd={() => setTab("sources")} />
        ) : (
          <>
            <div hidden={tab !== "summary"}><Summary pages={store.activePages} /></div>
            <div hidden={tab !== "ask"}><Ask pages={store.activePages} /></div>
            <div hidden={tab !== "quiz"}><Quiz store={store} /></div>
          </>
        )}
      </main>
    </div>
  );
}

function Header({ title, lead }: { title: string; lead: string }) {
  return (
    <>
      <h2 className="text-3xl md:text-4xl">{title}</h2>
      <p className="mb-6 mt-1.5 max-w-[60ch] text-muted-foreground">{lead}</p>
    </>
  );
}

function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border bg-card p-5 shadow-card", className)} {...p} />;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card className="mt-10 text-center">
      <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
      <h3 className="mt-3 text-xl">No sources selected</h3>
      <p className="mt-1 text-muted-foreground">Upload a PDF, document or video, or tick one in your library.</p>
      <Button className="mt-4" onClick={onAdd}>Add a source</Button>
    </Card>
  );
}

/* ---------------- Sources ---------------- */
function Sources({ store, onDone }: { store: ReturnType<typeof useStudyStore>; onDone: () => void }) {
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<{ kind: "busy" | "ok" | "err"; text: string } | null>(null);
  const [preview, setPreview] = useState<StudyDoc | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const transcribe = useServerFn(transcribeAudio);
  const loadYouTube = useServerFn(fetchYouTube);
  const [ytUrl, setYtUrl] = useState("");

  async function readVideo(file: File) {
    setStatus({ kind: "busy", text: `Pulling the audio out of ${file.name}…` });
    const segments = await videoToWavSegments(file);
    let text = "";
    for (let i = 0; i < segments.length; i++) {
      setStatus({ kind: "busy", text: `Listening to ${file.name} (part ${i + 1} of ${segments.length})…` });
      const fd = new FormData();
      fd.append("file", new File([segments[i]!], `part-${i + 1}.wav`, { type: "audio/wav" }));
      const { text: t } = await transcribe({ data: fd });
      text += (text ? "\n\n" : "") + t;
    }
    if (!text.trim()) throw new Error("No speech was found in this video.");
    const clean = text.trim();
    const pages = [];
    for (let i = 0; i < clean.length; i += 3000) pages.push({ page: pages.length + 1, text: clean.slice(i, i + 3000) });
    return pages;
  }

  async function handle(file: File) {
    const video = isVideo(file);
    const limit = video ? 300 : 30;
    if (file.size > limit * 1024 * 1024) return setStatus({ kind: "err", text: `That file is over ${limit} MB.` });
    setStatus({ kind: "busy", text: `Reading ${file.name}…` });
    try {
      const pages = video ? await readVideo(file) : await extractText(file);
      if (!pages.length) throw new Error("No selectable text found. Scanned PDFs (images only) aren't supported yet.");
      const doc: StudyDoc = { id: crypto.randomUUID(), name: file.name, pages, addedAt: Date.now(), selected: true };
      store.saveDocs([doc, ...store.docs.filter((d) => d.name !== file.name)]);
      setPreview(doc);
      setStatus({ kind: "ok", text: `${file.name} is ready (${pages.length} pages).` });
    } catch (e) {
      setStatus({ kind: "err", text: errMsg(e) });
    }
    if (input.current) input.current.value = "";
  }

  async function handleYouTube() {
    if (!parseYouTubeId(ytUrl)) return setStatus({ kind: "err", text: "That doesn't look like a YouTube link." });
    setStatus({ kind: "busy", text: "Reading the YouTube video's captions…" });
    try {
      const { title, pages } = await loadYouTube({ data: { url: ytUrl } });
      const name = `▶ ${title}`;
      const doc: StudyDoc = { id: crypto.randomUUID(), name, pages, addedAt: Date.now(), selected: true };
      store.saveDocs([doc, ...store.docs.filter((d) => d.name !== name)]);
      setPreview(doc);
      setYtUrl("");
      setStatus({ kind: "ok", text: `${title} is ready (${pages.length} parts).` });
    } catch (e) {
      setStatus({ kind: "err", text: errMsg(e) });
    }
  }

  return (
    <section>
      <Header title="Add your study sources" lead="Upload a textbook chapter, notes or a lecture video. Summaries, answers and quizzes cite the file name and page." />
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
        className={cn(
          "block cursor-pointer rounded-xl border-2 border-dashed bg-card px-5 py-10 text-center text-muted-foreground transition-colors",
          over && "border-primary bg-primary/5",
        )}
      >
        <input ref={input} type="file" className="hidden" accept=".pdf,.docx,.txt,.md,video/*,.mp4,.webm,.mov,.m4v" onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
        <Upload className="mx-auto mb-2 h-8 w-8 text-primary" />
        <strong className="text-foreground">Choose a file</strong> or drop it here
        <br />
        <small>PDF, DOCX, TXT, MD or a video (MP4, WebM, MOV) · videos are transcribed, then summarized</small>
      </label>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); void handleYouTube(); }}
      >
        <div className="relative flex-1">
          <Youtube className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <Input
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            placeholder="…or paste a YouTube link (https://youtube.com/watch?v=…)"
            aria-label="YouTube link"
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={!ytUrl.trim() || status?.kind === "busy"}>Add video</Button>
      </form>

      {status && (
        <p className={cn("mt-4 flex items-center gap-2", status.kind === "err" && "text-destructive", status.kind === "ok" && "text-success")} role="status">
          {status.kind === "busy" && <Loader2 className="h-4 w-4 animate-spin" />}
          {status.text}
          {status.kind === "ok" && <Button size="sm" variant="outline" className="ml-2" onClick={onDone}>See summary</Button>}
        </p>
      )}

      {store.docs.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-xl">Library</h3>
          <div className="flex flex-col gap-2">
            {store.docs.map((d) => (
              <Card key={d.id} className="flex items-center gap-3 p-3.5">
                <input
                  type="checkbox"
                  aria-label={`Use ${d.name}`}
                  checked={d.selected}
                  onChange={() => store.saveDocs(store.docs.map((x) => (x.id === d.id ? { ...x, selected: !x.selected } : x)))}
                  className="h-4 w-4 accent-primary"
                />
                <FileText className="h-5 w-5 text-primary" />
                <button className="min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={() => setPreview(d)}>
                  {d.name}
                </button>
                <span className="text-sm text-muted-foreground">{d.pages.length} pages</span>
                <Button size="icon" variant="ghost" aria-label={`Remove ${d.name}`} onClick={() => store.saveDocs(store.docs.filter((x) => x.id !== d.id))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Ticked sources are used for summaries, answers and quizzes.</p>
        </div>
      )}

      {preview && (
        <div className="mt-8">
          <h3 className="mb-2 text-xl">Text preview · {preview.name}</h3>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted p-4 font-mono text-xs">
            {preview.pages.map((p) => `— Page ${p.page} —\n${p.text}`).join("\n\n").slice(0, 4000)}
          </pre>
        </div>
      )}
    </section>
  );
}

type Pages = { doc: string; page: number; text: string }[];

/* ---------------- Summary ---------------- */
function Summary({ pages }: { pages: Pages }) {
  const run = useServerFn(summarize);
  const [length, setLength] = useState<"short" | "detailed">("detailed");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go() {
    setBusy(true); setErr("");
    try { setText((await run({ data: { pages, length } })).summary); }
    catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  }

  return (
    <section>
      <Header title="Summary" lead="A structured overview of your selected sources, with page citations." />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-card p-1">
          {(["short", "detailed"] as const).map((l) => (
            <button key={l} onClick={() => setLength(l)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium capitalize", length === l && "bg-primary text-primary-foreground")}>
              {l}
            </button>
          ))}
        </div>
        <Button onClick={go} disabled={busy}>
          {busy ? <><Loader2 className="animate-spin" />Summarising…</> : text ? "Summarise again" : "Summarise"}
        </Button>
      </div>
      {err && <p className="mt-4 text-destructive" role="alert">{err}</p>}
      {text && <Card className="mt-6"><Markdown>{text}</Markdown></Card>}
    </section>
  );
}

/* ---------------- Ask ---------------- */
type ChatMsg = { role: "user" | "assistant"; content: string };
function Ask({ pages }: { pages: Pages }) {
  const run = useServerFn(ask);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  async function send() {
    const question = q.trim();
    if (!question || busy) return;
    setErr(""); setBusy(true); setQ("");
    const history = msgs.slice(-12);
    setMsgs((m) => [...m, { role: "user", content: question }]);
    try {
      const { answer } = await run({ data: { pages, history, question } });
      setMsgs((m) => [...m, { role: "assistant", content: answer }]);
    } catch (e) {
      setErr(errMsg(e)); setQ(question); setMsgs((m) => m.slice(0, -1));
    }
    setBusy(false);
    ta.current?.focus();
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1"><Header title="Ask your study material" lead="Answers come only from what you uploaded, with the source cited." /></div>
        {msgs.length > 0 && <Button variant="ghost" size="sm" onClick={() => setMsgs([])}><RotateCcw />Clear</Button>}
      </div>
      <div className="flex flex-col gap-4">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="max-w-[80%] self-end rounded-xl rounded-br-sm bg-foreground px-4 py-2.5 text-background">{m.content}</div>
          ) : (
            <Card key={i} className="rounded-bl-sm"><Markdown>{m.content}</Markdown></Card>
          ),
        )}
        {busy && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Looking through your sources…</p>}
        <div ref={end} />
      </div>
      <Card className="sticky bottom-4 mt-6 p-3">
        <textarea
          ref={ta}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="e.g. Explain the main idea of chapter 1 in simple words"
          className="min-h-20 w-full resize-y bg-transparent p-2 outline-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Enter to send · Shift+Enter for new line</span>
          <Button onClick={send} disabled={busy || !q.trim()}><Send />Ask</Button>
        </div>
        {err && <p className="mt-2 text-sm text-destructive" role="alert">{err}</p>}
      </Card>
    </section>
  );
}

/* ---------------- Quiz ---------------- */
type Question = { question: string; options: string[]; correctIndex: number; explanation: string; topic: string; source: string };
function Quiz({ store }: { store: ReturnType<typeof useStudyStore> }) {
  const run = useServerFn(generateQuiz);
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [qs, setQs] = useState<Question[]>([]);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const lastWeak = store.attempts[0]?.weakTopics ?? [];

  async function go(focus: string[] = []) {
    setBusy(true); setErr(""); setSubmitted(false); setPicks({});
    try { setQs((await run({ data: { pages: store.activePages, count, difficulty, focusTopics: focus } })).questions); }
    catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  }

  const score = qs.reduce((s, q, i) => s + (picks[i] === q.correctIndex ? 1 : 0), 0);
  const weak = [...new Set(qs.filter((q, i) => picks[i] !== q.correctIndex).map((q) => q.topic))];

  function submit() {
    setSubmitted(true);
    store.addAttempt({ at: Date.now(), score, total: qs.length, weakTopics: weak });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <section>
      <Header title="Quiz from your sources" lead="Multiple-choice questions, each with the page it came from and an explanation." />
      <Card className="flex flex-wrap items-end gap-4">
        <label className="text-sm font-medium">Questions
          <select value={count} onChange={(e) => setCount(+e.target.value)} className="mt-1 block rounded-md border bg-background px-3 py-2">
            {[5, 10, 15].map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Difficulty
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} className="mt-1 block rounded-md border bg-background px-3 py-2 capitalize">
            {["easy", "medium", "hard"].map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <Button onClick={() => go()} disabled={busy}>
          {busy ? <><Loader2 className="animate-spin" />Writing questions…</> : qs.length ? "New quiz" : "Generate quiz"}
        </Button>
        {lastWeak.length > 0 && !busy && (
          <Button variant="outline" onClick={() => go(lastWeak)}>Practise weak topics</Button>
        )}
      </Card>
      {err && <p className="mt-4 text-destructive" role="alert">{err}</p>}

      {submitted && (
        <Card className="mt-6 border-l-4 border-l-primary">
          <h3 className="text-2xl">You scored {score} / {qs.length}</h3>
          <p className="mt-1 text-muted-foreground">
            {score === qs.length ? "Perfect — you've nailed this material." : weak.length ? <>Review: {weak.map((t) => <span key={t} className="cite-chip mr-1">{t}</span>)}</> : null}
          </p>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {qs.map((q, qi) => (
          <Card key={qi}>
            <h3 className="mb-3 font-sans text-lg font-semibold">{qi + 1}. {q.question}</h3>
            {q.options.map((o, oi) => {
              const picked = picks[qi] === oi;
              const right = submitted && oi === q.correctIndex;
              const wrong = submitted && picked && oi !== q.correctIndex;
              return (
                <label
                  key={oi}
                  className={cn(
                    "mb-2 flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors hover:border-primary",
                    picked && !submitted && "border-primary bg-primary/5",
                    right && "border-success bg-success/10",
                    wrong && "border-destructive bg-destructive/10",
                  )}
                >
                  <input type="radio" name={`q${qi}`} disabled={submitted} checked={picked} onChange={() => setPicks((p) => ({ ...p, [qi]: oi }))} className="mt-1.5 accent-primary" />
                  <span className="flex-1"><b>{"ABCDEF"[oi]}.</b> {o}</span>
                  {right && <Check className="h-5 w-5 text-success" />}
                  {wrong && <X className="h-5 w-5 text-destructive" />}
                </label>
              );
            })}
            {submitted && <p className="mt-2 text-sm">{q.explanation}</p>}
            <p className="mt-2 text-xs text-muted-foreground">Source: <span className="cite-chip">{q.source}</span> · {q.topic}</p>
          </Card>
        ))}
      </div>

      {qs.length > 0 && !submitted && (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={submit} disabled={Object.keys(picks).length < qs.length}>Submit answers</Button>
          <span className="text-sm text-muted-foreground">{Object.keys(picks).length}/{qs.length} answered</span>
        </div>
      )}

      {store.attempts.length > 0 && (
        <div className="mt-10">
          <h3 className="mb-2 text-xl">Recent attempts</h3>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {store.attempts.slice(0, 5).map((a) => (
              <li key={a.at}>{new Date(a.at).toLocaleString()} — <b className="text-foreground">{a.score}/{a.total}</b>{a.weakTopics.length ? ` · weak: ${a.weakTopics.join(", ")}` : ""}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
