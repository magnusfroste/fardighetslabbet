import type { ChoiceQuestion, Level, MathOp } from "./types";

export type Rng = () => number;

/** Liten deterministisk slumptalsgenerator (mulberry32) – gör passen repeterbara i test. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type MathArea = "addsub" | "muldiv" | "fracpct";

/** Räknar ut svaret ur räknesättet. Används både av appen och av kontrollskriptet. */
export function evalMath(op: MathOp): number {
  switch (op.op) {
    case "add":
    case "mul":
      return op.op === "add" ? op.a + op.b : op.a * op.b;
    case "sub":
      return op.a - op.b;
    case "div":
      return op.a / op.b;
    case "missing":
      return op.result - op.a;
    case "frac":
      return (op.whole * op.num) / op.den;
    case "percent":
      return (op.whole * op.pct) / 100;
  }
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function mathPrompt(op: MathOp): string {
  switch (op.op) {
    case "add":
      return `${op.a} + ${op.b} = ?`;
    case "sub":
      return `${op.a} − ${op.b} = ?`;
    case "mul":
      return `${op.a} × ${op.b} = ?`;
    case "div":
      return `${op.a} ÷ ${op.b} = ?`;
    case "missing":
      return `${op.a} + ? = ${op.result}`;
    case "frac":
      return `${op.num}/${op.den} av ${op.whole} = ?`;
    case "percent":
      return `${op.pct} % av ${op.whole} = ?`;
  }
}

const AREA_TITLES: Record<MathArea, string> = {
  addsub: "Plus och minus",
  muldiv: "Gånger och division",
  fracpct: "Bråk och procent",
};

function genAddSub(level: Level, rng: Rng): MathOp {
  if (level === 1) {
    if (rng() < 0.5) {
      const a = randInt(rng, 4, 60);
      const b = randInt(rng, 3, Math.max(4, 100 - a));
      return { op: "add", a, b };
    }
    const a = randInt(rng, 30, 99);
    const b = randInt(rng, 4, a - 2);
    return { op: "sub", a, b };
  }
  if (level === 2) {
    const r = rng();
    if (r < 0.35) {
      const a = randInt(rng, 25, 90);
      const b = randInt(rng, 15, 200 - a);
      return { op: "add", a, b };
    }
    if (r < 0.7) {
      const a = randInt(rng, 120, 320);
      const b = randInt(rng, 25, 99);
      return { op: "sub", a, b };
    }
    const a = randInt(rng, 20, 80);
    const b = randInt(rng, 20, 90);
    return { op: "missing", a, result: a + b };
  }
  const r = rng();
  if (r < 0.35) {
    const a = randInt(rng, 150, 480);
    const b = randInt(rng, 90, 520);
    return { op: "add", a, b };
  }
  if (r < 0.7) {
    const a = randInt(rng, 400, 980);
    const b = randInt(rng, 120, a - 60);
    return { op: "sub", a, b };
  }
  const a = randInt(rng, 120, 460);
  const b = randInt(rng, 80, 400);
  return { op: "missing", a, result: a + b };
}

function genMulDiv(level: Level, rng: Rng): MathOp {
  if (level === 1) {
    const a = randInt(rng, 1, 5);
    const b = randInt(rng, 1, 10);
    return rng() < 0.55 ? { op: "mul", a, b } : { op: "div", a: a * b, b: a };
  }
  if (level === 2) {
    const a = randInt(rng, 6, 9);
    const b = randInt(rng, 2, 10);
    return rng() < 0.55 ? { op: "mul", a, b } : { op: "div", a: a * b, b: a };
  }
  const a = randInt(rng, 11, 29);
  const b = randInt(rng, 3, 9);
  return rng() < 0.6 ? { op: "mul", a, b } : { op: "div", a: a * b, b: b };
}

function genFracPct(level: Level, rng: Rng): MathOp {
  const base = level === 1 ? [2, 4, 5, 10] : level === 2 ? [2, 3, 4, 5, 6, 8, 10] : [3, 4, 5, 6, 8, 10, 12];
  const pcts = level === 1 ? [50, 25, 10] : level === 2 ? [10, 20, 25, 50, 75] : [15, 20, 30, 40, 60, 70, 80];

  if (rng() < 0.55) {
    const den = pickOne(rng, base);
    const num = randInt(rng, 1, den - 1);
    const k = level === 1 ? randInt(rng, 1, 8) : level === 2 ? randInt(rng, 2, 12) : randInt(rng, 3, 16);
    return { op: "frac", num, den, whole: den * k };
  }
  const pct = pickOne(rng, pcts);
  const step = 100 / gcd(pct, 100);
  const k = level === 1 ? randInt(rng, 2, 10) : level === 2 ? randInt(rng, 2, 12) : randInt(rng, 2, 14);
  return { op: "percent", pct, whole: step * k };
}

function genMath(area: MathArea, level: Level, rng: Rng): MathOp {
  if (area === "addsub") return genAddSub(level, rng);
  if (area === "muldiv") return genMulDiv(level, rng);
  return genFracPct(level, rng);
}

/** Plausibla felaktiga svar – alltid unika, aldrig negativa. */
export function numberOptions(answer: number, extras: number[], rng: Rng): string[] {
  const values = [answer];
  const candidates = extras.filter((n) => Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n !== answer);
  for (let d = 1; d <= 15; d++) {
    candidates.push(answer + d, answer - d);
  }
  for (const c of shuffle(rng, candidates)) {
    if (values.length >= 4) break;
    if (c >= 0 && Number.isInteger(c) && !values.includes(c)) values.push(c);
  }
  return shuffle(rng, values).map(String);
}

function distractors(op: MathOp, answer: number): number[] {
  switch (op.op) {
    case "add":
      return [op.a - op.b, answer + 10, answer - 10, op.a + op.b + 1];
    case "sub":
      return [op.a + op.b, answer + 1, answer - 10, op.b];
    case "mul":
      return [op.a + op.b, answer + op.a, answer - op.a, op.a * op.b + 10];
    case "div":
      return [op.a - op.b, answer + 1, answer * 2, op.b];
    case "missing":
      return [op.result, op.a + op.a, op.result - op.a + 10, op.result + 1];
    case "frac":
      return [op.whole / op.den, op.whole - answer, answer + op.num, op.num * op.den];
    case "percent":
      return [op.whole - answer, Math.round(op.whole / op.pct), answer + 10, op.pct];
  }
}

function mathExplanation(op: MathOp, answer: number): string {
  switch (op.op) {
    case "add":
      return `${op.a} + ${op.b} = ${answer}.`;
    case "sub":
      return `${op.a} − ${op.b} = ${answer}.`;
    case "mul":
      return `${op.a} × ${op.b} = ${answer}.`;
    case "div":
      return `${op.a} ÷ ${op.b} = ${answer}, eftersom ${op.b} × ${answer} = ${op.a}.`;
    case "missing":
      return `Dra bort ${op.a} från ${op.result}: ${op.result} − ${op.a} = ${answer}.`;
    case "frac":
      return `Dela ${op.whole} i ${op.den} lika delar (${op.whole / op.den} i varje) och ta ${op.num} delar: ${answer}.`;
    case "percent":
      return `${op.pct} % av ${op.whole} = ${op.pct}/100 × ${op.whole} = ${answer}.`;
  }
}

export function mathQuestion(area: MathArea, level: Level, rng: Rng, id: string): ChoiceQuestion {
  const op = genMath(area, level, rng);
  const answer = evalMath(op);
  return {
    id,
    type: "choice",
    subject: "matematik",
    title: AREA_TITLES[area],
    prompt: mathPrompt(op),
    big: mathPrompt(op),
    options: numberOptions(answer, distractors(op, answer), rng),
    answer: String(answer),
    explanation: mathExplanation(op, answer),
    math: op,
    columns: 4,
  };
}