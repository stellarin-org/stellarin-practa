import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, StyleSheet, Pressable, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

import { Deck, Drill, DrillResult, SessionSummary } from "./lib/types";
import { loadAndValidateDeck } from "./lib/deck-validator";
import { SRSManager } from "./lib/srs-manager";
import { generateSession } from "./lib/session-generator";
import { DrillCard } from "./components/DrillCard";
import { FeedbackOverlay } from "./components/FeedbackOverlay";
import { ProgressBar } from "./components/ProgressBar";
import { SessionSummaryView } from "./components/SessionSummary";
import { IntroTutorial } from "./components/IntroTutorial";

const TUTORIAL_COMPLETED_KEY = "major_system_tutorial_completed";

type Phase = "loading" | "tutorial" | "ready" | "drilling" | "feedback" | "summary";

export default function MajorSystemTrainer({
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

  const [phase, setPhase] = useState<Phase>("loading");
  const [deck, setDeck] = useState<Deck | null>(null);
  const [srsManager, setSRSManager] = useState<SRSManager | null>(null);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>();
  const [currentResult, setCurrentResult] = useState<DrillResult | null>(null);
  const [results, setResults] = useState<DrillResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const drillStartTimeRef = useRef<number>(0);

  useEffect(() => {
    setConfig({
      headerMode: "default",
      title: "Major System",
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings]);

  useEffect(() => {
    async function initialize() {
      try {
        const deckData = context.assets?.deck;
        if (!deckData) {
          setError("Deck data not found in assets");
          return;
        }

        const validatedDeck = loadAndValidateDeck(deckData);
        setDeck(validatedDeck);

        let manager: SRSManager;
        if (context.storage) {
          manager = await SRSManager.load(context.storage, validatedDeck);
          setSRSManager(manager);

          const tutorialCompleted = await context.storage.get(TUTORIAL_COMPLETED_KEY);
          if (!tutorialCompleted) {
            setPhase("tutorial");
          } else {
            setPhase("ready");
          }
        } else {
          const noopStorage = {
            get: async () => null,
            set: async () => {},
            remove: async () => {},
            clear: async () => {},
          };
          manager = new SRSManager(noopStorage, validatedDeck);
          setSRSManager(manager);
          setPhase("tutorial");
        }
      } catch (err) {
        console.error("Failed to initialize Major System Trainer:", err);
        setError(err instanceof Error ? err.message : "Failed to load deck");
      }
    }

    initialize();
  }, [context.assets, context.storage]);

  const resolveImageAsset = useCallback(
    (imageName: string): number | { uri: string } | undefined => {
      const assets = context.assets as Record<string, unknown> | undefined;
      if (!assets) return undefined;
      
      if (assets[imageName]) {
        return assets[imageName] as number | { uri: string };
      }
      
      const deckMatch = imageName.match(/^(\d+)_(\w+)\.(png|webp)$/);
      if (deckMatch) {
        const [, num, word] = deckMatch;
        const assetKey = `img_${num}_${word}`;
        if (assets[assetKey]) {
          return assets[assetKey] as number | { uri: string };
        }
      }
      
      const altMatch = imageName.match(/^(\w+)_(\d+)\.(png|webp)$/);
      if (altMatch) {
        const [, word, num] = altMatch;
        const assetKey = `img_${num}_${word}`;
        if (assets[assetKey]) {
          return assets[assetKey] as number | { uri: string };
        }
      }
      
      return undefined;
    },
    [context.assets]
  );

  const handleTutorialComplete = useCallback(async () => {
    if (context.storage) {
      await context.storage.set(TUTORIAL_COMPLETED_KEY, "true");
    }
    setPhase("ready");
  }, [context.storage]);

  const startSession = useCallback(() => {
    if (!deck || !srsManager) return;

    const sessionDrills = generateSession(srsManager, deck);
    setDrills(sessionDrills);
    setCurrentIndex(0);
    setResults([]);
    setPhase("drilling");
    drillStartTimeRef.current = Date.now();

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [deck, srsManager]);

  const handleAnswer = useCallback(
    (index: number) => {
      if (selectedIndex !== undefined) return;

      const drill = drills[currentIndex];
      const responseMs = Date.now() - drillStartTimeRef.current;
      const isCorrect = index === drill.correctIndex;

      setSelectedIndex(index);

      const result: DrillResult = {
        drill,
        selectedIndex: index,
        isCorrect,
        responseMs,
      };

      setCurrentResult(result);
      setResults((prev) => [...prev, result]);

      if (srsManager) {
        const chosenNumber = drill.choices[index].number;
        srsManager.recordAnswer(drill.targetNumber, isCorrect, chosenNumber);
      }

      if (Platform.OS !== "web") {
        if (isCorrect) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }

      setTimeout(() => {
        setPhase("feedback");
      }, 300);
    },
    [drills, currentIndex, selectedIndex, srsManager]
  );

  const handleContinue = useCallback(async () => {
    setSelectedIndex(undefined);
    setCurrentResult(null);

    if (currentIndex < drills.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setPhase("drilling");
      drillStartTimeRef.current = Date.now();
    } else {
      if (srsManager) {
        await srsManager.save();
      }
      setPhase("summary");
    }
  }, [currentIndex, drills.length, srsManager]);

  const getSummary = useCallback((): SessionSummary => {
    const correctCount = results.filter((r) => r.isCorrect).length;
    const stats = srsManager?.getStats();
    
    return {
      totalQuestions: results.length,
      correctCount,
      accuracy: results.length > 0 ? correctCount / results.length : 0,
      newCardsIntroduced: drills.filter(
        (d, i) => results[i] && !results.slice(0, i).some((r) => r.drill.targetNumber === d.targetNumber)
      ).length,
      cardsReviewed: results.length,
      dueRemaining: stats?.dueNow || 0,
    };
  }, [results, drills, srsManager]);

  const handleSessionComplete = useCallback(() => {
    const summary = getSummary();
    onComplete({
      content: {
        type: "text",
        value: `Completed ${summary.totalQuestions} questions with ${Math.round(summary.accuracy * 100)}% accuracy`,
      },
      metadata: {
        accuracy: summary.accuracy,
        totalQuestions: summary.totalQuestions,
        correctCount: summary.correctCount,
        completedAt: Date.now(),
      },
    });
  }, [getSummary, onComplete]);

  if (error) {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
        <View style={styles.centerContent}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          {onSkip ? (
            <Pressable onPress={onSkip} style={[styles.button, { backgroundColor: theme.primary }]}>
              <ThemedText style={styles.buttonText}>Skip</ThemedText>
            </Pressable>
          ) : null}
        </View>
      </ThemedView>
    );
  }

  if (phase === "loading") {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading deck...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (phase === "tutorial") {
    return (
      <IntroTutorial
        onComplete={handleTutorialComplete}
        headerHeight={headerHeight}
      />
    );
  }

  if (phase === "ready") {
    const stats = srsManager?.getStats();
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
        <View style={styles.centerContent}>
          <ThemedText style={styles.title}>Major System</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
            Learn 01-99 with images
          </ThemedText>

          {stats ? (
            <View style={[styles.statsBox, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
              <View style={styles.statItem}>
                <ThemedText style={styles.statNumber}>{stats.introduced}</ThemedText>
                <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
                  Learned
                </ThemedText>
              </View>
              <View style={styles.statItem}>
                <ThemedText style={[styles.statNumber, { color: theme.primary }]}>
                  {stats.dueNow}
                </ThemedText>
                <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
                  Due
                </ThemedText>
              </View>
              <View style={styles.statItem}>
                <ThemedText style={[styles.statNumber, { color: theme.success }]}>
                  {stats.mastered}
                </ThemedText>
                <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
                  Mastered
                </ThemedText>
              </View>
            </View>
          ) : null}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Pressable
            onPress={startSession}
            style={[styles.button, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.buttonText}>Start Practice</ThemedText>
          </Pressable>

          <Pressable onPress={() => setPhase("tutorial")} style={styles.skipButton}>
            <ThemedText style={[styles.skipText, { color: theme.textSecondary }]}>
              View Tutorial
            </ThemedText>
          </Pressable>

          {onSkip ? (
            <Pressable onPress={onSkip} style={styles.skipButton}>
              <ThemedText style={[styles.skipText, { color: theme.textSecondary }]}>
                Skip
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </ThemedView>
    );
  }

  if (phase === "summary") {
    return (
      <View style={[styles.container, { paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <SessionSummaryView
          summary={getSummary()}
          onComplete={handleSessionComplete}
          onPracticeAgain={startSession}
        />
      </View>
    );
  }

  const currentDrill = drills[currentIndex];

  return (
    <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
      <View style={styles.progressContainer}>
        <ProgressBar current={currentIndex + 1} total={drills.length} />
        <ThemedText style={[styles.progressText, { color: theme.textSecondary }]}>
          {currentIndex + 1} / {drills.length}
        </ThemedText>
      </View>

      <View style={styles.drillContent}>
        {currentDrill ? (
          <DrillCard
            drill={currentDrill}
            onAnswer={handleAnswer}
            disabled={selectedIndex !== undefined}
            selectedIndex={selectedIndex}
            resolveImageAsset={resolveImageAsset}
          />
        ) : null}
      </View>

      {phase === "feedback" && currentResult ? (
        <FeedbackOverlay
          result={currentResult}
          onContinue={handleContinue}
          resolveImageAsset={resolveImageAsset}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: Spacing["2xl"],
  },
  loadingText: {
    marginTop: Spacing.lg,
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  statsBox: {
    flexDirection: "row",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    gap: Spacing["2xl"],
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    marginTop: Spacing.xs,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
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
  progressContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  progressText: {
    fontSize: 12,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  drillContent: {
    flex: 1,
    justifyContent: "center",
  },
});
