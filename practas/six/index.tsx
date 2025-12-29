import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { View, StyleSheet, Pressable, Platform, Image, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  withSpring,
  Easing,
  runOnJS,
  interpolate,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaContext, PractaCompleteHandler } from "@/types/flow";
import { WORDS } from "./wordlist";
import { VALID_WORDS } from "./validWords";
import { ImageSourcePropType } from "react-native";

const WORD_LENGTH = 6;
const INITIAL_ROWS = 6;

const COLORS = {
  correct: "#6AAA64",
  present: "#C9B458",
  absent: { dark: "#3A3A3C", light: "#787C7E" },
  tile: { dark: "#121213", light: "#FFFFFF" },
  tileBorder: { dark: "#3A3A3C", light: "#D3D6DA" },
  tileBorderFilled: { dark: "#565758", light: "#878A8C" },
  key: { dark: "#818384", light: "#D3D6DA" },
};

interface ResponsiveSizes {
  tileSize: number;
  tileGap: number;
  tileFontSize: number;
  keyHeight: number;
  keyFontSize: number;
  keyGap: number;
  keyRowGap: number;
  logoHeight: number;
  headerSpacing: number;
  isCompact: boolean;
}

const SizingContext = createContext<ResponsiveSizes>({
  tileSize: 52,
  tileGap: 6,
  tileFontSize: 26,
  keyHeight: 56,
  keyFontSize: 14,
  keyGap: 5,
  keyRowGap: 8,
  logoHeight: 40,
  headerSpacing: 16,
  isCompact: false,
});

function useResponsiveSizes(): ResponsiveSizes {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  
  return useMemo(() => {
    const availableHeight = height - insets.top - insets.bottom;
    const isCompact = availableHeight < 680;
    const isVeryCompact = availableHeight < 580;
    
    const tileSize = isVeryCompact ? 38 : isCompact ? 44 : 52;
    const tileGap = isVeryCompact ? 4 : isCompact ? 5 : 6;
    const tileFontSize = isVeryCompact ? 20 : isCompact ? 22 : 26;
    
    const keyHeight = isVeryCompact ? 42 : isCompact ? 48 : 56;
    const keyFontSize = isVeryCompact ? 12 : 14;
    const keyGap = isVeryCompact ? 3 : isCompact ? 4 : 5;
    const keyRowGap = isVeryCompact ? 5 : isCompact ? 6 : 8;
    
    const logoHeight = isCompact ? 30 : 40;
    const headerSpacing = isCompact ? 8 : 16;
    
    return {
      tileSize,
      tileGap,
      tileFontSize,
      keyHeight,
      keyFontSize,
      keyGap,
      keyRowGap,
      logoHeight,
      headerSpacing,
      isCompact,
    };
  }, [height, insets]);
}

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

function evaluatePartialGuess(guess: string, target: string): LetterState[] {
  const result: LetterState[] = [];
  const targetLetterCounts: Record<string, number> = {};
  
  for (const letter of target) {
    targetLetterCounts[letter] = (targetLetterCounts[letter] || 0) + 1;
  }
  
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === target[i]) {
      result[i] = "correct";
      targetLetterCounts[guess[i]]--;
    } else {
      result[i] = "pending" as LetterState;
    }
  }
  
  for (let i = 0; i < guess.length; i++) {
    if (result[i] === ("pending" as LetterState)) {
      if (targetLetterCounts[guess[i]] > 0) {
        result[i] = "present";
        targetLetterCounts[guess[i]]--;
      } else {
        result[i] = "absent";
      }
    }
  }
  
  return result;
}

interface LetterTileProps {
  letter: string;
  state: LetterState;
  immediate?: boolean;
  pop?: boolean;
  falling?: boolean;
  fallDelay?: number;
  hidden?: boolean;
}

function LetterTile({ letter, state, immediate = false, pop = false, falling = false, fallDelay = 0, hidden = false }: LetterTileProps) {
  const { isDark } = useTheme();
  const sizes = useContext(SizingContext);
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(hidden ? 0 : 1);

  useEffect(() => {
    if (falling) {
      translateY.value = withDelay(
        fallDelay,
        withTiming(300, { duration: 400, easing: Easing.in(Easing.quad) })
      );
      opacity.value = withDelay(
        fallDelay + 300,
        withTiming(0, { duration: 100 })
      );
    }
  }, [falling, fallDelay]);

  useEffect(() => {
    if (pop && letter) {
      scale.value = withSequence(
        withSpring(1.1, { damping: 10, stiffness: 400 }),
        withSpring(1, { damping: 10, stiffness: 400 })
      );
    }
  }, [letter, pop]);

  const getBackgroundColor = () => {
    if (!immediate && state !== "correct" && state !== "present" && state !== "absent") {
      return isDark ? COLORS.tile.dark : COLORS.tile.light;
    }
    switch (state) {
      case "correct":
        return COLORS.correct;
      case "present":
        return COLORS.present;
      case "absent":
        return isDark ? COLORS.absent.dark : COLORS.absent.light;
      default:
        return isDark ? COLORS.tile.dark : COLORS.tile.light;
    }
  };

  const getBorderColor = () => {
    if (state === "correct" || state === "present" || state === "absent") {
      return "transparent";
    }
    if (state === "filled") {
      return isDark ? COLORS.tileBorderFilled.dark : COLORS.tileBorderFilled.light;
    }
    return isDark ? COLORS.tileBorder.dark : COLORS.tileBorder.light;
  };

  const isRevealed = state === "correct" || state === "present" || state === "absent";

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.tile,
        {
          width: sizes.tileSize,
          height: sizes.tileSize,
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
        },
        animatedStyle,
      ]}
    >
      <ThemedText
        style={[
          styles.tileLetter,
          { fontSize: sizes.tileFontSize },
          isRevealed && { color: "#FFFFFF" },
        ]}
      >
        {letter}
      </ThemedText>
    </Animated.View>
  );
}

interface KeyboardKeyProps {
  letter: string;
  state?: LetterState;
  onPress: (letter: string) => void;
}

interface ToastProps {
  message: string;
  visible: boolean;
}

function Toast({ message, visible }: ToastProps) {
  const sizes = useContext(SizingContext);
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 15, stiffness: 300 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(-100, { duration: 300, easing: Easing.in(Easing.ease) });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.toast, { top: sizes.isCompact ? 80 : 120 }, animatedStyle]} pointerEvents="none">
      <View style={styles.toastContent}>
        <ThemedText style={styles.toastText}>{message}</ThemedText>
      </View>
    </Animated.View>
  );
}

function KeyboardKey({ letter, state, onPress }: KeyboardKeyProps) {
  const { theme, isDark } = useTheme();
  const sizes = useContext(SizingContext);
  const scale = useSharedValue(1);

  const getBackgroundColor = () => {
    switch (state) {
      case "correct":
        return COLORS.correct;
      case "present":
        return COLORS.present;
      case "absent":
        return isDark ? COLORS.absent.dark : COLORS.absent.light;
      default:
        return isDark ? COLORS.key.dark : COLORS.key.light;
    }
  };

  const textColor = state === "correct" || state === "present" || state === "absent" 
    ? "#FFFFFF" 
    : theme.text;

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.92, { duration: 50 }),
      withTiming(1, { duration: 100 })
    );
    onPress(letter);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        style={[styles.key, { backgroundColor: getBackgroundColor(), height: sizes.keyHeight }]}
      >
        <ThemedText style={[styles.keyText, { color: textColor, fontSize: sizes.keyFontSize }]}>
          {letter}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

interface MyPractaProps {
  context: PractaContext;
  onComplete: PractaCompleteHandler;
  onSkip?: () => void;
}

type GameState = "playing" | "won" | "lost";

export default function MyPracta({ context, onComplete, onSkip }: MyPractaProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const sizes = useResponsiveSizes();

  const [showIntro, setShowIntro] = useState(true);
  const introOpacity = useSharedValue(0);
  const gameOpacity = useSharedValue(0);

  useEffect(() => {
    introOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) });
    
    const timer = setTimeout(() => {
      introOpacity.value = withTiming(0, { duration: 500, easing: Easing.in(Easing.ease) }, () => {
        runOnJS(setShowIntro)(false);
      });
      gameOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const introAnimatedStyle = useAnimatedStyle(() => ({
    opacity: introOpacity.value,
  }));

  const gameAnimatedStyle = useAnimatedStyle(() => ({
    opacity: gameOpacity.value,
  }));

  const targetWord = useMemo(() => getDailyWord(), []);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [gameState, setGameState] = useState<GameState>("playing");
  const [letterStates, setLetterStates] = useState<Record<string, LetterState>>({});
  const [remainingRows, setRemainingRows] = useState(INITIAL_ROWS);
  const [fallingRow, setFallingRow] = useState(-1);
  const [hiddenRows, setHiddenRows] = useState<Set<number>>(new Set());
  const [warningMessage, setWarningMessage] = useState("");
  const [popIndex, setPopIndex] = useState(-1);

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

  const currentGuessStates = useMemo(() => {
    if (currentGuess.length === 0) return [];
    return evaluatePartialGuess(currentGuess, targetWord);
  }, [currentGuess, targetWord]);

  const updateKeyboardStates = useCallback((guess: string, states: LetterState[]) => {
    setLetterStates((prev) => {
      const newStates = { ...prev };
      for (let i = 0; i < guess.length; i++) {
        const letter = guess[i];
        const state = states[i];
        if (!newStates[letter] || state === "correct" || (state === "present" && newStates[letter] === "absent")) {
          newStates[letter] = state;
        }
      }
      return newStates;
    });
  }, []);

  const handleKeyPress = useCallback((key: string) => {
    if (gameState !== "playing" || fallingRow !== -1) return;

    const newGuess = currentGuess + key;
    setCurrentGuess(newGuess);
    setPopIndex(currentGuess.length);
    triggerHaptic("light");

    if (newGuess.length === WORD_LENGTH) {
      const states = evaluatePartialGuess(newGuess, targetWord);
      updateKeyboardStates(newGuess, states);

      if (!VALID_WORDS.has(newGuess)) {
        triggerHaptic("error");
        setWarningMessage("Not a valid word - you lost a row!");
        setTimeout(() => setWarningMessage(""), 2000);
        
        const newGuesses = [...guesses, newGuess];
        setGuesses(newGuesses);
        setCurrentGuess("");
        setPopIndex(-1);
        
        const newRemainingRows = remainingRows - 1;
        const rowToFall = newRemainingRows;
        setFallingRow(rowToFall);

        const animDuration = WORD_LENGTH * 100 + 500;
        setTimeout(() => {
          setHiddenRows((prev) => new Set([...prev, rowToFall]));
          setFallingRow(-1);
          setRemainingRows(newRemainingRows);
          
          if (newRemainingRows <= newGuesses.length) {
            setTimeout(() => setGameState("lost"), 300);
          }
        }, animDuration);
        return;
      }

      const newGuesses = [...guesses, newGuess];
      setGuesses(newGuesses);
      setCurrentGuess("");
      setPopIndex(-1);

      if (newGuess === targetWord) {
        triggerHaptic("success");
        setTimeout(() => setGameState("won"), 800);
      } else if (newGuesses.length >= remainingRows) {
        triggerHaptic("error");
        setTimeout(() => setGameState("lost"), 800);
      }
    }
  }, [gameState, currentGuess, guesses, targetWord, remainingRows, fallingRow, triggerHaptic, updateKeyboardStates]);

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
    for (let i = 0; i < INITIAL_ROWS; i++) {
      const isHidden = hiddenRows.has(i);
      const isFalling = fallingRow === i;
      const isSubmittedRow = i < guesses.length;
      const isCurrentRow = i === guesses.length && !isFalling && !isHidden;
      const guess = isSubmittedRow ? guesses[i] : (isCurrentRow ? currentGuess : "");
      const guessStates = isSubmittedRow 
        ? evaluateGuess(guesses[i], targetWord) 
        : (isCurrentRow ? currentGuessStates : []);

      const cells = [];
      for (let j = 0; j < WORD_LENGTH; j++) {
        const letter = guess[j] || "";
        let state: LetterState = letter ? "filled" : "empty";
        if (isSubmittedRow || (isCurrentRow && j < currentGuess.length)) {
          state = guessStates[j] || "filled";
        }
        cells.push(
          <LetterTile
            key={`${i}-${j}-${isFalling}`}
            letter={letter}
            state={state}
            immediate={isCurrentRow || isSubmittedRow}
            pop={isCurrentRow && j === popIndex}
            falling={isFalling}
            fallDelay={j * 100}
            hidden={isHidden}
          />
        );
      }
      rows.push(
        <View key={i} style={[styles.row, { gap: sizes.tileGap, marginBottom: sizes.tileGap }]}>
          {cells}
        </View>
      );
    }
    return rows;
  };

  const KEYBOARD_ROWS = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"],
  ];

  return (
    <SizingContext.Provider value={sizes}>
      <ThemedView style={styles.container}>
        {showIntro ? (
          <Animated.View style={[styles.introContainer, introAnimatedStyle]}>
            {context.assets?.six ? (
              <Image
                source={context.assets.six as ImageSourcePropType}
                style={styles.introImage}
                resizeMode="cover"
              />
            ) : null}
          </Animated.View>
        ) : null}

        <Animated.View style={[styles.gameContainer, { paddingTop: insets.top + (sizes.isCompact ? Spacing.sm : Spacing.lg) }, gameAnimatedStyle]}>
          <View style={[styles.header, { marginBottom: sizes.headerSpacing }]}>
            {context.assets?.sixLogo ? (
              <Image
                source={context.assets.sixLogo as ImageSourcePropType}
                style={[styles.logo, { height: sizes.logoHeight, width: sizes.logoHeight * 2 }]}
                resizeMode="contain"
              />
            ) : null}
            {!sizes.isCompact ? (
              <ThemedText style={[styles.instructions, { color: theme.textSecondary }]}>
                Guess the six letter word. Start by writing a word to find which letters match.{" "}
                <ThemedText 
                  style={[styles.instructionsLink, { color: theme.primary }]}
                  onPress={() => {
                    import("expo-web-browser").then((WebBrowser) => {
                      WebBrowser.openBrowserAsync("https://www.nytimes.com/games/wordle/index.html");
                    });
                  }}
                >
                  Learn more
                </ThemedText>
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.grid}>{renderGrid()}</View>

          <Toast message={warningMessage} visible={!!warningMessage} />

          {gameState === "playing" ? (
            <View style={[styles.keyboard, { paddingBottom: insets.bottom + Spacing.md }]}>
              {KEYBOARD_ROWS.map((row, rowIndex) => (
                <View key={rowIndex} style={[styles.keyboardRow, { gap: sizes.keyGap, marginBottom: sizes.keyRowGap }]}>
                  {row.map((key) => (
                    <KeyboardKey
                      key={key}
                      letter={key}
                      state={letterStates[key]}
                      onPress={handleKeyPress}
                    />
                  ))}
                </View>
              ))}
            </View>
        ) : (
          <View style={[styles.resultContainer, { paddingBottom: insets.bottom + Spacing.xl }]}>
            <View style={[
              styles.resultCard, 
              { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)" }
            ]}>
              <ThemedText style={styles.resultEmoji}>
                {gameState === "won" ? "✓" : ""}
              </ThemedText>
              <ThemedText style={styles.resultTitle}>
                {gameState === "won" ? "Well done!" : "Nice try!"}
              </ThemedText>
              <ThemedText style={[styles.resultSubtitle, { color: theme.textSecondary }]}>
                {gameState === "won"
                  ? `You got it in ${guesses.length}`
                  : "The word was"}
              </ThemedText>
              <ThemedText style={styles.resultText}>
                {gameState === "won"
                  ? `${guesses.length} / ${INITIAL_ROWS}`
                  : targetWord}
              </ThemedText>
            </View>
            <Pressable
              onPress={handleComplete}
              style={({ pressed }) => [
                styles.completeButton, 
                { 
                  backgroundColor: theme.primary,
                  opacity: pressed ? 0.9 : 1,
                }
              ]}
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
        </Animated.View>
      </ThemedView>
    </SizingContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  introContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  introImage: {
    width: "100%",
    height: "100%",
  },
  gameContainer: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  logo: {
    width: 80,
    height: 40,
    marginBottom: Spacing.xs,
  },
  instructions: {
    fontSize: 14,
    textAlign: "center",
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    lineHeight: 20,
  },
  instructionsLink: {
    fontSize: 14,
    fontWeight: "600",
  },
  toast: {
    position: "absolute",
    top: 120,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  toastContent: {
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  grid: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  row: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
  },
  tile: {
    width: 52,
    height: 52,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  tileLetter: {
    fontSize: 26,
    fontWeight: "700",
  },
  keyboard: {
    paddingHorizontal: Spacing.xs,
  },
  keyboardRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    marginBottom: 8,
  },
  key: {
    minWidth: 32,
    height: 56,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  keyText: {
    fontSize: 14,
    fontWeight: "600",
  },
  resultContainer: {
    paddingHorizontal: Spacing.xl,
  },
  resultCard: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  resultEmoji: {
    fontSize: 36,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  resultSubtitle: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: Spacing.xs,
  },
  resultText: {
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: 3,
  },
  completeButton: {
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xl,
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
    marginTop: Spacing.xs,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
