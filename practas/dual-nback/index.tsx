import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAudioPlayer } from "expo-audio";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

const LETTERS = ["C", "H", "K", "L", "Q", "R", "S", "T"];
const GRID_SIZE = 9;
const CELL_SIZE = 72;
const GRID_GAP = 8;
const TRIAL_DURATION = 3000;
const TRIALS_PER_SESSION = 20;

type Phase = "intro" | "playing" | "results";

interface Trial {
  position: number;
  letter: string;
  isPositionMatch: boolean;
  isAudioMatch: boolean;
}

interface GameStats {
  positionHits: number;
  positionMisses: number;
  positionFalseAlarms: number;
  audioHits: number;
  audioMisses: number;
  audioFalseAlarms: number;
}

export default function DualNBackPracta({
  context,
  onComplete,
  onSkip,
  onSettings,
  showSettings,
}: PractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();
  const LETTER_ASSET_KEYS: Record<string, string> = {
    C: "letterC", H: "letterH", K: "letterK", L: "letterL",
    Q: "letterQ", R: "letterR", S: "letterS", T: "letterT",
  };
  const letterPlayer = useAudioPlayer(context.assets?.letterC);

  const [phase, setPhase] = useState<Phase>("intro");
  const [nLevel, setNLevel] = useState(2);
  const [currentTrial, setCurrentTrial] = useState(0);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [activePosition, setActivePosition] = useState<number | null>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [positionPressed, setPositionPressed] = useState(false);
  const [audioPressed, setAudioPressed] = useState(false);
  const [stats, setStats] = useState<GameStats>({
    positionHits: 0,
    positionMisses: 0,
    positionFalseAlarms: 0,
    audioHits: 0,
    audioMisses: 0,
    audioFalseAlarms: 0,
  });

  const trialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stimulusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    setConfig({
      headerMode: phase === "playing" ? "minimal" : "default",
      title: "Dual N-Back",
      showSettings: phase !== "playing" && showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings, phase]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (trialTimerRef.current) clearTimeout(trialTimerRef.current);
      if (stimulusTimerRef.current) clearTimeout(stimulusTimerRef.current);
    };
  }, []);

  const triggerHaptic = useCallback((type: "light" | "success" | "error") => {
    if (Platform.OS === "web") return;
    switch (type) {
      case "light":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case "success":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "error":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  }, []);

  const generateTrials = useCallback(() => {
    const newTrials: Trial[] = [];
    const matchProbability = 0.25;

    for (let i = 0; i < TRIALS_PER_SESSION; i++) {
      let position: number;
      let letter: string;
      let isPositionMatch = false;
      let isAudioMatch = false;

      if (i >= nLevel) {
        if (Math.random() < matchProbability) {
          position = newTrials[i - nLevel].position;
          isPositionMatch = true;
        } else {
          do {
            position = Math.floor(Math.random() * GRID_SIZE);
          } while (position === newTrials[i - nLevel].position);
        }

        if (Math.random() < matchProbability) {
          letter = newTrials[i - nLevel].letter;
          isAudioMatch = true;
        } else {
          do {
            letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
          } while (letter === newTrials[i - nLevel].letter);
        }
      } else {
        position = Math.floor(Math.random() * GRID_SIZE);
        letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
      }

      newTrials.push({ position, letter, isPositionMatch, isAudioMatch });
    }

    return newTrials;
  }, [nLevel]);

  const calculateResults = useCallback(() => {
    const positionMatches = trials.filter((t) => t.isPositionMatch).length;
    const audioMatches = trials.filter((t) => t.isAudioMatch).length;

    const positionAccuracy =
      positionMatches > 0
        ? Math.round((stats.positionHits / positionMatches) * 100)
        : 100;
    const audioAccuracy =
      audioMatches > 0
        ? Math.round((stats.audioHits / audioMatches) * 100)
        : 100;
    const totalAccuracy = Math.round((positionAccuracy + audioAccuracy) / 2);

    return { positionAccuracy, audioAccuracy, totalAccuracy };
  }, [trials, stats]);

  const startGame = useCallback(() => {
    const newTrials = generateTrials();
    setTrials(newTrials);
    setCurrentTrial(0);
    setStats({
      positionHits: 0,
      positionMisses: 0,
      positionFalseAlarms: 0,
      audioHits: 0,
      audioMisses: 0,
      audioFalseAlarms: 0,
    });
    setPhase("playing");
  }, [generateTrials]);

  const endGame = useCallback(() => {
    setActivePosition(null);
    setActiveLetter(null);
    if (trialTimerRef.current) clearTimeout(trialTimerRef.current);
    if (stimulusTimerRef.current) clearTimeout(stimulusTimerRef.current);
    setPhase("results");
    triggerHaptic("success");
  }, [triggerHaptic]);

  const handlePositionPress = useCallback(() => {
    if (phase !== "playing" || positionPressed || currentTrial < nLevel) return;

    setPositionPressed(true);
    triggerHaptic("light");

    const trial = trials[currentTrial];
    if (trial.isPositionMatch) {
      setStats((prev) => ({ ...prev, positionHits: prev.positionHits + 1 }));
      triggerHaptic("success");
    } else {
      setStats((prev) => ({
        ...prev,
        positionFalseAlarms: prev.positionFalseAlarms + 1,
      }));
      triggerHaptic("error");
    }
  }, [phase, positionPressed, currentTrial, nLevel, trials, triggerHaptic]);

  const handleAudioPress = useCallback(() => {
    if (phase !== "playing" || audioPressed || currentTrial < nLevel) return;

    setAudioPressed(true);
    triggerHaptic("light");

    const trial = trials[currentTrial];
    if (trial.isAudioMatch) {
      setStats((prev) => ({ ...prev, audioHits: prev.audioHits + 1 }));
      triggerHaptic("success");
    } else {
      setStats((prev) => ({
        ...prev,
        audioFalseAlarms: prev.audioFalseAlarms + 1,
      }));
      triggerHaptic("error");
    }
  }, [phase, audioPressed, currentTrial, nLevel, trials, triggerHaptic]);

  const advanceToNextTrial = useCallback(() => {
    if (!isMountedRef.current) return;

    if (currentTrial >= nLevel) {
      const trial = trials[currentTrial];
      if (trial.isPositionMatch && !positionPressed) {
        setStats((prev) => ({
          ...prev,
          positionMisses: prev.positionMisses + 1,
        }));
      }
      if (trial.isAudioMatch && !audioPressed) {
        setStats((prev) => ({ ...prev, audioMisses: prev.audioMisses + 1 }));
      }
    }

    setPositionPressed(false);
    setAudioPressed(false);
    setActivePosition(null);
    setActiveLetter(null);

    if (currentTrial + 1 >= TRIALS_PER_SESSION) {
      endGame();
    } else {
      setCurrentTrial((prev) => prev + 1);
    }
  }, [currentTrial, nLevel, trials, positionPressed, audioPressed, endGame]);

  useEffect(() => {
    if (phase !== "playing") return;

    const trial = trials[currentTrial];
    if (!trial) return;

    setActivePosition(trial.position);
    setActiveLetter(trial.letter);
    triggerHaptic("light");

    const assetKey = LETTER_ASSET_KEYS[trial.letter];
    const audioSource = assetKey ? context.assets?.[assetKey] : null;
    if (audioSource) {
      letterPlayer.replace(audioSource);
      letterPlayer.seekTo(0);
      letterPlayer.play();
    }

    stimulusTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setActivePosition(null);
        setActiveLetter(null);
      }
    }, TRIAL_DURATION * 0.6);

    trialTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        advanceToNextTrial();
      }
    }, TRIAL_DURATION);

    return () => {
      if (trialTimerRef.current) clearTimeout(trialTimerRef.current);
      if (stimulusTimerRef.current) clearTimeout(stimulusTimerRef.current);
    };
  }, [phase, currentTrial, trials, triggerHaptic, advanceToNextTrial]);

  const handleComplete = () => {
    triggerHaptic("light");
    const { positionAccuracy, audioAccuracy, totalAccuracy } =
      calculateResults();
    onComplete({
      content: {
        type: "text",
        value: `Completed Dual ${nLevel}-Back training with ${totalAccuracy}% accuracy.`,
      },
      metadata: {
        nLevel,
        positionAccuracy,
        audioAccuracy,
        totalAccuracy,
        trials: TRIALS_PER_SESSION,
        completedAt: Date.now(),
      },
    });
  };

  const getScoreColor = (accuracy: number) => {
    if (accuracy >= 80) return theme.success;
    if (accuracy >= 50) return "#FF9500";
    return theme.error;
  };

  const renderIntro = () => (
    <View style={styles.introContainer}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: theme.primary + "20" },
        ]}
      >
        <Feather name="grid" size={48} color={theme.primary} />
      </View>

      <ThemedText style={styles.title}>Dual N-Back</ThemedText>
      <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
        Train your working memory by tracking position and audio simultaneously
      </ThemedText>

      <View style={styles.nLevelSection}>
        <ThemedText style={styles.nLevelLabel}>N-Level</ThemedText>
        <View style={styles.nLevelSelector}>
          {[1, 2, 3, 4, 5].map((level) => (
            <Pressable
              key={level}
              onPress={() => setNLevel(level)}
              style={[
                styles.nLevelButton,
                {
                  backgroundColor:
                    nLevel === level
                      ? theme.primary
                      : theme.backgroundSecondary,
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.nLevelButtonText,
                  { color: nLevel === level ? "#FFFFFF" : theme.text },
                ]}
              >
                {level}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.instructionsCard}>
        <View style={styles.instructionRow}>
          <Feather name="grid" size={20} color={theme.primary} />
          <ThemedText style={styles.instructionText}>
            Press Position when grid matches {nLevel} steps back
          </ThemedText>
        </View>
        <View style={styles.instructionRow}>
          <Feather name="volume-2" size={20} color={theme.primary} />
          <ThemedText style={styles.instructionText}>
            Press Audio when letter matches {nLevel} steps back
          </ThemedText>
        </View>
      </View>

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}
      >
        <Pressable
          onPress={startGame}
          style={[styles.button, { backgroundColor: theme.primary }]}
        >
          <ThemedText style={styles.buttonText}>Start Training</ThemedText>
        </Pressable>

        {onSkip ? (
          <Pressable onPress={onSkip} style={styles.skipButton}>
            <ThemedText
              style={[styles.skipText, { color: theme.textSecondary }]}
            >
              Skip
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const renderPlaying = () => (
    <View style={styles.gameContainer}>
      <View style={styles.progressContainer}>
        <ThemedText style={styles.trialCounter}>
          {currentTrial + 1} / {TRIALS_PER_SESSION}
        </ThemedText>
        <ThemedText style={styles.nLevelIndicator}>N-{nLevel}</ThemedText>
      </View>

      <View style={styles.letterDisplay}>
        <ThemedText style={styles.currentLetter}>
          {activeLetter || ""}
        </ThemedText>
      </View>

      <View style={styles.grid}>
        {Array.from({ length: GRID_SIZE }).map((_, i) => (
          <GridCell key={i} isActive={activePosition === i} theme={theme} />
        ))}
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={handlePositionPress}
          disabled={positionPressed || currentTrial < nLevel}
          style={[
            styles.controlButton,
            {
              backgroundColor: positionPressed
                ? theme.secondary
                : theme.backgroundDefault,
              borderColor: theme.primary,
              opacity: currentTrial < nLevel ? 0.5 : 1,
            },
          ]}
        >
          <Feather
            name="grid"
            size={24}
            color={positionPressed ? "#FFFFFF" : theme.primary}
          />
          <ThemedText
            style={[
              styles.controlButtonText,
              { color: positionPressed ? "#FFFFFF" : theme.text },
            ]}
          >
            Position
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={handleAudioPress}
          disabled={audioPressed || currentTrial < nLevel}
          style={[
            styles.controlButton,
            {
              backgroundColor: audioPressed
                ? theme.secondary
                : theme.backgroundDefault,
              borderColor: theme.primary,
              opacity: currentTrial < nLevel ? 0.5 : 1,
            },
          ]}
        >
          <Feather
            name="volume-2"
            size={24}
            color={audioPressed ? "#FFFFFF" : theme.primary}
          />
          <ThemedText
            style={[
              styles.controlButtonText,
              { color: audioPressed ? "#FFFFFF" : theme.text },
            ]}
          >
            Audio
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );

  const renderResults = () => {
    const { positionAccuracy, audioAccuracy, totalAccuracy } =
      calculateResults();

    return (
      <View style={styles.resultsContainer}>
        <ThemedText style={styles.resultsTitle}>Session Complete</ThemedText>

        <View style={styles.scoreCircle}>
          <ThemedText
            style={[styles.scoreValue, { color: getScoreColor(totalAccuracy) }]}
          >
            {totalAccuracy}%
          </ThemedText>
          <ThemedText
            style={[styles.scoreLabel, { color: theme.textSecondary }]}
          >
            Overall Accuracy
          </ThemedText>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Feather
              name="grid"
              size={24}
              color={getScoreColor(positionAccuracy)}
            />
            <ThemedText
              style={[
                styles.statValue,
                { color: getScoreColor(positionAccuracy) },
              ]}
            >
              {positionAccuracy}%
            </ThemedText>
            <ThemedText
              style={[styles.statLabel, { color: theme.textSecondary }]}
            >
              Position
            </ThemedText>
          </View>

          <View style={styles.statCard}>
            <Feather
              name="volume-2"
              size={24}
              color={getScoreColor(audioAccuracy)}
            />
            <ThemedText
              style={[
                styles.statValue,
                { color: getScoreColor(audioAccuracy) },
              ]}
            >
              {audioAccuracy}%
            </ThemedText>
            <ThemedText
              style={[styles.statLabel, { color: theme.textSecondary }]}
            >
              Audio
            </ThemedText>
          </View>
        </View>

        <ThemedText
          style={[styles.performanceMessage, { color: theme.textSecondary }]}
        >
          {totalAccuracy >= 80
            ? "Excellent! You're mastering this level."
            : totalAccuracy >= 60
              ? "Good effort! Keep practicing."
              : "Keep going! You'll improve with practice."}
        </ThemedText>

        <View
          style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}
        >
          <Pressable
            onPress={handleComplete}
            style={[styles.button, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.buttonText}>Complete</ThemedText>
          </Pressable>

          <Pressable onPress={startGame} style={styles.skipButton}>
            <ThemedText style={[styles.skipText, { color: theme.primary }]}>
              Try Again
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <ThemedView
      style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}
    >
      {phase === "intro" && renderIntro()}
      {phase === "playing" && renderPlaying()}
      {phase === "results" && renderResults()}
    </ThemedView>
  );
}

interface GridCellProps {
  isActive: boolean;
  theme: any;
}

function GridCell({ isActive, theme }: GridCellProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isActive) {
      scale.value = withSequence(
        withSpring(1.05, { damping: 10 }),
        withSpring(1, { damping: 15 }),
      );
    }
  }, [isActive, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.gridCell, animatedStyle]}>
      <View
        style={[
          styles.gridCellInner,
          {
            borderColor: "rgba(0,0,0,0.3)",
            backgroundColor: isActive ? theme.primary : theme.backgroundDefault,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  introContainer: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: Spacing["3xl"],
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: Spacing["2xl"],
  },
  nLevelSection: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  nLevelLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  nLevelSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  nLevelButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  nLevelButtonText: {
    fontSize: 18,
    fontWeight: "600",
  },
  instructionsCard: {
    gap: Spacing.md,
    marginBottom: Spacing["2xl"],
  },
  instructionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
  },
  footer: {
    marginTop: "auto",
  },
  button: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  buttonText: {
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
  gameContainer: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: Spacing.xl,
  },
  trialCounter: {
    fontSize: 16,
    fontWeight: "500",
  },
  nLevelIndicator: {
    fontSize: 16,
    fontWeight: "600",
  },
  letterDisplay: {
    height: 80,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  currentLetter: {
    fontSize: 48,
    fontWeight: "300",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: CELL_SIZE * 3 + GRID_GAP * 2,
    gap: GRID_GAP,
    marginBottom: Spacing["3xl"],
  },
  gridCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  gridCellInner: {
    flex: 1,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
  },
  controls: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
    marginTop: "auto",
    marginBottom: Spacing["2xl"],
  },
  controlButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    gap: Spacing.sm,
  },
  controlButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  resultsContainer: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
  },
  resultsTitle: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: Spacing["2xl"],
  },
  scoreCircle: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  scoreValue: {
    fontSize: 56,
    fontWeight: "700",
  },
  scoreLabel: {
    fontSize: 14,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.lg,
    marginBottom: Spacing["2xl"],
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.lg,
    backgroundColor: "#F5F5F5",
    borderRadius: BorderRadius.md,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "600",
    marginTop: Spacing.sm,
  },
  statLabel: {
    fontSize: 14,
    marginTop: Spacing.xs,
  },
  performanceMessage: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: Spacing["2xl"],
  },
});
