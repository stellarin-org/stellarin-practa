/**
 * Practa Starter Template
 * 
 * This is a minimal template for building your own Practa.
 * 
 * Key concepts:
 * - `context`: Contains flow info and optional `storage` for persistence
 * - `onComplete`: Call when the user finishes the experience
 * - `onSkip`: Optional callback if the user can skip
 * 
 * For persistent state (user preferences, progress), use context.storage:
 *   await context.storage?.get<string>("key")
 *   await context.storage?.set("key", value)
 * 
 * See docs/practa-storage-system.md for full storage documentation.
 */

import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, Platform, ImageSourcePropType } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaContext, PractaCompleteHandler, PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

interface ContentData {
  title: string;
  startedTitle: string;
  welcomeMessage: string;
  startedMessage: string;
  buttonStart: string;
  buttonComplete: string;
  buttonSkip: string;
}

interface MyPractaProps extends PractaProps {}

export default function MyPracta({ context, onComplete, onSkip, onSettings, showSettings }: MyPractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    setConfig({
      headerMode: "default",
      title: "My Practa",
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings]);

  // Get assets from context
  const wellnessBgSource = context.assets?.wellnessBg as ImageSourcePropType | undefined;
  const content = context.assets?.content as ContentData | undefined;

  // Default content fallbacks
  const title = isStarted 
    ? (content?.startedTitle ?? "Great!") 
    : (content?.title ?? "Welcome");
  const subtitle = isStarted
    ? (content?.startedMessage ?? "You've started your Practa experience.")
    : (content?.welcomeMessage ?? "This is a starter template. Customize it to create your own wellbeing experience.");
  const startButtonText = content?.buttonStart ?? "Start";
  const completeButtonText = content?.buttonComplete ?? "Complete";
  const skipButtonText = content?.buttonSkip ?? "Skip";

  const triggerHaptic = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleStart = () => {
    triggerHaptic();
    setIsStarted(true);
  };

  const handleComplete = () => {
    triggerHaptic();
    onComplete({
      content: { 
        type: "text", 
        value: "Practa completed successfully!"
      },
      metadata: { 
        completedAt: Date.now(),
        settings: {
          difficulty: "medium",
          soundEnabled: true
        }
      },
    });
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
      <View style={styles.content}>
        {wellnessBgSource ? (
          <Image
            source={wellnessBgSource}
            style={styles.wellnessImage}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.iconContainer, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="star" size={48} color={theme.primary} />
          </View>
        )}

        <ThemedText style={styles.title}>
          {title}
        </ThemedText>
        
        <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
          {subtitle}
        </ThemedText>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {isStarted ? (
          <Pressable
            onPress={handleComplete}
            style={[styles.button, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.buttonText}>{completeButtonText}</ThemedText>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleStart}
            style={[styles.button, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.buttonText}>{startButtonText}</ThemedText>
          </Pressable>
        )}

        {onSkip ? (
          <Pressable onPress={onSkip} style={styles.skipButton}>
            <ThemedText style={[styles.skipText, { color: theme.textSecondary }]}>
              {skipButtonText}
            </ThemedText>
          </Pressable>
        ) : null}
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
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  wellnessImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
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
});
