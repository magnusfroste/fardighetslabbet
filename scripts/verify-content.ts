/**
 * Innehållskontroll för Färdighetslabbet.
 * Körs med `npm run verify` (esbuild paketerar filen, sedan kör node den).
 *
 * Kontrollerar:
 *  1. att alla ordlistor är egna, kompletta och utan dubbletter/överlapp,
 *  2. att varje genererad matematikuppgift har rätt svar (räknat om från talen),
 *  3. att varje flervalsfråga har exakt ett korrekt alternativ och unika alternativ,
 *  4. att matchningsuppgifterna är entydiga,
 *  5. att stjärnor, nivåbyte, dagens bingla och localStorage-formatet beter sig som tänkt.
 */
import {
  PREPOSITIONS,
  SPELLING,
  SYNONYMS,
  VOCAB,
  WORD_CLASSES,
  WORD_CLASS_HELP,
  WORDS,
} from "../src/lib/content";
import { PASS_SIZE, buildDailyPass, buildPass } from "../src/lib/tasks";
import { evalMath, mulberry32 } from "../src/lib/math";
import type { Level, MathOp, Subject } from "../src/lib/types";
import {
  applyPass,
  emptyStore,
  lockDailyLevel,
  nextLevel,
  parseStore,
  rollDaily,
  starsFor,
  todayKey,
} from "../src/lib/progress";

declare const process: { exitCode?: number };

let failures = 0;
const failLines: string[] = [];

function check(cond: boolean, msg: string): void {
  if (!cond) {
    failures++;
    if (failLines.length < 25) failLines.push(msg);
  }
}

let sectionStart = 0;

function section(name: string): void {
  sectionStart = failures;
  console.log("");
  console.log(`— ${name}`);
}

function result(name: string): void {
  console.log(`${failures === sectionStart ? "OK  " : "FEL "} ${name}`);
}

function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}

/** Räknar ut svaret direkt ur talen – oberoende av evalMath i appen. */
function recompute(op: MathOp): number {
  if (op.op === "add") return op.a + op.b;
  if (op.op === "sub") return op.a - op.b;
  if (op.op === "mul") return op.a * op.b;
  if (op.op === "div") return op.a / op.b;
  if (op.op === "missing") return op.result - op.a;
  if (op.op === "frac") return (op.whole / op.den) * op.num;
  return (op.whole * op.pct) / 100;
}

const SUBJECTS: Subject[] = ["matematik", "svenska", "engelska"];

/* ------------------------------ 1. Listor ------------------------------ */

section("Ordlistor");

check(SPELLING.length >= 60, `Stavning: ${SPELLING.length} par, minst 60 krävs`);
check(SYNONYMS.length >= 40, `Synonymer: ${SYNONYMS.length} par, minst 40 krävs`);
check(VOCAB.length >= 80, `Engelska: ${VOCAB.length} ordpar, minst 80 krävs`);
check(PREPOSITIONS.length >= 20, `Prepositioner: ${PREPOSITIONS.length} fraser, minst 20 krävs`);
check(WORDS.length >= 40, `Ordklasser: ${WORDS.length} ord, minst 40 krävs`);

const spellingCorrect = new Set(SPELLING.map((s) => s.correct.toLowerCase()));
const spellingWrong = new Set(SPELLING.map((s) => s.wrong.toLowerCase()));
const seenCorrect = new Set<string>();
for (const item of SPELLING) {
  check(item.correct !== item.wrong, `Stavning: "${item.correct}" har samma rätt och fel form`);
  check(Boolean(item.clue && item.clue.trim()), `Stavning: "${item.correct}" saknar ledtråd`);
  check(!seenCorrect.has(item.correct), `Stavning: dubblett "${item.correct}"`);
  seenCorrect.add(item.correct);
  check(
    !spellingCorrect.has(item.wrong.toLowerCase()),
    `Stavning: felformen "${item.wrong}" är rätt stavning av ett annat ord i listan`
  );
  check(
    !spellingWrong.has(item.correct.toLowerCase()),
    `Stavning: "${item.correct}" används som felform någon annanstans`
  );
  check(lev(item.correct.toLowerCase(), item.wrong.toLowerCase()) <= 3, `Stavning: "${item.correct}"/"${item.wrong}" skiljer sig för mycket`);
  check(/^[a-zåäö]+$/.test(item.correct.toLowerCase()), `Stavning: "${item.correct}" innehåller oväntade tecken`);
  check(/^[a-zåäö]+$/.test(item.wrong.toLowerCase()), `Stavning: "${item.wrong}" innehåller oväntade tecken`);
}

const synLeft = new Set<string>();
const synRight = new Set<string>();
for (const pair of SYNONYMS) {
  check(!synLeft.has(pair.left), `Synonymer: vänsterordet "${pair.left}" finns två gånger`);
  check(!synRight.has(pair.right), `Synonymer: högerordet "${pair.right}" finns två gånger`);
  check(pair.left !== pair.right, `Synonymer: "${pair.left}" är sitt eget par`);
  synLeft.add(pair.left);
  synRight.add(pair.right);
}
for (const left of synLeft) {
  check(!synRight.has(left), `Synonymer: "${left}" är både vänster- och högerord – matchningsuppgiften blir tvetydig`);
}

const vocabSv = new Set<string>();
const vocabEn = new Set<string>();
for (const pair of VOCAB) {
  check(!vocabSv.has(pair.sv.toLowerCase()), `Engelska: svenska "${pair.sv}" finns två gånger`);
  check(!vocabEn.has(pair.en.toLowerCase()), `Engelska: engelska "${pair.en}" finns två gånger`);
  vocabSv.add(pair.sv.toLowerCase());
  vocabEn.add(pair.en.toLowerCase());
}
for (const sv of vocabSv) {
  check(!vocabEn.has(sv), `Engelska: "${sv}" är både svenskt och engelskt ord – flervalsfrågan blir tvetydig`);
}

check(WORD_CLASSES.length >= 6, "Ordklasser: för få klasser");
for (const cls of WORD_CLASSES) {
  check(Boolean(WORD_CLASS_HELP[cls]), `Ordklasser: "${cls}" saknar förklaring`);
}
const wordSeen = new Set<string>();
for (const item of WORDS) {
  check(WORD_CLASSES.includes(item.cls), `Ordklasser: "${item.word}" har okänd klass "${item.cls}"`);
  check(!wordSeen.has(item.word), `Ordklasser: dubblett "${item.word}"`);
  wordSeen.add(item.word);
}

const prepSeen = new Set<string>();
for (const item of PREPOSITIONS) {
  check(item.options.includes(item.answer), `Preposition: "${item.sentence}" saknar sitt svar bland alternativen`);
  check(new Set(item.options).size === item.options.length, `Preposition: dubbletter i alternativen för "${item.sentence}"`);
  check(item.options.filter((o) => o === item.answer).length === 1, `Preposition: svaret finns flera gånger i "${item.sentence}"`);
  check(item.options.length === 4, `Preposition: "${item.sentence}" har ${item.options.length} alternativ, väntar 4`);
  check(!prepSeen.has(item.sentence), `Preposition: dubblett "${item.sentence}"`);
  check(item.sentence.includes("___"), `Preposition: luckan saknas i "${item.sentence}"`);
  prepSeen.add(item.sentence);
}

result("ordlistor och innehåll");

/* --------------------------- 2. Passen i sig --------------------------- */

section("Genererade pass (200 frön × 3 nivåer × 3 ämnen)");

const stats = {
  passes: 0,
  questions: 0,
  math: 0,
  choice: 0,
  match: 0,
};

for (const subject of SUBJECTS) {
  for (const level of [1, 2, 3] as Level[]) {
    for (let seed = 0; seed < 200; seed++) {
      const rng = mulberry32(seed * 7919 + level * 131 + subject.length);
      const pass = buildPass(subject, level, rng);
      stats.passes++;
      check(pass.length === PASS_SIZE, `${subject} nivå ${level} frö ${seed}: ${pass.length} uppgifter istället för ${PASS_SIZE}`);
      check(new Set(pass.map((q) => q.id)).size === pass.length, `${subject} nivå ${level} frö ${seed}: dubblerade id`);

      const prompts = new Set<string>();
      for (const q of pass) {
        stats.questions++;
        check(Boolean(q.prompt.trim()), `${subject}: tom frågetext`);
        check(Boolean(q.explanation.trim()), `${subject}: "${q.prompt}" saknar förklaring`);
        check(q.subject === subject, `${subject}: frågan har ämnet ${q.subject}`);

        if (q.type === "choice") {
          stats.choice++;
          const expected = q.columns === 2 ? 2 : 4;
          check(q.options.length === expected, `${subject}: "${q.prompt}" har ${q.options.length} alternativ, väntar ${expected}`);
          check(new Set(q.options).size === q.options.length, `${subject}: dubblett bland alternativen till "${q.prompt}"`);
          check(q.options.filter((o) => o === q.answer).length === 1, `${subject}: "${q.prompt}" har inte exakt ett rätt alternativ`);
          check(q.options.every((o) => o.trim().length > 0), `${subject}: tomt alternativ till "${q.prompt}"`);

          if (q.title === "Stavning") {
            check(q.options.length === 2, `Stavning: "${q.prompt}" ska ha två alternativ`);
            const right = q.options.filter((o) => spellingCorrect.has(o.toLowerCase()));
            check(right.length >= 1, `Stavning: inget av alternativen till "${q.prompt}" är en känd rätt stavning`);
            const wrong = q.options.filter((o) => !spellingCorrect.has(o.toLowerCase()));
            check(wrong.length === 1, `Stavning: "${q.prompt}" har ${wrong.length} felformer, väntar 1`);
          }

          if (q.math) {
            stats.math++;
            const expectedAnswer = recompute(q.math);
            check(
              Number.isInteger(expectedAnswer) && expectedAnswer >= 0,
              `${subject}: svaret på "${q.prompt}" blev ${expectedAnswer} (inte ett heltal ≥ 0)`
            );
            check(evalMath(q.math) === expectedAnswer, `Matematik: evalMath och oberoende uträkning skiljer sig för "${q.prompt}"`);
            check(q.answer === String(expectedAnswer), `Matematik: "${q.prompt}" har svaret "${q.answer}", rätt är ${expectedAnswer}`);
            check(q.big === q.prompt, `Matematik: stor text saknas för "${q.prompt}"`);
            const numbers = (q.big ?? "").match(/\d+/g) ?? [];
            check(numbers.length > 0, `Matematik: inga tal i "${q.prompt}"`);
            if (!prompts.has(q.prompt)) {
              prompts.add(q.prompt);
            } else {
              check(false, `Matematik: upprepad uppgift i samma pass: "${q.prompt}"`);
            }
          }
        } else {
          stats.match++;
          check(q.pairs.length === 4, `${subject}: matchningsuppgiften har ${q.pairs.length} par, väntar 4`);
          const lefts = q.pairs.map((p) => p.left);
          const rights = q.pairs.map((p) => p.right);
          check(new Set(lefts).size === 4, `${subject}: dubblerade vänsterord i matchning`);
          check(new Set(rights).size === 4, `${subject}: dubblerade högerord i matchning`);
          check(!lefts.some((l) => rights.includes(l)), `${subject}: samma ord på båda sidor i matchning`);
          for (const pair of q.pairs) {
            const known = SYNONYMS.some((s) => s.left === pair.left && s.right === pair.right);
            check(known, `${subject}: paret ${pair.left}/${pair.right} finns inte i synonymlistan`);
          }
        }
      }
    }
  }
}

result(`pass, flervalsfrågor och matchning (${stats.passes} pass, ${stats.questions} uppgifter)`);

/* ------------------- 3. Dagens bingla är stabil per dag ------------------- */

section("Dagens bingla");

const dayA = "2026-11-15";
const dayB = "2026-11-16";
const signature = (subject: Subject, date: string, level: Level) =>
  buildDailyPass(subject, level, date)
    .map((q) => (q.type === "choice" ? `${q.prompt}=${q.answer}` : q.pairs.map((p) => `${p.left}/${p.right}`).join(",")))
    .join("|");

for (const subject of SUBJECTS) {
  check(signature(subject, dayA, 2) === signature(subject, dayA, 2), `${subject}: binglan är inte stabil inom samma dag`);
  check(buildDailyPass(subject, 2, dayA).length === PASS_SIZE, `${subject}: binglan har inte ${PASS_SIZE} uppgifter`);
  check(signature(subject, dayA, 2) !== signature(subject, dayB, 2), `${subject}: binglan byts inte mellan två dagar`);
}

result("dagens bingla");

/* --------------------------- 4. Stjärnor och nivå --------------------------- */

section("Stjärnor, nivåbyte och sparning");

check(starsFor(10, 10) === 3 && starsFor(9, 10) === 3, "Stjärnor: 9–10 rätt ska ge 3");
check(starsFor(8, 10) === 2 && starsFor(7, 10) === 2, "Stjärnor: 7–8 rätt ska ge 2");
check(starsFor(6, 10) === 1 && starsFor(5, 10) === 1, "Stjärnor: 5–6 rätt ska ge 1");
check(starsFor(4, 10) === 0 && starsFor(0, 10) === 0, "Stjärnor: 0–4 rätt ska ge 0");

check(nextLevel(1, 8, 10) === 2, "Nivå: 8 rätt ska höja från lätt");
check(nextLevel(1, 7, 10) === 1, "Nivå: 7 rätt ska ligga kvar");
check(nextLevel(2, 5, 10) === 1, "Nivå: 5 rätt ska sänka");
check(nextLevel(2, 10, 10) === 3, "Nivå: 10 rätt ska höja från medel");
check(nextLevel(3, 10, 10) === 3, "Nivå: taket är svår");
check(nextLevel(1, 0, 10) === 1, "Nivå: golvet är lätt");

let store = emptyStore();
const first = applyPass(store, "svenska", 9, PASS_SIZE, { daily: true, today: dayA });
store = first.store;
check(first.result.stars === 3, "Pass: 9 rätt ska ge 3 stjärnor");
check(first.result.change === "up", "Pass: 9 rätt ska höja nivån");
check(store.subjects.svenska.passes === 1, "Pass: antalet pass ska öka");
check(store.subjects.svenska.best === 9, "Pass: bästa resultat ska sparas");
check(store.subjects.svenska.level === 2, "Pass: nivån ska sparas");
check(store.history.length === 1, "Pass: historiken ska få en rad");
check(store.binglas === 1, "Bingla: första klara binglan ska räknas");
check(store.daily.results.svenska?.score === 9, "Bingla: resultatet ska sparas på dagen");

const replay = applyPass(store, "svenska", 4, PASS_SIZE, { daily: true, today: dayA });
store = replay.store;
check(store.binglas === 1, "Bingla: samma ämne samma dag ska inte räknas två gånger");
check(store.daily.results.svenska?.score === 9, "Bingla: första resultatet ska behållas");
check(store.subjects.svenska.best === 9, "Pass: bästa resultat ska inte sänkas");

store = rollDaily(store, dayB);
check(Object.keys(store.daily.results).length === 0, "Bingla: nytt dygn ska ge tom bingla");
check(store.daily.date === dayB, "Bingla: datumet ska uppdateras");

/* Nivån för dagens bingla låses, så att uppgifterna inte byts ut om eleven byter nivå samma dag. */
const locked = lockDailyLevel(emptyStore(), "matematik");
check(locked.level === 1, "Bingla: nivån ska låsas till ämnets nivå");
check(locked.store.daily.levels.matematik === 1, "Bingla: nivån ska sparas i dagens bingla");
const lockedPass = applyPass(locked.store, "matematik", 10, PASS_SIZE, { daily: true, today: todayKey() });
check(lockedPass.store.subjects.matematik.level === 2, "Bingla: passet ska kunna höja ämnets nivå");
check(lockedPass.store.daily.levels.matematik === 1, "Bingla: låst nivå ska stå kvar efter passet");
check(rollDaily(lockedPass.store, dayB).daily.levels.matematik === undefined, "Bingla: låst nivå ska släppas till nästa dag");

const roundTrip = parseStore(JSON.stringify(store));
check(roundTrip.subjects.svenska.passes === 2, "Sparning: pass ska överleva en tur genom JSON");
check(roundTrip.history.length === 2, "Sparning: historiken ska överleva");
check(roundTrip.binglas === 1, "Sparning: binglor ska överleva");
check(parseStore("inte json").subjects.matematik.level === 1, "Sparning: trasig data ska ge en tom butik");
check(parseStore(null).subjects.engelska.passes === 0, "Sparning: tom data ska ge noll pass");
check(todayKey(new Date(2026, 10, 15)) === "2026-11-15", "Datum: dagens nyckel ska vara lokalt YYYY-MM-DD");

result("stjärnor, nivåbyte och sparning");

/* ------------------------------- Summering ------------------------------- */

console.log("");
console.log("Sammanfattning");
console.log(`  stavningspar: ${SPELLING.length}`);
console.log(`  synonympar: ${SYNONYMS.length}`);
console.log(`  engelska ordpar: ${VOCAB.length}`);
console.log(`  prepositioner: ${PREPOSITIONS.length}`);
console.log(`  ordklasser: ${WORDS.length} ord i ${WORD_CLASSES.length} klasser`);
console.log(`  genererade pass: ${stats.passes} (${stats.questions} uppgifter, ${stats.math} matematik)`);
console.log(`  matchningar: ${stats.match}, flerval: ${stats.choice}`);

if (failures > 0) {
  console.log("");
  console.log(`${failures} fel hittades:`);
  for (const line of failLines) console.log(`  - ${line}`);
  if (failures > failLines.length) console.log(`  ... och ${failures - failLines.length} till`);
  process.exitCode = 1;
} else {
  console.log("");
  console.log("Alla kontroller gick igenom.");
}