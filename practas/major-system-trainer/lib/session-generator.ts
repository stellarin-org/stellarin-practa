import { Deck, Card, CardVariant, Drill, DrillChoice, DrillType } from "./types";
import { SRSManager } from "./srs-manager";

const SESSION_SIZE = 10;
const NEW_CARD_RATIO = 0.3;
const DRILL_TYPES: DrillType[] = ["NUMBER_TO_IMAGE", "IMAGE_TO_NUMBER", "NUMBER_TO_WORD"];

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
  deck: Deck
): string[] {
  const dueCards = shuffle(srsManager.getDueCards());
  const targetNewCount = Math.floor(SESSION_SIZE * NEW_CARD_RATIO);
  
  let sessionCards: string[] = [];

  const dueToUse = dueCards.slice(0, SESSION_SIZE - targetNewCount);
  sessionCards = [...dueToUse];

  const neededNewCards = SESSION_SIZE - sessionCards.length;
  const newCards = selectNewCardsForSession(srsManager, deck, neededNewCards);
  sessionCards.push(...newCards);

  if (sessionCards.length < SESSION_SIZE) {
    const recentlyWrong = srsManager.getRecentlyWrong()
      .filter(n => !sessionCards.includes(n));
    sessionCards.push(...recentlyWrong.slice(0, SESSION_SIZE - sessionCards.length));
  }

  if (sessionCards.length < SESSION_SIZE && dueCards.length > dueToUse.length) {
    sessionCards.push(...dueCards.slice(dueToUse.length, SESSION_SIZE));
  }

  if (sessionCards.length < SESSION_SIZE) {
    const additionalNew = selectNewCardsForSession(srsManager, deck, SESSION_SIZE)
      .filter(n => !sessionCards.includes(n));
    sessionCards.push(...additionalNew.slice(0, SESSION_SIZE - sessionCards.length));
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

function selectDrillType(targetCard: Card, srsManager: SRSManager): DrillType {
  const weights: [DrillType, number][] = [
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

  return DRILL_TYPES[0];
}

export function generateDrill(
  targetNumber: string,
  deck: Deck,
  srsManager: SRSManager,
  forceType?: DrillType
): Drill {
  const targetCard = deck.cards.find(c => c.number === targetNumber);
  if (!targetCard) {
    throw new Error(`Card not found: ${targetNumber}`);
  }

  const targetVariant = getDisplayVariant(targetCard, srsManager);
  const type = forceType || selectDrillType(targetCard, srsManager);
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

export function generateSession(
  srsManager: SRSManager,
  deck: Deck
): Drill[] {
  const cardNumbers = generateSessionCards(srsManager, deck);
  
  for (const num of cardNumbers) {
    if (!srsManager.isIntroduced(num)) {
      srsManager.introduceCard(num);
    }
  }

  return cardNumbers.map(num => generateDrill(num, deck, srsManager));
}
