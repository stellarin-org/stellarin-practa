import { Deck, Card, CardVariant, Phoneme, DIGIT_PHONEMES } from "./types";

const TEST_MODE = false;
const TEST_CARD_RANGE = ["01", "02", "03", "04"];

export interface ValidationError {
  card?: string;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export function validateDeck(deck: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!deck || typeof deck !== "object") {
    return { valid: false, errors: [{ field: "deck", message: "Deck is not a valid object" }], warnings };
  }

  const d = deck as Record<string, unknown>;

  if (d.version !== 2) {
    errors.push({ field: "version", message: `Expected version 2, got ${d.version}` });
  }

  if (typeof d.count !== "number" || d.count !== 100) {
    errors.push({ field: "count", message: `Expected count 100, got ${d.count}` });
  }

  if (!Array.isArray(d.cards)) {
    return { valid: false, errors: [{ field: "cards", message: "Cards must be an array" }], warnings };
  }

  if (d.cards.length !== 100) {
    errors.push({ field: "cards", message: `Expected 100 cards, got ${d.cards.length}` });
  }

  const seenNumbers = new Set<string>();
  const seenVariantIds = new Set<string>();
  const seenImageNames = new Set<string>();

  for (let i = 0; i < d.cards.length; i++) {
    const card = d.cards[i] as Record<string, unknown>;
    const cardErrors = validateCard(card, i, seenNumbers, seenVariantIds, seenImageNames);
    errors.push(...cardErrors.errors);
    warnings.push(...cardErrors.warnings);
  }

  for (let n = 0; n <= 99; n++) {
    const numStr = n.toString().padStart(2, "0");
    if (!seenNumbers.has(numStr)) {
      errors.push({ field: "cards", message: `Missing card for number ${numStr}` });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateCard(
  card: Record<string, unknown>,
  index: number,
  seenNumbers: Set<string>,
  seenVariantIds: Set<string>,
  seenImageNames: Set<string>
): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const num = card.number as string;

  if (typeof num !== "string" || !/^[0-9]{2}$/.test(num)) {
    errors.push({ card: `[${index}]`, field: "number", message: `Invalid number format: ${num}` });
    return { errors, warnings };
  }

  if (seenNumbers.has(num)) {
    errors.push({ card: num, field: "number", message: "Duplicate number" });
  }
  seenNumbers.add(num);

  const digits = card.digits as number[];
  if (!Array.isArray(digits) || digits.length !== 2) {
    errors.push({ card: num, field: "digits", message: "digits must be array of 2 numbers" });
  } else {
    const expectedTens = parseInt(num[0], 10);
    const expectedOnes = parseInt(num[1], 10);
    if (digits[0] !== expectedTens || digits[1] !== expectedOnes) {
      errors.push({ card: num, field: "digits", message: `digits ${digits} don't match number ${num}` });
    }
  }

  const variants = card.variants as CardVariant[];
  if (!Array.isArray(variants) || variants.length === 0) {
    errors.push({ card: num, field: "variants", message: "Must have at least one variant" });
    return { errors, warnings };
  }

  const primaryId = card.primary_variant as string;
  let primaryFound = false;

  for (const variant of variants) {
    if (variant.id === primaryId) primaryFound = true;

    if (seenVariantIds.has(variant.id)) {
      warnings.push({ card: num, field: `variant.${variant.id}`, message: "Duplicate variant ID" });
    }
    seenVariantIds.add(variant.id);

    if (seenImageNames.has(variant.image)) {
      warnings.push({ card: num, field: `variant.${variant.id}.image`, message: `Duplicate image name: ${variant.image}` });
    }
    seenImageNames.add(variant.image);

    const phonemes = variant.phonemes;
    if (!Array.isArray(phonemes) || phonemes.length !== 2) {
      errors.push({ card: num, field: `variant.${variant.id}.phonemes`, message: "phonemes must be array of 2" });
    } else {
      const d = digits as [number, number];
      if (!DIGIT_PHONEMES[d[0]]?.includes(phonemes[0] as Phoneme)) {
        errors.push({
          card: num,
          field: `variant.${variant.id}.phonemes[0]`,
          message: `'${phonemes[0]}' not valid for digit ${d[0]}`,
        });
      }
      if (!DIGIT_PHONEMES[d[1]]?.includes(phonemes[1] as Phoneme)) {
        errors.push({
          card: num,
          field: `variant.${variant.id}.phonemes[1]`,
          message: `'${phonemes[1]}' not valid for digit ${d[1]}`,
        });
      }
    }
  }

  if (!primaryFound) {
    errors.push({ card: num, field: "primary_variant", message: `Primary variant '${primaryId}' not found in variants` });
  }

  return { errors, warnings };
}

export function loadAndValidateDeck(deckData: unknown): Deck {
  const result = validateDeck(deckData);
  
  if (!result.valid) {
    const errorMsg = result.errors.slice(0, 5).map(e => 
      `${e.card ? `[${e.card}] ` : ""}${e.field}: ${e.message}`
    ).join("\n");
    throw new Error(`Invalid deck:\n${errorMsg}`);
  }

  if (result.warnings.length > 0) {
    console.warn("Deck validation warnings:", result.warnings);
  }

  const deck = deckData as Deck;

  if (TEST_MODE) {
    const filteredCards = deck.cards.filter(card => TEST_CARD_RANGE.includes(card.number));
    return {
      ...deck,
      count: filteredCards.length,
      cards: filteredCards,
    };
  }

  return deck;
}
