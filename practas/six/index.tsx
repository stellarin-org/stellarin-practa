import React, { useState, useEffect, useCallback, useMemo, createContext, useContext, useRef } from "react";
import { View, StyleSheet, Pressable, Platform, Image, useWindowDimensions, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { Feather } from "@expo/vector-icons";
import { GlassCard } from "@/components/GlassCard";
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
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaContext, PractaCompleteHandler } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { ImageSourcePropType } from "react-native";

const WORD_LENGTH = 6;
const INITIAL_ROWS = 6;

const EXAMPLE_WORDS = [
  "NOTICE", "BREATH", "CENTER", "LISTEN", "UNISON", "ANCHOR",
  "BEYOND", "GROUND", "ACCEPT", "ORIGIN", "SHADOW", "SILENT",
  "INTENT", "HUMBLE", "EMBODY", "FUSION", "INSIDE", "UNFOLD",
  "ENTIRE", "CIRCLE", "ATTUNE", "SERENE", "GENTLE", "NATURE",
];

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

function getDailyWord(words: string[]): string {
  const startDate = Date.UTC(2025, 0, 1);
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayIndex = Math.floor((todayUTC - startDate) / (1000 * 60 * 60 * 24));
  const safeIndex = ((dayIndex % words.length) + words.length) % words.length;
  return words[safeIndex];
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

interface GhostLetterTileProps {
  letter: string;
  fadeIn: boolean;
  delay: number;
  fadeOutDelay?: number;
}

function GhostLetterTile({ letter, fadeIn, delay, fadeOutDelay = 0 }: GhostLetterTileProps) {
  const { isDark } = useTheme();
  const sizes = useContext(SizingContext);
  const letterOpacity = useSharedValue(fadeIn ? 0 : 0.4);
  const tileOpacity = useSharedValue(1);

  useEffect(() => {
    if (fadeIn && letter) {
      letterOpacity.value = 0;
      letterOpacity.value = withDelay(
        delay,
        withTiming(0.4, { duration: 1400, easing: Easing.inOut(Easing.ease) })
      );
      tileOpacity.value = withDelay(
        delay,
        withTiming(1, { duration: 800, easing: Easing.out(Easing.ease) })
      );
    } else if (letter) {
      letterOpacity.value = withDelay(
        fadeOutDelay,
        withTiming(0, { duration: 800, easing: Easing.out(Easing.ease) })
      );
      tileOpacity.value = withDelay(
        fadeOutDelay,
        withTiming(0.97, { duration: 600, easing: Easing.out(Easing.ease) })
      );
    }
  }, [fadeIn, letter, delay, fadeOutDelay]);

  const letterStyle = useAnimatedStyle(() => ({
    opacity: letterOpacity.value,
  }));

  const tileStyle = useAnimatedStyle(() => ({
    opacity: tileOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.tile,
        {
          width: sizes.tileSize,
          height: sizes.tileSize,
          backgroundColor: isDark ? COLORS.tile.dark : COLORS.tile.light,
          borderColor: isDark ? COLORS.tileBorder.dark : COLORS.tileBorder.light,
        },
        tileStyle,
      ]}
    >
      <Animated.Text
        style={[
          styles.tileLetter,
          { 
            fontSize: sizes.tileFontSize,
            color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.55)",
          },
          letterStyle,
        ]}
      >
        {letter}
      </Animated.Text>
    </Animated.View>
  );
}

interface HintLetterTileProps {
  letter: string;
  index: number;
  revealedIndex: number;
  isFadingOut: boolean;
}

function HintLetterTile({ letter, index, revealedIndex, isFadingOut }: HintLetterTileProps) {
  const { isDark } = useTheme();
  const sizes = useContext(SizingContext);
  const letterOpacity = useSharedValue(0);
  const letterScale = useSharedValue(0.85);
  
  const isRevealed = index <= revealedIndex;
  const waveDelay = index * 50;
  const fadeOutDelay = (5 - index) * 40;

  useEffect(() => {
    if (isFadingOut) {
      letterOpacity.value = withDelay(
        fadeOutDelay,
        withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) })
      );
      letterScale.value = withDelay(
        fadeOutDelay,
        withTiming(0.85, { duration: 300, easing: Easing.out(Easing.cubic) })
      );
    } else if (isRevealed && letter) {
      letterOpacity.value = withDelay(
        waveDelay,
        withTiming(0.5, { duration: 350, easing: Easing.out(Easing.cubic) })
      );
      letterScale.value = withDelay(
        waveDelay,
        withSpring(1, { damping: 15, stiffness: 180 })
      );
    }
  }, [isRevealed, letter, waveDelay, isFadingOut, fadeOutDelay]);

  const letterStyle = useAnimatedStyle(() => ({
    opacity: letterOpacity.value,
    transform: [{ scale: letterScale.value }],
  }));

  return (
    <View
      style={[
        styles.tile,
        {
          width: sizes.tileSize,
          height: sizes.tileSize,
          backgroundColor: isDark ? COLORS.tile.dark : COLORS.tile.light,
          borderColor: isDark ? COLORS.tileBorder.dark : COLORS.tileBorder.light,
        },
      ]}
    >
      <Animated.Text
        style={[
          styles.tileLetter,
          { 
            fontSize: sizes.tileFontSize,
            color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.55)",
          },
          letterStyle,
        ]}
      >
        {letter}
      </Animated.Text>
    </View>
  );
}

interface LetterTileProps {
  letter: string;
  state: LetterState;
  immediate?: boolean;
  pop?: boolean;
  falling?: boolean;
  fallDelay?: number;
  hidden?: boolean;
  celebrating?: boolean;
  celebrateDelay?: number;
}

function LetterTile({ letter, state, immediate = false, pop = false, falling = false, fallDelay = 0, hidden = false, celebrating = false, celebrateDelay = 0 }: LetterTileProps) {
  const { isDark } = useTheme();
  const sizes = useContext(SizingContext);
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const rotateZ = useSharedValue(0);
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

  useEffect(() => {
    if (celebrating) {
      translateY.value = withDelay(
        celebrateDelay,
        withSequence(
          withTiming(-18, { duration: 200, easing: Easing.out(Easing.cubic) }),
          withSpring(0, { damping: 8, stiffness: 200 })
        )
      );
      rotateZ.value = withDelay(
        celebrateDelay,
        withSequence(
          withTiming(-4, { duration: 120, easing: Easing.out(Easing.quad) }),
          withTiming(4, { duration: 120, easing: Easing.inOut(Easing.quad) }),
          withSpring(0, { damping: 10, stiffness: 250 })
        )
      );
      scale.value = withDelay(
        celebrateDelay,
        withSequence(
          withTiming(1.15, { duration: 180, easing: Easing.out(Easing.cubic) }),
          withSpring(1, { damping: 8, stiffness: 200 })
        )
      );
    }
  }, [celebrating, celebrateDelay]);

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
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
      { rotate: `${rotateZ.value}deg` },
    ],
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
  shimmerProgress?: number;
  keyIndex?: number;
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

interface TutorialOverlayProps {
  visible: boolean;
  onDismiss: () => void;
}

function TutorialOverlay({ visible, onDismiss }: TutorialOverlayProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  
  if (!visible) return null;
  
  const tips = [
    { icon: "edit-3" as const, title: "Start smart", text: "Begin with words that have common vowels like A, E, O and popular consonants like R, S, T." },
    { icon: "eye" as const, title: "Read the colors", text: "Green means correct spot. Yellow means right letter, wrong spot. Gray means the letter isn't in the word." },
    { icon: "zap" as const, title: "Use what you learn", text: "Each guess gives you clues. Use confirmed letters in your next guess to narrow down faster." },
  ];
  
  return (
    <Animated.View 
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={[styles.tutorialFullScreen, { backgroundColor: isDark ? '#121213' : '#FFFFFF' }]}
    >
      <View style={[styles.tutorialContainer, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={styles.tutorialHeader}>
          <ThemedText style={styles.tutorialTitle}>How to Play</ThemedText>
        </View>
        
        <ScrollView style={styles.tutorialContent} showsVerticalScrollIndicator={false} contentContainerStyle={styles.tutorialScrollContent}>
          {tips.map((tip, index) => (
            <View key={index} style={styles.tutorialTip}>
              <View style={[styles.tutorialIconContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                <Feather name={tip.icon} size={20} color={theme.primary} />
              </View>
              <View style={styles.tutorialTipText}>
                <ThemedText style={styles.tutorialTipTitle}>{tip.title}</ThemedText>
                <ThemedText style={[styles.tutorialTipDescription, { color: theme.textSecondary }]}>
                  {tip.text}
                </ThemedText>
              </View>
            </View>
          ))}
          
          <View style={[styles.tutorialColorGuide, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
            <View style={styles.tutorialColorRow}>
              <View style={[styles.tutorialColorBox, { backgroundColor: COLORS.correct }]} />
              <ThemedText style={styles.tutorialColorText}>Correct position</ThemedText>
            </View>
            <View style={styles.tutorialColorRow}>
              <View style={[styles.tutorialColorBox, { backgroundColor: COLORS.present }]} />
              <ThemedText style={styles.tutorialColorText}>Wrong position</ThemedText>
            </View>
            <View style={styles.tutorialColorRow}>
              <View style={[styles.tutorialColorBox, { backgroundColor: isDark ? COLORS.absent.dark : COLORS.absent.light }]} />
              <ThemedText style={styles.tutorialColorText}>Not in word</ThemedText>
            </View>
          </View>
        </ScrollView>
        
        <Pressable 
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.tutorialButton,
            { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 }
          ]}
        >
          <ThemedText style={styles.tutorialButtonText}>Got it!</ThemedText>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function KeyboardKey({ letter, state, onPress, shimmerProgress = -1, keyIndex = 0 }: KeyboardKeyProps) {
  const { theme, isDark } = useTheme();
  const sizes = useContext(SizingContext);
  const scale = useSharedValue(1);
  const shimmerScale = useSharedValue(1);
  const shimmerOpacity = useSharedValue(0);

  useEffect(() => {
    if (shimmerProgress >= 0) {
      const distance = Math.abs(shimmerProgress - keyIndex);
      const inRange = distance < 3;
      
      if (inRange) {
        const intensity = 1 - (distance / 3);
        shimmerScale.value = withSpring(1 + intensity * 0.08, { damping: 12, stiffness: 200 });
        shimmerOpacity.value = withTiming(intensity * 0.25, { duration: 150 });
      } else {
        shimmerScale.value = withSpring(1, { damping: 15, stiffness: 180 });
        shimmerOpacity.value = withTiming(0, { duration: 200 });
      }
    } else {
      shimmerScale.value = withSpring(1, { damping: 15, stiffness: 180 });
      shimmerOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [shimmerProgress, keyIndex]);

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
    transform: [{ scale: scale.value * shimmerScale.value }],
  }));

  const shimmerOverlayStyle = useAnimatedStyle(() => ({
    opacity: shimmerOpacity.value,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        style={[styles.key, { backgroundColor: getBackgroundColor(), height: sizes.keyHeight, overflow: 'hidden' }]}
      >
        <Animated.View 
          style={[
            { 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              backgroundColor: isDark ? '#FFFFFF' : '#000000',
              borderRadius: 6,
            },
            shimmerOverlayStyle
          ]} 
        />
        <ThemedText style={[styles.keyText, { color: textColor, fontSize: sizes.keyFontSize }]}>
          {letter}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

type GameState = "playing" | "won" | "lost";

export default function MyPracta({ context, onComplete, showSettings, onSettings }: {
  context: PractaContext;
  onComplete: PractaCompleteHandler;
  onSkip?: () => void;
  showSettings?: boolean;
  onSettings?: () => void;
}) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const sizes = useResponsiveSizes();
  const { setConfig, resetConfig } = usePractaChrome();

  const wordlist = useMemo(() => {
    return (context.assets?.wordlist as string[]) || [];
  }, [context.assets]);

  const validWords = useMemo(() => {
    const words = (context.assets?.validWords as string[]) || [];
    return new Set(words);
  }, [context.assets]);

  const targetWord = useMemo(() => {
    if (wordlist.length === 0) return "";
    return getDailyWord(wordlist);
  }, [wordlist]);

  const hints = useMemo(() => {
    return (context.assets?.hints as Record<string, string>) || {};
  }, [context.assets]);

  const [guesses, setGuesses] = useState<string[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [gameState, setGameState] = useState<GameState>("playing");
  const [letterStates, setLetterStates] = useState<Record<string, LetterState>>({});
  const [remainingRows, setRemainingRows] = useState(INITIAL_ROWS);
  const [fallingRow, setFallingRow] = useState(-1);
  const [hiddenRows, setHiddenRows] = useState<Set<number>>(new Set());
  const [warningMessage, setWarningMessage] = useState("");
  const [popIndex, setPopIndex] = useState(-1);
  const [showTutorial, setShowTutorial] = useState(false);
  const [hintWord, setHintWord] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [hintLetterIndex, setHintLetterIndex] = useState(-1);
  const [hintFadingOut, setHintFadingOut] = useState(false);
  const [shownHintWords, setShownHintWords] = useState<Set<string>>(new Set());
  const hintTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintLetterRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const HINT_DELAY = 15000;
  const HINT_LETTER_DURATION = 800;

  const findMatchingValidWord = useCallback((): string | null => {
    if (guesses.length === 0 || !targetWord) return null;
    
    const correctPositions: (string | null)[] = new Array(WORD_LENGTH).fill(null);
    const presentLetters: Set<string> = new Set();
    const absentLetters: Set<string> = new Set();
    const notInPosition: Map<number, Set<string>> = new Map();
    
    for (let i = 0; i < WORD_LENGTH; i++) {
      notInPosition.set(i, new Set());
    }
    
    for (const guess of guesses) {
      const states = evaluateGuess(guess, targetWord);
      for (let i = 0; i < guess.length; i++) {
        const letter = guess[i];
        const state = states[i];
        
        if (state === "correct") {
          correctPositions[i] = letter;
        } else if (state === "present") {
          presentLetters.add(letter);
          notInPosition.get(i)?.add(letter);
        } else if (state === "absent") {
          if (!correctPositions.includes(letter) && !presentLetters.has(letter)) {
            absentLetters.add(letter);
          }
        }
      }
    }
    
    const validWordsArray = Array.from(validWords);
    for (const word of validWordsArray) {
      if (word === targetWord) continue;
      if (shownHintWords.has(word)) continue;
      if (word.length !== WORD_LENGTH) continue;
      
      let matches = true;
      
      for (let i = 0; i < WORD_LENGTH; i++) {
        if (correctPositions[i] && word[i] !== correctPositions[i]) {
          matches = false;
          break;
        }
        if (notInPosition.get(i)?.has(word[i])) {
          matches = false;
          break;
        }
        if (absentLetters.has(word[i]) && !correctPositions.includes(word[i]) && !presentLetters.has(word[i])) {
          matches = false;
          break;
        }
      }
      
      if (matches) {
        for (const letter of presentLetters) {
          if (!word.includes(letter)) {
            matches = false;
            break;
          }
        }
      }
      
      if (matches) {
        return word;
      }
    }
    
    return null;
  }, [guesses, targetWord, validWords, shownHintWords]);

  const getHintFileWord = useCallback((): string | null => {
    const hint = hints[targetWord];
    if (hint && hint.length === 6 && !shownHintWords.has(hint)) {
      return hint;
    }
    return null;
  }, [hints, targetWord, shownHintWords]);

  const getNextHintWord = useCallback((): string => {
    const matchingWord = findMatchingValidWord();
    if (matchingWord) return matchingWord;
    
    const hintFileWord = getHintFileWord();
    if (hintFileWord) return hintFileWord;
    
    return "ILOVEU";
  }, [findMatchingValidWord, getHintFileWord]);

  const resetHintTimer = useCallback(() => {
    setShowHint(false);
    setHintWord(null);
    setHintLetterIndex(-1);
    setHintFadingOut(false);
    
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    if (hintLetterRef.current) {
      clearTimeout(hintLetterRef.current);
      hintLetterRef.current = null;
    }
  }, []);

  const showNextHintLetter = useCallback((word: string, index: number) => {
    if (index >= WORD_LENGTH) {
      setShownHintWords(prev => new Set(prev).add(word));
      hintLetterRef.current = setTimeout(() => {
        setHintFadingOut(true);
        hintLetterRef.current = setTimeout(() => {
          setHintFadingOut(false);
          const nextWord = getNextHintWord();
          setHintWord(nextWord);
          setHintLetterIndex(-1);
          showNextHintLetter(nextWord, 0);
        }, 500);
      }, 2000);
      return;
    }
    
    setHintLetterIndex(index);
    hintLetterRef.current = setTimeout(() => {
      showNextHintLetter(word, index + 1);
    }, HINT_LETTER_DURATION);
  }, [getNextHintWord]);

  const startHintTimer = useCallback(() => {
    if (gameState !== "playing" || guesses.length === 0 || currentGuess.length > 0) {
      return;
    }
    
    resetHintTimer();
    
    hintTimerRef.current = setTimeout(() => {
      if (gameState === "playing" && guesses.length > 0 && currentGuess.length === 0) {
        const word = getNextHintWord();
        setHintWord(word);
        setShowHint(true);
        showNextHintLetter(word, 0);
      }
    }, HINT_DELAY);
  }, [gameState, guesses.length, currentGuess.length, getNextHintWord, resetHintTimer, showNextHintLetter]);

  useEffect(() => {
    if (gameState !== "playing") {
      resetHintTimer();
      return;
    }
    
    if (currentGuess.length > 0) {
      resetHintTimer();
      return;
    }
    
    if (guesses.length > 0 && currentGuess.length === 0) {
      startHintTimer();
    }
    
    return () => {
      if (hintTimerRef.current) {
        clearTimeout(hintTimerRef.current);
      }
    };
  }, [gameState, guesses.length, currentGuess.length, startHintTimer, resetHintTimer]);

  useEffect(() => {
    setConfig({
      headerMode: "minimal",
      showProgressDots: false,
      showSettings,
      onSettings,
      rightAction: (
        <Pressable 
          onPress={() => setShowTutorial(true)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            justifyContent: "center",
            alignItems: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
          }}
        >
          <Feather name="help-circle" size={18} color="rgba(0, 0, 0, 0.8)" />
        </Pressable>
      ),
    });
    return () => {
      resetConfig();
    };
  }, [setConfig, resetConfig, showSettings, onSettings]);
  
  const [ghostWords, setGhostWords] = useState<string[]>(() => {
    const shuffled = [...EXAMPLE_WORDS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, INITIAL_ROWS);
  });
  const [activeGhostRows, setActiveGhostRows] = useState<Set<number>>(new Set());
  const [isFadingOut, setIsFadingOut] = useState(false);
  
  const ghostTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const ghostCycleRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  
  const isGridEmpty = guesses.length === 0 && currentGuess.length === 0;
  
  const clearGhostTimers = useCallback(() => {
    ghostTimersRef.current.forEach(t => clearTimeout(t));
    ghostTimersRef.current = [];
    if (ghostCycleRef.current) {
      clearInterval(ghostCycleRef.current);
      ghostCycleRef.current = null;
    }
  }, []);
  
  useEffect(() => {
    if (!isGridEmpty) {
      clearGhostTimers();
      setActiveGhostRows(new Set());
      setIsFadingOut(false);
      return;
    }
    
    let isMounted = true;
    
    const revealNextRow = (rowIndex: number) => {
      if (!isMounted || rowIndex >= INITIAL_ROWS) return;
      
      setActiveGhostRows(prev => new Set([...prev, rowIndex]));
      
      if (rowIndex + 1 < INITIAL_ROWS) {
        const timer = setTimeout(() => {
          if (isMounted) revealNextRow(rowIndex + 1);
        }, 350 + rowIndex * 50);
        ghostTimersRef.current.push(timer);
      }
    };
    
    const startReveal = () => {
      if (!isMounted) return;
      setIsFadingOut(false);
      revealNextRow(0);
    };
    
    const startTimer = setTimeout(startReveal, 600);
    ghostTimersRef.current.push(startTimer);
    
    ghostCycleRef.current = setInterval(() => {
      if (!isMounted) return;
      
      setIsFadingOut(true);
      
      const fadeOutDuration = INITIAL_ROWS * 60 + 800;
      const transitionTimer = setTimeout(() => {
        if (!isMounted) return;
        setActiveGhostRows(new Set());
        
        const shuffled = [...EXAMPLE_WORDS].sort(() => Math.random() - 0.5);
        setGhostWords(shuffled.slice(0, INITIAL_ROWS));
        
        const revealTimer = setTimeout(startReveal, 400);
        ghostTimersRef.current.push(revealTimer);
      }, fadeOutDuration);
      ghostTimersRef.current.push(transitionTimer);
    }, 9000);
    
    return () => {
      isMounted = false;
      clearGhostTimers();
    };
  }, [isGridEmpty, clearGhostTimers]);

  const [shimmerProgress, setShimmerProgress] = useState(-1);
  const shimmerTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const shimmerIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = React.useRef<number>(Date.now());
  
  const TOTAL_KEYS = 26;
  const INACTIVITY_DELAY = 7000;
  const SHIMMER_COOLDOWN = 15000;
  const lastShimmerRef = React.useRef<number>(0);
  
  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShimmerProgress(-1);
    
    if (shimmerIntervalRef.current) {
      clearInterval(shimmerIntervalRef.current);
      shimmerIntervalRef.current = null;
    }
  }, []);
  
  useEffect(() => {
    if (gameState !== "playing") {
      resetInactivityTimer();
      return;
    }
    
    const runShimmer = () => {
      if (shimmerIntervalRef.current) return;
      
      lastShimmerRef.current = Date.now();
      let progress = 0;
      
      shimmerIntervalRef.current = setInterval(() => {
        setShimmerProgress(progress);
        progress++;
        if (progress > TOTAL_KEYS + 5) {
          clearInterval(shimmerIntervalRef.current!);
          shimmerIntervalRef.current = null;
          setShimmerProgress(-1);
        }
      }, 60);
    };
    
    const checkInactivity = () => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      const timeSinceLastShimmer = now - lastShimmerRef.current;
      
      if (elapsed >= INACTIVITY_DELAY && timeSinceLastShimmer >= SHIMMER_COOLDOWN && !shimmerIntervalRef.current) {
        runShimmer();
      }
    };
    
    shimmerTimerRef.current = setInterval(checkInactivity, 1000);
    
    return () => {
      if (shimmerTimerRef.current) clearInterval(shimmerTimerRef.current);
      if (shimmerIntervalRef.current) clearInterval(shimmerIntervalRef.current);
    };
  }, [gameState, resetInactivityTimer]);

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

      if (!validWords.has(newGuess)) {
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

  const handleKeyPressWithReset = useCallback((key: string) => {
    resetInactivityTimer();
    resetHintTimer();
    handleKeyPress(key);
  }, [handleKeyPress, resetInactivityTimer, resetHintTimer]);

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

  const handleShare = useCallback(async () => {
    triggerHaptic("light");
    
    const lines = guesses.map((guess) => {
      const states = evaluateGuess(guess, targetWord);
      return states.map((s) => 
        s === "correct" ? "🟩" : s === "present" ? "🟨" : "⬛"
      ).join("");
    });
    
    const text = `Six  ${guesses.length}/${INITIAL_ROWS}\n\n${lines.join("\n")}`;
    
    try {
      if (Platform.OS === "web") {
        if (navigator.share) {
          await navigator.share({ text });
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
        }
      } else {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          const FS = await import("expo-file-system/legacy");
          const fileUri = FS.cacheDirectory + "six-result.txt";
          await FS.writeAsStringAsync(fileUri, text);
          await Sharing.shareAsync(fileUri, {
            mimeType: "text/plain",
            dialogTitle: "Share your Six result",
          });
        }
      }
    } catch (error) {
      console.warn("Share failed:", error);
    }
  }, [triggerHaptic, guesses, targetWord]);

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
      
      const showGhostWord = isGridEmpty && !isHidden && !isFalling;
      const ghostWord = ghostWords[i] || "";
      const isGhostActive = activeGhostRows.has(i);
      
      const showHintInRow = isCurrentRow && showHint && hintWord && currentGuess.length === 0;

      const cells = [];
      for (let j = 0; j < WORD_LENGTH; j++) {
        const letter = guess[j] || "";
        let state: LetterState = letter ? "filled" : "empty";
        if (isSubmittedRow || (isCurrentRow && j < currentGuess.length)) {
          state = guessStates[j] || "filled";
        }
        
        if (showGhostWord) {
          const fadeOutDelay = isFadingOut ? (INITIAL_ROWS - 1 - i) * 60 + (WORD_LENGTH - 1 - j) * 30 : 0;
          cells.push(
            <GhostLetterTile
              key={`ghost-${i}-${j}`}
              letter={ghostWord[j] || ""}
              fadeIn={isGhostActive && !isFadingOut}
              delay={j * 100}
              fadeOutDelay={fadeOutDelay}
            />
          );
        } else if (showHintInRow) {
          cells.push(
            <HintLetterTile
              key={`hint-${i}-${j}-${hintWord}`}
              letter={hintWord?.[j] || ""}
              index={j}
              revealedIndex={hintLetterIndex}
              isFadingOut={hintFadingOut}
            />
          );
        } else {
          const isWinningRow = gameState === "won" && i === guesses.length - 1;
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
              celebrating={isWinningRow}
              celebrateDelay={j * 100 + 300}
            />
          );
        }
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
        <View style={[styles.gameContainer, { paddingTop: insets.top + 44 + (sizes.isCompact ? Spacing.xs : Spacing.sm) }]}>
          <View style={[styles.header, { marginBottom: sizes.headerSpacing }]}>
            {context.assets?.sixLogo ? (
              <Image
                source={context.assets.sixLogo as ImageSourcePropType}
                style={[styles.logo, { height: sizes.logoHeight, width: sizes.logoHeight * 2 }]}
                resizeMode="contain"
              />
            ) : null}
            {!sizes.isCompact ? (
              <View style={styles.instructionsContainer}>
                <ThemedText style={[styles.instructions, { color: theme.textSecondary }]}>
                  Guess the six letter word. Start by writing a word.{" "}
                </ThemedText>
                <Pressable onPress={() => setShowTutorial(true)}>
                  <ThemedText style={[styles.instructions, { color: theme.primary }]}>
                    Learn how to play
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.grid}>{renderGrid()}</View>

          <Toast message={warningMessage} visible={!!warningMessage} />
          
          <TutorialOverlay visible={showTutorial} onDismiss={() => setShowTutorial(false)} />

          <View style={styles.bottomArea}>
            <View 
              style={[styles.keyboard, { paddingBottom: insets.bottom + Spacing.md }]}
              pointerEvents={gameState === "playing" ? "auto" : "none"}
            >
              <Animated.View style={{ opacity: gameState === "playing" ? 1 : 0 }}>
                {KEYBOARD_ROWS.map((row, rowIndex) => {
                  const rowStartIndex = rowIndex === 0 ? 0 : rowIndex === 1 ? 10 : 19;
                  return (
                    <View key={rowIndex} style={[styles.keyboardRow, { gap: sizes.keyGap, marginBottom: sizes.keyRowGap }]}>
                      {row.map((key, keyIdx) => (
                        <KeyboardKey
                          key={key}
                          letter={key}
                          state={letterStates[key]}
                          onPress={handleKeyPressWithReset}
                          shimmerProgress={shimmerProgress}
                          keyIndex={rowStartIndex + keyIdx}
                        />
                      ))}
                    </View>
                  );
                })}
              </Animated.View>
            </View>

            {gameState !== "playing" ? (
              <Animated.View
                entering={FadeIn.delay(500).duration(400)}
                style={styles.resultOverlay}
              >
                <GlassCard
                  style={styles.resultGlass}
                  intensity={isDark ? 60 : 50}
                >
                  <View style={styles.resultTextGroup}>
                    <ThemedText style={styles.resultScore}>
                      {gameState === "won"
                        ? `${guesses.length} / ${INITIAL_ROWS}`
                        : targetWord}
                    </ThemedText>
                    <ThemedText style={[styles.resultSubtitle, { color: theme.textSecondary }]}>
                      {gameState === "won" ? "Good job!" : "Better luck next time"}
                    </ThemedText>
                  </View>
                  <View style={styles.buttonRow}>
                    <Pressable
                      onPress={handleShare}
                      style={({ pressed }) => [
                        styles.shareButton, 
                        { 
                          backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)",
                          opacity: pressed ? 0.9 : 1,
                        }
                      ]}
                    >
                      <Feather name="share" size={18} color={theme.text} style={{ marginRight: 8 }} />
                      <ThemedText style={styles.shareButtonText}>Share</ThemedText>
                    </Pressable>
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
                      <ThemedText style={styles.completeButtonText} lightColor="#FFFFFF" darkColor="#FFFFFF">Continue</ThemedText>
                    </Pressable>
                  </View>
                </GlassCard>
              </Animated.View>
            ) : null}
          </View>

        </View>
      </ThemedView>
    </SizingContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  instructionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  instructions: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  tutorialFullScreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
  },
  tutorialContainer: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  tutorialHeader: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  tutorialTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  tutorialContent: {
    flex: 1,
  },
  tutorialScrollContent: {
    paddingTop: Spacing.md,
  },
  tutorialTip: {
    flexDirection: "row",
    marginBottom: Spacing.md,
  },
  tutorialIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  tutorialTipText: {
    flex: 1,
  },
  tutorialTipTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  tutorialTipDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  tutorialColorGuide: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  tutorialColorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  tutorialColorBox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  tutorialColorText: {
    fontSize: 13,
  },
  tutorialButton: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  tutorialButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
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
  bottomArea: {
    position: "relative",
  },
  resultOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  resultGlass: {
    alignItems: "center",
    gap: Spacing.lg,
    width: "100%",
  },
  resultTextGroup: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  resultScore: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 3,
  },
  resultSubtitle: {
    fontSize: 15,
    fontWeight: "500",
  },
  completeButton: {
    flex: 1,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  completeButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    width: "100%",
  },
  shareButton: {
    flexDirection: "row",
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  shareButtonText: {
    fontWeight: "600",
    fontSize: 16,
  },
});
