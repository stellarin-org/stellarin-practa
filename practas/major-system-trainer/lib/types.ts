export type Phoneme =
  | "S" | "Z"
  | "T" | "D" | "TH_unvoiced" | "TH_voiced"
  | "N"
  | "M"
  | "R"
  | "L"
  | "SH" | "CH" | "J" | "ZH"
  | "K" | "G"
  | "F" | "V"
  | "P" | "B";

export const DIGIT_PHONEMES: Record<number, Phoneme[]> = {
  0: ["S", "Z"],
  1: ["T", "D", "TH_unvoiced", "TH_voiced"],
  2: ["N"],
  3: ["M"],
  4: ["R"],
  5: ["L"],
  6: ["SH", "CH", "J", "ZH"],
  7: ["K", "G"],
  8: ["F", "V"],
  9: ["P", "B"],
};

export const PHONEME_DISPLAY: Record<Phoneme, string> = {
  S: "S", Z: "Z",
  T: "T", D: "D", TH_unvoiced: "TH", TH_voiced: "TH",
  N: "N",
  M: "M",
  R: "R",
  L: "L",
  SH: "SH", CH: "CH", J: "J", ZH: "ZH",
  K: "K", G: "G",
  F: "F", V: "V",
  P: "P", B: "B",
};

export interface CardVariant {
  id: string;
  word: string;
  image: string;
  phonemes: [Phoneme, Phoneme];
}

export interface Card {
  number: string;
  digits: [number, number];
  primary_variant: string;
  variants: CardVariant[];
}

export interface Deck {
  version: number;
  generated_at: string;
  count: number;
  cards: Card[];
}

export type MasteryLevel = "NEW" | "LEARNING" | "REVIEW" | "MASTERED";

export interface CardState {
  number: string;
  due_at: number;
  interval_days: number;
  correct_streak: number;
  lapse_count: number;
  last_seen_at: number;
  last_result: "correct" | "incorrect" | null;
  preferred_variant_id: string | null;
}

export interface SRSState {
  cards: Record<string, CardState>;
  confusion_matrix: Record<string, Record<string, number>>;
  introduced_order: string[];
}

export type DrillType = "NUMBER_TO_IMAGE" | "IMAGE_TO_NUMBER" | "NUMBER_TO_WORD";

export interface DrillChoice {
  number: string;
  variant: CardVariant;
}

export interface Drill {
  id: string;
  type: DrillType;
  targetNumber: string;
  targetVariant: CardVariant;
  choices: DrillChoice[];
  correctIndex: number;
}

export interface DrillResult {
  drill: Drill;
  selectedIndex: number;
  isCorrect: boolean;
  responseMs: number;
}

export interface SessionSummary {
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  newCardsIntroduced: number;
  cardsReviewed: number;
  dueRemaining: number;
}

export function getMastery(state: CardState): MasteryLevel {
  if (state.interval_days === 0 && state.correct_streak === 0) return "NEW";
  if (state.interval_days < 7) return "LEARNING";
  if (state.interval_days >= 14) return "MASTERED";
  return "REVIEW";
}

export function formatPhonemeBreakdown(digits: [number, number], phonemes: [Phoneme, Phoneme]): string {
  return `${digits[0]} = ${PHONEME_DISPLAY[phonemes[0]]}, ${digits[1]} = ${PHONEME_DISPLAY[phonemes[1]]}`;
}
