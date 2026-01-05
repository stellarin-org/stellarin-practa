import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Phoneme, PHONEME_DISPLAY } from "../lib/types";

interface PhonemeBreakdownProps {
  number: string;
  word: string;
  phonemes: [Phoneme, Phoneme];
}

export function PhonemeBreakdown({ number, word, phonemes }: PhonemeBreakdownProps) {
  const { theme } = useTheme();
  
  const digit1 = parseInt(number[0], 10);
  const digit2 = parseInt(number[1], 10);
  const phoneme1Display = PHONEME_DISPLAY[phonemes[0]];
  const phoneme2Display = PHONEME_DISPLAY[phonemes[1]];

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
      <View style={[styles.numberBox, { backgroundColor: theme.primary }]}>
        <ThemedText style={styles.numberText}>{number}</ThemedText>
      </View>

      <View style={styles.breakdownRow}>
        <View style={styles.digitColumn}>
          <ThemedText style={[styles.digit, { color: theme.primary }]}>{digit1}</ThemedText>
          <Feather name="arrow-down" size={16} color={theme.textSecondary} />
          <ThemedText style={styles.phoneme}>{phoneme1Display}</ThemedText>
        </View>

        <ThemedText style={[styles.plus, { color: theme.textSecondary }]}>+</ThemedText>

        <View style={styles.digitColumn}>
          <ThemedText style={[styles.digit, { color: theme.primary }]}>{digit2}</ThemedText>
          <Feather name="arrow-down" size={16} color={theme.textSecondary} />
          <ThemedText style={styles.phoneme}>{phoneme2Display}</ThemedText>
        </View>
      </View>

      <Feather name="arrow-down" size={20} color={theme.textSecondary} style={styles.finalArrow} />

      <ThemedText style={styles.word}>{word}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  numberBox: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  numberText: {
    fontSize: 32,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: Spacing.xl,
  },
  digitColumn: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  digit: {
    fontSize: 24,
    fontWeight: "600",
  },
  phoneme: {
    fontSize: 18,
    fontWeight: "600",
  },
  phonemeStack: {
    flexDirection: "row",
  },
  plus: {
    fontSize: 20,
    fontWeight: "400",
    marginTop: Spacing.xs,
  },
  finalArrow: {
    marginVertical: Spacing.md,
  },
  word: {
    fontSize: 28,
    fontWeight: "700",
    textTransform: "capitalize",
  },
});
