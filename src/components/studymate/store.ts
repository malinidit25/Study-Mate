import { useCallback, useEffect, useState } from "react";
import type { DocPage } from "@/lib/extract";

export type StudyDoc = { id: string; name: string; pages: DocPage[]; addedAt: number; selected: boolean };
export type QuizAttempt = { at: number; score: number; total: number; weakTopics: string[] };

const DOCS_KEY = "studyate-docs-v1";
const ATTEMPTS_KEY = "studyate-attempts-v1";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useStudyStore() {
  const [docs, setDocs] = useState<StudyDoc[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDocs(load(DOCS_KEY, []));
    setAttempts(load(ATTEMPTS_KEY, []));
    setReady(true);
  }, []);

  const saveDocs = useCallback((next: StudyDoc[]) => {
    setDocs(next);
    try {
      localStorage.setItem(DOCS_KEY, JSON.stringify(next));
    } catch {
      /* storage full: keep in memory */
    }
  }, []);

  const addAttempt = useCallback((a: QuizAttempt) => {
    setAttempts((prev) => {
      const next = [a, ...prev].slice(0, 30);
      localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const activePages = docs
    .filter((d) => d.selected)
    .flatMap((d) => d.pages.map((p) => ({ doc: d.name, page: p.page, text: p.text })));

  return { docs, saveDocs, attempts, addAttempt, activePages, ready };
}
