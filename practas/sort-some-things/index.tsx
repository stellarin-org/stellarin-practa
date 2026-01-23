/**
 * Sort a Few Things Practa
 * 
 * A gentle, mobile-first exercise that helps users sort what's on their mind
 * and choose one place to begin.
 * 
 * Trains: Prioritization, Decision closure, Task initiation readiness
 * Duration: 2-4 minutes
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  TextInput,
  Animated,
  Easing,
  Keyboard,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

type Screen = "research" | "launch" | "entry1" | "entry2" | "entry3" | "entry4" | "grid" | "handoff";
const AUTO_ADVANCE_DELAY = 700;
const SPRING_CONFIG = { tension: 40, friction: 12, useNativeDriver: true };
const RESEARCH_REVEAL_DELAY = 2500;

interface QuadrantData {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
}

const QUICK_STARTS = {
  entry1: ["Cleaning my desk", "Replying to that email", "Organizing photos"],
  entry2: ["That meeting invite", "A deadline soon", "Returning a call"],
  entry3: ["Learning something new", "A creative project", "A long-term goal"],
  entry4: ["A health check-in", "A conversation I've postponed", "Something I'm avoiding"],
};

const PROMPTS = {
  entry1: {
    question: "What's something that can wait and doesn't really matter much right now?",
    placeholder: "Something like...",
    icon: "cloud" as const,
  },
  entry2: {
    question: "What's something loud or demanding that probably won't matter much in the long run?",
    placeholder: "It might be...",
    icon: "volume-2" as const,
  },
  entry3: {
    question: "What's something future-you would appreciate you giving attention?",
    placeholder: "One thing I care about...",
    icon: "sunrise" as const,
  },
  entry4: {
    question: "What's something that genuinely needs your time today?",
    placeholder: "Something to handle...",
    icon: "clock" as const,
  },
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function SortAFewThings({ 
  context, 
  onComplete, 
  onSkip, 
  onSettings, 
  showSettings 
}: PractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();
  
  const [screen, setScreen] = useState<Screen>("research");
  const [quadrants, setQuadrants] = useState<QuadrantData>({
    q1: "",
    q2: "",
    q3: "",
    q4: "",
  });
  const [currentInput, setCurrentInput] = useState("");
  const [selectedTask, setSelectedTask] = useState<keyof QuadrantData | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);
  const [startTime] = useState(Date.now());
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const autoAdvanceTimer = useRef<NodeJS.Timeout | null>(null);
  const celebrationTimer = useRef<NodeJS.Timeout | null>(null);
  const hasCompleted = useRef(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  
  const gridCardAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const nextButtonAnim = useRef(new Animated.Value(0)).current;
  
  // Research screen animations - staggered text reveal
  const researchLine1Anim = useRef(new Animated.Value(0)).current;
  const researchLine2Anim = useRef(new Animated.Value(0)).current;
  const researchLine3Anim = useRef(new Animated.Value(0)).current;
  const researchContinueAnim = useRef(new Animated.Value(0)).current;
  const [researchReady, setResearchReady] = useState(false);
  
  // Button animation refs - hoisted to top level to satisfy React hooks rules
  const launchButtonScale = useRef(new Animated.Value(1)).current;
  const entryButtonScale = useRef(new Animated.Value(1)).current;
  const handoffGentleScale = useRef(new Animated.Value(1)).current;
  const handoffFocusScale = useRef(new Animated.Value(1)).current;
  const researchButtonScale = useRef(new Animated.Value(1)).current;
  const handoffSpinAnim = useRef(new Animated.Value(0)).current;
  const handoffScaleAnim = useRef(new Animated.Value(0.8)).current;
  const commitmentButtonsAnim = useRef(new Animated.Value(0)).current;
  const celebrationCheckAnim = useRef(new Animated.Value(0)).current;
  const buttonsExitAnim = useRef(new Animated.Value(1)).current;
  
  const createButtonHandlers = (scale: Animated.Value) => ({
    onPressIn: () => Animated.spring(scale, { toValue: 0.96, ...SPRING_CONFIG }).start(),
    onPressOut: () => Animated.spring(scale, { toValue: 1, ...SPRING_CONFIG }).start(),
  });

  useEffect(() => {
    setConfig({
      headerMode: "minimal",
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const isEntryScreen = ["entry1", "entry2", "entry3", "entry4"].includes(screen);
    const isValid = currentInput.trim().length >= 3;
    const isActivelyTyping = Platform.OS === "web" ? isInputFocused : isKeyboardVisible;

    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }

    if (isEntryScreen && isValid && !isActivelyTyping) {
      autoAdvanceTimer.current = setTimeout(() => {
        handleNextAuto();
      }, AUTO_ADVANCE_DELAY);
    }

    return () => {
      if (autoAdvanceTimer.current) {
        clearTimeout(autoAdvanceTimer.current);
      }
    };
  }, [currentInput, isKeyboardVisible, isInputFocused, screen]);

  // Animate next button based on valid input (minimum 3 characters)
  useEffect(() => {
    const isValid = currentInput.trim().length >= 3;
    Animated.spring(nextButtonAnim, {
      toValue: isValid ? 1 : 0,
      ...SPRING_CONFIG,
    }).start();
  }, [currentInput]);

  // Research screen staggered text reveal animation
  useEffect(() => {
    if (screen === "research") {
      researchLine1Anim.setValue(0);
      researchLine2Anim.setValue(0);
      researchLine3Anim.setValue(0);
      researchContinueAnim.setValue(0);
      setResearchReady(false);
      
      const staggerDelay = 600;
      
      Animated.sequence([
        Animated.spring(researchLine1Anim, { toValue: 1, ...SPRING_CONFIG }),
        Animated.delay(staggerDelay),
        Animated.spring(researchLine2Anim, { toValue: 1, ...SPRING_CONFIG }),
        Animated.delay(staggerDelay),
        Animated.spring(researchLine3Anim, { toValue: 1, ...SPRING_CONFIG }),
        Animated.delay(RESEARCH_REVEAL_DELAY),
        Animated.spring(researchContinueAnim, { toValue: 1, ...SPRING_CONFIG }),
      ]).start(() => {
        setResearchReady(true);
        // Auto-progress after 7 seconds total or after button reveal
        autoAdvanceTimer.current = setTimeout(() => {
          handleNext();
        }, 7000);
      });
    }

    return () => {
      if (autoAdvanceTimer.current) {
        clearTimeout(autoAdvanceTimer.current);
      }
    };
  }, [screen]);

  // Launch screen auto-advance timer
  useEffect(() => {
    if (screen === "launch") {
      const timer = setTimeout(() => {
        handleNext();
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [screen]);

  // Handoff screen celebration animation
  useEffect(() => {
    if (screen === "handoff") {
      handoffSpinAnim.setValue(0);
      handoffScaleAnim.setValue(0.8);
      commitmentButtonsAnim.setValue(0);
      celebrationCheckAnim.setValue(0);
      buttonsExitAnim.setValue(1);
      
      Animated.parallel([
        Animated.spring(handoffScaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(handoffSpinAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.spring(commitmentButtonsAnim, {
          toValue: 1,
          ...SPRING_CONFIG,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [screen]);

  const completePracta = useCallback(() => {
    if (hasCompleted.current) return;
    hasCompleted.current = true;
    
    if (celebrationTimer.current) {
      clearTimeout(celebrationTimer.current);
      celebrationTimer.current = null;
    }
    
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    const selectedTaskText = selectedTask ? quadrants[selectedTask] : "";
    onComplete?.({
      content: { type: "text", value: selectedTaskText },
      metadata: { 
        source: "user",
        quadrants,
        selectedTask,
        commitment,
      },
    });
  }, [selectedTask, quadrants, commitment, onComplete]);

  const handleCommitment = (choice: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setCommitment(choice);
    
    // Animate: fade out buttons, show celebration
    Animated.sequence([
      Animated.timing(buttonsExitAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(celebrationCheckAnim, {
        toValue: 1,
        tension: 50,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Complete after 6 seconds, or user can tap to finish sooner
      celebrationTimer.current = setTimeout(() => {
        completePracta();
      }, 6000);
    });
  };

  useEffect(() => {
    if (screen === "research") return;
    
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    
    Animated.parallel([
      Animated.spring(fadeAnim, { toValue: 1, ...SPRING_CONFIG }),
      Animated.spring(slideAnim, { toValue: 0, ...SPRING_CONFIG }),
    ]).start();

    if (screen === "grid") {
      gridCardAnims.forEach(anim => anim.setValue(0));
      gridCardAnims.forEach((anim, index) => {
        Animated.spring(anim, {
          toValue: 1,
          delay: index * 100,
          ...SPRING_CONFIG,
        }).start();
      });
    }

    const entryScreens = ["entry1", "entry2", "entry3", "entry4"];
    const entryIndex = entryScreens.indexOf(screen);
    if (entryIndex >= 0) {
      Animated.spring(progressAnim, {
        toValue: (entryIndex + 1) / 4,
        ...SPRING_CONFIG,
      }).start();
    }
  }, [screen]);

  const handleNextAuto = useCallback(() => {
    const input = currentInput.trim();
    if (input.length < 3) return;
    
    const screenToQuadrant: Record<string, keyof QuadrantData> = {
      entry1: "q1",
      entry2: "q2", 
      entry3: "q3",
      entry4: "q4",
    };
    
    const quadrantKey = screenToQuadrant[screen];
    if (quadrantKey) {
      setQuadrants(prev => ({ ...prev, [quadrantKey]: input }));
    }
    
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    const screenOrder: Screen[] = ["research", "launch", "entry1", "entry2", "entry3", "entry4", "grid", "handoff"];
    const currentIndex = screenOrder.indexOf(screen);
    if (currentIndex < screenOrder.length - 1) {
      setCurrentInput("");
      setScreen(screenOrder[currentIndex + 1]);
    }
  }, [currentInput, screen]);

  const triggerHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(style);
    }
  };

  const handleNext = () => {
    triggerHaptic();
    
    const screenToQuadrant: Record<string, keyof QuadrantData> = {
      entry1: "q1",
      entry2: "q2", 
      entry3: "q3",
      entry4: "q4",
    };
    
    const quadrantKey = screenToQuadrant[screen];
    if (quadrantKey && currentInput.trim()) {
      setQuadrants(prev => ({ ...prev, [quadrantKey]: currentInput.trim() }));
    }
    
    const screenOrder: Screen[] = ["research", "launch", "entry1", "entry2", "entry3", "entry4", "grid", "handoff"];
    const currentIndex = screenOrder.indexOf(screen);
    if (currentIndex < screenOrder.length - 1) {
      setCurrentInput("");
      setScreen(screenOrder[currentIndex + 1]);
    }
  };

  const handleSelectTask = (key: keyof QuadrantData) => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedTask(key);
    setTimeout(() => setScreen("handoff"), 400);
  };

  const handleHandoff = (mode: "gentle" | "focus") => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    const duration = Date.now() - startTime;
    onComplete({
      content: {
        type: "text",
        value: selectedTask ? quadrants[selectedTask] : "",
      },
      metadata: {
        allTasks: quadrants,
        mode,
        duration,
      },
    });
  };

  const handleChipPress = (chip: string) => {
    triggerHaptic();
    setCurrentInput(chip);
    inputRef.current?.focus();
  };

  const renderResearchScreen = () => {
    const buttonHandlers = createButtonHandlers(researchButtonScale);
    
    const createLineStyle = (anim: Animated.Value) => ({
      opacity: anim,
      transform: [{
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      }],
    });
    
    return (
      <Pressable style={styles.researchContainer} onPress={handleNext}>
        <View style={styles.researchContent}>
          <Animated.View style={createLineStyle(researchLine1Anim)}>
            <ThemedText style={[styles.researchText, { color: theme.text }]}>
              Time management isn't just productivity—
            </ThemedText>
          </Animated.View>
          
          <Animated.View style={createLineStyle(researchLine2Anim)}>
            <ThemedText style={[styles.researchText, { color: theme.text }]}>
              it's linked to happiness.
            </ThemedText>
          </Animated.View>
          
          <Animated.View style={[createLineStyle(researchLine3Anim), { marginTop: Spacing.xl }]}>
            <ThemedText style={[styles.researchStat, { color: theme.textSecondary }]}>
              18% of life satisfaction differences were linked across 53,957 in multiple independent studies.
            </ThemedText>
          </Animated.View>
        </View>
        
        <Animated.View 
          pointerEvents={researchReady ? "auto" : "none"}
          style={[
            styles.footer, 
            { 
              paddingBottom: insets.bottom + Spacing.lg,
              opacity: researchContinueAnim,
              transform: [{
                translateY: researchContinueAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [40, 0],
                }),
              }],
            },
          ]}
        >
          <AnimatedPressable
            onPress={handleNext}
            onPressIn={buttonHandlers.onPressIn}
            onPressOut={buttonHandlers.onPressOut}
            style={[
              styles.primaryButton,
              { 
                backgroundColor: theme.primary,
                transform: [{ scale: researchButtonScale }],
              },
            ]}
          >
            <ThemedText style={styles.buttonText}>Continue</ThemedText>
          </AnimatedPressable>
          
          <ThemedText style={[styles.researchCitation, { color: theme.textSecondary }]}>
            PLOS ONE, 2021
          </ThemedText>
        </Animated.View>
      </Pressable>
    );
  };

  const renderLaunchScreen = () => {
    const buttonHandlers = createButtonHandlers(launchButtonScale);
    
    return (
      <Pressable onPress={handleNext} style={{ flex: 1 }}>
        <Animated.View
          style={[
            styles.screenContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.launchContent}>
            <View style={[styles.iconCircle, { backgroundColor: theme.primary + "15" }]}>
              <Feather name="layers" size={40} color={theme.primary} />
            </View>
            <ThemedText style={styles.launchTitle}>
              Let's sort a few things.
            </ThemedText>
            <ThemedText style={[styles.launchSubtitle, { color: theme.textSecondary }]}>
              There's no right answer—just what's true for you right now.
            </ThemedText>
          </View>
          
          <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <AnimatedPressable
              onPress={handleNext}
              onPressIn={buttonHandlers.onPressIn}
              onPressOut={buttonHandlers.onPressOut}
              style={[
                styles.primaryButton,
                { 
                  backgroundColor: theme.primary,
                  transform: [{ scale: launchButtonScale }],
                },
              ]}
            >
              <ThemedText style={styles.buttonText}>Begin</ThemedText>
            </AnimatedPressable>
          </View>
        </Animated.View>
      </Pressable>
    );
  };

  const renderProgressBar = () => {
    const entryScreens = ["entry1", "entry2", "entry3", "entry4"];
    const isEntryScreen = entryScreens.includes(screen);
    
    if (!isEntryScreen) return null;
    
    return (
      <View style={styles.progressContainer}>
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                backgroundColor: theme.primary,
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
        <ThemedText style={[styles.progressLabel, { color: theme.textSecondary }]}>
          {entryScreens.indexOf(screen) + 1} of 4
        </ThemedText>
      </View>
    );
  };

  const renderEntryScreen = (screenKey: "entry1" | "entry2" | "entry3" | "entry4") => {
    const prompt = PROMPTS[screenKey];
    const quickStarts = QUICK_STARTS[screenKey];
    const isValid = currentInput.trim().length >= 3;
    const buttonHandlers = createButtonHandlers(entryButtonScale);

    return (
      <Animated.View
        style={[
          styles.screenContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <KeyboardAwareScrollViewCompat
          contentContainerStyle={styles.entryScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.entryContent}>
            <ThemedText style={styles.promptText}>
              {prompt.question}
            </ThemedText>
            
            <TextInput
              ref={inputRef}
              style={[
                styles.textInput,
                {
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  borderColor: currentInput ? theme.primary : theme.border,
                },
              ]}
              value={currentInput}
              onChangeText={setCurrentInput}
              placeholder={prompt.placeholder}
              placeholderTextColor={theme.textSecondary}
              maxLength={60}
              returnKeyType="done"
              onSubmitEditing={handleNext}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              autoFocus
            />
            
            <Animated.View 
              style={[
                styles.chipsSection,
                {
                  opacity: nextButtonAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0],
                  }),
                },
              ]}
              pointerEvents={isValid ? "none" : "auto"}
            >
              <ThemedText style={[styles.chipsLabel, { color: theme.textSecondary }]}>
                Quick starts
              </ThemedText>
              <View style={styles.chipsContainer}>
                {quickStarts.map((chip, index) => (
                  <Pressable
                    key={index}
                    onPress={() => handleChipPress(chip)}
                    style={({ pressed }) => [
                      styles.chip,
                      { 
                        backgroundColor: theme.backgroundTertiary,
                        opacity: pressed ? 0.7 : 1,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      },
                    ]}
                  >
                    <ThemedText style={[styles.chipText, { color: theme.textSecondary }]}>
                      {chip}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <ThemedText style={[styles.chipHint, { color: theme.textSecondary }]}>
                Tap one to start, then make it yours
              </ThemedText>
            </Animated.View>
          </View>
        </KeyboardAwareScrollViewCompat>
        
        <Animated.View 
          pointerEvents={currentInput.trim().length >= 3 ? "auto" : "none"}
          style={[
            styles.floatingFooter, 
            { 
              bottom: insets.bottom + Spacing.lg,
              opacity: nextButtonAnim,
              transform: [{
                translateY: nextButtonAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [80, 0],
                }),
              }],
            },
          ]}
        >
          <AnimatedPressable
            onPress={handleNext}
            onPressIn={buttonHandlers.onPressIn}
            onPressOut={buttonHandlers.onPressOut}
            disabled={!isValid}
            style={[
              styles.primaryButton,
              { 
                backgroundColor: isValid ? theme.primary : theme.border,
                opacity: isValid ? 1 : 0.5,
                transform: [{ scale: entryButtonScale }],
              },
            ]}
          >
            <ThemedText style={styles.buttonText}>Next</ThemedText>
          </AnimatedPressable>
        </Animated.View>
      </Animated.View>
    );
  };

  const renderGridScreen = () => {
    // Grid layout: Row 1 = Urgent, Column 2 = Important
    // q2 (Urgent, Not Important) | q4 (Urgent, Important)
    // q1 (Not Urgent, Not Imp)   | q3 (Not Urgent, Important)
    const gridItems: { key: keyof QuadrantData; label: string }[] = [
      { key: "q2", label: quadrants.q2 },
      { key: "q4", label: quadrants.q4 },
      { key: "q1", label: quadrants.q1 },
      { key: "q3", label: quadrants.q3 },
    ];

    return (
      <Animated.View
        style={[
          styles.screenContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.gridHeader}>
          <View style={[styles.iconCircle, { backgroundColor: theme.primary + "15", marginBottom: Spacing.md }]}>
            <Feather name="target" size={28} color={theme.primary} />
          </View>
          <ThemedText style={styles.gridPrompt}>
            Which one feels like a good place to start?
          </ThemedText>
        </View>
        
        <View style={styles.gridContainer}>
          {gridItems.map((item, index) => {
            const isSelected = selectedTask === item.key;
            const isOther = selectedTask && selectedTask !== item.key;
            
            return (
              <Animated.View
                key={item.key}
                style={[
                  styles.gridCardWrapper,
                  {
                    opacity: gridCardAnims[index],
                    transform: [
                      {
                        scale: gridCardAnims[index].interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.8, 1],
                        }),
                      },
                    ],
                  },
                  isOther && styles.gridCardFaded,
                ]}
              >
                <Pressable
                  onPress={() => handleSelectTask(item.key)}
                  disabled={selectedTask !== null}
                  style={({ pressed }) => [
                    styles.gridCard,
                    {
                      backgroundColor: isSelected 
                        ? theme.primary + "18" 
                        : theme.backgroundSecondary,
                      borderColor: isSelected ? theme.primary : theme.border,
                      transform: [{ scale: pressed && !selectedTask ? 0.97 : 1 }],
                    },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.gridCardText,
                      isSelected && { color: theme.primary, fontWeight: "600" },
                    ]}
                    numberOfLines={3}
                  >
                    {item.label}
                  </ThemedText>
                  {isSelected && (
                    <View style={[styles.checkCircle, { backgroundColor: theme.primary }]}>
                      <Feather name="check" size={14} color="white" />
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </Animated.View>
    );
  };

  const renderHandoffScreen = () => {
    const selectedTaskText = selectedTask ? quadrants[selectedTask] : "";
    const commitmentLabels: Record<string, string> = {
      hour: "in the next hour",
      today: "today",
      tomorrow: "tomorrow",
      someday: "someday",
    };
    
    return (
      <Pressable 
        onPress={commitment ? completePracta : undefined}
        style={{ flex: 1 }}
        disabled={!commitment}
      >
        <Animated.View
          style={[
            styles.screenContainer,
            styles.handoffCentered,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Celebration checkmark - appears after commitment */}
          <Animated.View 
            style={[
              styles.iconCircle, 
              { 
                backgroundColor: theme.success + "15", 
                marginBottom: Spacing.lg,
                opacity: celebrationCheckAnim,
                transform: [{
                  scale: celebrationCheckAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.3, 1.2, 1],
                  }),
                }],
              }
            ]}
        >
          <Feather name="check-circle" size={36} color={theme.success} />
        </Animated.View>
        
        {/* Before commitment: spinning task card */}
        {!commitment && (
          <Animated.View 
            style={[
              styles.handoffCard, 
              { 
                backgroundColor: theme.backgroundSecondary,
                transform: [
                  { scale: handoffScaleAnim },
                  { 
                    rotateY: handoffSpinAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    }) 
                  },
                ],
              }
            ]}
          >
            <ThemedText style={styles.handoffTaskText}>
              {selectedTaskText}
            </ThemedText>
          </Animated.View>
        )}
        
        {/* After commitment: plan summary */}
        {commitment && (
          <Animated.View 
            style={[
              styles.planSummary,
              {
                opacity: celebrationCheckAnim,
                transform: [{
                  translateY: celebrationCheckAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                }],
              }
            ]}
          >
            <View style={[styles.planCard, { backgroundColor: theme.backgroundSecondary }]}>
              <ThemedText style={styles.planTaskText}>
                {selectedTaskText}
              </ThemedText>
            </View>
            <ThemedText style={[styles.planConnector, { color: theme.primary }]}>
              +
            </ThemedText>
            <View style={[styles.planCard, { backgroundColor: theme.primary + "12" }]}>
              <ThemedText style={[styles.planCommitmentText, { color: theme.primary }]}>
                {commitmentLabels[commitment]}
              </ThemedText>
            </View>
          </Animated.View>
        )}
        
        {/* Subtitle - changes based on state */}
        <Animated.Text 
          style={[
            styles.handoffSubtitle, 
            { 
              color: theme.textSecondary, 
              marginTop: Spacing.lg,
              opacity: commitment ? celebrationCheckAnim : handoffSpinAnim,
            }
          ]}
        >
          {commitment ? "You've got a plan." : "A good place to begin."}
        </Animated.Text>
        
        {/* Commitment buttons - fade out when selected */}
        <Animated.View 
          pointerEvents={commitment ? "none" : "auto"}
          style={[
            styles.commitmentContainer,
            {
              opacity: Animated.multiply(commitmentButtonsAnim, buttonsExitAnim),
              transform: [{
                translateY: commitmentButtonsAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              }],
            }
          ]}
        >
          {[
            { key: "hour", label: "I'll do this in the next hour" },
            { key: "today", label: "I'll do this today" },
            { key: "tomorrow", label: "I'll do this tomorrow" },
            { key: "someday", label: "I'll do this someday" },
          ].map((option) => (
            <Pressable
              key={option.key}
              onPress={() => handleCommitment(option.key)}
              style={({ pressed }) => [
                styles.commitmentButton,
                {
                  backgroundColor: pressed ? theme.primary + "15" : theme.backgroundSecondary,
                  borderColor: theme.border,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <ThemedText style={styles.commitmentButtonText}>
                {option.label}
              </ThemedText>
            </Pressable>
          ))}
        </Animated.View>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
      {screen === "research" && renderResearchScreen()}
      {screen === "launch" && renderLaunchScreen()}
      {screen === "entry1" && renderEntryScreen("entry1")}
      {screen === "entry2" && renderEntryScreen("entry2")}
      {screen === "entry3" && renderEntryScreen("entry3")}
      {screen === "entry4" && renderEntryScreen("entry4")}
      {screen === "grid" && renderGridScreen()}
      {screen === "handoff" && renderHandoffScreen()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  researchContainer: {
    flex: 1,
    justifyContent: "space-between",
  },
  researchContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  researchText: {
    fontSize: 26,
    fontWeight: "600",
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  researchStat: {
    fontSize: 17,
    lineHeight: 26,
  },
  researchCitation: {
    fontSize: 13,
    textAlign: "center",
    marginTop: Spacing.md,
  },
  screenContainer: {
    flex: 1,
    justifyContent: "space-between",
  },
  progressContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  questionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  launchContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  launchTitle: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.md,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  launchSubtitle: {
    fontSize: 17,
    textAlign: "center",
    lineHeight: 26,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  floatingFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
  },
  primaryButton: {
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  buttonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 17,
  },
  secondaryButton: {
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  secondaryButtonText: {
    fontWeight: "600",
    fontSize: 17,
  },
  skipButton: {
    padding: Spacing.md,
    alignItems: "center",
  },
  skipText: {
    fontSize: 15,
  },
  entryScrollContent: {
    flexGrow: 1,
  },
  entryContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  promptText: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 34,
    marginBottom: Spacing["2xl"],
    letterSpacing: -0.3,
  },
  textInput: {
    height: 56,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    fontSize: 17,
    borderWidth: 2,
    marginBottom: Spacing.xl,
  },
  chipsSection: {
    gap: Spacing.sm,
  },
  chipsLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  chip: {
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md + 2,
    borderRadius: BorderRadius.full,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "500",
  },
  chipHint: {
    fontSize: 13,
    fontStyle: "italic",
    marginTop: Spacing.xs,
  },
  gridHeader: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    alignItems: "center",
  },
  gridPrompt: {
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 30,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  gridContainer: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    alignContent: "center",
    justifyContent: "center",
  },
  gridCardWrapper: {
    width: "47%",
  },
  gridCardFaded: {
    opacity: 0.25,
  },
  gridCard: {
    aspectRatio: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  gridCardText: {
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 22,
  },
  checkCircle: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  handoffContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  handoffCentered: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  handoffCard: {
    width: "100%",
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  handoffTaskText: {
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  handoffSubtitle: {
    fontSize: 16,
    textAlign: "center",
  },
  commitmentContainer: {
    width: "100%",
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  commitmentButton: {
    width: "100%",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  commitmentButtonText: {
    fontSize: 16,
    textAlign: "center",
    fontWeight: "500",
  },
  planSummary: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    flexWrap: "wrap",
  },
  planCard: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    maxWidth: "45%",
  },
  planTaskText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 22,
  },
  planConnector: {
    fontSize: 24,
    fontWeight: "600",
  },
  planCommitmentText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});
