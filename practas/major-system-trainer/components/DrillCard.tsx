import React, { useState } from "react";
import { View, StyleSheet, Pressable, useWindowDimensions, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { StandardDrill, DrillChoice, DrillType } from "../lib/types";

const NUMBER_BUTTON_HEIGHT = 72;
const NUMBER_GRID_GAP = Spacing.md;
const HEADER_AND_PADDING = 200;
const IMAGE_PROMPT_HEIGHT = 120;

interface DrillCardProps {
  drill: StandardDrill;
  onAnswer: (index: number) => void;
  disabled?: boolean;
  selectedIndex?: number;
  resolveImageAsset: (imageName: string) => number | { uri: string } | undefined;
}

export function DrillCard({
  drill,
  onAnswer,
  disabled = false,
  selectedIndex,
  resolveImageAsset,
}: DrillCardProps) {
  const { theme } = useTheme();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();

  const numberGridHeight = (NUMBER_BUTTON_HEIGHT * 2) + NUMBER_GRID_GAP + Spacing.md;
  const availableImageHeight = screenHeight - HEADER_AND_PADDING - numberGridHeight;
  const dynamicImageHeight = Math.max(200, Math.min(availableImageHeight, 500));

  const availableWidthForImages = screenWidth - (Spacing.lg * 2) - Spacing.md;
  const imageChoiceWidth = Math.floor(availableWidthForImages / 2);
  const availableHeightForImageGrid = screenHeight - HEADER_AND_PADDING - IMAGE_PROMPT_HEIGHT;
  const imageChoiceHeight = Math.floor((availableHeightForImageGrid - Spacing.md) / 2);
  const finalImageWidth = Math.min(imageChoiceWidth, imageChoiceHeight * (2/3));
  const finalImageHeight = finalImageWidth * (3/2);

  const renderPrompt = () => {
    switch (drill.type) {
      case "NUMBER_TO_IMAGE":
      case "NUMBER_TO_WORD":
        return (
          <View style={styles.promptContainer}>
            <ThemedText style={styles.numberPrompt}>{drill.targetNumber}</ThemedText>
            <ThemedText style={[styles.promptHint, { color: theme.textSecondary }]}>
              {drill.type === "NUMBER_TO_IMAGE" ? "Select the image" : "Select the word"}
            </ThemedText>
          </View>
        );
      case "IMAGE_TO_NUMBER":
        return (
          <View style={styles.promptContainer}>
            <View style={[styles.promptImageContainer, { borderColor: theme.border, height: dynamicImageHeight }]}>
              <Image
                source={resolveImageAsset(drill.targetVariant.image)}
                style={styles.promptImage}
                contentFit="cover"
                placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                transition={200}
              />
              <View style={styles.promptWordOverlay}>
                <ThemedText style={styles.promptWordOverlayText}>{drill.targetVariant.word}</ThemedText>
              </View>
            </View>
            <ThemedText style={[styles.promptHint, { color: theme.textSecondary }]}>
              What number is this?
            </ThemedText>
          </View>
        );
    }
  };

  const renderChoice = (choice: DrillChoice, index: number) => {
    const isSelected = selectedIndex === index;
    const isCorrect = index === drill.correctIndex;
    const showResult = selectedIndex !== undefined;

    let backgroundColor = theme.backgroundSecondary;
    let borderColor = theme.border;
    
    if (showResult) {
      if (isCorrect) {
        backgroundColor = theme.success + "20";
        borderColor = theme.success;
      } else if (isSelected && !isCorrect) {
        backgroundColor = theme.error + "20";
        borderColor = theme.error;
      }
    } else if (isSelected) {
      borderColor = theme.primary;
    }

    switch (drill.type) {
      case "NUMBER_TO_IMAGE":
        return (
          <Pressable
            key={choice.number}
            style={[
              styles.imageChoice,
              { backgroundColor, borderColor, width: finalImageWidth, height: finalImageHeight },
            ]}
            onPress={() => !disabled && onAnswer(index)}
            disabled={disabled}
          >
            <Image
              source={resolveImageAsset(choice.variant.image)}
              style={styles.choiceImage}
              contentFit="cover"
              placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
              transition={150}
            />
            <View style={styles.wordOverlay}>
              <ThemedText style={styles.wordOverlayText}>{choice.variant.word}</ThemedText>
            </View>
          </Pressable>
        );
      case "IMAGE_TO_NUMBER":
        return (
          <Pressable
            key={choice.number}
            style={[
              styles.numberChoice,
              { backgroundColor, borderColor },
            ]}
            onPress={() => !disabled && onAnswer(index)}
            disabled={disabled}
          >
            <ThemedText style={styles.choiceNumber}>{choice.number}</ThemedText>
          </Pressable>
        );
      case "NUMBER_TO_WORD":
        return (
          <Pressable
            key={choice.number}
            style={[
              styles.wordChoice,
              { backgroundColor, borderColor },
            ]}
            onPress={() => !disabled && onAnswer(index)}
            disabled={disabled}
          >
            <ThemedText style={styles.choiceWord}>{choice.variant.word}</ThemedText>
          </Pressable>
        );
    }
  };

  return (
    <View style={styles.container}>
      {renderPrompt()}
      <View style={drill.type === "IMAGE_TO_NUMBER" ? styles.numberGrid : (drill.type === "NUMBER_TO_IMAGE" ? styles.imageGrid : styles.choiceList)}>
        {drill.choices.map((choice, index) => renderChoice(choice, index))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  promptContainer: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  numberPrompt: {
    fontSize: 72,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  promptHint: {
    fontSize: 16,
  },
  promptImageContainer: {
    width: "100%",
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    overflow: "hidden",
    marginBottom: Spacing.md,
    position: "relative",
  },
  promptImage: {
    width: "100%",
    height: "100%",
  },
  promptWordOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  promptWordOverlayText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    textTransform: "capitalize",
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.md,
  },
  imageChoice: {
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    overflow: "hidden",
    position: "relative",
  },
  choiceImage: {
    width: "100%",
    height: "100%",
  },
  wordOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  wordOverlayText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    textTransform: "capitalize",
  },
  choiceList: {
    gap: Spacing.sm,
  },
  numberGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.md,
  },
  numberChoice: {
    width: "45%",
    paddingVertical: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    alignItems: "center",
  },
  choiceNumber: {
    fontSize: 28,
    fontWeight: "600",
  },
  wordChoice: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    alignItems: "center",
  },
  choiceWord: {
    fontSize: 20,
    fontWeight: "500",
    textTransform: "capitalize",
  },
});
