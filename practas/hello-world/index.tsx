import React, { useState } from "react";
import { View, StyleSheet, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaContext, PractaCompleteHandler, PractaMetadata } from "@/types/flow";

const zenCircleImage = require("./assets/zen-circle.png");

export const metadata: PractaMetadata = {
  id: "hello-world",
  type: "hello-world",
  name: "Hello World",
  description: "A simple interactive Practa that counts taps",
  author: "Stellarin",
  version: "1.0.0",
  estimatedDuration: 15,
  category: "starter",
  tags: ["interactive", "demo"],
};

interface MyPractaProps {
  context: PractaContext;
  onComplete: PractaCompleteHandler;
  onSkip?: () => void;
}

export function MyPracta({ context, onComplete, onSkip }: MyPractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [tapCount, setTapCount] = useState(0);
  const [isPressed, setIsPressed] = useState(false);

  const handleTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTapCount(prev => prev + 1);
  };

  const handleComplete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete({
      content: { 
        type: "text", 
        value: `Hello World! Tapped ${tapCount} times.` 
      },
      metadata: { 
        tapCount,
        completedAt: Date.now(),
      },
    });
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
      <View style={styles.content}>
        <Image source={zenCircleImage} style={styles.heroImage} />
        
        <ThemedText style={styles.title}>Hello World</ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
          Welcome to your first Practa
        </ThemedText>

        <Pressable 
          onPress={handleTap}
          onPressIn={() => setIsPressed(true)}
          onPressOut={() => setIsPressed(false)}
          style={({ pressed }) => [
            styles.tapPressable,
            { transform: [{ scale: pressed ? 0.95 : 1 }] }
          ]}
        >
          <Card style={{ ...styles.tapCard, borderColor: theme.primary + "40" }}>
            <View style={[
              styles.tapCircle, 
              { backgroundColor: isPressed ? theme.primary + "40" : theme.primary + "20" }
            ]}>
              <ThemedText style={[styles.tapCount, { color: theme.primary }]}>
                {tapCount}
              </ThemedText>
            </View>
            <ThemedText style={styles.tapLabel}>Tap me</ThemedText>
          </Card>
        </Pressable>

        <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>
          Tap the card above, then complete the Practa
        </ThemedText>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable
          onPress={handleComplete}
          style={[styles.button, { backgroundColor: theme.primary }]}
        >
          <ThemedText style={styles.buttonText}>Complete</ThemedText>
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

export default MyPracta;

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
  heroImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: Spacing.lg,
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
    marginBottom: Spacing["2xl"],
  },
  tapPressable: {
  },
  tapCard: {
    padding: Spacing.xl,
    alignItems: "center",
    borderWidth: 2,
  },
  tapCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  tapCount: {
    fontSize: 36,
    fontWeight: "700",
  },
  tapLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  hint: {
    fontSize: 14,
    textAlign: "center",
    marginTop: Spacing.xl,
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
