import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { GlassBackground } from "@/components/GlassBackground";
import { GlassCard } from "@/components/GlassCard";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

interface Letter {
  id: string;
  content: string;
  createdAt: number;
  deliveryDate: number;
  deliveryLabel: string;
}

interface Config {
  mode?: "save" | "show";
}

type WriteStep = "write" | "schedule" | "done";

const DELIVERY_OPTIONS = [
  { value: "1d", label: "Tomorrow", days: 1, description: "A quick reminder" },
  { value: "1w", label: "1 Week", days: 7, description: "A week from now" },
  { value: "1m", label: "1 Month", days: 30, description: "Next month" },
  { value: "3m", label: "3 Months", days: 90, description: "A season away" },
  { value: "6m", label: "6 Months", days: 180, description: "Half a year" },
  { value: "1y", label: "1 Year", days: 365, description: "Your future self" },
];

const POETIC_GREETINGS = [
  "A message from the past has arrived...",
  "Your former self left these words for you...",
  "Time has delivered this moment to you...",
  "From across the days, a voice whispers...",
  "The universe has kept this safe for you...",
];

function getRandomGreeting() {
  return POETIC_GREETINGS[Math.floor(Math.random() * POETIC_GREETINGS.length)];
}

function formatTimeAgo(createdAt: number): string {
  const now = Date.now();
  const diff = now - createdAt;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "a week ago" : `${weeks} weeks ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? "a month ago" : `${months} months ago`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

export default function MyPracta({
  context,
  onComplete,
  onSettings,
  showSettings,
}: PractaProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();

  const config = (context.assets?.config as Config) || {};
  const inputRef = useRef<TextInput>(null);
  const mode = config.mode || "save";

  const [letterContent, setLetterContent] = useState("");
  const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null);
  const [writeStep, setWriteStep] = useState<WriteStep>("write");
  const [letters, setLetters] = useState<Letter[]>([]);
  const [dueLetters, setDueLetters] = useState<Letter[]>([]);
  const [currentLetterIndex, setCurrentLetterIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 2000 }),
        withTiming(0.3, { duration: 2000 })
      ),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  useEffect(() => {
    const title = mode === "save" 
      ? (writeStep === "schedule" ? "When to Deliver" : "Write a Letter")
      : "Your Letters";
    setConfig({
      headerMode: "default",
      title,
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings, mode, writeStep]);

  useEffect(() => {
    loadLetters();
  }, []);

  useEffect(() => {
    if (mode === "save" && writeStep === "write" && !isLoading) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [mode, writeStep, isLoading]);

  const loadLetters = async () => {
    setIsLoading(true);
    try {
      const stored = await context.storage?.get<Letter[]>("letters");
      if (stored) {
        setLetters(stored);
        const now = Date.now();
        const due = stored.filter((letter) => letter.deliveryDate <= now);
        setDueLetters(due);
      }
    } catch (error) {
      console.warn("Failed to load letters:", error);
    }
    setIsLoading(false);
  };

  const saveNewLetter = async () => {
    if (!letterContent.trim() || !selectedDelivery) return;

    const delivery = DELIVERY_OPTIONS.find((d) => d.value === selectedDelivery);
    if (!delivery) return;

    const now = Date.now();
    const deliveryDate = now + delivery.days * 24 * 60 * 60 * 1000;

    const newLetter: Letter = {
      id: `letter-${now}`,
      content: letterContent.trim(),
      createdAt: now,
      deliveryDate,
      deliveryLabel: delivery.label,
    };

    const updatedLetters = [...letters, newLetter];
    await context.storage?.set("letters", updatedLetters);
    setLetters(updatedLetters);
    setWriteStep("done");

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const markLetterAsRead = async (letterId: string) => {
    const updatedLetters = letters.filter((l) => l.id !== letterId);
    await context.storage?.set("letters", updatedLetters);
    setLetters(updatedLetters);

    const remainingDue = dueLetters.filter((l) => l.id !== letterId);
    setDueLetters(remainingDue);

    if (currentLetterIndex >= remainingDue.length && remainingDue.length > 0) {
      setCurrentLetterIndex(remainingDue.length - 1);
    }
  };

  const handleComplete = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onComplete({
      content: {
        type: "text",
        value:
          mode === "save"
            ? "Letter saved for future delivery"
            : `Read ${dueLetters.length} letter(s) from the past`,
      },
      metadata: {
        completedAt: Date.now(),
        mode,
      },
    });
  };

  const triggerHaptic = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  if (isLoading) {
    return (
      <GlassBackground
        style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}
      >
        <View style={styles.centerContent}>
          <Feather name="loader" size={32} color={theme.primary} />
        </View>
      </GlassBackground>
    );
  }

  if (mode === "show") {
    if (dueLetters.length === 0) {
      return (
        <GlassBackground
          style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}
        >
          <Animated.View
            entering={FadeIn.duration(800)}
            style={styles.centerContent}
          >
            <GlassCard style={styles.emptyStateCard}>
              <View style={styles.emptyStateInner}>
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: theme.primary + "20" },
                  ]}
                >
                  <Feather name="mail" size={48} color={theme.primary} />
                </View>
                <ThemedText style={styles.title}>No Letters Yet</ThemedText>
                <ThemedText
                  style={[styles.subtitle, { color: theme.textSecondary }]}
                >
                  Your future letters are still traveling through time. They will
                  appear here when the moment is right.
                </ThemedText>
                {letters.length > 0 ? (
                  <ThemedText
                    style={[styles.pendingNote, { color: theme.textSecondary }]}
                  >
                    {letters.length} letter{letters.length > 1 ? "s" : ""} waiting
                    to be delivered
                  </ThemedText>
                ) : null}
              </View>
            </GlassCard>
          </Animated.View>
          <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <Pressable
              onPress={handleComplete}
              style={[styles.button, { backgroundColor: theme.primary }]}
            >
              <ThemedText style={styles.buttonText}>Continue</ThemedText>
            </Pressable>
            <Pressable onPress={() => onComplete({})} style={styles.skipButton}>
              <ThemedText
                style={[styles.skipText, { color: theme.textSecondary }]}
              >
                Skip
              </ThemedText>
            </Pressable>
          </View>
        </GlassBackground>
      );
    }

    const currentLetter = dueLetters[currentLetterIndex];

    return (
      <GlassBackground
        style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInUp.duration(1000).delay(200)}>
            <View style={styles.letterHeader}>
              <Animated.View style={[styles.glowCircle, glowStyle]}>
                <View
                  style={[
                    styles.envelopeIcon,
                    { backgroundColor: theme.primary + "30" },
                  ]}
                >
                  <Feather name="mail" size={40} color={theme.primary} />
                </View>
              </Animated.View>
            </View>

            <ThemedText
              style={[styles.poeticGreeting, { color: theme.textSecondary }]}
            >
              {getRandomGreeting()}
            </ThemedText>

            <Animated.View entering={FadeInUp.duration(800).delay(600)}>
              <GlassCard style={styles.letterCard}>
                <ThemedText style={[styles.letterDate, { color: theme.textSecondary }]}>
                  Written {formatTimeAgo(currentLetter.createdAt)}
                </ThemedText>
                <ThemedText style={styles.letterText}>
                  {currentLetter.content}
                </ThemedText>
                <View style={styles.letterSignature}>
                  <Feather
                    name="heart"
                    size={16}
                    color={theme.primary}
                    style={{ marginRight: Spacing.xs }}
                  />
                  <ThemedText
                    style={[
                      styles.signatureText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    From your past self
                  </ThemedText>
                </View>
              </GlassCard>
            </Animated.View>

            {dueLetters.length > 1 ? (
              <View style={styles.letterNavigation}>
                <ThemedText
                  style={[styles.letterCount, { color: theme.textSecondary }]}
                >
                  Letter {currentLetterIndex + 1} of {dueLetters.length}
                </ThemedText>
                <View style={styles.navButtons}>
                  <GlassCard
                    noPadding
                    onPress={() => {
                      triggerHaptic();
                      setCurrentLetterIndex(Math.max(0, currentLetterIndex - 1));
                    }}
                    style={[
                      styles.navButton,
                      { opacity: currentLetterIndex === 0 ? 0.3 : 1 },
                    ]}
                  >
                    <Feather name="chevron-left" size={20} color={theme.text} />
                  </GlassCard>
                  <GlassCard
                    noPadding
                    onPress={() => {
                      triggerHaptic();
                      setCurrentLetterIndex(
                        Math.min(dueLetters.length - 1, currentLetterIndex + 1)
                      );
                    }}
                    style={[
                      styles.navButton,
                      {
                        opacity:
                          currentLetterIndex === dueLetters.length - 1 ? 0.3 : 1,
                      },
                    ]}
                  >
                    <Feather name="chevron-right" size={20} color={theme.text} />
                  </GlassCard>
                </View>
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <GlassCard
            onPress={() => {
              triggerHaptic();
              markLetterAsRead(currentLetter.id);
            }}
            style={styles.glassActionButton}
          >
            <View style={styles.glassButtonInner}>
              <Feather
                name="check"
                size={18}
                color={theme.text}
                style={{ marginRight: Spacing.sm }}
              />
              <ThemedText style={[styles.secondaryButtonText, { color: theme.text }]}>
                Mark as Read
              </ThemedText>
            </View>
          </GlassCard>
          <Pressable
            onPress={handleComplete}
            style={[styles.button, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.buttonText}>Done Reading</ThemedText>
          </Pressable>
        </View>
      </GlassBackground>
    );
  }

  if (writeStep === "done") {
    const delivery = DELIVERY_OPTIONS.find((d) => d.value === selectedDelivery);
    return (
      <GlassBackground
        style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}
      >
        <Animated.View
          entering={FadeIn.duration(800)}
          style={styles.centerContent}
        >
          <GlassCard style={styles.emptyStateCard}>
            <View style={styles.emptyStateInner}>
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: theme.success + "20" },
                ]}
              >
                <Feather name="send" size={48} color={theme.success} />
              </View>
              <ThemedText style={styles.title}>Letter Sealed</ThemedText>
              <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
                Your words will find their way to you in {delivery?.label.toLowerCase()}.
              </ThemedText>
              <ThemedText style={[styles.poeticNote, { color: theme.primary }]}>
                "Time carries our words like seeds on the wind."
              </ThemedText>
            </View>
          </GlassCard>
        </Animated.View>
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Pressable
            onPress={handleComplete}
            style={[styles.button, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.buttonText}>Complete</ThemedText>
          </Pressable>
        </View>
      </GlassBackground>
    );
  }

  if (writeStep === "schedule") {
    return (
      <GlassBackground
        style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}
      >
        <Animated.View
          entering={FadeIn.duration(400)}
          style={styles.scheduleContainer}
        >
          <View style={styles.scheduleHeader}>
            <ThemedText style={styles.scheduleTitle}>
              When should this letter arrive?
            </ThemedText>
            <ThemedText style={[styles.scheduleSubtitle, { color: theme.textSecondary }]}>
              Choose when your future self will receive these words
            </ThemedText>
          </View>

          <View style={styles.deliveryGrid}>
            {DELIVERY_OPTIONS.map((option, index) => (
              <Animated.View
                key={option.value}
                entering={FadeInUp.duration(400).delay(index * 80)}
                style={styles.deliveryItemWrapper}
              >
                <GlassCard
                  onPress={() => {
                    triggerHaptic();
                    setSelectedDelivery(option.value);
                  }}
                  noPadding
                  style={[
                    styles.deliveryItem,
                    selectedDelivery === option.value
                      ? { borderColor: theme.primary, borderWidth: 1.5 }
                      : {},
                  ]}
                >
                  <View style={styles.deliveryItemPadded}>
                    <View style={styles.deliveryItemContent}>
                      <ThemedText
                        style={[
                          styles.deliveryItemLabel,
                          {
                            color:
                              selectedDelivery === option.value
                                ? theme.primary
                                : theme.text,
                          },
                        ]}
                      >
                        {option.label}
                      </ThemedText>
                      <ThemedText
                        style={[
                          styles.deliveryItemDesc,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {option.description}
                      </ThemedText>
                    </View>
                    {selectedDelivery === option.value ? (
                      <Feather name="check-circle" size={22} color={theme.primary} />
                    ) : (
                      <View
                        style={[
                          styles.deliveryCircle,
                          { borderColor: theme.glassBorder },
                        ]}
                      />
                    )}
                  </View>
                </GlassCard>
              </Animated.View>
            ))}
          </View>
        </Animated.View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.footerButtons}>
            <GlassCard
              onPress={() => {
                triggerHaptic();
                setWriteStep("write");
              }}
              noPadding
              style={styles.backButtonGlass}
            >
              <Feather name="arrow-left" size={20} color={theme.text} />
            </GlassCard>
            <Pressable
              onPress={() => {
                triggerHaptic();
                saveNewLetter();
              }}
              disabled={!selectedDelivery}
              style={[
                styles.sendButton,
                {
                  backgroundColor: selectedDelivery
                    ? theme.primary
                    : theme.backgroundTertiary,
                },
              ]}
            >
              <Feather
                name="send"
                size={18}
                color={selectedDelivery ? "#FFFFFF" : theme.textSecondary}
                style={{ marginRight: Spacing.sm }}
              />
              <ThemedText
                style={[
                  styles.buttonText,
                  {
                    color: selectedDelivery ? "#FFFFFF" : theme.textSecondary,
                  },
                ]}
              >
                Send Letter
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </GlassBackground>
    );
  }

  return (
    <GlassBackground
      style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.writeScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeIn.duration(600)}>
            <GlassCard style={styles.writeCard}>
              <ThemedText style={[styles.salutation, { color: theme.textSecondary }]}>
                Dear Future Self,
              </ThemedText>

              <TextInput
                ref={inputRef}
                style={[
                  styles.letterInput,
                  {
                    color: theme.text,
                    outlineStyle: "none",
                  } as any,
                ]}
                placeholder="What would you like to tell yourself?"
                placeholderTextColor={theme.textSecondary + "80"}
                multiline
                value={letterContent}
                onChangeText={setLetterContent}
                textAlignVertical="top"
                selectionColor={theme.primary}
                cursorColor={theme.primary}
              />
            </GlassCard>
          </Animated.View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          {letterContent.trim() ? (
            <Animated.View entering={FadeIn.duration(300)}>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setWriteStep("schedule");
                }}
                style={[styles.button, { backgroundColor: theme.primary }]}
              >
                <ThemedText style={styles.buttonText}>
                  Continue
                </ThemedText>
                <Feather
                  name="arrow-right"
                  size={18}
                  color="#FFFFFF"
                  style={{ marginLeft: Spacing.sm }}
                />
              </Pressable>
            </Animated.View>
          ) : null}
          <Pressable onPress={() => onComplete({})} style={styles.skipButton}>
            <ThemedText
              style={[styles.skipText, { color: theme.textSecondary }]}
            >
              Skip for now
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
  },
  writeScrollContent: {
    flexGrow: 1,
    padding: Spacing.xl,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyStateCard: {
    width: "100%",
  },
  emptyStateInner: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: Spacing.lg,
  },
  pendingNote: {
    fontSize: 14,
    textAlign: "center",
    marginTop: Spacing.xl,
    fontStyle: "italic",
  },
  poeticNote: {
    fontSize: 14,
    textAlign: "center",
    marginTop: Spacing["2xl"],
    fontStyle: "italic",
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  footerButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  button: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
  backButtonGlass: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  glassActionButton: {
    marginBottom: Spacing.sm,
  },
  glassButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
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
  writeCard: {
    minHeight: 320,
  },
  salutation: {
    fontSize: 18,
    fontStyle: "italic",
    marginBottom: Spacing.lg,
  },
  letterInput: {
    flex: 1,
    minHeight: 240,
    fontSize: 18,
    lineHeight: 28,
  },
  scheduleContainer: {
    flex: 1,
    padding: Spacing.xl,
  },
  scheduleHeader: {
    marginBottom: Spacing["2xl"],
  },
  scheduleTitle: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  scheduleSubtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  deliveryGrid: {
    gap: Spacing.md,
  },
  deliveryItemWrapper: {
    width: "100%",
  },
  deliveryItem: {
    borderRadius: BorderRadius.lg,
  },
  deliveryItemPadded: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
  },
  deliveryItemContent: {
    flex: 1,
  },
  deliveryItemLabel: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 2,
  },
  deliveryItemDesc: {
    fontSize: 13,
  },
  deliveryCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
  },
  letterHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  glowCircle: {
    padding: Spacing.lg,
    borderRadius: 100,
  },
  envelopeIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  poeticGreeting: {
    fontSize: 16,
    fontStyle: "italic",
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 24,
  },
  letterCard: {
    marginBottom: Spacing.lg,
  },
  letterDate: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  letterText: {
    fontSize: 18,
    lineHeight: 28,
    marginBottom: Spacing.lg,
  },
  letterSignature: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  signatureText: {
    fontSize: 14,
    fontStyle: "italic",
  },
  letterNavigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.md,
  },
  letterCount: {
    fontSize: 14,
  },
  navButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
