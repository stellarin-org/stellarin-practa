import React, { useState, useCallback, useEffect } from "react";
import { View, StyleSheet, TextInput, Pressable, useWindowDimensions, ScrollView, Platform } from "react-native";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { HistoricalDateDrill as HistoricalDateDrillType } from "../lib/types";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface HistoricalDateDrillProps {
  drill: HistoricalDateDrillType;
  onComplete: (isCorrect: boolean, enteredAnswer: string) => void;
  disabled?: boolean;
  resolveImageAsset: (imageName: string) => number | { uri: string } | undefined;
}

export function HistoricalDateDrill({
  drill,
  onComplete,
  disabled = false,
  resolveImageAsset,
}: HistoricalDateDrillProps) {
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [answer, setAnswer] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  useEffect(() => {
    setAnswer("");
    setShowResult(false);
    setIsCorrect(false);
  }, [drill.id]);

  const cardWidth = Math.min(100, (screenWidth - Spacing.lg * 2 - Spacing.md * (drill.cards.length - 1)) / drill.cards.length);

  const handleSubmit = useCallback(() => {
    if (disabled || showResult || !answer.trim()) return;

    const normalizedAnswer = answer.trim().replace(/[^0-9]/g, "");
    const normalizedCorrect = drill.correctAnswer.replace(/[^0-9]/g, "");
    
    const correct = normalizedAnswer === normalizedCorrect;
    setIsCorrect(correct);
    setShowResult(true);

    setTimeout(() => {
      onComplete(correct, answer);
    }, 1500);
  }, [answer, drill.correctAnswer, disabled, showResult, onComplete]);

  return (
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <ThemedText style={[styles.dateOfLabel, { color: theme.textSecondary }]}>
            THE DATE OF
          </ThemedText>
          <ThemedText style={styles.eventName}>
            {drill.dateEntry.event}
          </ThemedText>
        </View>

        <View style={[styles.quoteContainer, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
          <ThemedText style={[styles.quoteText, { color: theme.textSecondary }]}>
            "{drill.dateEntry.quote}"
          </ThemedText>
          <ThemedText style={[styles.whyText, { color: theme.text }]}>
            {drill.dateEntry.why_important}
          </ThemedText>
        </View>

        <View style={styles.cardsContainer}>
          {drill.cards.map((card, index) => (
            <View
              key={`card-${index}`}
              style={[
                styles.card,
                { 
                  width: cardWidth,
                  backgroundColor: theme.backgroundSecondary,
                  borderColor: showResult ? (isCorrect ? theme.success : theme.error) : theme.border,
                },
              ]}
            >
              <Image
                source={resolveImageAsset(card.variant.image)}
                style={styles.cardImage}
                contentFit="cover"
                placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                transition={150}
              />
              <View style={styles.cardLabel}>
                <ThemedText style={styles.cardWord}>{card.variant.word}</ThemedText>
                {showResult ? (
                  <ThemedText style={[styles.cardNumber, { color: theme.primary }]}>
                    {card.number}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: theme.backgroundSecondary,
                borderColor: showResult ? (isCorrect ? theme.success : theme.error) : theme.border,
                color: theme.text,
              },
            ]}
            value={answer}
            onChangeText={setAnswer}
            placeholder="Enter the date..."
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            editable={!disabled && !showResult}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {!showResult ? (
            <Pressable
              style={[
                styles.submitButton,
                {
                  backgroundColor: answer.trim() ? theme.primary : theme.backgroundSecondary,
                  opacity: answer.trim() ? 1 : 0.5,
                },
              ]}
              onPress={handleSubmit}
              disabled={!answer.trim() || disabled}
            >
              <ThemedText style={[styles.submitText, { color: answer.trim() ? "#FFFFFF" : theme.textSecondary }]}>
                Check Answer
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        {showResult ? (
          <View style={[styles.resultBanner, { backgroundColor: isCorrect ? theme.success : theme.error }]}>
            <ThemedText style={styles.resultText}>
              {isCorrect ? "Correct!" : `The answer was ${drill.correctAnswer}`}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  dateOfLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: Spacing.xs,
  },
  eventName: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 28,
  },
  quoteContainer: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  quoteText: {
    fontSize: 16,
    fontStyle: "italic",
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  whyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  cardsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  card: {
    height: 130,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: 90,
  },
  cardLabel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xs,
  },
  cardWord: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  cardNumber: {
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  inputContainer: {
    marginBottom: Spacing.lg,
  },
  textInput: {
    borderWidth: 2,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 4,
  },
  submitButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "600",
  },
  resultBanner: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  resultText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
