import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { SessionSummary as SessionSummaryType } from "../lib/types";

interface SessionSummaryProps {
  summary: SessionSummaryType;
  onComplete: () => void;
  onPracticeAgain: () => void;
}

export function SessionSummaryView({
  summary,
  onComplete,
  onPracticeAgain,
}: SessionSummaryProps) {
  const { theme } = useTheme();

  const getPerformanceMessage = () => {
    if (summary.accuracy >= 0.9) return "Excellent work!";
    if (summary.accuracy >= 0.7) return "Good progress!";
    if (summary.accuracy >= 0.5) return "Keep practicing!";
    return "Don't give up!";
  };

  const getPerformanceColor = () => {
    if (summary.accuracy >= 0.9) return theme.success;
    if (summary.accuracy >= 0.7) return theme.primary;
    if (summary.accuracy >= 0.5) return theme.warning;
    return theme.error;
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: getPerformanceColor() + "20" }]}>
          <Feather name="award" size={56} color={getPerformanceColor()} />
        </View>

        <ThemedText style={styles.title}>{getPerformanceMessage()}</ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
          Session complete
        </ThemedText>

        <View style={[styles.statsContainer, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
          <View style={styles.statRow}>
            <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
              Accuracy
            </ThemedText>
            <ThemedText style={[styles.statValue, { color: getPerformanceColor() }]}>
              {Math.round(summary.accuracy * 100)}%
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.statRow}>
            <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
              Questions
            </ThemedText>
            <ThemedText style={styles.statValue}>
              {summary.correctCount}/{summary.totalQuestions}
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.statRow}>
            <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
              New cards
            </ThemedText>
            <ThemedText style={styles.statValue}>
              {summary.newCardsIntroduced}
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.statRow}>
            <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
              Due remaining
            </ThemedText>
            <ThemedText style={styles.statValue}>
              {summary.dueRemaining}
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <Pressable
          onPress={onComplete}
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
        >
          <ThemedText style={styles.primaryButtonText}>Done</ThemedText>
        </Pressable>

        <Pressable
          onPress={onPracticeAgain}
          style={[styles.secondaryButton, { borderColor: theme.border }]}
        >
          <ThemedText style={styles.secondaryButtonText}>Try More</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
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
    marginBottom: Spacing["2xl"],
  },
  statsContainer: {
    width: "100%",
    maxWidth: 300,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  statLabel: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "600",
  },
  divider: {
    height: 1,
  },
  buttonContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  primaryButton: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
