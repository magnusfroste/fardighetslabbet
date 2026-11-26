import { useEffect, useMemo, useRef, useState } from "react";
import {
  LEVEL_NAMES,
  SUBJECTS,
  type Level,
  type MatchQuestion,
  type Question,
  type Subject,
} from "./lib/types";
import { ADAPT_DOWN, ADAPT_UP, PASS_SIZE, buildPass, randomSeed, seedFrom } from "./lib/tasks";
import { mulberry32, shuffle } from "./lib/math";
import {
  applyPass,
  emptyStore,
  loadStore,
  lockDailyLevel,
  recentHistory,
  rollDaily,
  saveStore,
  todayKey,
  type HistoryEntry,
  type PassResult,
  type Store,
} from "./lib/progress";

type Screen =
  | { v: "home" }
  | { v: "daily" }
  | { v: "overview" }
  | { v: "subject"; subject: Subject }
  | { v: "pass"; subject: Subject; level: Level; seed: number; daily: boolean }
  | { v: "result"; subject: Subject; result: PassResult };

const LEVEL_HINT: Record<Level, string> = {
  1: "Enkla tal och vanliga ord",
  2: "Lite svårare – tvåsiffrigt och fler ord",
  3: "Utmanande – stora tal och ovanligare ord",
};

const SUBJECT_MARK: Record<Subject, string> = {
  matematik: "+−",
  svenska: "Aa",
  engelska: "Ab",
};

const SUBJECT_SHORT: Record<Subject, string> = {
  matematik: "Matte",
  svenska: "Svenska",
  engelska: "Engelska",
};

function subjectName(subject: Subject): string {
  return SUBJECTS.find((s) => s.id === subject)!.name;
}

function dateLabel(): string {
  return new Date().toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

export default function App() {
  const [store, setStore] = useState<Store>(() => loadStore());
  const [screen, setScreen] = useState<Screen>({ v: "home" });

  useEffect(() => {
    saveStore(store);
  }, [store]);

  // Nytt dygn = ny bingla, även om fliken står öppen över midnatt.
  useEffect(() => {
    const tick = () => setStore((s) => rollDaily(s));
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const update = (next: Store) => setStore(next);

  const startPass = (subject: Subject, level?: Level) => {
    const chosen = level ?? store.subjects[subject].level;
    if (level && level !== store.subjects[subject].level) {
      update({
        ...store,
        subjects: { ...store.subjects, [subject]: { ...store.subjects[subject], level } },
      });
    }
    setScreen({ v: "pass", subject, level: chosen, seed: randomSeed(), daily: false });
  };

  const startDaily = (subject: Subject) => {
    const { store: locked, level } = lockDailyLevel(store, subject);
    if (locked !== store) update(locked);
    setScreen({
      v: "pass",
      subject,
      level,
      seed: seedFrom(`${todayKey()}|${subject}`),
      daily: true,
    });
  };

  const finishPass = (subject: Subject, score: number, daily: boolean) => {
    const { store: next, result } = applyPass(store, subject, score, PASS_SIZE, { daily });
    update(next);
    setScreen({ v: "result", subject, result });
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <header className="border-b border-line/80">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6 max-[899px]:!pl-20">
          <button
            type="button"
            onClick={() => setScreen({ v: "home" })}
            className="flex items-center gap-3 rounded-2xl text-left focus-ring"
            aria-label="Färdighetslabbet – till startsidan"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-lg font-extrabold text-white">
              F
            </span>
            <span>
              <span className="block text-base font-extrabold leading-tight sm:text-lg">Färdighetslabbet</span>
              <span className="block text-xs text-muted">Träna matte, svenska och engelska</span>
            </span>
          </button>
          {screen.v !== "home" ? (
            <button type="button" onClick={() => setScreen({ v: "home" })} className="btn btn-ghost px-4 text-sm">
              Startsida
            </button>
          ) : (
            <button type="button" onClick={() => setScreen({ v: "overview" })} className="btn btn-ghost px-4 text-sm">
              Översikt
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {screen.v === "home" && (
          <Home
            store={store}
            onOpen={(subject) => setScreen({ v: "subject", subject })}
            onDaily={() => setScreen({ v: "daily" })}
            onOverview={() => setScreen({ v: "overview" })}
            onReset={() => update(emptyStore())}
          />
        )}

        {screen.v === "daily" && (
          <DailyScreen
            store={store}
            onStart={startDaily}
            onBack={() => setScreen({ v: "home" })}
            onOverview={() => setScreen({ v: "overview" })}
          />
        )}

        {screen.v === "overview" && <OverviewScreen store={store} onHome={() => setScreen({ v: "home" })} />}

        {screen.v === "subject" && (
          <SubjectScreen
            subject={screen.subject}
            store={store}
            onStart={(level) => startPass(screen.subject, level)}
            onBack={() => setScreen({ v: "home" })}
          />
        )}

        {screen.v === "pass" && (
          <PassScreen
            key={`${screen.subject}-${screen.level}-${screen.seed}-${screen.daily}`}
            subject={screen.subject}
            level={screen.level}
            seed={screen.seed}
            daily={screen.daily}
            onFinish={(score) => finishPass(screen.subject, score, screen.daily)}
            onExit={() =>
              setScreen(screen.daily ? { v: "daily" } : { v: "subject", subject: screen.subject })
            }
          />
        )}

        {screen.v === "result" && (
          <ResultScreen
            subject={screen.subject}
            result={screen.result}
            onAgain={() =>
              screen.result.daily ? setScreen({ v: "daily" }) : startPass(screen.subject)
            }
            onHome={() => setScreen({ v: "home" })}
          />
        )}
      </main>

      <footer className="mt-auto border-t border-line bg-bg">
        <div className="mx-auto w-full max-w-3xl px-4 py-5 text-center text-sm text-muted sm:px-6">
          <p className="font-medium">Gratis · ingen inloggning · fungerar på iPad</p>
          <p className="mt-1 text-xs text-muted/80">Färdighetslabbet · öppen källkod · inga kakor, ingen spårning</p>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------- Hem ------------------------------- */

function Home({
  store,
  onOpen,
  onDaily,
  onOverview,
  onReset,
}: {
  store: Store;
  onOpen: (subject: Subject) => void;
  onDaily: () => void;
  onOverview: () => void;
  onReset: () => void;
}) {
  const totalPasses = SUBJECTS.reduce((sum, s) => sum + store.subjects[s.id].passes, 0);
  const dailyDone = SUBJECTS.filter((s) => store.daily.results[s.id]).length;

  return (
    <div className="space-y-6">
      <section className="card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Åk 4–6</p>
        <h1 className="mt-2 text-2xl font-extrabold leading-snug sm:text-3xl">
          Tio uppgifter i taget – nivån anpassar sig efter dig
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          Välj ämne och kör ett pass. Du får svar direkt och en kort förklaring – ingen tidspress. Klarar du åtta rätt
          eller mer blir nästa pass svårare, får du fem rätt eller färre blir det lättare. Allt sparas bara i din
          webbläsare.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          <span className="chip">{PASS_SIZE} uppgifter per pass</span>
          <span className="chip">0–3 stjärnor</span>
          <span className="chip">Ingen inloggning</span>
        </div>
      </section>

      <section className="card border-accent/30 bg-accent-soft/60 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-dark">Dagens bingla</p>
            <h2 className="mt-1 text-xl font-extrabold">Tio blandade uppgifter – en gång om dagen</h2>
            <p className="mt-1 text-sm text-muted">
              {dateLabel()} · samma uppgifter hela dagen, ny bingla i morgon.
            </p>
          </div>
          <span className="chip bg-white">
            {dailyDone === 0 ? "Inte spelad idag" : `Klart i ${dailyDone} av 3 ämnen`}
          </span>
        </div>
        <button type="button" onClick={onDaily} className="btn btn-primary mt-4 w-full sm:w-auto">
          {dailyDone >= 3 ? "Se dagens bingla" : "Öppna dagens bingla"} →
        </button>
      </section>

      <section aria-labelledby="amnen">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="amnen" className="text-lg font-bold">
            Träna ämne
          </h2>
          {totalPasses > 0 && <span className="text-sm text-muted">{totalPasses} pass spelade</span>}
        </div>
        <div className="grid gap-4">
          {SUBJECTS.map((subject) => {
            const p = store.subjects[subject.id];
            return (
              <button
                key={subject.id}
                type="button"
                onClick={() => onOpen(subject.id)}
                className="card card-tap flex w-full items-start gap-4 text-left focus-ring"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-lg font-extrabold text-accent">
                  {SUBJECT_MARK[subject.id]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold">{subject.name}</span>
                    <span className="chip chip-sm">Nivå {LEVEL_NAMES[p.level]}</span>
                    {store.daily.results[subject.id] && <span className="chip chip-sm border-accent/40 text-accent-dark">Bingla klar ★</span>}
                  </span>
                  <span className="mt-1 block text-sm text-muted">{subject.blurb}</span>
                  <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    <span>
                      <strong className="font-semibold text-ink">{p.passes}</strong> pass
                    </span>
                    <span>
                      Bästa resultat:{" "}
                      <strong className="font-semibold text-ink">
                        {p.passes ? `${p.best} av ${PASS_SIZE}` : "–"}
                      </strong>
                    </span>
                    <span>
                      Stjärnor: <strong className="font-semibold text-ink">{p.stars}</strong>
                    </span>
                  </span>
                </span>
                <span aria-hidden="true" className="mt-1 text-xl text-accent">
                  →
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
        <button type="button" onClick={onOverview} className="btn btn-ghost px-4 text-sm">
          Översikt för lärare
        </button>
        <button
          type="button"
          className="text-sm text-muted underline decoration-line underline-offset-4 focus-ring"
          onClick={() => {
            if (window.confirm("Nollställa alla sparade framsteg på den här enheten?")) onReset();
          }}
        >
          Nollställ framsteg
        </button>
      </div>
    </div>
  );
}

/* --------------------------- Dagens bingla --------------------------- */

function DailyScreen({
  store,
  onStart,
  onBack,
  onOverview,
}: {
  store: Store;
  onStart: (subject: Subject) => void;
  onBack: () => void;
  onOverview: () => void;
}) {
  const done = SUBJECTS.filter((s) => store.daily.results[s.id]).length;
  const doneStars = SUBJECTS.reduce((sum, s) => sum + (store.daily.results[s.id]?.stars ?? 0), 0);

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-muted focus-ring">
        ← Startsida
      </button>

      <section className="card p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-dark">Dagens bingla</p>
        <h1 className="mt-1 text-2xl font-extrabold">{dateLabel()}</h1>
        <p className="mt-2 text-base leading-relaxed text-muted">
          En bingla är tio blandade uppgifter i ett ämne. Uppgifterna är desamma hela dagen och byts ut när det blir en
          ny dag. Välj ämne – du kan göra en bingla per ämne.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="chip bg-white">
            {done} av 3 ämnen klara
          </span>
          <span className="chip bg-white">★ {doneStars} stjärnor idag</span>
        </div>
      </section>

      <div className="grid gap-3">
        {SUBJECTS.map((subject) => {
          const result = store.daily.results[subject.id];
          const level = store.daily.levels[subject.id] ?? store.subjects[subject.id].level;
          return (
            <div key={subject.id} className="card flex flex-wrap items-center gap-4 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-base font-extrabold text-accent">
                {SUBJECT_MARK[subject.id]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold">
                  {subject.name} <span className="ml-1 text-xs font-semibold text-muted">nivå {LEVEL_NAMES[level]}</span>
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {result ? `Klart idag · ${result.score} av ${result.total} rätt` : "Tio uppgifter, cirka 5 minuter"}
                </p>
              </div>
              {result ? (
                <div className="flex items-center gap-3">
                  <span className="text-lg text-amber-500" aria-label={`${result.stars} av 3 stjärnor`}>
                    {"★".repeat(result.stars)}
                    <span className="text-line">{"★".repeat(3 - result.stars)}</span>
                  </span>
                  <span className="chip border-accent/40 text-accent-dark">Klart ✓</span>
                </div>
              ) : (
                <button type="button" onClick={() => onStart(subject.id)} className="btn btn-primary px-4 text-sm">
                  Starta
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted">
        Binglan sparas bara på den här enheten. Nästa bingla kommer i morgon.
      </p>

      <div className="text-center">
        <button type="button" onClick={onOverview} className="text-sm font-semibold text-muted underline decoration-line underline-offset-4 focus-ring">
          Se översikt
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- Översikt ----------------------------- */

function OverviewScreen({ store, onHome }: { store: Store; onHome: () => void }) {
  const history = recentHistory(store, 10);
  const totalPasses = SUBJECTS.reduce((sum, s) => sum + store.subjects[s.id].passes, 0);
  const totalStars = SUBJECTS.reduce((sum, s) => sum + store.subjects[s.id].stars, 0);

  return (
    <div className="space-y-5">
      <button type="button" onClick={onHome} className="text-sm font-semibold text-muted focus-ring">
        ← Startsida
      </button>

      <section className="card p-6">
        <h1 className="text-2xl font-extrabold">Översikt</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          För dig som lärare eller förälder. Siffrorna gäller den här enheten och webbläsaren – inget konto behövs och
          inget skickas vidare.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <Stat label="Pass totalt" value={String(totalPasses)} />
          <Stat label="Binglor klara" value={String(store.binglas)} />
          <Stat label="Stjärnor" value={String(totalStars)} />
          <Stat label="Pass idag" value={String(store.history.filter((h) => todayKey(new Date(h.at)) === todayKey()).length)} />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-base font-bold">Per ämne</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[260px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-semibold">Ämne</th>
                <th className="pb-2 font-semibold">Nivå</th>
                <th className="pb-2 text-right font-semibold">Pass</th>
                <th className="pb-2 text-right font-semibold">Bästa</th>
                <th className="hidden pb-2 text-right font-semibold sm:table-cell">Senaste</th>
                <th className="pb-2 text-right font-semibold">Stjärnor</th>
              </tr>
            </thead>
            <tbody>
              {SUBJECTS.map((subject) => {
                const p = store.subjects[subject.id];
                return (
                  <tr key={subject.id} className="border-t border-line">
                    <td className="py-3 font-semibold">{subject.name}</td>
                    <td className="py-3 text-muted">{LEVEL_NAMES[p.level]}</td>
                    <td className="py-3 text-right">{p.passes}</td>
                    <td className="py-3 text-right">{p.passes ? `${p.best}/${PASS_SIZE}` : "–"}</td>
                    <td className="hidden py-3 text-right sm:table-cell">{p.last === null ? "–" : `${p.last}/${PASS_SIZE}`}</td>
                    <td className="py-3 text-right">{p.stars}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Nivån höjs automatiskt vid {ADAPT_UP}–{PASS_SIZE} rätt och sänks vid 0–{ADAPT_DOWN} rätt.
        </p>
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">Senaste passen</h2>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" /> rätt
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[#e9b3a4]" /> fel
            </span>
          </div>
        </div>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Inga pass ännu. Spela ett pass så syns staplarna här.</p>
        ) : (
          <div className="mt-4 space-y-2.5">
            {history.map((entry, i) => (
              <ChartRow key={`${entry.at}-${i}`} entry={entry} />
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-muted">Varje stapel är ett pass om {PASS_SIZE} uppgifter. De tio senaste visas.</p>
      </section>

      <section className="card p-6">
        <h2 className="text-base font-bold">Så funkar nivåerna</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
          <li>
            <strong className="text-ink">8–10 rätt</strong> – nästa pass blir en nivå svårare.
          </li>
          <li>
            <strong className="text-ink">6–7 rätt</strong> – du stannar på samma nivå.
          </li>
          <li>
            <strong className="text-ink">0–5 rätt</strong> – nästa pass blir en nivå lättare.
          </li>
        </ul>
      </section>
    </div>
  );
}

function ChartRow({ entry }: { entry: HistoryEntry }) {
  const total = Math.max(entry.total, 1);
  const correct = Math.max(0, Math.min(entry.score, total));
  const wrong = total - correct;
  return (
    <div className="flex items-center gap-3">
      <span className="w-[118px] shrink-0 truncate text-xs text-muted">
        {SUBJECT_SHORT[entry.subject]} · {shortDate(entry.at)}
      </span>
      <span className="flex h-6 flex-1 overflow-hidden rounded-full border border-line bg-white">
        <span
          className="flex h-full items-center justify-end bg-accent pr-1.5 text-[10px] font-bold text-white"
          style={{ width: `${(correct / total) * 100}%` }}
        >
          {correct > 0 && correct}
        </span>
        <span
          className="flex h-full items-center justify-start bg-[#e9b3a4] pl-1.5 text-[10px] font-bold text-[#6f2a1d]"
          style={{ width: `${(wrong / total) * 100}%` }}
        >
          {wrong > 0 && wrong}
        </span>
      </span>
      <span className="w-11 shrink-0 text-right text-xs font-semibold">
        {correct}/{total}
      </span>
    </div>
  );
}

/* ---------------------------- Ämnessida ---------------------------- */

function SubjectScreen({
  subject,
  store,
  onStart,
  onBack,
}: {
  subject: Subject;
  store: Store;
  onStart: (level: Level) => void;
  onBack: () => void;
}) {
  const p = store.subjects[subject];
  const [level, setLevel] = useState<Level>(p.level);
  const info = SUBJECTS.find((s) => s.id === subject)!;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-muted focus-ring">
        ← Alla ämnen
      </button>

      <section className="card p-6 sm:p-7">
        <h1 className="text-2xl font-extrabold">{info.name}</h1>
        <p className="mt-2 text-base text-muted">{info.blurb}</p>

        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Stat label="Pass" value={String(p.passes)} />
          <Stat label="Bästa resultat" value={p.passes ? `${p.best}/${PASS_SIZE}` : "–"} />
          <Stat label="Stjärnor" value={String(p.stars)} />
        </div>

        <h2 className="mt-7 text-sm font-semibold uppercase tracking-wide text-muted">Välj nivå</h2>
        <div className="mt-3 grid gap-3">
          {([1, 2, 3] as Level[]).map((l) => {
            const active = l === level;
            return (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                aria-pressed={active}
                className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors focus-ring ${
                  active ? "border-accent bg-accent-soft" : "border-line bg-white"
                }`}
              >
                <span>
                  <span className="block text-base font-bold">
                    {LEVEL_NAMES[l]}
                    {l === p.level && <span className="ml-2 text-xs font-semibold text-accent">din nivå</span>}
                  </span>
                  <span className="block text-sm text-muted">{LEVEL_HINT[l]}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs ${
                    active ? "border-accent bg-accent text-white" : "border-line text-transparent"
                  }`}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>

        <button type="button" onClick={() => onStart(level)} className="btn btn-primary mt-6 w-full">
          Starta pass · {PASS_SIZE} uppgifter
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          Nivån sparas när du startar. Efter passet justeras den automatiskt.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold">Det här tränar du</h2>
        <ul className="mt-2 grid gap-1 text-sm text-muted">
          {subject === "matematik" && (
            <>
              <li>• Addition och subtraktion</li>
              <li>• Multiplikation och division</li>
              <li>• Bråk och procent</li>
            </>
          )}
          {subject === "svenska" && (
            <>
              <li>• Stavning – välj rätt av två alternativ</li>
              <li>• Ordklasser</li>
              <li>• Synonymer – para ihop ord</li>
            </>
          )}
          {subject === "engelska" && (
            <>
              <li>• Glosor svenska → engelska</li>
              <li>• Glosor engelska → svenska</li>
              <li>• Prepositioner i fraser</li>
            </>
          )}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-bg px-3 py-3">
      <div className="text-xl font-extrabold">{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

/* ------------------------------ Passet ------------------------------ */

function PassScreen({
  subject,
  level,
  seed,
  daily,
  onFinish,
  onExit,
}: {
  subject: Subject;
  level: Level;
  seed: number;
  daily: boolean;
  onFinish: (score: number) => void;
  onExit: () => void;
}) {
  const questions = useMemo<Question[]>(() => buildPass(subject, level, mulberry32(seed)), [subject, level, seed]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [matchOk, setMatchOk] = useState<boolean | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);

  const q = questions[index];
  const answered = picked !== null || matchOk !== null;
  const wasRight = q.type === "choice" ? picked === q.answer : matchOk === true;

  // Håll återkopplingen synlig på små skärmar, och börja varje uppgift uppifrån.
  useEffect(() => {
    if (answered) feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [answered]);

  useEffect(() => {
    if (index > 0) window.scrollTo({ top: 0, behavior: "auto" });
  }, [index]);

  const answer = (correct: boolean, choice: string | null) => {
    if (answered) return;
    setPicked(choice);
    setAnswers((prev) => [...prev, correct]);
  };

  const next = () => {
    if (index + 1 >= questions.length) {
      onFinish(answers.filter(Boolean).length);
      return;
    }
    setIndex(index + 1);
    setPicked(null);
    setMatchOk(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onExit} className="text-sm font-semibold text-muted focus-ring">
          ← Avbryt
        </button>
        <div className="text-sm font-semibold text-muted">
          {daily && <span className="mr-2 text-accent-dark">Dagens bingla ·</span>}
          Uppgift {index + 1} av {questions.length}
        </div>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={questions.length}
        aria-valuenow={index + (answered ? 1 : 0)}
        aria-label="Passets framsteg"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${((index + (answered ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="chip chip-sm">{subjectName(subject)}</span>
          <span className="chip chip-sm">{LEVEL_NAMES[level]}</span>
          <span className="text-muted">{q.title}</span>
        </div>

        <h1 className="mt-4 text-xl font-bold leading-snug sm:text-2xl">{q.prompt}</h1>
        {q.type === "choice" && q.big && (
          <p className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{q.big}</p>
        )}

        {q.type === "choice" ? (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {q.options.map((option) => {
              const isAnswer = option === q.answer;
              const isPicked = option === picked;
              const state = !answered ? "idle" : isAnswer ? "right" : isPicked ? "wrong" : "dim";
              return (
                <button
                  key={option}
                  type="button"
                  disabled={answered}
                  onClick={() => answer(option === q.answer, option)}
                  className={`option option-${state}`}
                >
                  <span className="flex-1">{option}</span>
                  {answered && isAnswer && (
                    <span aria-hidden="true" className="text-lg">
                      ✓
                    </span>
                  )}
                  {answered && isPicked && !isAnswer && (
                    <span aria-hidden="true" className="text-lg">
                      ✕
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <MatchTask
            question={q}
            onDone={(ok) => {
              if (matchOk === null) {
                setMatchOk(ok);
                setAnswers((prev) => [...prev, ok]);
              }
            }}
          />
        )}
      </section>

      {answered && (
        <section
          ref={feedbackRef}
          className={`card p-5 ${wasRight ? "border-accent/40 bg-accent-soft/50" : ""}`}
          aria-live="polite"
        >
          <p className={`text-base font-bold ${wasRight ? "text-accent-dark" : "text-ink"}`}>
            {wasRight ? "Rätt!" : "Nästan!"}
          </p>
          {q.type === "choice" && !wasRight && (
            <p className="mt-1 text-base">
              Rätt svar: <strong className="font-bold">{q.answer}</strong>
            </p>
          )}
          <p className="mt-2 text-sm leading-relaxed text-muted">{q.explanation}</p>
          <button type="button" onClick={next} className="btn btn-primary mt-4 w-full sm:w-auto">
            {index + 1 >= questions.length ? "Visa resultat" : "Nästa uppgift"} →
          </button>
        </section>
      )}

      <p className="text-center text-xs text-muted">
        {answers.filter(Boolean).length} rätt hittills · ta den tid du behöver
      </p>
    </div>
  );
}

/* ----------------------------- Matchning ----------------------------- */

function MatchTask({
  question,
  onDone,
}: {
  question: MatchQuestion;
  onDone: (ok: boolean) => void;
}) {
  const [rightOrder] = useState<string[]>(() =>
    shuffle(
      mulberry32(Math.floor(Math.random() * 1_000_000) + 7),
      question.pairs.map((p) => p.right)
    )
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const [errors, setErrors] = useState(0);
  const doneRef = useRef(false);
  const timer = useRef<number | null>(null);

  const finished = matched.length === question.pairs.length;

  useEffect(() => {
    if (finished && !doneRef.current) {
      doneRef.current = true;
      onDone(errors === 0);
    }
  }, [finished, errors, onDone]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const pickRight = (right: string) => {
    if (finished || !selected) return;
    const pair = question.pairs.find((p) => p.left === selected);
    if (pair && pair.right === right) {
      setMatched((prev) => [...prev, selected]);
      setSelected(null);
      setWrong(null);
    } else {
      setErrors((n) => n + 1);
      setWrong(right);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setWrong(null), 700);
    }
  };

  return (
    <div className="mt-5">
      <p className="text-sm text-muted">Tryck på ett ord till vänster och sedan på dess synonym till höger.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="grid gap-3">
          {question.pairs.map((pair) => {
            const isMatched = matched.includes(pair.left);
            const isSelected = selected === pair.left;
            return (
              <button
                key={pair.left}
                type="button"
                disabled={isMatched}
                onClick={() => setSelected(pair.left)}
                aria-pressed={isSelected}
                className={`option option-${isMatched ? "right" : isSelected ? "selected" : "idle"}`}
              >
                {pair.left}
              </button>
            );
          })}
        </div>
        <div className="grid gap-3">
          {rightOrder.map((right) => {
            const isMatched = question.pairs.some((p) => p.right === right && matched.includes(p.left));
            return (
              <button
                key={right}
                type="button"
                disabled={isMatched || finished}
                onClick={() => pickRight(right)}
                className={`option option-${isMatched ? "right" : wrong === right ? "wrong" : "idle"}`}
              >
                {right}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">
        {matched.length} av {question.pairs.length} par klara
        {!selected && !finished && " · välj ett ord till vänster"}
      </p>
    </div>
  );
}

/* ----------------------------- Resultat ----------------------------- */

function ResultScreen({
  subject,
  result,
  onAgain,
  onHome,
}: {
  subject: Subject;
  result: PassResult;
  onAgain: () => void;
  onHome: () => void;
}) {
  const levelText =
    result.change === "up"
      ? `Nästa pass blir på nivå ${LEVEL_NAMES[result.level]} – du klarade ${ADAPT_UP} eller fler rätt.`
      : result.change === "down"
        ? `Nästa pass blir på nivå ${LEVEL_NAMES[result.level]} – vi backar lite och bygger upp igen.`
        : `Du fortsätter på nivå ${LEVEL_NAMES[result.level]}.`;

  const message =
    result.stars === 3
      ? "Strålande! Du har verkligen koll på det här."
      : result.stars === 2
        ? "Bra jobbat! Bara några få fel kvar."
        : result.stars === 1
          ? "Helt okej – repetera en gång till så sitter det bättre."
          : "Ta det lugnt. Läs förklaringarna och kör ett pass igen.";

  return (
    <div className="space-y-4">
      <section className="card p-6 text-center sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          {result.daily ? `Dagens bingla · ${subjectName(subject)}` : subjectName(subject)} · nivå{" "}
          {LEVEL_NAMES[result.previousLevel]}
        </p>
        <div className="mt-3 flex justify-center gap-1 text-4xl">
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= result.stars ? "text-amber-500" : "text-line"} aria-hidden="true">
              ★
            </span>
          ))}
        </div>
        <p className="mt-1 text-sm text-muted">{result.stars} av 3 stjärnor</p>
        <h1 className="mt-4 text-2xl font-extrabold">
          {result.score} av {result.total} rätt
        </h1>
        <p className="mt-2 text-base text-muted">{message}</p>

        <div className="mt-5 rounded-2xl border border-line bg-bg p-4 text-left text-sm">
          <p className="font-semibold">{levelText}</p>
          <p className="mt-1 text-muted">
            {result.change === "up"
              ? "Nivån höjs automatiskt när du klarar 8 av 10."
              : result.change === "down"
                ? "Nivån sänks automatiskt när du får 5 rätt eller färre."
                : "Klara 8 av 10 nästa gång för att gå upp en nivå."}
          </p>
        </div>

        {result.daily && (
          <p className="mt-4 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm font-semibold text-accent-dark">
            Binglan är klar för idag. En ny bingla väntar i morgon.
          </p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onAgain} className="btn btn-primary w-full">
            {result.daily ? "Se dagens bingla" : "Spela igen"}
          </button>
          <button type="button" onClick={onHome} className="btn btn-ghost w-full">
            Till startsidan
          </button>
        </div>
      </section>

      <section className="card p-5 text-sm text-muted">
        <p>
          Resultatet sparas i den här webbläsaren. Ingen inloggning, inga kakor och inget skickas till någon server.
        </p>
      </section>
    </div>
  );
}