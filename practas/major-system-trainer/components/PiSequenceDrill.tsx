import React, { useState, useCallback, useRef } from "react";
import { View, StyleSheet, Pressable, useWindowDimensions, LayoutRectangle } from "react-native";
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PiSequenceDrill as PiSequenceDrillType, PiSequenceCard } from "../lib/types";

type SlotBounds = { pageX: number; pageY: number; width: number; height: number };

interface PiSequenceDrillProps {
  drill: PiSequenceDrillType;
  onComplete: (isCorrect: boolean) => void;
  disabled?: boolean;
  resolveImageAsset: (imageName: string) => number | { uri: string } | undefined;
}

interface DraggableCardProps {
  card: PiSequenceCard;
  index: number;
  onDragEnd: (cardIndex: number, absoluteX: number, absoluteY: number) => void;
  resolveImageAsset: (imageName: string) => number | { uri: string } | undefined;
  isPlaced: boolean;
  disabled: boolean;
}

function DraggableCard({
  card,
  index,
  onDragEnd,
  resolveImageAsset,
  isPlaced,
  disabled,
}: DraggableCardProps) {
  const { theme } = useTheme();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(0);

  const gesture = Gesture.Pan()
    .enabled(!disabled && !isPlaced)
    .onStart(() => {
      scale.value = withSpring(1.05);
      zIndex.value = 100;
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      scale.value = withSpring(1);
      zIndex.value = 0;

      runOnJS(onDragEnd)(index, event.absoluteX, event.absoluteY);

      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
    opacity: isPlaced ? 0.3 : 1,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.draggableCard,
          { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
          animatedStyle,
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
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

export function PiSequenceDrill({
  drill,
  onComplete,
  disabled = false,
  resolveImageAsset,
}: PiSequenceDrillProps) {
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  
  const [slots, setSlots] = useState<(number | null)[]>(
    Array(drill.sequence.length).fill(null)
  );
  const [shuffledOrder] = useState(() => {
    const indices = drill.sequence.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  });
  const slotRefs = useRef<(View | null)[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const slotWidth = Math.min(100, (screenWidth - Spacing.lg * 2 - Spacing.md * (drill.sequence.length - 1)) / drill.sequence.length);

  const handleDragEnd = useCallback((cardIndex: number, absoluteX: number, absoluteY: number) => {
    const measurePromises = slotRefs.current.map((ref, idx) => {
      return new Promise<{ index: number; bounds: SlotBounds | null }>((resolve) => {
        if (ref) {
          ref.measure((x, y, width, height, pageX, pageY) => {
            resolve({ index: idx, bounds: { pageX, pageY, width, height } });
          });
        } else {
          resolve({ index: idx, bounds: null });
        }
      });
    });

    Promise.all(measurePromises).then((results) => {
      let droppedSlot = -1;
      for (const { index, bounds } of results) {
        if (bounds) {
          if (
            absoluteX >= bounds.pageX &&
            absoluteX <= bounds.pageX + bounds.width &&
            absoluteY >= bounds.pageY &&
            absoluteY <= bounds.pageY + bounds.height
          ) {
            droppedSlot = index;
            break;
          }
        }
      }
      if (droppedSlot >= 0) {
        handleDrop(cardIndex, droppedSlot);
      }
    });
  }, []);

  const handleDrop = useCallback((cardIndex: number, slotIndex: number) => {
    setSlots(prev => {
      const newSlots = [...prev];
      const existingSlot = newSlots.findIndex(s => s === cardIndex);
      if (existingSlot >= 0) {
        newSlots[existingSlot] = null;
      }
      newSlots[slotIndex] = cardIndex;
      return newSlots;
    });
  }, []);

  const handleSlotTap = useCallback((slotIndex: number) => {
    if (disabled || showResult) return;
    setSlots(prev => {
      const newSlots = [...prev];
      newSlots[slotIndex] = null;
      return newSlots;
    });
  }, [disabled, showResult]);

  const handleSubmit = useCallback(() => {
    const allFilled = slots.every(s => s !== null);
    if (!allFilled) return;

    const correct = slots.every((cardIdx, slotIdx) => {
      if (cardIdx === null) return false;
      return shuffledOrder[cardIdx] === slotIdx;
    });

    setIsCorrect(correct);
    setShowResult(true);

    setTimeout(() => {
      onComplete(correct);
    }, 1000);
  }, [slots, shuffledOrder, onComplete]);

  const allFilled = slots.every(s => s !== null);
  const placedCards = new Set(slots.filter(s => s !== null));

  return (
    <View style={styles.container}>
      <View style={styles.promptContainer}>
        <ThemedText style={[styles.piLabel, { color: theme.textSecondary }]}>
          Digits of Pi
        </ThemedText>
        <ThemedText style={styles.numberPrompt}>{drill.displayNumbers}</ThemedText>
        <ThemedText style={[styles.promptHint, { color: theme.textSecondary }]}>
          Drag cards to match the sequence
        </ThemedText>
      </View>

      <View style={styles.slotsContainer}>
        {drill.sequence.map((_, index) => {
          const placedCardIdx = slots[index];
          const placedCard = placedCardIdx !== null ? drill.sequence[shuffledOrder[placedCardIdx]] : null;
          
          let slotBorderColor = theme.border;
          if (showResult && placedCardIdx !== null) {
            const isSlotCorrect = shuffledOrder[placedCardIdx] === index;
            slotBorderColor = isSlotCorrect ? theme.success : theme.error;
          }

          return (
            <View
              key={`slot-${index}`}
              ref={(ref) => { slotRefs.current[index] = ref; }}
              collapsable={false}
              style={[
                styles.slot,
                { 
                  width: slotWidth, 
                  borderColor: slotBorderColor,
                  backgroundColor: placedCard ? theme.backgroundSecondary : "transparent",
                },
              ]}
            >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => handleSlotTap(index)}
            >
              <ThemedText style={[styles.slotNumber, { color: theme.textSecondary }]}>
                {index + 1}
              </ThemedText>
              {placedCard ? (
                <View style={styles.placedCardContainer} pointerEvents="none">
                  <Image
                    source={resolveImageAsset(placedCard.variant.image)}
                    style={styles.slotImage}
                    contentFit="cover"
                  />
                  <ThemedText style={styles.slotWord} numberOfLines={1}>
                    {placedCard.variant.word}
                  </ThemedText>
                </View>
              ) : null}
            </Pressable>
            </View>
          );
        })}
      </View>

      <View style={styles.cardsContainer}>
        {shuffledOrder.map((originalIndex, shuffledIdx) => (
          <DraggableCard
            key={`card-${originalIndex}`}
            card={drill.sequence[originalIndex]}
            index={shuffledIdx}
            onDragEnd={handleDragEnd}
            resolveImageAsset={resolveImageAsset}
            isPlaced={placedCards.has(shuffledIdx)}
            disabled={disabled || showResult}
          />
        ))}
      </View>

      {!showResult && (
        <Pressable
          style={[
            styles.submitButton,
            { 
              backgroundColor: allFilled ? theme.primary : theme.backgroundSecondary,
              opacity: allFilled ? 1 : 0.5,
            },
          ]}
          onPress={handleSubmit}
          disabled={!allFilled || disabled}
        >
          <ThemedText style={[styles.submitText, { color: allFilled ? "#FFFFFF" : theme.textSecondary }]}>
            Check Sequence
          </ThemedText>
        </Pressable>
      )}

      {showResult && (
        <View style={[styles.resultBanner, { backgroundColor: isCorrect ? theme.success : theme.error }]}>
          <ThemedText style={styles.resultText}>
            {isCorrect ? "Perfect!" : "Not quite"}
          </ThemedText>
        </View>
      )}
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
    marginBottom: Spacing.xl,
  },
  piLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: Spacing.xs,
  },
  numberPrompt: {
    fontSize: 48,
    fontWeight: "700",
    letterSpacing: 8,
    marginBottom: Spacing.sm,
  },
  promptHint: {
    fontSize: 16,
  },
  slotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  slot: {
    height: 120,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  slotNumber: {
    position: "absolute",
    top: Spacing.xs,
    fontSize: 12,
    fontWeight: "600",
  },
  placedCardContainer: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  slotImage: {
    width: "100%",
    height: 80,
    borderRadius: BorderRadius.sm,
  },
  slotWord: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
    textTransform: "capitalize",
  },
  cardsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  draggableCard: {
    width: 90,
    height: 120,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: 85,
  },
  cardLabel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xs,
  },
  cardWord: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "capitalize",
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
    marginTop: Spacing.md,
  },
  resultText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
