/**
 * Running Span Task - Working Memory Assessment
 * 
 * Scientific Background (Conway et al., 2005; Bunting, Cowan & Saults, 2006):
 * - Presents unpredictable-length sequences of items
 * - User must recall the last N items in correct serial order
 * - Fast presentation rate (~500ms) engages passive memory strategy
 * - Measures working memory capacity and focus of attention (typically 3-5 items)
 * - Correlates with fluid intelligence (r = .40-.60)
 * 
 * Key Parameters:
 * - Presentation rate: 500ms (prevents active rehearsal)
 * - Recall set size: 3-6 items (adapts to performance)
 * - Scoring: Position-based (correct item in correct position)
 * - List length: Varies unpredictably (8-15 items)
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

type Phase = "intro" | "presenting" | "recall" | "feedback" | "complete";
type StimulusType = "letters" | "numbers";

interface TrialResult {
  listLength: number;
  recallSize: number;
  correctItems: number;
  score: number;
  responseTime: number;
}

interface SessionRecord {
  timestamp: number;
  averageScore: number;
  averageRecallSize: number;
  finalRecallSize: number;
  trials: TrialResult[];
}

const LETTERS = "BCDFGHJKLMNPQRSTVWXZ".split("");
const MAX_HISTORY = 30;
const STORAGE_KEY = "sessionHistory";
const NUMBERS = "123456789".split("");

const PRESENTATION_RATE = 500;
const MIN_LIST_LENGTH = 8;
const MAX_LIST_LENGTH = 15;
const INITIAL_RECALL_SIZE = 3;
const MAX_RECALL_SIZE = 6;
const DEFAULT_TRIALS_PER_SESSION = 8;
const INTER_STIMULUS_INTERVAL = 200;

export default function RunningSpan({ context, onComplete, onSettings, showSettings }: PractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();

  const trialsPerSession = typeof context.config?.trialsPerSession === "number"
    ? Math.max(3, Math.min(20, Math.round(context.config.trialsPerSession)))
    : DEFAULT_TRIALS_PER_SESSION;

  const [phase, setPhase] = useState<Phase>("intro");
  const [currentStimulus, setCurrentStimulus] = useState<string>("");
  const [sequence, setSequence] = useState<string[]>([]);
  const [targetItems, setTargetItems] = useState<string[]>([]);
  const [userResponse, setUserResponse] = useState<string[]>([]);
  const [recallSize, setRecallSize] = useState(INITIAL_RECALL_SIZE);
  const [trialNumber, setTrialNumber] = useState(0);
  const [results, setResults] = useState<TrialResult[]>([]);
  const [stimulusType, setStimulusType] = useState<StimulusType>("letters");
  const [showingFeedback, setShowingFeedback] = useState(false);
  const [lastScore, setLastScore] = useState(0);
  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>([]);
  const [isNewRecord, setIsNewRecord] = useState<{ score: boolean; span: boolean }>({ score: false, span: false });
  const [previousBest, setPreviousBest] = useState<{ score: number; span: number }>({ score: 0, span: 0 });
  
  const stimulusOpacity = useSharedValue(0);
  const stimulusScale = useSharedValue(0.8);
  const buttonScale = useSharedValue(1);
  
  const presentationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recallStartTime = useRef<number>(0);
  const isMountedRef = useRef(true);
  const currentTrialRecallSize = useRef(INITIAL_RECALL_SIZE);

  useEffect(() => {
    setConfig({
      headerMode: "default",
      title: "Running Span",
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings]);

  useEffect(() => {
    isMountedRef.current = true;
    
    const loadHistory = async () => {
      try {
        const history = await context.storage?.get<SessionRecord[]>(STORAGE_KEY);
        if (history && Array.isArray(history)) {
          setSessionHistory(history);
          if (history.length > 0) {
            const bestScore = Math.max(...history.map(s => s.averageScore));
            const bestSpan = Math.max(...history.map(s => s.finalRecallSize));
            setPreviousBest({ score: bestScore, span: bestSpan });
          }
        }
      } catch (e) {
        console.warn("Failed to load session history:", e);
      }
    };
    
    loadHistory();
    
    return () => {
      isMountedRef.current = false;
      if (presentationRef.current) {
        clearTimeout(presentationRef.current);
      }
    };
  }, [context.storage]);

  const triggerHaptic = useCallback((style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(style);
    }
  }, []);

  const generateSequence = useCallback((): string[] => {
    const items = stimulusType === "letters" ? LETTERS : NUMBERS;
    const length = Math.floor(Math.random() * (MAX_LIST_LENGTH - MIN_LIST_LENGTH + 1)) + MIN_LIST_LENGTH;
    const seq: string[] = [];
    let lastItem = "";
    
    for (let i = 0; i < length; i++) {
      let item: string;
      do {
        item = items[Math.floor(Math.random() * items.length)];
      } while (item === lastItem);
      seq.push(item);
      lastItem = item;
    }
    
    return seq;
  }, [stimulusType]);

  const presentSequence = useCallback((seq: string[], index: number = 0) => {
    if (!isMountedRef.current) return;

    if (index < seq.length) {
      setCurrentStimulus(seq[index]);
      stimulusOpacity.value = withTiming(1, { duration: 120 });
      stimulusScale.value = 1;
      
      triggerHaptic(Haptics.ImpactFeedbackStyle.Light);

      presentationRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        
        stimulusOpacity.value = withTiming(0, { duration: 100 });
        stimulusScale.value = 1;
        
        presentationRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          presentSequence(seq, index + 1);
        }, INTER_STIMULUS_INTERVAL);
      }, PRESENTATION_RATE);
    } else {
      const trialRecall = currentTrialRecallSize.current;
      const targets = seq.slice(-trialRecall);
      setTargetItems(targets);
      setPhase("recall");
      recallStartTime.current = Date.now();
      
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    }
  }, [stimulusOpacity, stimulusScale, triggerHaptic]);

  const startTrial = useCallback(() => {
    currentTrialRecallSize.current = recallSize;
    setUserResponse([]);
    setCurrentStimulus("");
    const seq = generateSequence();
    setSequence(seq);
    setPhase("presenting");
    
    setTimeout(() => {
      if (isMountedRef.current) {
        presentSequence(seq);
      }
    }, 500);
  }, [generateSequence, presentSequence, recallSize]);

  const handleItemSelect = useCallback((item: string) => {
    const trialRecall = currentTrialRecallSize.current;
    if (userResponse.length >= trialRecall) return;
    
    triggerHaptic();
    buttonScale.value = withSequence(
      withTiming(0.95, { duration: 50 }),
      withSpring(1, { damping: 10 })
    );
    
    const newResponse = [...userResponse, item];
    setUserResponse(newResponse);
    
    if (newResponse.length === trialRecall) {
      const responseTime = Date.now() - recallStartTime.current;
      let correctCount = 0;
      
      for (let i = 0; i < trialRecall; i++) {
        if (newResponse[i] === targetItems[i]) {
          correctCount++;
        }
      }
      
      const score = correctCount / trialRecall;
      setLastScore(score);
      
      const result: TrialResult = {
        listLength: sequence.length,
        recallSize: trialRecall,
        correctItems: correctCount,
        score,
        responseTime,
      };
      
      setResults(prev => [...prev, result]);
      
      if (score >= 0.8 && trialRecall < MAX_RECALL_SIZE) {
        setRecallSize(trialRecall + 1);
      } else if (score < 0.5 && trialRecall > INITIAL_RECALL_SIZE) {
        setRecallSize(trialRecall - 1);
      }
      
      setShowingFeedback(true);
      setPhase("feedback");
      
      if (Platform.OS !== "web") {
        if (score >= 0.8) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (score < 0.5) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }
      
      setTimeout(() => {
        if (!isMountedRef.current) return;
        setShowingFeedback(false);
        
        if (trialNumber + 1 >= trialsPerSession) {
          setPhase("complete");
        } else {
          setTrialNumber(prev => prev + 1);
          startTrial();
        }
      }, 2000);
    }
  }, [userResponse, targetItems, sequence, trialNumber, triggerHaptic, buttonScale, startTrial]);

  const handleUndo = useCallback(() => {
    if (userResponse.length > 0) {
      triggerHaptic();
      setUserResponse(prev => prev.slice(0, -1));
    }
  }, [userResponse, triggerHaptic]);

  const saveSession = useCallback(async (newSession: SessionRecord) => {
    try {
      const updatedHistory = [...sessionHistory, newSession].slice(-MAX_HISTORY);
      await context.storage?.set(STORAGE_KEY, updatedHistory);
      setSessionHistory(updatedHistory);
    } catch (e) {
      console.warn("Failed to save session:", e);
    }
  }, [context.storage, sessionHistory]);

  const handleSessionComplete = useCallback(() => {
    const totalScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const avgRecallSize = results.reduce((sum, r) => sum + r.recallSize, 0) / results.length;
    
    const newScoreRecord = totalScore > previousBest.score;
    const newSpanRecord = recallSize > previousBest.span;
    
    setIsNewRecord({ score: newScoreRecord, span: newSpanRecord });
    
    const newSession: SessionRecord = {
      timestamp: Date.now(),
      averageScore: totalScore,
      averageRecallSize: avgRecallSize,
      finalRecallSize: recallSize,
      trials: results,
    };
    
    saveSession(newSession);
    
    if (newScoreRecord || newSpanRecord) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [results, recallSize, previousBest, saveSession]);

  useEffect(() => {
    if (phase === "complete") {
      handleSessionComplete();
    }
  }, [phase]);

  const handleComplete = useCallback(() => {
    triggerHaptic();
    
    const totalScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const avgRecallSize = results.reduce((sum, r) => sum + r.recallSize, 0) / results.length;
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    
    onComplete({
      content: {
        type: "text",
        value: `Running Span completed! Average score: ${Math.round(totalScore * 100)}%. Working memory span: ~${avgRecallSize.toFixed(1)} items.`,
      },
      metadata: {
        trials: results,
        averageScore: totalScore,
        averageRecallSize: avgRecallSize,
        averageResponseTime: avgResponseTime,
        finalRecallSize: recallSize,
        stimulusType,
        completedAt: Date.now(),
        isNewRecord,
        sessionHistory: sessionHistory.length + 1,
      },
    });
  }, [results, recallSize, stimulusType, triggerHaptic, onComplete, isNewRecord, sessionHistory]);

  const animatedStimulusStyle = useAnimatedStyle(() => ({
    opacity: stimulusOpacity.value,
    transform: [{ scale: stimulusScale.value }],
  }));

  const getAvailableItems = () => {
    return stimulusType === "letters" ? LETTERS : NUMBERS;
  };

  const renderIntro = () => (
    <View style={styles.content}>
      <View style={[styles.iconContainer, { backgroundColor: theme.primary + "20" }]}>
        <Feather name="zap" size={48} color={theme.primary} />
      </View>
      
      <ThemedText style={styles.title}>Train Your Memory</ThemedText>
      <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
        Watch {stimulusType} flash by, then recall the <ThemedText style={{ fontWeight: "700" }}>last {recallSize}</ThemedText> in order. Regular practice expands your mental capacity.
      </ThemedText>
      
      <View style={styles.typeSelector}>
        <Pressable
          style={[
            styles.typeButton,
            { 
              backgroundColor: stimulusType === "letters" ? theme.primary : theme.backgroundSecondary,
              borderColor: theme.primary,
            }
          ]}
          onPress={() => setStimulusType("letters")}
        >
          <ThemedText style={[
            styles.typeButtonText,
            { color: stimulusType === "letters" ? "white" : theme.text }
          ]}>
            Letters
          </ThemedText>
        </Pressable>
        <Pressable
          style={[
            styles.typeButton,
            { 
              backgroundColor: stimulusType === "numbers" ? theme.primary : theme.backgroundSecondary,
              borderColor: theme.primary,
            }
          ]}
          onPress={() => setStimulusType("numbers")}
        >
          <ThemedText style={[
            styles.typeButtonText,
            { color: stimulusType === "numbers" ? "white" : theme.text }
          ]}>
            Numbers
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );

  const renderPresenting = () => (
    <View style={styles.content}>
      <ThemedText style={[styles.trialIndicator, { color: theme.textSecondary }]}>
        Trial {trialNumber + 1} of {trialsPerSession}
      </ThemedText>
      
      <View style={styles.stimulusContainer}>
        <Animated.View style={[styles.stimulusBox, animatedStimulusStyle]}>
          <ThemedText style={[styles.stimulus, { color: theme.primary }]}>
            {currentStimulus}
          </ThemedText>
        </Animated.View>
      </View>
      
      <ThemedText style={[styles.instruction, { color: theme.textSecondary }]}>
        Watch carefully...
      </ThemedText>
    </View>
  );

  const renderRecall = () => {
    const trialRecall = targetItems.length;
    return (
    <View style={styles.content}>
      <ThemedText style={[styles.trialIndicator, { color: theme.textSecondary }]}>
        Trial {trialNumber + 1} of {trialsPerSession}
      </ThemedText>
      
      <ThemedText style={styles.recallTitle}>
        Recall the last {trialRecall}
      </ThemedText>
      
      <View style={styles.responseContainer}>
        {Array.from({ length: trialRecall }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.responseSlot,
              { 
                backgroundColor: userResponse[i] ? theme.primary : theme.backgroundSecondary,
                borderColor: i === userResponse.length ? theme.primary : "transparent",
                borderWidth: i === userResponse.length ? 2 : 0,
              }
            ]}
          >
            <ThemedText style={[
              styles.responseText,
              { color: userResponse[i] ? "white" : theme.textSecondary }
            ]}>
              {userResponse[i] || (i + 1)}
            </ThemedText>
          </View>
        ))}
      </View>
      
      <View style={styles.keypad}>
        {getAvailableItems().map((item) => (
          <Pressable
            key={item}
            style={[
              styles.keypadButton,
              { backgroundColor: theme.backgroundSecondary }
            ]}
            onPress={() => handleItemSelect(item)}
            disabled={userResponse.length >= trialRecall}
          >
            <ThemedText style={styles.keypadText}>{item}</ThemedText>
          </Pressable>
        ))}
      </View>
      
      <Pressable style={[styles.undoButton, { opacity: userResponse.length > 0 ? 1 : 0 }]} onPress={handleUndo} disabled={userResponse.length === 0}>
        <Feather name="delete" size={20} color={theme.textSecondary} />
        <ThemedText style={[styles.undoText, { color: theme.textSecondary }]}>
          Undo
        </ThemedText>
      </Pressable>
    </View>
  );
  };

  const renderFeedback = () => {
    const isCorrect = lastScore >= 0.8;
    const isPartial = lastScore >= 0.5 && lastScore < 0.8;
    
    return (
      <View style={styles.content}>
        <View style={[
          styles.feedbackIcon,
          { backgroundColor: isCorrect ? "#4CAF50" + "20" : isPartial ? "#FF9800" + "20" : "#F44336" + "20" }
        ]}>
          <Feather
            name={isCorrect ? "check-circle" : isPartial ? "minus-circle" : "x-circle"}
            size={48}
            color={isCorrect ? "#4CAF50" : isPartial ? "#FF9800" : "#F44336"}
          />
        </View>
        
        <ThemedText style={styles.feedbackTitle}>
          {isCorrect ? "Excellent!" : isPartial ? "You're getting stronger!" : "Every rep builds your brain!"}
        </ThemedText>
        
        <ThemedText style={[styles.feedbackSubtitle, { color: theme.textSecondary }]}>
          {Math.round(lastScore * targetItems.length)} of {targetItems.length} correct
        </ThemedText>
        
        <View style={styles.comparisonContainer}>
          <View style={styles.comparisonRow}>
            <ThemedText style={[styles.comparisonLabel, { color: theme.textSecondary }]}>
              Correct:
            </ThemedText>
            <View style={styles.comparisonItems}>
              {targetItems.map((item, i) => (
                <View
                  key={i}
                  style={[styles.comparisonItem, { backgroundColor: "#4CAF50" + "30" }]}
                >
                  <ThemedText style={styles.comparisonItemText}>{item}</ThemedText>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.comparisonRow}>
            <ThemedText style={[styles.comparisonLabel, { color: theme.textSecondary }]}>
              Yours:
            </ThemedText>
            <View style={styles.comparisonItems}>
              {userResponse.map((item, i) => (
                <View
                  key={i}
                  style={[
                    styles.comparisonItem,
                    { backgroundColor: item === targetItems[i] ? "#4CAF50" + "30" : "#F44336" + "30" }
                  ]}
                >
                  <ThemedText style={styles.comparisonItemText}>{item}</ThemedText>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderProgressSummary = () => {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
    
    const allSessions = [...sessionHistory];
    const currentSession: SessionRecord = {
      timestamp: now,
      averageScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
      averageRecallSize: results.reduce((sum, r) => sum + r.recallSize, 0) / results.length,
      finalRecallSize: recallSize,
      trials: results,
    };
    allSessions.push(currentSession);
    
    const weekSessions = allSessions.filter(s => s.timestamp >= oneWeekAgo);
    const monthSessions = allSessions.filter(s => s.timestamp >= oneMonthAgo);
    
    if (monthSessions.length < 1) return null;
    
    const weekAvg = weekSessions.length > 0
      ? Math.round((weekSessions.reduce((sum, s) => sum + s.averageScore, 0) / weekSessions.length) * 100)
      : null;
    const monthAvg = Math.round((monthSessions.reduce((sum, s) => sum + s.averageScore, 0) / monthSessions.length) * 100);
    
    return (
      <View style={styles.progressSummary}>
        <View style={styles.progressRow}>
          <View style={styles.progressItem}>
            <ThemedText style={[styles.progressLabel, { color: theme.textSecondary }]}>This Week</ThemedText>
            <ThemedText style={[styles.progressValue, { color: theme.primary }]}>
              {weekAvg !== null ? `${weekAvg}%` : "--"}
            </ThemedText>
            <ThemedText style={[styles.progressCount, { color: theme.textSecondary }]}>
              {weekSessions.length} session{weekSessions.length !== 1 ? "s" : ""}
            </ThemedText>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.backgroundSecondary }]} />
          <View style={styles.progressItem}>
            <ThemedText style={[styles.progressLabel, { color: theme.textSecondary }]}>This Month</ThemedText>
            <ThemedText style={[styles.progressValue, { color: theme.primary }]}>
              {`${monthAvg}%`}
            </ThemedText>
            <ThemedText style={[styles.progressCount, { color: theme.textSecondary }]}>
              {monthSessions.length} session{monthSessions.length !== 1 ? "s" : ""}
            </ThemedText>
          </View>
        </View>
      </View>
    );
  };

  const renderComplete = () => {
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const avgRecall = results.reduce((sum, r) => sum + r.recallSize, 0) / results.length;
    const hasNewRecord = isNewRecord.score || isNewRecord.span;
    
    return (
      <ScrollView contentContainerStyle={styles.completeContent} showsVerticalScrollIndicator={false}>
        {hasNewRecord ? (
          <View style={[styles.recordBanner, { backgroundColor: "#FFD700" + "30" }]}>
            <Feather name="star" size={20} color="#FFD700" />
            <ThemedText style={styles.recordText}>
              New Personal Best{isNewRecord.score && isNewRecord.span ? "s" : ""}! 
              {isNewRecord.score ? ` ${Math.round(avgScore * 100)}% accuracy` : ""}
              {isNewRecord.score && isNewRecord.span ? " &" : ""}
              {isNewRecord.span ? ` ${recallSize}-item span` : ""}
            </ThemedText>
          </View>
        ) : null}
        
        <View style={[styles.iconContainer, { backgroundColor: "#4CAF50" + "20" }]}>
          <Feather name="award" size={48} color="#4CAF50" />
        </View>
        
        <ThemedText style={styles.title}>Great Work!</ThemedText>
        <ThemedText style={[styles.completionSubtitle, { color: theme.textSecondary }]}>
          Session #{sessionHistory.length + 1} complete
        </ThemedText>
        
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <ThemedText style={[styles.statValue, { color: theme.primary }]}>
              {Math.round(avgScore * 100)}%
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
              Accuracy
            </ThemedText>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.backgroundSecondary }]} />
          <View style={styles.statItem}>
            <ThemedText style={[styles.statValue, { color: theme.primary }]}>
              {avgRecall.toFixed(1)}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
              Avg Span
            </ThemedText>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.backgroundSecondary }]} />
          <View style={styles.statItem}>
            <ThemedText style={[styles.statValue, { color: theme.primary }]}>
              {recallSize}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
              Final Span
            </ThemedText>
          </View>
        </View>
        
        {renderProgressSummary()}
        
        <ThemedText style={[styles.researchNote, { color: theme.textSecondary }]}>
          {sessionHistory.length === 0 
            ? "Keep practicing to track your progress over time!"
            : "Working memory training is linked to improved focus and learning. Keep it up!"}
        </ThemedText>
      </ScrollView>
    );
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
      {phase === "intro" ? renderIntro() : null}
      {phase === "presenting" ? renderPresenting() : null}
      {phase === "recall" ? renderRecall() : null}
      {phase === "feedback" ? renderFeedback() : null}
      {phase === "complete" ? renderComplete() : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {phase === "intro" ? (
          <Pressable
            onPress={startTrial}
            style={[styles.button, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.buttonText}>Begin</ThemedText>
          </Pressable>
        ) : null}
        
        {phase === "complete" ? (
          <Pressable
            onPress={handleComplete}
            style={[styles.button, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.buttonText}>Complete</ThemedText>
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
    marginBottom: Spacing.xl,
  },
  typeSelector: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  typeButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  trialIndicator: {
    fontSize: 14,
    position: "absolute",
    top: 0,
  },
  stimulusContainer: {
    width: 150,
    height: 150,
    justifyContent: "center",
    alignItems: "center",
  },
  stimulusBox: {
    width: 120,
    height: 120,
    borderRadius: BorderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  stimulus: {
    fontSize: 72,
    fontWeight: "700",
  },
  instruction: {
    fontSize: 16,
    marginTop: Spacing.xl,
  },
  recallTitle: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: Spacing.xl,
  },
  responseContainer: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  responseSlot: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  responseText: {
    fontSize: 24,
    fontWeight: "600",
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.sm,
    maxWidth: 320,
  },
  keypadButton: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  keypadText: {
    fontSize: 20,
    fontWeight: "600",
  },
  undoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    padding: Spacing.sm,
  },
  undoText: {
    fontSize: 14,
  },
  feedbackIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  feedbackTitle: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  feedbackSubtitle: {
    fontSize: 16,
    marginBottom: Spacing.xl,
  },
  completionSubtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  comparisonContainer: {
    gap: Spacing.md,
  },
  comparisonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  comparisonLabel: {
    fontSize: 14,
    width: 60,
  },
  comparisonItems: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  comparisonItem: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  comparisonItemText: {
    fontSize: 18,
    fontWeight: "600",
  },
  statsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  statItem: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  statValue: {
    fontSize: 32,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    marginTop: Spacing.xs,
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  researchNote: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: Spacing.lg,
  },
  completeContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  recordBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  recordText: {
    fontSize: 14,
    fontWeight: "600",
  },
  progressSummary: {
    marginVertical: Spacing.lg,
    width: "100%",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  progressItem: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  progressLabel: {
    fontSize: 12,
    marginBottom: Spacing.xs,
  },
  progressValue: {
    fontSize: 28,
    fontWeight: "700",
  },
  progressCount: {
    fontSize: 11,
    marginTop: 2,
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
});
