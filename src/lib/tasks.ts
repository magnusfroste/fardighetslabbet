import { PREPOSITIONS, SPELLING, SYNONYMS, VOCAB, WORD_CLASSES, WORD_CLASS_HELP, WORDS } from "./content";
import { mathQuestion, mulberry32, pickOne, randInt, shuffle, type MathArea, type Rng } from "./math";
import type { ChoiceQuestion, Level, MatchQuestion, Question, Subject } from "./types";

export const PASS_SIZE = 10;
export const ADAPT_UP = 8; // 8 rätt eller mer → nivån höjs
export const ADAPT_DOWN = 5; // 5 rätt eller färre → nivån sänks

function weightedSample<T extends { level: Level }>(items: T[], level: Level, count: number, rng: Rng): T[] {
  const allowed = items.filter((i) => i.level <= level);
  const exact = allowed.filter((i) => i.level === level);
  // Ord på rätt nivå väger tyngre, men lättare ord får också plats.
  const bag = shuffle(rng, [...allowed, ...exact, ...exact]);
  const out: T[] = [];
  const seen = new Set<T>();
  for (const item of bag) {
    if (out.length >= count) break;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function uniqueValues(values: string[], exclude: string[], count: number): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (out.length >= count) break;
    if (exclude.includes(v) || out.includes(v)) continue;
    out.push(v);
  }
  return out;
}

/* ------------------------------ Svenska ------------------------------ */

function spellingQuestion(item: (typeof SPELLING)[number], rng: Rng, id: string): ChoiceQuestion {
  return {
    id,
    type: "choice",
    subject: "svenska",
    title: "Stavning",
    prompt: `Välj rätt stavning: ${item.clue}.`,
    options: shuffle(rng, [item.correct, item.wrong]),
    answer: item.correct,
    explanation: item.tip ? `Rätt stavning är "${item.correct}". ${item.tip}` : `Rätt stavning är "${item.correct}".`,
    columns: 2,
  };
}

function wordClassQuestion(item: (typeof WORDS)[number], rng: Rng, id: string): ChoiceQuestion {
  const others = shuffle(rng, WORD_CLASSES.filter((c) => c !== item.cls)).slice(0, 3);
  return {
    id,
    type: "choice",
    subject: "svenska",
    title: "Ordklasser",
    prompt: `Vilken ordklass är "${item.word}"?`,
    options: shuffle(rng, [item.cls, ...others]),
    answer: item.cls,
    explanation: WORD_CLASS_HELP[item.cls],
    columns: 4,
  };
}

function synonymQuestion(pairs: (typeof SYNONYMS)[number][], rng: Rng, id: string): MatchQuestion {
  return {
    id,
    type: "match",
    subject: "svenska",
    title: "Synonymer",
    prompt: "Para ihop varje ord med en synonym.",
    pairs: pairs.map((p) => ({ left: p.left, right: p.right })),
    explanation: `Rätt par: ${pairs.map((p) => `${p.left} = ${p.right}`).join(", ")}.`,
  };
}

/* ----------------------------- Engelska ----------------------------- */

function vocabQuestion(
  pair: (typeof VOCAB)[number],
  direction: "sv-en" | "en-sv",
  pool: typeof VOCAB,
  rng: Rng,
  id: string
): ChoiceQuestion {
  if (direction === "sv-en") {
    const options = uniqueValues(
      shuffle(rng, pool.map((p) => p.en)),
      [pair.en, pair.sv],
      3
    );
    return {
      id,
      type: "choice",
      subject: "engelska",
      title: "Glosor svenska → engelska",
      prompt: `Vad heter "${pair.sv}" på engelska?`,
      options: shuffle(rng, [pair.en, ...options]),
      answer: pair.en,
      explanation: `"${pair.sv}" heter "${pair.en}" på engelska.`,
      columns: 4,
    };
  }
  const options = uniqueValues(
    shuffle(rng, pool.map((p) => p.sv)),
    [pair.sv, pair.en],
    3
  );
  return {
    id,
    type: "choice",
    subject: "engelska",
    title: "Glosor engelska → svenska",
    prompt: `Vad betyder "${pair.en}" på svenska?`,
    options: shuffle(rng, [pair.sv, ...options]),
    answer: pair.sv,
    explanation: `"${pair.en}" betyder "${pair.sv}" på svenska.`,
    columns: 4,
  };
}

function prepositionQuestion(item: (typeof PREPOSITIONS)[number], rng: Rng, id: string): ChoiceQuestion {
  return {
    id,
    type: "choice",
    subject: "engelska",
    title: "Prepositioner",
    prompt: item.sentence,
    options: shuffle(rng, item.options),
    answer: item.answer,
    explanation: `Rätt svar är "${item.answer}". ${item.note}`,
    columns: 4,
  };
}

/* ------------------------------ Passet ------------------------------ */

const MATH_PLAN: MathArea[] = [
  "addsub",
  "addsub",
  "addsub",
  "addsub",
  "muldiv",
  "muldiv",
  "muldiv",
  "fracpct",
  "fracpct",
  "fracpct",
];

function buildMath(level: Level, rng: Rng): Question[] {
  const used = new Set<string>();
  const out: Question[] = [];
  MATH_PLAN.forEach((area, index) => {
    let q = mathQuestion(area, level, rng, `m${index + 1}`);
    let guard = 0;
    while (used.has(q.prompt) && guard < 40) {
      q = mathQuestion(area, level, rng, `m${index + 1}`);
      guard++;
    }
    used.add(q.prompt);
    out.push(q);
  });
  return shuffle(rng, out).map((q, i) => ({ ...q, id: `m${i + 1}` }));
}

function buildSwedish(level: Level, rng: Rng): Question[] {
  const out: Question[] = [];
  weightedSample(SPELLING, level, 4, rng).forEach((item, i) => {
    out.push(spellingQuestion(item, rng, `s${i + 1}`));
  });
  weightedSample(WORDS, level, 3, rng).forEach((item, i) => {
    out.push(wordClassQuestion(item, rng, `s${i + 5}`));
  });
  const pairs = weightedSample(SYNONYMS, level, 12, rng);
  for (let i = 0; i < 3; i++) {
    out.push(synonymQuestion(pairs.slice(i * 4, i * 4 + 4), rng, `s${i + 8}`));
  }
  return out;
}

function buildEnglish(level: Level, rng: Rng): Question[] {
  const out: Question[] = [];
  const pairs = weightedSample(VOCAB, level, 7, rng);
  pairs.slice(0, 4).forEach((pair, i) => {
    out.push(vocabQuestion(pair, "sv-en", VOCAB, rng, `e${i + 1}`));
  });
  pairs.slice(4, 7).forEach((pair, i) => {
    out.push(vocabQuestion(pair, "en-sv", VOCAB, rng, `e${i + 5}`));
  });
  weightedSample(PREPOSITIONS, level, 3, rng).forEach((item, i) => {
    out.push(prepositionQuestion(item, rng, `e${i + 8}`));
  });
  return out;
}

/** Bygger ett pass om 10 uppgifter för valt ämne och nivå. */
export function buildPass(subject: Subject, level: Level, rng: Rng): Question[] {
  if (subject === "matematik") return buildMath(level, rng);
  if (subject === "svenska") return shuffle(rng, buildSwedish(level, rng));
  return shuffle(rng, buildEnglish(level, rng));
}

/** Ett fast frö per pass, så att samma pass kan spelas om utan att byta innehåll. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Stabilt frö ur en text, t.ex. datum + ämne för Dagens bingla. */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Dagens bingla: samma tio uppgifter hela dygnet, blandade inom valt ämne. */
export function buildDailyPass(subject: Subject, level: Level, dateKey: string): Question[] {
  return buildPass(subject, level, mulberry32(seedFrom(`${dateKey}|${subject}`)));
}

export { randInt, pickOne };