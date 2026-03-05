import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { PractaAI } from "@/lib/practa-ai";

export type GameState = "playing" | "won" | "lost";
export type LetterState = "empty" | "filled" | "correct" | "correctDouble" | "present" | "absent" | "pending";

const AI_COMMENT_INTERVAL = 20000;

function buildAIPrompt(
  guesses: string[],
  targetWord: string,
  gameState: GameState,
  remainingRows: number,
  letterStates: Record<string, LetterState>,
  partialGuess: string,
): string {
  const typingInfo = partialGuess && partialGuess.length > 0 && partialGuess.length < 6
    ? `\nCurrently typing: "${partialGuess}" (${partialGuess.length}/6 letters typed — they seem stuck mid-word!)`
    : "";

  const guessDetails = (guesses || []).map((g: string, i: number) => {
    const result = g.split("").map((letter: string, j: number) => {
      if (letter === targetWord[j]) return `${letter}(green)`;
      if (targetWord.includes(letter)) return `${letter}(yellow)`;
      return `${letter}(gray)`;
    }).join(" ");
    return `Guess ${i + 1}: ${result}`;
  }).join("\n");

  const greenPositions: string[] = Array(6).fill("_");
  const yellowLetters = new Set<string>();
  const grayLetters = new Set<string>();

  for (const guess of (guesses || [])) {
    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i];
      if (letter === targetWord[i]) {
        greenPositions[i] = letter;
      } else if (targetWord.includes(letter)) {
        yellowLetters.add(letter);
      } else {
        grayLetters.add(letter);
      }
    }
  }

  const hasInfo = guesses && guesses.length > 0;
  let knownInfo = "";
  if (hasInfo) {
    const pattern = greenPositions.join("");
    const yellows = Array.from(yellowLetters).join(", ") || "none";
    const grays = Array.from(grayLetters).join(", ") || "none";
    knownInfo = `\n\nWhat we know:\n- Pattern: ${pattern}\n- Yellow (in word, wrong spot): ${yellows}\n- Gray (not in word): ${grays}`;

    if (yellowLetters.size > 0) {
      knownInfo += `\n- CONSTRAINT: Any word suggestion MUST contain: ${Array.from(yellowLetters).join(", ")}`;
    }
    if (grayLetters.size > 0) {
      knownInfo += `\n- CONSTRAINT: Any word suggestion MUST NOT contain: ${Array.from(grayLetters).join(", ")}`;
    }
  }

  let situationNote = "";
  const remaining = remainingRows - (guesses?.length || 0);
  if (remaining <= 2 && remaining > 0) {
    situationNote = `\n\nPRESSURE: Only ${remaining} guess${remaining === 1 ? "" : "es"} left! Be urgent but encouraging.`;
  }
  if (gameState === "won") {
    situationNote = "\n\nTHEY GOT IT! Celebrate like you both cracked it together!";
  }
  if (gameState === "lost") {
    situationNote = `\n\nThey ran out of guesses. The word was ${targetWord}. Be a supportive friend.`;
  }

  return `You're playing a 6-letter word guessing game together with someone as their co-player buddy. You do NOT know the answer. You're figuring it out together based on the clues.

Game right now:
- Guess ${guesses?.length || 0} of ${remainingRows || 6}
- Status: ${gameState}
${guessDetails ? `\n${guessDetails}` : "\nNo guesses yet — you're both staring at an empty board."}${typingInfo}${knownInfo}${situationNote}

How to be:
- You're a co-player, not a spectator. You're solving this together. Think out loud like a friend would.
- ACTIVELY HELP by analyzing the pattern. Look at the known green positions, yellow letters, and eliminated letters and reason about what fits.
- Suggest specific words that could work! "what about PRINCE?" or "try DUSTER maybe?" — real six-letter words only.
- CRITICAL: Any word you suggest MUST include ALL yellow letters and MUST NOT use any gray letters. Double-check before suggesting. If E is yellow, your suggestion must contain E. If S is gray, your suggestion must NOT contain S.
- Point out letter patterns: "words ending in -LY are common" or "that E and R combo... maybe -ER ending?" or "I bet it ends in -ED or -ING" or "double letters maybe?"
- Comment on their actual guess: "oh smart, that tested a lot of new letters" or "hmm same letters as before, let's try something different"
- If they're mid-word (partially typed), notice it! Comment on what they're spelling so far — "ooh are you going for something starting with CR?" or help them finish it: "CRA... CRATER maybe?" or encourage them: "I like where you're going with that"
- React naturally. Excited by greens, intrigued by yellows, bummed by all-grays.
- If no guesses yet, suggest a good starting strategy or word.
- When they win: celebrate like you both cracked it together.
- When they lose: be a supportive friend, not patronizing.
- Talk like texting a friend. Casual, lowercase fine. No emojis.

Reply with JUST ONE short comment (max 120 chars). No quotes around it. No prefixes. Just the comment.`;
}

export function useAICoPlayer(
  gameState: GameState,
  guesses: string[],
  targetWord: string,
  remainingRows: number,
  letterStates: Record<string, LetterState>,
  aiEnabled: boolean,
  currentGuess: string,
  ai?: PractaAI,
) {
  const [comment, setComment] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGuessCountRef = useRef(0);
  const hasFetchedInitialRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentGuessRef = useRef(currentGuess);
  currentGuessRef.current = currentGuess;

  const fetchComment = useCallback(async () => {
    if (!aiEnabled || !targetWord || !ai) return;
    setIsLoading(true);
    try {
      const partial = currentGuessRef.current;
      const prompt = buildAIPrompt(guesses, targetWord, gameState, remainingRows, letterStates, partial);

      const result = await ai.gemini({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 1.0,
          thinkingConfig: { thinkingBudget: 1024 },
        },
      });

      const raw = result?.text || "";
      const cleaned = raw.replace(/^["']+|["']+$/g, "").trim().split("\n")[0].trim();
      if (cleaned && cleaned.length <= 150) {
        setComment(cleaned);
        setVisible(true);
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = setTimeout(() => setVisible(false), 8000);
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  }, [aiEnabled, targetWord, guesses, gameState, remainingRows, letterStates, ai]);

  useEffect(() => {
    if (!aiEnabled || gameState !== "playing" || !targetWord) return;

    if (!hasFetchedInitialRef.current) {
      hasFetchedInitialRef.current = true;
      const delay = setTimeout(() => fetchComment(), 3000);
      return () => clearTimeout(delay);
    }
  }, [aiEnabled, gameState, targetWord]);

  useEffect(() => {
    if (!aiEnabled || gameState !== "playing") return;

    if (guesses.length > lastGuessCountRef.current) {
      lastGuessCountRef.current = guesses.length;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fetchComment(), 2000);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [guesses.length, aiEnabled, gameState, fetchComment]);

  useEffect(() => {
    if (!aiEnabled || gameState !== "playing" || !targetWord) return;

    const interval = setInterval(() => {
      if (!isLoading) fetchComment();
    }, AI_COMMENT_INTERVAL);

    return () => clearInterval(interval);
  }, [aiEnabled, gameState, targetWord, isLoading, fetchComment]);

  useEffect(() => {
    if (gameState !== "playing" && aiEnabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      const endDelay = setTimeout(() => fetchComment(), 1500);
      return () => clearTimeout(endDelay);
    }
  }, [gameState, aiEnabled, fetchComment]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  return { comment, visible, isLoading, dismiss };
}

export function AICoPlayerBubble({ comment, visible, onDismiss }: { comment: string | null; visible: boolean; onDismiss: () => void }) {
  const { theme, isDark } = useTheme();

  return (
    <View style={styles.aiBubbleContainer}>
      {visible && comment ? (
        <Animated.View
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
        >
          <Pressable onPress={onDismiss} style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
            <View style={[
              styles.aiBubble,
              { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)" },
            ]}>
              <Feather name="message-circle" size={14} color={theme.primary} style={{ marginTop: 1 }} />
              <ThemedText style={[styles.aiBubbleText, { color: theme.text }]}>{comment}</ThemedText>
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  aiBubbleContainer: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    height: 32,
    justifyContent: "center",
    zIndex: 50,
  },
  aiBubble: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
  },
  aiBubbleText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: "italic",
  },
});
