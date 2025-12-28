import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaContext, PractaCompleteHandler } from "@/types/flow";
import { WORDS } from "./wordlist";
import { VALID_WORDS } from "./validWords";

const WORD_LENGTH = 6;
const MAX_GUESSES = 6;

function getDailyWord(): string {
  const startDate = Date.UTC(2025, 0, 1);
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayIndex = Math.floor((todayUTC - startDate) / (1000 * 60 * 60 * 24));
  const safeIndex = ((dayIndex % WORDS.length) + WORDS.length) % WORDS.length;
  return WORDS[safeIndex];
}

type LetterState = "empty" | "filled" | "correct" | "present" | "absent";

function evaluateGuess(guess: string, target: string): LetterState[] {
  const result: LetterState[] = new Array(guess.length).fill("absent");
  const targetLetterCounts: Record<string, number> = {};
  
  for (const letter of target) {
    targetLetterCounts[letter] = (targetLetterCounts[letter] || 0) + 1;
  }
  
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === target[i]) {
      result[i] = "correct";
      targetLetterCounts[guess[i]]--;
    }
  }
  
  for (let i = 0; i < guess.length; i++) {
    if (result[i] !== "correct" && targetLetterCounts[guess[i]] > 0) {
      result[i] = "present";
      targetLetterCounts[guess[i]]--;
    }
  }
  
  return result;
}

interface LetterTileProps {
  letter: string;
  state: LetterState;
  delay?: number;
  shake?: boolean;
}

function LetterTile({ letter, state, delay = 0, shake = false }: LetterTileProps) {
  const { theme, isDark } = useTheme();
  const flipProgress = useSharedValue(0);
  const shakeOffset = useSharedValue(0);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (state === "correct" || state === "present" || state === "absent") {
      flipProgress.value = withDelay(
        delay,
        withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) }, () => {
          runOnJS(setShowResult)(true);
        })
      );
    }
  }, [state, delay]);

  useEffect(() => {
    if (shake) {
      shakeOffset.value = withSequence(
        withTiming(-5, { duration: 50 }),
        withTiming(5, { duration: 50 }),
        withTiming(-5, { duration: 50 }),
        withTiming(5, { duration: 50 }),
        withTiming(0, { duration: 50 })
      );
    }
  }, [shake]);

  const getBackgroundColor = () => {
    if (!showResult) {
      return state === "filled" ? theme.backgroundSecondary : theme.backgroundDefault;
    }
    switch (state) {
      case "correct":
        return "#538D4E";
      case "present":
        return "#B59F3B";
      case "absent":
        return isDark ? "#3A3A3C" : "#787C7E";
      default:
        return theme.backgroundSecondary;
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shakeOffset.value },
      { perspective: 300 },
      { rotateX: `${flipProgress.value * 180}deg` },
    ],
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotateX: flipProgress.value > 0.5 ? "180deg" : "0deg" }],
    opacity: flipProgress.value > 0.5 ? 1 : 1,
  }));

  return (
    <Animated.View
      style={[
        styles.tile,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: state === "filled" ? theme.textSecondary : theme.border,
        },
        animatedStyle,
      ]}
    >
      <Animated.View style={textAnimatedStyle}>
        <ThemedText
          style={[
            styles.tileLetter,
            showResult && { color: "#FFFFFF" },
          ]}
        >
          {letter}
        </ThemedText>
      </Animated.View>
    </Animated.View>
  );
}

interface KeyboardKeyProps {
  letter: string;
  state?: LetterState;
  onPress: (letter: string) => void;
  wide?: boolean;
}

function KeyboardKey({ letter, state, onPress, wide }: KeyboardKeyProps) {
  const { theme, isDark } = useTheme();

  const getBackgroundColor = () => {
    switch (state) {
      case "correct":
        return "#538D4E";
      case "present":
        return "#B59F3B";
      case "absent":
        return isDark ? "#3A3A3C" : "#787C7E";
      default:
        return isDark ? "#818384" : "#D3D6DA";
    }
  };

  const textColor = state === "correct" || state === "present" || state === "absent" ? "#FFFFFF" : theme.text;

  return (
    <Pressable
      onPress={() => onPress(letter)}
      style={[
        styles.key,
        wide && styles.wideKey,
        { backgroundColor: getBackgroundColor() },
      ]}
    >
      <ThemedText style={[styles.keyText, { color: textColor }]}>
        {letter}
      </ThemedText>
    </Pressable>
  );
}

interface MyPractaProps {
  context: PractaContext;
  onComplete: PractaCompleteHandler;
  onSkip?: () => void;
}

type GameState = "playing" | "won" | "lost";

export default function MyPracta({ context, onComplete, onSkip }: MyPractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const targetWord = useMemo(() => getDailyWord(), []);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [gameState, setGameState] = useState<GameState>("playing");
  const [shakeRow, setShakeRow] = useState(-1);
  const [letterStates, setLetterStates] = useState<Record<string, LetterState>>({});

  const triggerHaptic = useCallback((type: "light" | "success" | "error") => {
    if (Platform.OS === "web") return;
    if (type === "light") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (type === "success") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, []);

  const getGuessStates = useCallback((guess: string): LetterState[] => {
    return evaluateGuess(guess, targetWord);
  }, [targetWord]);

  const handleKeyPress = useCallback((key: string) => {
    if (gameState !== "playing") return;

    if (key === "ENTER") {
      if (currentGuess.length !== WORD_LENGTH) {
        setShakeRow(guesses.length);
        triggerHaptic("error");
        setTimeout(() => setShakeRow(-1), 300);
        return;
      }

      if (!VALID_WORDS.has(currentGuess)) {
        setShakeRow(guesses.length);
        triggerHaptic("error");
        setTimeout(() => setShakeRow(-1), 300);
        return;
      }

      const newGuesses = [...guesses, currentGuess];
      setGuesses(newGuesses);
      setCurrentGuess("");

      const states = evaluateGuess(currentGuess, targetWord);
      const newLetterStates = { ...letterStates };
      for (let i = 0; i < WORD_LENGTH; i++) {
        const letter = currentGuess[i];
        const state = states[i];
        if (!newLetterStates[letter] || state === "correct" || (state === "present" && newLetterStates[letter] === "absent")) {
          newLetterStates[letter] = state;
        }
      }
      setLetterStates(newLetterStates);

      if (currentGuess === targetWord) {
        triggerHaptic("success");
        setTimeout(() => setGameState("won"), 1500);
      } else if (newGuesses.length >= MAX_GUESSES) {
        triggerHaptic("error");
        setTimeout(() => setGameState("lost"), 1500);
      } else {
        triggerHaptic("light");
      }
    } else if (key === "DEL") {
      setCurrentGuess((prev) => prev.slice(0, -1));
      triggerHaptic("light");
    } else if (currentGuess.length < WORD_LENGTH) {
      setCurrentGuess((prev) => prev + key);
      triggerHaptic("light");
    }
  }, [gameState, currentGuess, guesses, targetWord, letterStates, triggerHaptic]);

  const handleComplete = useCallback(() => {
    triggerHaptic("success");
    onComplete({
      content: {
        type: "text",
        value: gameState === "won" 
          ? `Solved in ${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"}!`
          : `The word was ${targetWord}`,
      },
      metadata: {
        completedAt: Date.now(),
        won: gameState === "won",
        attempts: guesses.length,
        word: targetWord,
      },
    });
  }, [gameState, guesses.length, targetWord, onComplete, triggerHaptic]);

  const renderGrid = () => {
    const rows = [];
    for (let i = 0; i < MAX_GUESSES; i++) {
      const guess = guesses[i] || (i === guesses.length ? currentGuess : "");
      const isSubmitted = i < guesses.length;
      const isShaking = shakeRow === i;
      const guessStates = isSubmitted ? getGuessStates(guesses[i]) : [];

      const cells = [];
      for (let j = 0; j < WORD_LENGTH; j++) {
        const letter = guess[j] || "";
        let state: LetterState = letter ? "filled" : "empty";
        if (isSubmitted) {
          state = guessStates[j];
        }
        cells.push(
          <LetterTile
            key={j}
            letter={letter}
            state={state}
            delay={isSubmitted ? j * 100 : 0}
            shake={isShaking}
          />
        );
      }
      rows.push(
        <View key={i} style={styles.row}>
          {cells}
        </View>
      );
    }
    return rows;
  };

  const KEYBOARD_ROWS = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "DEL"],
  ];

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.md }]}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>One Word a Day</ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
          Guess the 6-letter word
        </ThemedText>
      </View>

      <View style={styles.grid}>{renderGrid()}</View>

      {gameState === "playing" ? (
        <View style={[styles.keyboard, { paddingBottom: insets.bottom + Spacing.sm }]}>
          {KEYBOARD_ROWS.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.keyboardRow}>
              {row.map((key) => (
                <KeyboardKey
                  key={key}
                  letter={key}
                  state={letterStates[key]}
                  onPress={handleKeyPress}
                  wide={key === "ENTER" || key === "DEL"}
                />
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.resultContainer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={[styles.resultCard, { backgroundColor: theme.backgroundSecondary }]}>
            <ThemedText style={styles.resultTitle}>
              {gameState === "won" ? "Congratulations!" : "Better luck tomorrow!"}
            </ThemedText>
            <ThemedText style={[styles.resultText, { color: theme.textSecondary }]}>
              {gameState === "won"
                ? `You got it in ${guesses.length} ${guesses.length === 1 ? "try" : "tries"}!`
                : `The word was ${targetWord}`}
            </ThemedText>
          </View>
          <Pressable
            onPress={handleComplete}
            style={[styles.completeButton, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.completeButtonText}>Continue</ThemedText>
          </Pressable>
          {onSkip ? (
            <Pressable onPress={onSkip} style={styles.skipButton}>
              <ThemedText style={[styles.skipText, { color: theme.textSecondary }]}>
                Skip
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    marginTop: Spacing.xs,
  },
  grid: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  row: {
    flexDirection: "row",
    gap: 5,
    marginBottom: 5,
  },
  tile: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  tileLetter: {
    fontSize: 28,
    fontWeight: "700",
  },
  keyboard: {
    paddingHorizontal: Spacing.xs,
  },
  keyboardRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
    marginBottom: 6,
  },
  key: {
    minWidth: 30,
    height: 52,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  wideKey: {
    minWidth: 50,
    paddingHorizontal: 12,
  },
  keyText: {
    fontSize: 14,
    fontWeight: "600",
  },
  resultContainer: {
    paddingHorizontal: Spacing.lg,
  },
  resultCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  resultText: {
    fontSize: 16,
  },
  completeButton: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  completeButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
  skipButton: {
    padding: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  skipText: {
    fontSize: 14,
  },
});
