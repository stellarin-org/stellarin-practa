import { Deck, Card, CardVariant, Drill, StandardDrill, PiSequenceDrill, HistoricalDateDrill, HistoricalDateEntry, DrillChoice, DrillType } from "./types";
import { SRSManager } from "./srs-manager";

const DEFAULT_SESSION_SIZE = 10;
const NEW_CARD_RATIO = 0.3;
const PI_SEQUENCE_CHANCE = 0.15;
const HISTORICAL_DATE_CHANCE = 0.12;
const STANDARD_DRILL_TYPES: Array<"NUMBER_TO_IMAGE" | "IMAGE_TO_NUMBER" | "NUMBER_TO_WORD"> = ["NUMBER_TO_IMAGE", "IMAGE_TO_NUMBER", "NUMBER_TO_WORD"];

const PI_DIGITS_PAIRS = [
  "14", "15", "92", "65", "35", "89", "79", "32", "38", "46",
  "26", "43", "38", "32", "79", "50", "28", "84", "19", "71",
  "69", "39", "93", "75", "10", "58", "20", "97", "49", "44",
  "59", "23", "07", "81", "64", "06", "28", "62", "08", "99",
  "86", "28", "03", "48", "25", "34", "21", "17", "06", "79"
];

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getReverse(number: string): string {
  return number[1] + number[0];
}

function hasValidReverse(number: string, deck: Deck): boolean {
  const reverse = getReverse(number);
  if (reverse === number) return false;
  if (reverse === "00") return false;
  return deck.cards.some(c => c.number === reverse);
}

export function selectNewCardsForSession(
  srsManager: SRSManager,
  deck: Deck,
  count: number
): string[] {
  const newCards = srsManager.getNewCards();
  const selected: string[] = [];
  const selectedReverses = new Set<string>();

  const shuffled = shuffle(newCards);

  for (const num of shuffled) {
    if (selected.length >= count) break;

    const reverse = getReverse(num);
    if (selectedReverses.has(num)) continue;

    selected.push(num);
    
    if (hasValidReverse(num, deck)) {
      selectedReverses.add(reverse);
    }
  }

  return selected;
}

export function generateSessionCards(
  srsManager: SRSManager,
  deck: Deck,
  sessionSize: number = DEFAULT_SESSION_SIZE
): string[] {
  const dueCards = shuffle(srsManager.getDueCards());
  const targetNewCount = Math.floor(sessionSize * NEW_CARD_RATIO);
  
  let sessionCards: string[] = [];

  const dueToUse = dueCards.slice(0, sessionSize - targetNewCount);
  sessionCards = [...dueToUse];

  const neededNewCards = sessionSize - sessionCards.length;
  const newCards = selectNewCardsForSession(srsManager, deck, neededNewCards);
  sessionCards.push(...newCards);

  if (sessionCards.length < sessionSize) {
    const recentlyWrong = srsManager.getRecentlyWrong()
      .filter(n => !sessionCards.includes(n));
    sessionCards.push(...recentlyWrong.slice(0, sessionSize - sessionCards.length));
  }

  if (sessionCards.length < sessionSize && dueCards.length > dueToUse.length) {
    sessionCards.push(...dueCards.slice(dueToUse.length, sessionSize));
  }

  if (sessionCards.length < sessionSize) {
    const additionalNew = selectNewCardsForSession(srsManager, deck, sessionSize)
      .filter(n => !sessionCards.includes(n));
    sessionCards.push(...additionalNew.slice(0, sessionSize - sessionCards.length));
  }

  return shuffle(sessionCards);
}

function getDisplayVariant(
  card: Card,
  srsManager: SRSManager
): CardVariant {
  const preferred = srsManager.getPreferredVariant(card.number);
  if (preferred) {
    const variant = card.variants.find(v => v.id === preferred);
    if (variant) return variant;
  }
  
  const primary = card.variants.find(v => v.id === card.primary_variant);
  return primary || card.variants[0];
}

function selectDistractors(
  targetNumber: string,
  deck: Deck,
  srsManager: SRSManager,
  count: number = 3
): Card[] {
  const candidates: { card: Card; priority: number }[] = [];
  const targetTens = targetNumber[0];
  const targetOnes = targetNumber[1];
  const reverse = getReverse(targetNumber);

  const confusions = srsManager.getConfusions(targetNumber);
  const confusedSet = new Set(confusions.map(([n]) => n));

  for (const card of deck.cards) {
    if (card.number === targetNumber) continue;

    let priority = 0;

    if (card.number === reverse && hasValidReverse(targetNumber, deck)) {
      priority = 100;
    } else if (confusedSet.has(card.number)) {
      priority = 50 + (confusions.find(([n]) => n === card.number)?.[1] || 0);
    } else if (card.number[0] === targetTens) {
      priority = 20;
    } else if (card.number[1] === targetOnes) {
      priority = 10;
    } else {
      priority = 1;
    }

    candidates.push({ card, priority });
  }

  candidates.sort((a, b) => b.priority - a.priority);

  const selected: Card[] = [];
  const highPriority = candidates.filter(c => c.priority >= 10);
  const lowPriority = candidates.filter(c => c.priority < 10);

  for (const c of shuffle(highPriority)) {
    if (selected.length >= count) break;
    selected.push(c.card);
  }

  for (const c of shuffle(lowPriority)) {
    if (selected.length >= count) break;
    selected.push(c.card);
  }

  return selected;
}

let drillCounter = 0;

function selectStandardDrillType(targetCard: Card, srsManager: SRSManager): "NUMBER_TO_IMAGE" | "IMAGE_TO_NUMBER" | "NUMBER_TO_WORD" {
  const weights: ["NUMBER_TO_IMAGE" | "IMAGE_TO_NUMBER" | "NUMBER_TO_WORD", number][] = [
    ["NUMBER_TO_IMAGE", 40],
    ["IMAGE_TO_NUMBER", 30],
    ["NUMBER_TO_WORD", 30],
  ];

  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let random = Math.random() * total;

  for (const [type, weight] of weights) {
    random -= weight;
    if (random <= 0) return type;
  }

  return STANDARD_DRILL_TYPES[0];
}

export function generateStandardDrill(
  targetNumber: string,
  deck: Deck,
  srsManager: SRSManager,
  forceType?: "NUMBER_TO_IMAGE" | "IMAGE_TO_NUMBER" | "NUMBER_TO_WORD"
): StandardDrill {
  const targetCard = deck.cards.find(c => c.number === targetNumber);
  if (!targetCard) {
    throw new Error(`Card not found: ${targetNumber}`);
  }

  const targetVariant = getDisplayVariant(targetCard, srsManager);
  const type = forceType || selectStandardDrillType(targetCard, srsManager);
  const distractorCards = selectDistractors(targetNumber, deck, srsManager, 3);

  const choices: DrillChoice[] = [
    { number: targetNumber, variant: targetVariant },
    ...distractorCards.map(card => ({
      number: card.number,
      variant: getDisplayVariant(card, srsManager),
    })),
  ];

  const shuffledChoices = shuffle(choices);
  const correctIndex = shuffledChoices.findIndex(c => c.number === targetNumber);

  return {
    id: `drill_${++drillCounter}_${Date.now()}`,
    type,
    targetNumber,
    targetVariant,
    choices: shuffledChoices,
    correctIndex,
  };
}

export function generatePiSequenceDrill(
  deck: Deck,
  srsManager: SRSManager,
  sequenceLength: number = 3
): PiSequenceDrill {
  const startIndex = Math.floor(Math.random() * (PI_DIGITS_PAIRS.length - sequenceLength));
  const sequenceNumbers = PI_DIGITS_PAIRS.slice(startIndex, startIndex + sequenceLength);
  
  const sequence = sequenceNumbers.map(num => {
    const card = deck.cards.find(c => c.number === num);
    if (!card) {
      const fallbackCard = deck.cards[Math.floor(Math.random() * deck.cards.length)];
      return {
        number: fallbackCard.number,
        variant: getDisplayVariant(fallbackCard, srsManager),
      };
    }
    return {
      number: num,
      variant: getDisplayVariant(card, srsManager),
    };
  });

  return {
    id: `pi_drill_${++drillCounter}_${Date.now()}`,
    type: "PI_SEQUENCE",
    sequence,
    displayNumbers: sequenceNumbers.join(" "),
  };
}

export function generateHistoricalDateDrill(
  dateEntry: HistoricalDateEntry,
  deck: Deck,
  srsManager: SRSManager
): HistoricalDateDrill {
  const dateDigits = dateEntry.date.replace(/[^0-9]/g, "");
  const pairs: string[] = [];
  
  for (let i = 0; i < dateDigits.length; i += 2) {
    if (i + 1 < dateDigits.length) {
      pairs.push(dateDigits.substring(i, i + 2));
    }
  }

  const cards = pairs.map(num => {
    const card = deck.cards.find(c => c.number === num);
    if (!card) {
      const fallbackNum = num.padStart(2, "0");
      const fallbackCard = deck.cards.find(c => c.number === fallbackNum) || deck.cards[0];
      return {
        number: fallbackCard.number,
        variant: getDisplayVariant(fallbackCard, srsManager),
      };
    }
    return {
      number: num,
      variant: getDisplayVariant(card, srsManager),
    };
  });

  return {
    id: `hist_drill_${++drillCounter}_${Date.now()}`,
    type: "HISTORICAL_DATE",
    dateEntry,
    cards,
    correctAnswer: dateEntry.date,
  };
}

export function generateSession(
  srsManager: SRSManager,
  deck: Deck,
  historicalDates?: HistoricalDateEntry[],
  sessionSize?: number
): Drill[] {
  const cardNumbers = generateSessionCards(srsManager, deck, sessionSize);
  
  for (const num of cardNumbers) {
    if (!srsManager.isIntroduced(num)) {
      srsManager.introduceCard(num);
    }
  }

  const drills: Drill[] = [];
  
  for (let i = 0; i < cardNumbers.length; i++) {
    const piCount = drills.filter(d => d.type === "PI_SEQUENCE").length;
    const histCount = drills.filter(d => d.type === "HISTORICAL_DATE").length;
    
    if (Math.random() < PI_SEQUENCE_CHANCE && piCount < 2) {
      drills.push(generatePiSequenceDrill(deck, srsManager));
    } else if (historicalDates && historicalDates.length > 0 && Math.random() < HISTORICAL_DATE_CHANCE && histCount < 2) {
      const randomDate = historicalDates[Math.floor(Math.random() * historicalDates.length)];
      drills.push(generateHistoricalDateDrill(randomDate, deck, srsManager));
    } else {
      drills.push(generateStandardDrill(cardNumbers[i], deck, srsManager));
    }
  }

  return drills;
}
