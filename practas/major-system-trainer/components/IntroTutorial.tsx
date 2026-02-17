import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

const ACCENT_COLORS = {
  amber: "#F59E0B",
  amberMuted: "rgba(245, 158, 11, 0.15)",
  jade: "#10B981",
  jadeMuted: "rgba(16, 185, 129, 0.15)",
};

interface IntroTutorialProps {
  onComplete: () => void;
  headerHeight: number;
}

const PHONEME_TABLE = [
  { digit: "0", sounds: "S, Z", example: "Sue, Zoo" },
  { digit: "1", sounds: "T, D", example: "Tie, Die" },
  { digit: "2", sounds: "N", example: "Noah" },
  { digit: "3", sounds: "M", example: "Ma" },
  { digit: "4", sounds: "R", example: "Ray" },
  { digit: "5", sounds: "L", example: "Law" },
  { digit: "6", sounds: "SH, CH, J", example: "Shoe, Chew" },
  { digit: "7", sounds: "K, G", example: "Key, Go" },
  { digit: "8", sounds: "F, V", example: "Fee, Vow" },
  { digit: "9", sounds: "P, B", example: "Pie, Bee" },
];

export function IntroTutorial({ onComplete, headerHeight }: IntroTutorialProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);

  const totalSteps = 4;

  const handleNext = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: i === step ? theme.primary : theme.border,
            },
          ]}
        />
      ))}
    </View>
  );

  const renderStep0 = () => (
    <View style={styles.stepContent}>
      <View style={[styles.iconCircle, { backgroundColor: ACCENT_COLORS.amberMuted }]}>
        <Feather name="zap" size={48} color={theme.primary} />
      </View>
      <ThemedText style={styles.stepTitle}>Welcome to Major System</ThemedText>
      <ThemedText style={[styles.stepDescription, { color: theme.textSecondary }]}>
        The Major System is a powerful memory technique that turns numbers into
        memorable images.
      </ThemedText>
      <View style={[styles.highlightBox, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <ThemedText style={styles.highlightText}>
          Numbers → Sounds → Words → Images
        </ThemedText>
      </View>
      <ThemedText style={[styles.stepDescription, { color: theme.textSecondary }]}>
        By learning this system, you can memorize phone numbers, dates, and any
        sequence of digits with ease.
      </ThemedText>
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>The Code</ThemedText>
      <ThemedText style={[styles.stepDescription, { color: theme.textSecondary }]}>
        Each digit (0-9) maps to specific consonant sounds:
      </ThemedText>
      <View style={[styles.tableContainer, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <View style={[styles.tableHeader, { borderBottomColor: theme.border }]}>
          <ThemedText style={[styles.tableHeaderCell, { flex: 0.5 }]}>#</ThemedText>
          <ThemedText style={[styles.tableHeaderCell, { flex: 1 }]}>Sound</ThemedText>
          <ThemedText style={[styles.tableHeaderCell, { flex: 1 }]}>Example</ThemedText>
        </View>
        {PHONEME_TABLE.map((row, i) => (
          <View
            key={row.digit}
            style={[
              styles.tableRow,
              i < PHONEME_TABLE.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
            ]}
          >
            <View style={[styles.digitCell, { flex: 0.5 }]}>
              <ThemedText style={[styles.digitText, { color: theme.primary }]}>
                {row.digit}
              </ThemedText>
            </View>
            <ThemedText style={[styles.tableCell, { flex: 1 }]}>{row.sounds}</ThemedText>
            <ThemedText style={[styles.tableCell, { flex: 1, color: theme.textSecondary }]}>
              {row.example}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>How It Works</ThemedText>
      <ThemedText style={[styles.stepDescription, { color: theme.textSecondary }]}>
        Two-digit numbers combine two sounds to form a word:
      </ThemedText>
      
      <View style={[styles.exampleBox, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <View style={styles.exampleRow}>
          <View style={[styles.numberBadge, { backgroundColor: theme.primary }]}>
            <ThemedText style={styles.numberBadgeText}>06</ThemedText>
          </View>
        </View>
        
        <View style={styles.breakdownContainer}>
          <View style={styles.breakdownItem}>
            <ThemedText style={[styles.breakdownDigit, { color: theme.primary }]}>0</ThemedText>
            <Feather name="arrow-down" size={16} color={theme.textSecondary} />
            <ThemedText style={styles.breakdownSound}>S</ThemedText>
          </View>
          <ThemedText style={[styles.breakdownPlus, { color: theme.textSecondary }]}>+</ThemedText>
          <View style={styles.breakdownItem}>
            <ThemedText style={[styles.breakdownDigit, { color: theme.primary }]}>6</ThemedText>
            <Feather name="arrow-down" size={16} color={theme.textSecondary} />
            <ThemedText style={styles.breakdownSound}>SH</ThemedText>
          </View>
        </View>
        
        <Feather name="arrow-down" size={24} color={theme.textSecondary} style={styles.arrowDown} />
        
        <View style={styles.resultRow}>
          <ThemedText style={styles.resultWord}>SuSHi</ThemedText>
        </View>
      </View>
      
      <ThemedText style={[styles.stepDescription, { color: theme.textSecondary }]}>
        Vowels (A, E, I, O, U) and some consonants (W, H, Y) are ignored - they
        are just "filler" to make real words.
      </ThemedText>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <View style={[styles.iconCircle, { backgroundColor: ACCENT_COLORS.jadeMuted }]}>
        <Feather name="target" size={48} color={ACCENT_COLORS.jade} />
      </View>
      <ThemedText style={styles.stepTitle}>Practice Makes Perfect</ThemedText>
      <ThemedText style={[styles.stepDescription, { color: theme.textSecondary }]}>
        You will practice with quick drills:
      </ThemedText>
      
      <View style={styles.drillTypeList}>
        <View style={styles.drillTypeItem}>
          <View style={[styles.drillIcon, { backgroundColor: ACCENT_COLORS.amberMuted }]}>
            <Feather name="hash" size={20} color={ACCENT_COLORS.amber} />
          </View>
          <View style={styles.drillTypeText}>
            <ThemedText style={styles.drillTypeName}>Number → Image</ThemedText>
            <ThemedText style={[styles.drillTypeDesc, { color: theme.textSecondary }]}>
              See a number, pick the matching image
            </ThemedText>
          </View>
        </View>
        
        <View style={styles.drillTypeItem}>
          <View style={[styles.drillIcon, { backgroundColor: ACCENT_COLORS.jadeMuted }]}>
            <Feather name="image" size={20} color={ACCENT_COLORS.jade} />
          </View>
          <View style={styles.drillTypeText}>
            <ThemedText style={styles.drillTypeName}>Image → Number</ThemedText>
            <ThemedText style={[styles.drillTypeDesc, { color: theme.textSecondary }]}>
              See an image, pick the matching number
            </ThemedText>
          </View>
        </View>
        
        <View style={styles.drillTypeItem}>
          <View style={[styles.drillIcon, { backgroundColor: ACCENT_COLORS.amberMuted }]}>
            <Feather name="type" size={20} color={ACCENT_COLORS.amber} />
          </View>
          <View style={styles.drillTypeText}>
            <ThemedText style={styles.drillTypeName}>Number → Word</ThemedText>
            <ThemedText style={[styles.drillTypeDesc, { color: theme.textSecondary }]}>
              See a number, pick the matching word
            </ThemedText>
          </View>
        </View>

        <View style={styles.drillTypeItem}>
          <View style={[styles.drillIcon, { backgroundColor: ACCENT_COLORS.jadeMuted }]}>
            <Feather name="layers" size={20} color={ACCENT_COLORS.jade} />
          </View>
          <View style={styles.drillTypeText}>
            <ThemedText style={styles.drillTypeName}>Pi Sequence</ThemedText>
            <ThemedText style={[styles.drillTypeDesc, { color: theme.textSecondary }]}>
              Drag and drop images to complete the sequence of Pi digits
            </ThemedText>
          </View>
        </View>

        <View style={styles.drillTypeItem}>
          <View style={[styles.drillIcon, { backgroundColor: ACCENT_COLORS.amberMuted }]}>
            <Feather name="calendar" size={20} color={ACCENT_COLORS.amber} />
          </View>
          <View style={styles.drillTypeText}>
            <ThemedText style={styles.drillTypeName}>Historical Dates</ThemedText>
            <ThemedText style={[styles.drillTypeDesc, { color: theme.textSecondary }]}>
              Memorize important dates using mnemonic images and text entry
            </ThemedText>
          </View>
        </View>
      </View>
      
      <ThemedText style={[styles.stepDescription, { color: theme.textSecondary }]}>
        Spaced repetition ensures you review cards right before you forget them.
      </ThemedText>
    </View>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 0:
        return renderStep0();
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      default:
        return null;
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: 120 + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {renderStepIndicator()}
        {renderCurrentStep()}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + Spacing.lg,
            backgroundColor: theme.backgroundDefault,
            borderTopColor: theme.border,
          },
        ]}
      >
        <View style={styles.footerButtons}>
          {step > 0 ? (
            <Pressable
              onPress={handleBack}
              style={[styles.backButton, { borderColor: theme.border }]}
            >
              <Feather name="chevron-left" size={20} color={theme.text} />
              <ThemedText style={styles.backButtonText}>Back</ThemedText>
            </Pressable>
          ) : (
            <View style={styles.backButton} />
          )}

          <Pressable
            onPress={handleNext}
            style={[styles.nextButton, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.nextButtonText}>
              {step === totalSteps - 1 ? "Get Started" : "Next"}
            </ThemedText>
            {step < totalSteps - 1 ? (
              <Feather name="chevron-right" size={20} color="white" />
            ) : null}
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  stepIndicator: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing["2xl"],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepContent: {
    alignItems: "center",
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  stepDescription: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  highlightBox: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  highlightText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  tableContainer: {
    width: "100%",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
  },
  tableHeaderCell: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
  },
  digitCell: {
    alignItems: "flex-start",
  },
  digitText: {
    fontSize: 16,
    fontWeight: "700",
  },
  tableCell: {
    fontSize: 14,
  },
  exampleBox: {
    width: "100%",
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  exampleRow: {
    marginBottom: Spacing.lg,
  },
  numberBadge: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing["2xl"],
    borderRadius: BorderRadius.md,
  },
  numberBadgeText: {
    fontSize: 36,
    fontWeight: "700",
    color: "white",
  },
  breakdownContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  breakdownItem: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  breakdownDigit: {
    fontSize: 24,
    fontWeight: "700",
  },
  breakdownSound: {
    fontSize: 18,
    fontWeight: "600",
  },
  breakdownPlus: {
    fontSize: 24,
    fontWeight: "600",
  },
  arrowDown: {
    marginVertical: Spacing.sm,
  },
  resultRow: {
    marginTop: Spacing.sm,
  },
  resultWord: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 1,
  },
  drillTypeList: {
    width: "100%",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  drillTypeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  drillIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  drillTypeText: {
    flex: 1,
  },
  drillTypeName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  drillTypeDesc: {
    fontSize: 14,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
  },
  footerButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    minWidth: 100,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: Spacing.xs,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing["2xl"],
    borderRadius: BorderRadius.md,
    minWidth: 120,
    justifyContent: "center",
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
    marginRight: Spacing.xs,
  },
});
