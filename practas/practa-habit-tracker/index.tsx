import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform, ScrollView, TextInput, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { GestureDetector, Gesture, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

interface Habit {
  id: string;
  name: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  state: "could" | "will" | "did";
}

interface StoredData {
  habits: Habit[];
  lastResetDate: string;
}

interface HabitHistory {
  [date: string]: string[];
}

interface DragState {
  habit: Habit | null;
  x: number;
  y: number;
}

const DEFAULT_HABITS: Habit[] = [
  { id: "1", name: "Take a walk", icon: "navigation", color: "#81C784", state: "could" },
  { id: "2", name: "Read in Bed", icon: "book-open", color: "#BA68C8", state: "could" },
  { id: "3", name: "Protein Breakfast", icon: "coffee", color: "#FFB74D", state: "could" },
  { id: "4", name: "Call Friend/Family", icon: "phone", color: "#4FC3F7", state: "could" },
];

const AVAILABLE_ICONS: Array<keyof typeof Feather.glyphMap> = [
  "heart", "star", "sun", "moon", "coffee", "music", "camera", "smile",
  "zap", "target", "award", "gift", "feather", "compass", "umbrella", "anchor",
];

const AVAILABLE_COLORS = [
  "#4FC3F7", "#81C784", "#FFB74D", "#BA68C8", "#4DD0E1",
  "#FF8A80", "#B388FF", "#82B1FF", "#CCFF90", "#FFD180",
];

const ICON_SIZE = 56;
const HISTORY_DAYS = 90;

function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function pruneOldHistory(history: HabitHistory): HabitHistory {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - HISTORY_DAYS);
  const cutoffStr = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-${String(cutoffDate.getDate()).padStart(2, '0')}`;
  
  const pruned: HabitHistory = {};
  for (const date of Object.keys(history)) {
    if (date >= cutoffStr) {
      pruned[date] = history[date];
    }
  }
  return pruned;
}

export default function HabitTracker({ context, onComplete, onSkip, onSettings, showSettings }: PractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();
  
  const [habits, setHabits] = useState<Habit[]>(DEFAULT_HABITS);
  const [history, setHistory] = useState<HabitHistory>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newHabitName, setNewHabitName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<keyof typeof Feather.glyphMap>("star");
  const [selectedColor, setSelectedColor] = useState(AVAILABLE_COLORS[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggingHabit, setDraggingHabit] = useState<DragState>({ habit: null, x: 0, y: 0 });
  
  const [containerHeight, setContainerHeight] = useState(0);
  const sectionHeight = containerHeight > 0 ? (containerHeight - 80) / 3 : 200;

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragScale = useSharedValue(0);

  useEffect(() => {
    setConfig({
      headerMode: "default",
      title: "Practa",
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const stored = await context.storage?.get<StoredData>("habitData");
      const storedHistory = await context.storage?.get<HabitHistory>("habitHistory");
      
      if (storedHistory) {
        setHistory(pruneOldHistory(storedHistory));
      }
      
      if (stored) {
        const today = getTodayString();
        if (stored.lastResetDate !== today) {
          const resetHabits = stored.habits.map(h => ({ ...h, state: "could" as const }));
          setHabits(resetHabits);
          await saveData(resetHabits, today);
        } else {
          setHabits(stored.habits);
        }
      }
    } catch (error) {
      console.warn("Failed to load habits:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveData = async (habitsToSave: Habit[], date?: string) => {
    try {
      const data: StoredData = {
        habits: habitsToSave,
        lastResetDate: date || getTodayString(),
      };
      await context.storage?.set("habitData", data);
    } catch (error) {
      console.warn("Failed to save habits:", error);
    }
  };

  const saveHistory = async (newHistory: HabitHistory) => {
    try {
      const pruned = pruneOldHistory(newHistory);
      await context.storage?.set("habitHistory", pruned);
      setHistory(pruned);
    } catch (error) {
      console.warn("Failed to save history:", error);
    }
  };

  const recordCompletion = useCallback((habitId: string) => {
    const today = getTodayString();
    setHistory(prev => {
      const todayCompletions = prev[today] || [];
      if (!todayCompletions.includes(habitId)) {
        const newHistory = {
          ...prev,
          [today]: [...todayCompletions, habitId],
        };
        saveHistory(newHistory);
        return newHistory;
      }
      return prev;
    });
  }, []);

  const removeFromHistory = useCallback((habitId: string) => {
    const today = getTodayString();
    setHistory(prev => {
      const todayCompletions = prev[today] || [];
      if (todayCompletions.includes(habitId)) {
        const newHistory = {
          ...prev,
          [today]: todayCompletions.filter(id => id !== habitId),
        };
        saveHistory(newHistory);
        return newHistory;
      }
      return prev;
    });
  }, []);

  const triggerHaptic = useCallback((style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(style);
    }
  }, []);

  const moveHabit = useCallback((id: string, newState: "could" | "will" | "did") => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    
    setHabits(prev => {
      const habit = prev.find(h => h.id === id);
      const wasInDid = habit?.state === "did";
      const movingToDid = newState === "did";
      
      if (movingToDid && !wasInDid) {
        recordCompletion(id);
      } else if (!movingToDid && wasInDid) {
        removeFromHistory(id);
      }
      
      const updated = prev.map(h => 
        h.id === id ? { ...h, state: newState } : h
      );
      saveData(updated);
      return updated;
    });
  }, [triggerHaptic, recordCompletion, removeFromHistory]);

  const addHabit = useCallback(() => {
    if (!newHabitName.trim()) return;
    
    triggerHaptic();
    const newHabit: Habit = {
      id: Date.now().toString(),
      name: newHabitName.trim(),
      icon: selectedIcon,
      color: selectedColor,
      state: "could",
    };
    
    setHabits(prev => {
      const updated = [...prev, newHabit];
      saveData(updated);
      return updated;
    });
    
    setNewHabitName("");
    setSelectedIcon("star");
    setSelectedColor(AVAILABLE_COLORS[0]);
    setShowAddModal(false);
  }, [newHabitName, selectedIcon, selectedColor, triggerHaptic]);

  const removeHabit = useCallback((id: string) => {
    triggerHaptic();
    setHabits(prev => {
      const updated = prev.filter(h => h.id !== id);
      saveData(updated);
      return updated;
    });
  }, [triggerHaptic]);

  const handleComplete = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const didCount = habits.filter(h => h.state === "did").length;
    const totalDaysTracked = Object.keys(history).length;
    const totalCompletions = Object.values(history).reduce((sum, arr) => sum + arr.length, 0);
    
    onComplete({
      content: { 
        type: "text", 
        value: `Completed ${didCount} habits today!` 
      },
      metadata: { 
        habitsCompleted: didCount,
        totalHabits: habits.length,
        completedAt: Date.now(),
        historyDays: totalDaysTracked,
        totalHistoryCompletions: totalCompletions,
      },
    });
  };

  const couldHabits = habits.filter(h => h.state === "could");
  const willHabits = habits.filter(h => h.state === "will");
  const didHabits = habits.filter(h => h.state === "did");

  const checkDropZone = useCallback((absoluteY: number): "could" | "will" | "did" => {
    const zoneTop = headerHeight + Spacing.lg;
    const relativeY = absoluteY - zoneTop;
    
    if (relativeY < sectionHeight) {
      return "could";
    } else if (relativeY < sectionHeight * 2) {
      return "will";
    } else {
      return "did";
    }
  }, [headerHeight, sectionHeight]);

  const startDrag = useCallback((habit: Habit, x: number, y: number) => {
    setDraggingHabit({ habit, x, y });
    dragX.value = x - ICON_SIZE / 2;
    dragY.value = y - ICON_SIZE / 2;
    dragScale.value = withSpring(1.15);
  }, [dragX, dragY, dragScale]);

  const updateDrag = useCallback((x: number, y: number) => {
    dragX.value = x - ICON_SIZE / 2;
    dragY.value = y - ICON_SIZE / 2;
  }, [dragX, dragY]);

  const endDrag = useCallback((absoluteY: number) => {
    if (draggingHabit.habit) {
      const zone = checkDropZone(absoluteY);
      if (zone !== draggingHabit.habit.state) {
        moveHabit(draggingHabit.habit.id, zone);
      }
    }
    dragScale.value = withSpring(0);
    setTimeout(() => {
      setDraggingHabit({ habit: null, x: 0, y: 0 });
    }, 100);
  }, [draggingHabit.habit, checkDropZone, moveHabit, dragScale]);

  const floatingIconStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: dragX.value,
    top: dragY.value,
    transform: [{ scale: dragScale.value }],
    zIndex: 9999,
  }));

  if (isLoading) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
          <View style={styles.loadingContainer}>
            <ThemedText style={styles.loadingText}>Loading your habits...</ThemedText>
          </View>
        </ThemedView>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedView 
        style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}
        onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height - headerHeight - Spacing.lg)}
      >
        <View style={styles.sectionsContainer}>
          <View style={[styles.section, { height: sectionHeight, backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                Today I could...
              </ThemedText>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={true}
              contentContainerStyle={styles.habitsScroll}
            >
              {couldHabits.map((habit) => (
                <DraggableHabit
                  key={habit.id}
                  habit={habit}
                  onDragStart={startDrag}
                  onDragUpdate={updateDrag}
                  onDragEnd={endDrag}
                  onRemove={removeHabit}
                  theme={theme}
                  isDragging={draggingHabit.habit?.id === habit.id}
                />
              ))}
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setShowAddModal(true);
                }}
                style={styles.addButton}
              >
                <View style={[styles.addIconBox, { backgroundColor: theme.backgroundTertiary }]}>
                  <Feather name="plus" size={20} color={theme.textSecondary} />
                </View>
              </Pressable>
            </ScrollView>
          </View>

          <View style={[styles.section, { height: sectionHeight, backgroundColor: theme.amberMuted }]}>
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: theme.primary }]}>
                Today I will...
              </ThemedText>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={true}
              contentContainerStyle={styles.habitsScroll}
            >
              {willHabits.length === 0 ? (
                <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
                  Drag habits here
                </ThemedText>
              ) : (
                willHabits.map((habit) => (
                  <DraggableHabit
                    key={habit.id}
                    habit={habit}
                    onDragStart={startDrag}
                    onDragUpdate={updateDrag}
                    onDragEnd={endDrag}
                    onRemove={removeHabit}
                    theme={theme}
                    isDragging={draggingHabit.habit?.id === habit.id}
                  />
                ))
              )}
            </ScrollView>
          </View>

          <View style={[styles.section, { height: sectionHeight, backgroundColor: "#E8F5E9" }]}>
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: "#4CAF50" }]}>
                Today I did...
              </ThemedText>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={true}
              contentContainerStyle={styles.habitsScroll}
            >
              {didHabits.length === 0 ? (
                <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
                  Drag completed habits here
                </ThemedText>
              ) : (
                didHabits.map((habit) => (
                  <DraggableHabit
                    key={habit.id}
                    habit={habit}
                    onDragStart={startDrag}
                    onDragUpdate={updateDrag}
                    onDragEnd={endDrag}
                    onRemove={removeHabit}
                    theme={theme}
                    isDragging={draggingHabit.habit?.id === habit.id}
                  />
                ))
              )}
            </ScrollView>
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          <Pressable
            onPress={handleComplete}
            style={[styles.continueButton, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
          </Pressable>
        </View>

        {draggingHabit.habit ? (
          <Animated.View style={floatingIconStyle} pointerEvents="none">
            <View style={[styles.habitIcon, { backgroundColor: draggingHabit.habit.color }]}>
              <Feather name={draggingHabit.habit.icon} size={24} color="white" />
            </View>
          </Animated.View>
        ) : null}

        <Modal
          visible={showAddModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowAddModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>New Habit</ThemedText>
                <Pressable onPress={() => setShowAddModal(false)} style={styles.closeButton}>
                  <Feather name="x" size={24} color={theme.text} />
                </Pressable>
              </View>

              <TextInput
                style={[styles.input, { 
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                }]}
                placeholder="Habit name..."
                placeholderTextColor={theme.textSecondary}
                value={newHabitName}
                onChangeText={setNewHabitName}
                autoFocus
              />

              <ThemedText style={[styles.labelText, { color: theme.textSecondary }]}>
                Icon
              </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconPicker}>
                {AVAILABLE_ICONS.map((icon) => (
                  <Pressable
                    key={icon}
                    onPress={() => {
                      triggerHaptic();
                      setSelectedIcon(icon);
                    }}
                    style={[
                      styles.iconOption,
                      { backgroundColor: theme.backgroundSecondary },
                      selectedIcon === icon && { backgroundColor: selectedColor }
                    ]}
                  >
                    <Feather 
                      name={icon} 
                      size={22} 
                      color={selectedIcon === icon ? "white" : theme.textSecondary} 
                    />
                  </Pressable>
                ))}
              </ScrollView>

              <ThemedText style={[styles.labelText, { color: theme.textSecondary }]}>
                Color
              </ThemedText>
              <View style={styles.colorPicker}>
                {AVAILABLE_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => {
                      triggerHaptic();
                      setSelectedColor(color);
                    }}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      selectedColor === color && styles.colorSelected
                    ]}
                  >
                    {selectedColor === color ? (
                      <Feather name="check" size={16} color="white" />
                    ) : null}
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={addHabit}
                style={[
                  styles.saveButton, 
                  { backgroundColor: theme.primary },
                  !newHabitName.trim() && { opacity: 0.5 }
                ]}
                disabled={!newHabitName.trim()}
              >
                <ThemedText style={styles.saveButtonText}>Add Habit</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>
      </ThemedView>
    </GestureHandlerRootView>
  );
}

interface DraggableHabitProps {
  habit: Habit;
  onDragStart: (habit: Habit, x: number, y: number) => void;
  onDragUpdate: (x: number, y: number) => void;
  onDragEnd: (absoluteY: number) => void;
  onRemove: (id: string) => void;
  theme: any;
  isDragging: boolean;
}

function DraggableHabit({ habit, onDragStart, onDragUpdate, onDragEnd, onRemove, theme, isDragging }: DraggableHabitProps) {
  const panGesture = Gesture.Pan()
    .onStart((e) => {
      runOnJS(onDragStart)(habit, e.absoluteX, e.absoluteY);
      if (Platform.OS !== "web") {
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      }
    })
    .onUpdate((e) => {
      runOnJS(onDragUpdate)(e.absoluteX, e.absoluteY);
    })
    .onEnd((e) => {
      runOnJS(onDragEnd)(e.absoluteY);
    });

  const longPressGesture = Gesture.LongPress()
    .minDuration(500)
    .onEnd(() => {
      runOnJS(onRemove)(habit.id);
    });

  const composedGesture = Gesture.Race(panGesture, longPressGesture);

  const isDone = habit.state === "did";

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={[styles.habitWrapper, isDragging && { opacity: 0.3 }]}>
        <View 
          style={[
            styles.habitIcon,
            { backgroundColor: habit.color }
          ]}
        >
          <Feather name={habit.icon} size={24} color="white" />
          {isDone ? (
            <View style={styles.checkBadge}>
              <Feather name="check" size={8} color="white" />
            </View>
          ) : null}
        </View>
        <ThemedText style={styles.habitLabel} numberOfLines={2}>
          {habit.name}
        </ThemedText>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
  },
  sectionsContainer: {
    flex: 1,
  },
  section: {
    width: "100%",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  sectionHeader: {
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  habitsScroll: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    flexGrow: 1,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: "italic",
    paddingVertical: Spacing.md,
  },
  habitWrapper: {
    alignItems: "center",
    width: 80,
  },
  habitIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  habitLabel: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 16,
    height: 32,
  },
  checkBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#4CAF50",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  addButton: {
    alignItems: "center",
    width: 80,
  },
  addIconBox: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(0,0,0,0.15)",
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  continueButton: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  continueButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing["4xl"],
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
  },
  closeButton: {
    padding: Spacing.xs,
  },
  input: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    fontSize: 16,
    marginBottom: Spacing.lg,
  },
  labelText: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  iconPicker: {
    marginBottom: Spacing.lg,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  colorPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: "white",
  },
  saveButton: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  saveButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
});
