import type { Level, Subject } from "./types";

export const STORAGE_KEY = "fardighetslabbet-v1";
export const SUBJECT_IDS: Subject[] = ["matematik", "svenska", "engelska"];
const MAX_HISTORY = 30;

export type SubjectProgress = {
  level: Level;
  passes: number;
  best: number;
  stars: number;
  last: number | null;
};

export type HistoryEntry = {
  /** ISO-tid för passet */
  at: string;
  subject: Subject;
  score: number;
  total: number;
  level: Level;
  daily: boolean;
};

export type DailyResult = { score: number; total: number; stars: 0 | 1 | 2 | 3 };

export type DailyState = {
  /** Lokalt datum, YYYY-MM-DD */
  date: string;
  /** Nivån som binglan startades på, så att uppgifterna är desamma hela dygnet. */
  levels: Partial<Record<Subject, Level>>;
  results: Partial<Record<Subject, DailyResult>>;
};

export type Store = {
  v: 1;
  subjects: Record<Subject, SubjectProgress>;
  history: HistoryEntry[];
  binglas: number;
  daily: DailyState;
};

export type PassResult = {
  score: number;
  total: number;
  stars: 0 | 1 | 2 | 3;
  previousLevel: Level;
  level: Level;
  change: "up" | "down" | "same";
  daily: boolean;
};

function emptySubject(): SubjectProgress {
  return { level: 1, passes: 0, best: 0, stars: 0, last: null };
}

/** Lokalt datum som YYYY-MM-DD (dygnet byts vid midnatt på enheten). */
export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function emptyStore(): Store {
  return {
    v: 1,
    subjects: {
      matematik: emptySubject(),
      svenska: emptySubject(),
      engelska: emptySubject(),
    },
    history: [],
    binglas: 0,
    daily: { date: todayKey(), levels: {}, results: {} },
  };
}

function isLevel(v: unknown): v is Level {
  return v === 1 || v === 2 || v === 3;
}

function clampInt(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

/** Läser sparade framsteg. Klarar trasig eller äldre data utan att krascha. */
export function parseStore(raw: string | null): Store {
  const store = emptyStore();
  if (!raw) return store;
  try {
    const data = JSON.parse(raw) as Record<string, unknown> | null;
    if (!data || typeof data !== "object") return store;

    const subjects = data.subjects as Record<string, Partial<SubjectProgress>> | undefined;
    if (subjects && typeof subjects === "object") {
      for (const id of SUBJECT_IDS) {
        const s = subjects[id];
        if (!s || typeof s !== "object") continue;
        store.subjects[id] = {
          level: isLevel(s.level) ? s.level : 1,
          passes: clampInt(s.passes, 0),
          best: clampInt(s.best, 0),
          stars: clampInt(s.stars, 0),
          last: typeof s.last === "number" ? s.last : null,
        };
      }
    }

    if (Array.isArray(data.history)) {
      store.history = (data.history as HistoryEntry[])
        .filter((h) => h && typeof h === "object" && SUBJECT_IDS.includes(h.subject))
        .slice(-MAX_HISTORY)
        .map((h) => ({
          at: typeof h.at === "string" ? h.at : new Date().toISOString(),
          subject: h.subject,
          score: clampInt(h.score, 0),
          total: clampInt(h.total, 10),
          level: isLevel(h.level) ? h.level : 1,
          daily: Boolean(h.daily),
        }));
    }

    store.binglas = clampInt(data.binglas, 0);

    const daily = data.daily as Partial<DailyState> | undefined;
    if (daily && typeof daily.date === "string" && daily.results && typeof daily.results === "object") {
      const results: Partial<Record<Subject, DailyResult>> = {};
      for (const id of SUBJECT_IDS) {
        const r = (daily.results as Record<string, DailyResult>)[id];
        if (r && typeof r === "object" && typeof r.score === "number") {
          results[id] = {
            score: clampInt(r.score, 0),
            total: clampInt(r.total, 10),
            stars: (isLevel(r.stars) ? r.stars : 0) as 0 | 1 | 2 | 3,
          };
        }
      }
      const levels: Partial<Record<Subject, Level>> = {};
      const rawLevels = (daily.levels ?? {}) as Record<string, unknown>;
      for (const id of SUBJECT_IDS) {
        if (isLevel(rawLevels[id])) levels[id] = rawLevels[id];
      }
      store.daily = { date: daily.date, levels, results };
    }
  } catch {
    return emptyStore();
  }
  return store;
}

/** Nollställer dagens bingla när datumet har bytts. */
export function rollDaily(store: Store, today = todayKey()): Store {
  if (store.daily.date === today) return store;
  return { ...store, daily: { date: today, levels: {}, results: {} } };
}

/** Nivån som dagens bingla låstes till (annars ämnets nuvarande nivå). */
export function dailyLevel(store: Store, subject: Subject): Level {
  return store.daily.date === todayKey() ? store.daily.levels[subject] ?? store.subjects[subject].level : store.subjects[subject].level;
}

/** Låser nivån för dagens bingla i ett ämne, så att uppgifterna inte byts ut. */
export function lockDailyLevel(store: Store, subject: Subject): { store: Store; level: Level } {
  const level = dailyLevel(store, subject);
  if (store.daily.levels[subject]) return { store, level };
  return {
    store: { ...store, daily: { ...store.daily, levels: { ...store.daily.levels, [subject]: level } } },
    level,
  };
}

export function loadStore(): Store {
  if (typeof window === "undefined" || !window.localStorage) return emptyStore();
  try {
    return rollDaily(parseStore(window.localStorage.getItem(STORAGE_KEY)));
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: Store): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* Privat läge eller fullt minne – appen fungerar ändå, utan sparade framsteg. */
  }
}

/** 0–3 stjärnor per pass (9–10 rätt = 3, 7–8 = 2, 5–6 = 1). */
export function starsFor(score: number, total: number): 0 | 1 | 2 | 3 {
  const ratio = total > 0 ? score / total : 0;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.7) return 2;
  if (ratio >= 0.5) return 1;
  return 0;
}

/** Adaptiv nivå: 8+ rätt höjer, 5 eller färre sänker. */
export function nextLevel(level: Level, score: number, total: number): Level {
  const up = Math.ceil(total * 0.8);
  const down = Math.floor(total * 0.5);
  if (score >= up && level < 3) return (level + 1) as Level;
  if (score <= down && level > 1) return (level - 1) as Level;
  return level;
}

export function dailyDone(store: Store, subject: Subject): DailyResult | undefined {
  return store.daily.date === todayKey() ? store.daily.results[subject] : undefined;
}

/** Sparar ett avslutat pass (vanligt eller dagens bingla) och räknar ut nivåbyte. */
export function applyPass(
  store: Store,
  subject: Subject,
  score: number,
  total: number,
  options: { daily?: boolean; today?: string; now?: Date } = {}
): { store: Store; result: PassResult } {
  const today = options.today ?? todayKey(options.now ?? new Date());
  const rolled = rollDaily(store, today);
  const current = rolled.subjects[subject];
  const stars = starsFor(score, total);
  const level = nextLevel(current.level, score, total);
  const change: PassResult["change"] = level > current.level ? "up" : level < current.level ? "down" : "same";

  const updated: SubjectProgress = {
    level,
    passes: current.passes + 1,
    best: Math.max(current.best, score),
    stars: current.stars + stars,
    last: score,
  };

  const entry: HistoryEntry = {
    at: (options.now ?? new Date()).toISOString(),
    subject,
    score,
    total,
    level,
    daily: Boolean(options.daily),
  };

  const isNewDaily = Boolean(options.daily) && !rolled.daily.results[subject];
  const daily = isNewDaily
    ? { ...rolled.daily, results: { ...rolled.daily.results, [subject]: { score, total, stars } } }
    : rolled.daily;

  const next: Store = {
    ...rolled,
    subjects: { ...rolled.subjects, [subject]: updated },
    history: [...rolled.history, entry].slice(-MAX_HISTORY),
    binglas: rolled.binglas + (isNewDaily ? 1 : 0),
    daily,
  };

  return {
    store: next,
    result: { score, total, stars, previousLevel: current.level, level, change, daily: Boolean(options.daily) },
  };
}

/** Senaste passen, äldst först, för stapeldiagrammet. */
export function recentHistory(store: Store, count = 10): HistoryEntry[] {
  return store.history.slice(-count);
}