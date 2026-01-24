import React from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { DrillResult, formatPhonemeBreakdown, isStandardDrill, StandardDrill } from "../lib/types";
import { PhonemeBreakdown } from "./PhonemeBreakdown";

interface FeedbackOverlayProps {
  result: DrillResult;
  onContinue: () => void;
  resolveImageAsset: (imageName: string) => number | { uri: string } | undefined;
}

export function FeedbackOverlay({
  result,
  onContinue,
  resolveImageAsset,
}: FeedbackOverlayProps) {
  const { theme } = useTheme();
  const { drill, isCorrect } = result;

  if (!isStandardDrill(drill)) {
    return null;
  }

  const standardDrill = drill as StandardDrill;
  const correctChoice = standardDrill.choices[standardDrill.correctIndex];
  const breakdown = formatPhonemeBreakdown(
    [parseInt(standardDrill.targetNumber[0]), parseInt(standardDrill.targetNumber[1])] as [number, number],
    standardDrill.targetVariant.phonemes
  );

  if (!isCorrect) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundDefault + "F5" }]}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ThemedText style={[styles.encourageText, { color: theme.textSecondary }]}>
            Let's learn this one
          </ThemedText>

          <View style={styles.imagePreview}>
            <Image
              source={resolveImageAsset(correctChoice.variant.image)}
              style={styles.learnImage}
              contentFit="cover"
            />
          </View>

          <PhonemeBreakdown
            number={standardDrill.targetNumber}
            word={correctChoice.variant.word}
            phonemes={standardDrill.targetVariant.phonemes}
          />

          <ThemedText style={[styles.explanationText, { color: theme.textSecondary }]}>
            In the Major System, each digit has specific sounds. Combine them to form a memorable word.
          </ThemedText>

          <Pressable
            onPress={onContinue}
            style={[styles.continueButton, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.continueButtonText}>Got it</ThemedText>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault + "F5" }]}>
      <View style={styles.content}>
        <View style={[
          styles.iconContainer,
          { backgroundColor: theme.success + "20" }
        ]}>
          <Feather
            name="check"
            size={48}
            color={theme.success}
          />
        </View>

        <ThemedText style={styles.resultText}>Correct!</ThemedText>

        <View style={[styles.cardInfo, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <ThemedText style={styles.cardNumber}>{standardDrill.targetNumber}</ThemedText>
            <View style={styles.cardDetails}>
              <Image
                source={resolveImageAsset(correctChoice.variant.image)}
                style={styles.feedbackImage}
                contentFit="cover"
              />
              <ThemedText style={styles.cardWord}>{correctChoice.variant.word}</ThemedText>
            </View>
          </View>
          
          <View style={[styles.breakdownContainer, { backgroundColor: theme.backgroundSecondary }]}>
            <ThemedText style={[styles.breakdownLabel, { color: theme.textSecondary }]}>
              Phoneme breakdown:
            </ThemedText>
            <ThemedText style={styles.breakdownText}>{breakdown}</ThemedText>
          </View>
        </View>

        <Pressable
          onPress={onContinue}
          style={[styles.continueButton, { backgroundColor: theme.primary }]}
        >
          <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  scrollView: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing.xl,
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  content: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  resultText: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: Spacing.xl,
  },
  encourageText: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  imagePreview: {
    width: 120,
    height: 120,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.xl,
  },
  learnImage: {
    width: "100%",
    height: "100%",
  },
  explanationText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
    lineHeight: 20,
    paddingHorizontal: Spacing.md,
  },
  cardInfo: {
    width: "100%",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: Spacing["2xl"],
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  cardNumber: {
    fontSize: 48,
    fontWeight: "700",
  },
  cardDetails: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  feedbackImage: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.sm,
  },
  cardWord: {
    fontSize: 20,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  breakdownContainer: {
    padding: Spacing.md,
  },
  breakdownLabel: {
    fontSize: 12,
    marginBottom: Spacing.xs,
  },
  breakdownText: {
    fontSize: 16,
    fontWeight: "500",
  },
  continueButton: {
    width: "100%",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  continueButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
