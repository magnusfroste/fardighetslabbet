export type Level = 1 | 2 | 3;

export type Subject = "matematik" | "svenska" | "engelska";

export const SUBJECTS: { id: Subject; name: string; blurb: string }[] = [
  {
    id: "matematik",
    name: "Matematik",
    blurb: "Räkna plus, minus, gånger, delat, bråk och procent.",
  },
  {
    id: "svenska",
    name: "Svenska",
    blurb: "Stavning, ordklasser och synonymer.",
  },
  {
    id: "engelska",
    name: "Engelska",
    blurb: "Glosor åt båda hållen och prepositioner i fraser.",
  },
];

export const LEVEL_NAMES: Record<Level, string> = {
  1: "Lätt",
  2: "Medel",
  3: "Svår",
};

/** Ett räknesätt med sina tal, så att svaret kan räknas ut (och kontrolleras) i efterhand. */
export type MathOp =
  | { op: "add"; a: number; b: number }
  | { op: "sub"; a: number; b: number }
  | { op: "mul"; a: number; b: number }
  | { op: "div"; a: number; b: number }
  | { op: "missing"; a: number; result: number }
  | { op: "frac"; num: number; den: number; whole: number }
  | { op: "percent"; pct: number; whole: number };

export type ChoiceQuestion = {
  id: string;
  type: "choice";
  subject: Subject;
  title: string;
  prompt: string;
  big?: string;
  options: string[];
  answer: string;
  explanation: string;
  math?: MathOp;
  /** 2 = två stora knappar (stavning), 4 = fyra rutor */
  columns?: 2 | 4;
};

export type MatchQuestion = {
  id: string;
  type: "match";
  subject: Subject;
  title: string;
  prompt: string;
  pairs: { left: string; right: string }[];
  explanation: string;
};

export type Question = ChoiceQuestion | MatchQuestion;