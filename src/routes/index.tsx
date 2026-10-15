import { createFileRoute } from "@tanstack/react-router";
import { StudyApp } from "@/components/studymate/StudyApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Study Mate — Summaries, answers & quizzes from your notes" },
      { name: "description", content: "Upload a PDF or document and get a summary, cited answers to your doubts, and quizzes generated from it." },
      { property: "og:title", content: "Study Mate — Study smarter from your own notes" },
      { property: "og:description", content: "Summaries, cited answers and quizzes generated from the PDFs you upload." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudyApp,
});
