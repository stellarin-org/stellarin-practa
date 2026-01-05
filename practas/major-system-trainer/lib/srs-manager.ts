import { PractaStorage } from "@/lib/practa-storage";
import { CardState, SRSState, MasteryLevel, getMastery, Deck } from "./types";

const SRS_STATE_KEY = "srs_state";
const INTERVAL_PROGRESSION = [1, 3, 7, 14, 30];
const MAX_INTERVAL = 30;

export class SRSManager {
  private storage: PractaStorage;
  private state: SRSState;
  private deck: Deck;

  constructor(storage: PractaStorage, deck: Deck, initialState?: SRSState) {
    this.storage = storage;
    this.deck = deck;
    this.state = initialState || {
      cards: {},
      confusion_matrix: {},
      introduced_order: [],
    };
  }

  static async load(storage: PractaStorage, deck: Deck): Promise<SRSManager> {
    const savedState = await storage.get<SRSState>(SRS_STATE_KEY);
    return new SRSManager(storage, deck, savedState || undefined);
  }

  async save(): Promise<void> {
    await this.storage.set(SRS_STATE_KEY, this.state);
  }

  getCardState(number: string): CardState {
    if (!this.state.cards[number]) {
      this.state.cards[number] = {
        number,
        due_at: 0,
        interval_days: 0,
        correct_streak: 0,
        lapse_count: 0,
        last_seen_at: 0,
        last_result: null,
        preferred_variant_id: null,
      };
    }
    return this.state.cards[number];
  }

  getMastery(number: string): MasteryLevel {
    return getMastery(this.getCardState(number));
  }

  isIntroduced(number: string): boolean {
    return this.state.introduced_order.includes(number);
  }

  introduceCard(number: string): void {
    if (!this.isIntroduced(number)) {
      this.state.introduced_order.push(number);
      const cardState = this.getCardState(number);
      cardState.due_at = Date.now();
    }
  }

  recordAnswer(number: string, isCorrect: boolean, chosenNumber?: string): void {
    const cardState = this.getCardState(number);
    const now = Date.now();
    
    cardState.last_seen_at = now;
    cardState.last_result = isCorrect ? "correct" : "incorrect";

    if (isCorrect) {
      cardState.correct_streak += 1;
      
      if (cardState.interval_days === 0) {
        cardState.interval_days = INTERVAL_PROGRESSION[0];
      } else {
        const currentIdx = INTERVAL_PROGRESSION.indexOf(cardState.interval_days);
        if (currentIdx >= 0 && currentIdx < INTERVAL_PROGRESSION.length - 1) {
          cardState.interval_days = INTERVAL_PROGRESSION[currentIdx + 1];
        } else if (currentIdx === INTERVAL_PROGRESSION.length - 1) {
          cardState.interval_days = MAX_INTERVAL;
        } else {
          const nextIdx = INTERVAL_PROGRESSION.findIndex(i => i > cardState.interval_days);
          if (nextIdx >= 0) {
            cardState.interval_days = INTERVAL_PROGRESSION[nextIdx];
          } else {
            cardState.interval_days = MAX_INTERVAL;
          }
        }
      }
    } else {
      cardState.interval_days = INTERVAL_PROGRESSION[0];
      cardState.correct_streak = 0;
      cardState.lapse_count += 1;
      
      if (chosenNumber && chosenNumber !== number) {
        this.recordConfusion(number, chosenNumber);
      }
    }

    cardState.due_at = now + cardState.interval_days * 24 * 60 * 60 * 1000;
  }

  private recordConfusion(correctNumber: string, chosenNumber: string): void {
    if (!this.state.confusion_matrix[correctNumber]) {
      this.state.confusion_matrix[correctNumber] = {};
    }
    this.state.confusion_matrix[correctNumber][chosenNumber] = 
      (this.state.confusion_matrix[correctNumber][chosenNumber] || 0) + 1;
  }

  getConfusions(number: string): [string, number][] {
    const confusions = this.state.confusion_matrix[number] || {};
    return Object.entries(confusions).sort((a, b) => b[1] - a[1]);
  }

  getDueCards(): string[] {
    const now = Date.now();
    return this.state.introduced_order.filter(num => {
      const state = this.state.cards[num];
      return state && state.due_at <= now;
    });
  }

  getNewCards(): string[] {
    const allNumbers = this.deck.cards.map(c => c.number);
    return allNumbers.filter(num => !this.isIntroduced(num));
  }

  getRecentlyWrong(): string[] {
    return this.state.introduced_order
      .filter(num => {
        const state = this.state.cards[num];
        return state && state.last_result === "incorrect";
      })
      .sort((a, b) => {
        const stateA = this.state.cards[a];
        const stateB = this.state.cards[b];
        return (stateB?.last_seen_at || 0) - (stateA?.last_seen_at || 0);
      });
  }

  setPreferredVariant(number: string, variantId: string): void {
    const cardState = this.getCardState(number);
    cardState.preferred_variant_id = variantId;
  }

  getPreferredVariant(number: string): string | null {
    return this.getCardState(number).preferred_variant_id;
  }

  getStats(): {
    introduced: number;
    dueNow: number;
    mastered: number;
    learning: number;
    total: number;
  } {
    const introduced = this.state.introduced_order.length;
    const dueNow = this.getDueCards().length;
    let mastered = 0;
    let learning = 0;

    for (const num of this.state.introduced_order) {
      const mastery = this.getMastery(num);
      if (mastery === "MASTERED") mastered++;
      else if (mastery === "LEARNING") learning++;
    }

    return {
      introduced,
      dueNow,
      mastered,
      learning,
      total: 99,
    };
  }
}
