import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, StyleSheet, Pressable, Platform, ScrollView, TextInput, Modal, Dimensions } from "react-native";
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

import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

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
  { id: "3", name: "Protein at Breakfast", icon: "coffee", color: "#FFB74D", state: "could" },
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

const PILL_ICON_SIZE = 28;
const HISTORY_DAYS = 90;

interface SectionTheme {
  name: string;
  could: string;
  will: string;
  did: string;
}

const SECTION_THEMES: SectionTheme[] = [
  { name: "Apple Clean", could: "#F9F9F9", will: "#F5F5F5", did: "#F0F0F0" },
  { name: "Ocean Breeze", could: "#E3F2FD", will: "#B3E5FC", did: "#80DEEA" },
  { name: "Forest", could: "#E8F5E9", will: "#C8E6C9", did: "#A5D6A7" },
  { name: "Sunset", could: "#FFF3E0", will: "#FFE0B2", did: "#FFCC80" },
  { name: "Lavender", could: "#F3E5F5", will: "#E1BEE7", did: "#CE93D8" },
  { name: "Rose", could: "#FCE4EC", will: "#F8BBD0", did: "#F48FB1" },
  { name: "Slate", could: "#ECEFF1", will: "#CFD8DC", did: "#B0BEC5" },
  { name: "Midnight", could: "#1A1A2E", will: "#16213E", did: "#0F3460" },
  { name: "Coral Reef", could: "#FFF8E1", will: "#FFECB3", did: "#FFE082" },
  { name: "Berry", could: "#EDE7F6", will: "#D1C4E9", did: "#B39DDB" },
  { name: "Mint", could: "#E0F2F1", will: "#B2DFDB", did: "#80CBC4" },
];

function getContrastTextColor(hexColor: string): string {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.9)";
}

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

export default function HabitTracker({ context, onComplete, onSettings, showSettings }: PractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();
  
  const [habits, setHabits] = useState<Habit[]>(DEFAULT_HABITS);
  const [history, setHistory] = useState<HabitHistory>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [newHabitName, setNewHabitName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<keyof typeof Feather.glyphMap>("star");
  const [selectedColor, setSelectedColor] = useState(AVAILABLE_COLORS[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggingHabit, setDraggingHabit] = useState<DragState>({ habit: null, x: 0, y: 0 });
  const [selectedThemeIndex, setSelectedThemeIndex] = useState(0);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  const sectionFlex = 1;
  const currentSectionTheme = SECTION_THEMES[selectedThemeIndex];
  const isDarkTheme = selectedThemeIndex === 6;


  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragScale = useSharedValue(0);

  const handleOpenSettings = useCallback(() => {
    triggerHaptic();
    setShowSettingsModal(true);
  }, []);

  useEffect(() => {
    setConfig({
      headerMode: "default",
      title: "Practa",
      showSettings: true,
      onSettings: handleOpenSettings,
    });
  }, [setConfig, handleOpenSettings]);

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

  const openEditModal = useCallback((habit: Habit) => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setEditingHabit(habit);
    setNewHabitName(habit.name);
    setSelectedIcon(habit.icon);
    setSelectedColor(habit.color);
    setShowEditModal(true);
  }, [triggerHaptic]);

  const updateHabit = useCallback(() => {
    if (!editingHabit || !newHabitName.trim()) return;
    triggerHaptic();
    setHabits(prev => {
      const updated = prev.map(h => 
        h.id === editingHabit.id 
          ? { ...h, name: newHabitName.trim(), icon: selectedIcon, color: selectedColor }
          : h
      );
      saveData(updated);
      return updated;
    });
    setEditingHabit(null);
    setNewHabitName("");
    setSelectedIcon("star");
    setSelectedColor(AVAILABLE_COLORS[0]);
    setShowEditModal(false);
  }, [editingHabit, newHabitName, selectedIcon, selectedColor, triggerHaptic]);

  const deleteEditingHabit = useCallback(() => {
    if (!editingHabit) return;
    removeHabit(editingHabit.id);
    setEditingHabit(null);
    setShowEditModal(false);
  }, [editingHabit, removeHabit]);

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
    const screenHeight = Dimensions.get("window").height;
    const zoneTop = headerHeight + Spacing.lg;
    const availableHeight = screenHeight - zoneTop;
    const sectionSize = availableHeight / 3;
    const relativeY = absoluteY - zoneTop;
    
    if (relativeY < sectionSize) {
      return "could";
    } else if (relativeY < sectionSize * 2) {
      return "will";
    } else {
      return "did";
    }
  }, [headerHeight]);

  const startDrag = useCallback((habit: Habit, x: number, y: number) => {
    setDraggingHabit({ habit, x, y });
    dragX.value = x - 50;
    dragY.value = y - 20;
    dragScale.value = withSpring(1.1);
  }, [dragX, dragY, dragScale]);

  const updateDrag = useCallback((x: number, y: number) => {
    dragX.value = x - 50;
    dragY.value = y - 20;
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
      >
        <View style={styles.sectionsContainer}>
          <View style={[styles.section, { flex: sectionFlex, backgroundColor: currentSectionTheme.could }]}>
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: getContrastTextColor(currentSectionTheme.could) }]}>
                Today I could...
              </ThemedText>
            </View>
            <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
              <View style={styles.pillGrid}>
                {couldHabits.map((habit) => (
                  <DraggableHabit
                    key={habit.id}
                    habit={habit}
                    onDragStart={startDrag}
                    onDragUpdate={updateDrag}
                    onDragEnd={endDrag}
                    onLongPress={openEditModal}
                    theme={theme}
                    isDragging={draggingHabit.habit?.id === habit.id}
                  />
                ))}
                <Pressable 
                  style={styles.addPillDotted}
                  onPress={() => {
                    triggerHaptic();
                    setNewHabitName("");
                    setSelectedIcon("star");
                    setSelectedColor(AVAILABLE_COLORS[0]);
                    setShowAddModal(true);
                  }}
                >
                  <Feather name="plus" size={16} color={getContrastTextColor(currentSectionTheme.could)} style={{ opacity: 0.5 }} />
                  <ThemedText style={[styles.addPillDottedText, { color: getContrastTextColor(currentSectionTheme.could) }]}>
                    Add habit
                  </ThemedText>
                </Pressable>
              </View>
            </ScrollView>
          </View>

          {selectedThemeIndex === 0 ? <View style={styles.sectionSeparator} /> : null}

          <View style={[styles.section, { flex: sectionFlex, backgroundColor: currentSectionTheme.will }]}>
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: getContrastTextColor(currentSectionTheme.will) }]}>
                Today I will...
              </ThemedText>
            </View>
            <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
              <View style={styles.pillGrid}>
                {willHabits.length === 0 ? (
                  <ThemedText style={[styles.emptyText, { color: getContrastTextColor(currentSectionTheme.will) }]}>
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
                      onLongPress={openEditModal}
                      theme={theme}
                      isDragging={draggingHabit.habit?.id === habit.id}
                    />
                  ))
                )}
              </View>
            </ScrollView>
          </View>

          {selectedThemeIndex === 0 ? <View style={styles.sectionSeparator} /> : null}

          <View style={[styles.section, { flex: sectionFlex, backgroundColor: currentSectionTheme.did }]}>
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: getContrastTextColor(currentSectionTheme.did) }]}>
                Today I did...
              </ThemedText>
            </View>
            <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
              <View style={styles.pillGrid}>
                {didHabits.length === 0 ? (
                  <ThemedText style={[styles.emptyText, { color: getContrastTextColor(currentSectionTheme.did) }]}>
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
                      onLongPress={openEditModal}
                      theme={theme}
                      isDragging={draggingHabit.habit?.id === habit.id}
                    />
                  ))
                )}
              </View>
            </ScrollView>
          </View>
        </View>

        <View style={[styles.footer, { bottom: insets.bottom + Spacing.md }]}>
          <Pressable
            onPress={handleComplete}
            style={[styles.continueButton, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
          </Pressable>
        </View>

        {draggingHabit.habit ? (
          <Animated.View style={floatingIconStyle} pointerEvents="none">
            <View style={[styles.floatingPill, { backgroundColor: "rgba(255,255,255,0.95)" }]}>
              <View style={[styles.pillIcon, { backgroundColor: draggingHabit.habit.color }]}>
                <Feather name={draggingHabit.habit.icon} size={14} color="white" />
              </View>
              <ThemedText style={styles.pillLabel} numberOfLines={1}>
                {draggingHabit.habit.name}
              </ThemedText>
            </View>
          </Animated.View>
        ) : null}

        <Modal
          visible={showSettingsModal}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setShowSettingsModal(false)}
        >
          <View style={[styles.settingsModalContent, { backgroundColor: theme.backgroundDefault, paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl }]}>
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Settings</ThemedText>
                <Pressable onPress={() => setShowSettingsModal(false)} style={styles.closeButton}>
                  <Feather name="x" size={28} color={theme.text} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <ThemedText style={[styles.settingsSectionTitle, { color: theme.textSecondary }]}>
                  Theme
                </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.themeScrollRow}>
                {SECTION_THEMES.map((sectionTheme, index) => (
                  <Pressable
                    key={sectionTheme.name}
                    onPress={() => {
                      triggerHaptic();
                      setSelectedThemeIndex(index);
                    }}
                    style={[
                      styles.themeCard,
                      { backgroundColor: theme.backgroundSecondary },
                      selectedThemeIndex === index && { borderColor: theme.primary, borderWidth: 2 }
                    ]}
                  >
                    <View style={styles.themePreview}>
                      <View style={[styles.themePreviewSection, { backgroundColor: sectionTheme.could }]} />
                      <View style={[styles.themePreviewSection, { backgroundColor: sectionTheme.will }]} />
                      <View style={[styles.themePreviewSection, { backgroundColor: sectionTheme.did }]} />
                    </View>
                    <ThemedText style={[styles.themeCardName, selectedThemeIndex === index && { color: theme.primary }]}>
                      {sectionTheme.name}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.settingsHabitHeader}>
                <ThemedText style={[styles.settingsSectionTitle, { color: theme.textSecondary }]}>
                  Habits
                </ThemedText>
                <Pressable 
                  onPress={() => {
                    triggerHaptic();
                    setNewHabitName("");
                    setSelectedIcon("star");
                    setSelectedColor(AVAILABLE_COLORS[0]);
                    setShowAddModal(true);
                  }}
                  style={[styles.addHabitButton, { backgroundColor: theme.primary }]}
                >
                  <Feather name="plus" size={16} color="white" />
                  <ThemedText style={styles.addHabitButtonText}>Add</ThemedText>
                </Pressable>
              </View>
              
              <View style={styles.habitsList}>
                {habits.map((habit) => (
                  <Pressable 
                    key={habit.id} 
                    style={[styles.habitRow, { backgroundColor: theme.backgroundSecondary }]}
                    onPress={() => {
                      setShowSettingsModal(false);
                      openEditModal(habit);
                    }}
                  >
                    <View style={[styles.habitRowIcon, { backgroundColor: habit.color }]}>
                      <Feather name={habit.icon} size={16} color="white" />
                    </View>
                    <ThemedText style={styles.habitRowName} numberOfLines={1}>
                      {habit.name}
                    </ThemedText>
                    <Feather name="edit-2" size={18} color={theme.textSecondary} />
                  </Pressable>
                ))}
                </View>
              </ScrollView>
          </View>
        </Modal>

        <Modal
          visible={showAddModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowAddModal(false)}
        >
          <KeyboardAwareScrollViewCompat 
            contentContainerStyle={styles.modalOverlay}
            bounces={false}
          >
            <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault, paddingBottom: insets.bottom + Spacing.xl }]}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>New Habit</ThemedText>
                <Pressable onPress={() => setShowAddModal(false)} style={styles.closeButton}>
                  <Feather name="x" size={28} color={theme.text} />
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
                returnKeyType="done"
                onSubmitEditing={newHabitName.trim() ? addHabit : undefined}
              />

              <ThemedText style={[styles.labelText, { color: theme.textSecondary }]}>
                Icon
              </ThemedText>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={styles.iconPicker}
                contentContainerStyle={styles.iconPickerContent}
              >
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
                      size={26} 
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
                      <Feather name="check" size={20} color="white" />
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
          </KeyboardAwareScrollViewCompat>
        </Modal>

        <Modal
          visible={showEditModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowEditModal(false)}
        >
          <KeyboardAwareScrollViewCompat 
            contentContainerStyle={styles.modalOverlay}
            bounces={false}
          >
            <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault, paddingBottom: insets.bottom + Spacing.xl }]}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Edit Habit</ThemedText>
                <Pressable onPress={() => setShowEditModal(false)} style={styles.closeButton}>
                  <Feather name="x" size={28} color={theme.text} />
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
                returnKeyType="done"
                onSubmitEditing={newHabitName.trim() ? updateHabit : undefined}
              />

              <ThemedText style={[styles.labelText, { color: theme.textSecondary }]}>
                Icon
              </ThemedText>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={styles.iconPicker}
                contentContainerStyle={styles.iconPickerContent}
              >
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
                      size={26} 
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
                      <Feather name="check" size={20} color="white" />
                    ) : null}
                  </Pressable>
                ))}
              </View>

              <View style={styles.editButtonRow}>
                <Pressable
                  onPress={deleteEditingHabit}
                  style={[styles.deleteButton]}
                >
                  <Feather name="trash-2" size={18} color="white" />
                  <ThemedText style={styles.deleteButtonText}>Delete</ThemedText>
                </Pressable>
                <Pressable
                  onPress={updateHabit}
                  style={[
                    styles.saveButton, 
                    styles.saveButtonFlex,
                    { backgroundColor: theme.primary },
                    !newHabitName.trim() && { opacity: 0.5 }
                  ]}
                  disabled={!newHabitName.trim()}
                >
                  <ThemedText style={styles.saveButtonText}>Save Changes</ThemedText>
                </Pressable>
              </View>
            </View>
          </KeyboardAwareScrollViewCompat>
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
  onLongPress: (habit: Habit) => void;
  theme: any;
  isDragging: boolean;
}

function DraggableHabit({ habit, onDragStart, onDragUpdate, onDragEnd, onLongPress, theme, isDragging }: DraggableHabitProps) {
  const longPressGesture = Gesture.LongPress()
    .minDuration(1500)
    .onStart(() => {
      runOnJS(onLongPress)(habit);
    });

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

  const composedGesture = Gesture.Race(longPressGesture, panGesture);
  const isDone = habit.state === "did";

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={[styles.pill, isDragging && { opacity: 0.3 }]}>
        <View style={[styles.pillIcon, { backgroundColor: habit.color }]}>
          <Feather name={habit.icon} size={14} color="white" />
        </View>
        <ThemedText style={styles.pillLabel} numberOfLines={1}>
          {habit.name}
        </ThemedText>
        {isDone ? (
          <View style={styles.checkBadge}>
            <Feather name="check" size={10} color="#4CAF50" />
          </View>
        ) : null}
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sectionHeader: {
    alignItems: "center",
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  scrollContainer: {
    flex: 1,
  },
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.sm,
    rowGap: Spacing.md,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 20,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    gap: 6,
    width: "48%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  pillIcon: {
    width: PILL_ICON_SIZE,
    height: PILL_ICON_SIZE,
    borderRadius: PILL_ICON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: "500",
    flex: 1,
  },
  emptyText: {
    fontSize: 13,
    fontStyle: "italic",
    paddingVertical: Spacing.sm,
  },
  checkBadge: {
    marginLeft: 2,
  },
  deleteBadge: {
    position: "absolute",
    top: -4,
    left: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "white",
    zIndex: 1,
  },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: 20,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    gap: 6,
    width: "48%",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(0,0,0,0.15)",
  },
  addPillIcon: {
    width: PILL_ICON_SIZE,
    height: PILL_ICON_SIZE,
    borderRadius: PILL_ICON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  addPillText: {
    fontSize: 11,
    fontWeight: "500",
  },
  floatingPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    gap: 6,
    minWidth: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
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
    flexGrow: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius["2xl"],
    borderTopRightRadius: BorderRadius["2xl"],
    padding: Spacing.xl,
    paddingTop: Spacing.md,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  closeButton: {
    padding: Spacing.sm,
    marginRight: -Spacing.sm,
  },
  input: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    fontSize: 18,
    marginBottom: Spacing.xl,
  },
  labelText: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  iconPicker: {
    marginBottom: Spacing.xl,
  },
  iconPickerContent: {
    paddingRight: Spacing.xl,
  },
  iconOption: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  colorPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: "white",
  },
  saveButton: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  saveButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 18,
  },
  saveButtonFlex: {
    flex: 1,
  },
  addPillDotted: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    height: 40,
    gap: 6,
    width: "48%",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(0,0,0,0.25)",
  },
  addPillDottedText: {
    fontSize: 13,
    fontWeight: "500",
    opacity: 0.5,
  },
  editButtonRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: "#FF3B30",
  },
  deleteButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
  themeModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  themeModalContent: {
    borderTopLeftRadius: BorderRadius["2xl"],
    borderTopRightRadius: BorderRadius["2xl"],
    padding: Spacing.xl,
    paddingTop: Spacing.md,
    maxHeight: "70%",
  },
  themeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  themeOptionSelected: {
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  themePreview: {
    flexDirection: "row",
    width: 72,
    height: 36,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  themePreviewSection: {
    flex: 1,
  },
  themeName: {
    flex: 1,
    fontSize: 16,
  },
  settingsModalContent: {
    flex: 1,
    padding: Spacing.xl,
    paddingTop: Spacing.md,
  },
  settingsSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
  },
  themeScrollRow: {
    marginBottom: Spacing.xl,
  },
  themeCard: {
    width: 100,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.md,
    alignItems: "center",
  },
  themeCardName: {
    fontSize: 11,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  settingsHabitHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  addHabitButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  addHabitButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
  habitsList: {
    gap: Spacing.sm,
  },
  habitRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  habitRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  habitRowName: {
    flex: 1,
    fontSize: 16,
  },
  habitRowDelete: {
    padding: Spacing.sm,
  },
  sectionSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
});
