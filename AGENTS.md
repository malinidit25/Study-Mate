<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Study Mate extracts document text in the browser (src/lib/extract.ts) and keeps the library in localStorage; AI work runs in server functions (src/lib/study.functions.ts → ai.server.ts) that receive the page text. Why: no accounts needed and files never need uploading to storage.
- Videos are turned into text in the browser (src/lib/video.ts extracts 16 kHz mono WAV segments) and transcribed server-side (src/lib/transcribe.functions.ts); the transcript is stored like any other document. Why: keeps summaries, Q&A and quizzes on one text pipeline and stays under transcription upload limits.
