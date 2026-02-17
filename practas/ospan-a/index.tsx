import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, StyleSheet, Pressable, Platform, ScrollView, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  FadeIn,
  FadeOut,
  runOnJS,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CONFETTI_COLORS = ["#FF6B6B", "#4ECDC4", "#FFE66D", "#95E1D3", "#F38181", "#AA96DA", "#FCBAD3"];

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

const LETTERS = ["F", "H", "J", "K", "L", "N", "P", "Q", "R", "S", "T", "Y"];
const LETTER_DISPLAY_MS = 800;
const ISI_MS = 300;
const MIN_LIST_LENGTH = 3;
const MAX_LIST_LENGTH = 7;
const SESSION_TARGET_SECONDS = 5 * 60;
const SESSION_HARD_CAP_SECONDS = 10 * 60;
const MAX_STORED_ATTEMPTS = 30;

interface ArithmeticProblem {
  display: string;
  isCorrect: boolean;
}

interface TrialData {
  listLength: number;
  letters: string[];
  problems: ArithmeticProblem[];
  processingResponses: boolean[];
  recalledLetters: string[];
  processingAccuracy: number;
  memoryAccuracy: number;
  success: boolean;
  timestamp: number;
}

interface AttemptRecord {
  date: string;
  timestamp: number;
  meanListLength: number;
  maxListLength: number;
  processingAccuracy: number;
  recallAccuracy: number;
  trialsCompleted: number;
  attentionScore: number;
}

interface StoredData {
  attempts: AttemptRecord[];
  calibratedTimeout: number | null;
}

type Phase = "intro" | "calibration" | "processing" | "memory" | "recall" | "feedback" | "summary";

function generateArithmeticProblem(): ArithmeticProblem {
  const A = Math.floor(Math.random() * 9) + 1;
  const B = Math.floor(Math.random() * 9) + 1;
  const C = Math.floor(Math.random() * 9) + 1;
  const ops = ["+", "-", "*"] as const;
  const op1 = ops[Math.floor(Math.random() * ops.length)];

  let result: number;
  if (op1 === "+") {
    result = A * B + C;
  } else if (op1 === "-") {
    result = A * B - C;
  } else {
    result = A * B * C;
  }

  const showCorrect = Math.random() > 0.5;
  const displayedResult = showCorrect ? result : result + (Math.random() > 0.5 ? Math.floor(Math.random() * 5) + 1 : -(Math.floor(Math.random() * 5) + 1));

  const opSymbol = op1 === "*" ? "x" : op1;
  const display = `(${A} x ${B}) ${opSymbol === "x" ? "+" : opSymbol} ${C} = ${displayedResult}`;

  return { display, isCorrect: showCorrect };
}

function getRandomLetter(exclude: string[] = []): string {
  const available = LETTERS.filter((l) => !exclude.includes(l));
  return available[Math.floor(Math.random() * available.length)];
}

interface ConfettiPiece {
  id: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  color: string;
  delay: number;
  rotation: number;
  scale: number;
  duration: number;
}

function ConfettiPieceView({ piece }: { piece: ConfettiPiece }) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(piece.scale);

  useEffect(() => {
    translateX.value = withDelay(
      piece.delay,
      withTiming(piece.targetX - piece.startX, { duration: piece.duration })
    );
    translateY.value = withDelay(
      piece.delay,
      withSequence(
        withTiming(piece.targetY, { duration: piece.duration * 0.6 }),
        withTiming(piece.targetY + 150, { duration: piece.duration * 0.4 })
      )
    );
    rotate.value = withDelay(
      piece.delay,
      withTiming(piece.rotation * 720, { duration: piece.duration })
    );
    scale.value = withDelay(
      piece.delay + piece.duration * 0.5,
      withTiming(0.2, { duration: piece.duration * 0.5 })
    );
    opacity.value = withDelay(
      piece.delay + piece.duration * 0.7,
      withTiming(0, { duration: piece.duration * 0.3 })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: piece.startX,
          top: piece.startY,
          width: 12,
          height: 12,
          backgroundColor: piece.color,
          borderRadius: 3,
        },
        animatedStyle,
      ]}
    />
  );
}

function Confetti({ show }: { show: boolean }) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    if (show) {
      const newPieces: ConfettiPiece[] = [];
      const centerX = SCREEN_WIDTH / 2;
      const centerY = SCREEN_HEIGHT / 2;
      
      for (let i = 0; i < 40; i++) {
        const angle = (Math.random() * Math.PI * 2);
        const distance = 150 + Math.random() * 200;
        const targetX = centerX + Math.cos(angle) * distance;
        const targetY = -100 - Math.random() * 300;
        const speed = 800 + Math.random() * 1200;
        
        newPieces.push({
          id: i,
          startX: centerX - 6,
          startY: centerY,
          targetX,
          targetY,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          delay: Math.random() * 150,
          rotation: Math.random() > 0.5 ? 1 : -1,
          scale: 0.6 + Math.random() * 0.8,
          duration: speed,
        });
      }
      setPieces(newPieces);
    } else {
      setPieces([]);
    }
  }, [show]);

  if (!show || pieces.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((piece) => (
        <ConfettiPieceView key={piece.id} piece={piece} />
      ))}
    </View>
  );
}

function getFeedbackMessage(memoryAcc: number, processingAcc: number, success: boolean): { title: string; subtitle: string; icon: string; positive: boolean } {
  const perfectMemory = memoryAcc === 1;
  const perfectMath = processingAcc === 1;
  const perfectAll = perfectMemory && perfectMath;
  
  if (perfectAll) {
    return { title: "Perfect!", subtitle: "Flawless round!", icon: "star", positive: true };
  }
  if (success && perfectMemory) {
    return { title: "Excellent!", subtitle: "Perfect memory recall!", icon: "award", positive: true };
  }
  if (success && perfectMath) {
    return { title: "Nice work!", subtitle: "All math correct!", icon: "thumbs-up", positive: true };
  }
  if (success) {
    return { title: "Great job!", subtitle: "You passed this round!", icon: "check-circle", positive: true };
  }
  if (memoryAcc >= 0.6 || processingAcc >= 0.6) {
    return { title: "Almost there!", subtitle: "You're getting stronger!", icon: "trending-up", positive: true };
  }
  return { title: "Good effort!", subtitle: "Every attempt builds your brain!", icon: "zap", positive: true };
}

export default function OSPANPracta({ context, onComplete, onSettings, showSettings }: PractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();

  const [phase, setPhase] = useState<Phase>("intro");
  const [storedData, setStoredData] = useState<StoredData>({ attempts: [], calibratedTimeout: null });
  const [isLoading, setIsLoading] = useState(true);

  const [listLength, setListLength] = useState(MIN_LIST_LENGTH);
  const [currentTrialIndex, setCurrentTrialIndex] = useState(0);
  const [currentProblem, setCurrentProblem] = useState<ArithmeticProblem | null>(null);
  const [currentLetter, setCurrentLetter] = useState<string | null>(null);
  const [trialLetters, setTrialLetters] = useState<string[]>([]);
  const [trialProblems, setTrialProblems] = useState<ArithmeticProblem[]>([]);
  const [processingResponses, setProcessingResponses] = useState<boolean[]>([]);
  const [recalledLetters, setRecalledLetters] = useState<string[]>([]);
  const [showingLetter, setShowingLetter] = useState(false);

  const [calibrationTrials, setCalibrationTrials] = useState(0);
  const [calibrationTimes, setCalibrationTimes] = useState<number[]>([]);
  const [calibratedTimeout, setCalibratedTimeout] = useState(5000);

  const [sessionTrials, setSessionTrials] = useState<TrialData[]>([]);
  const [consecutiveSuccesses, setConsecutiveSuccesses] = useState(0);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);

  const [lastTrialResult, setLastTrialResult] = useState<TrialData | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<"correct" | "wrong" | null>(null);

  const problemStartTime = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trialLettersRef = useRef<string[]>([]);
  const trialProblemsRef = useRef<ArithmeticProblem[]>([]);
  const currentTrialIndexRef = useRef(0);
  const listLengthRef = useRef(MIN_LIST_LENGTH);
  const calibratedTimeoutRef = useRef(5000);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progress = useSharedValue(0);
  const flashOpacity = useSharedValue(0);

  const flashAnimatedStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  useEffect(() => {
    setConfig({
      headerMode: "default",
      title: "OSPAN-A",
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings]);

  useEffect(() => {
    loadStoredData();
  }, []);

  const loadStoredData = async () => {
    try {
      const data = await context.storage?.get<StoredData>("ospan-data");
      if (data) {
        setStoredData(data);
        if (data.calibratedTimeout) {
          setCalibratedTimeout(data.calibratedTimeout);
        }
      }
    } catch {}
    setIsLoading(false);
  };

  const saveStoredData = async (newData: StoredData) => {
    try {
      await context.storage?.set("ospan-data", newData);
      setStoredData(newData);
    } catch {}
  };

  const triggerHaptic = (type: "light" | "medium" | "success" | "error" = "light") => {
    if (Platform.OS === "web") return;
    if (type === "success") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === "error") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (type === "medium") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const startCalibration = () => {
    if (storedData.calibratedTimeout) {
      setCalibratedTimeout(storedData.calibratedTimeout);
      calibratedTimeoutRef.current = storedData.calibratedTimeout;
      startSession();
      return;
    }
    setPhase("calibration");
    setCalibrationTrials(0);
    setCalibrationTimes([]);
    showNextCalibrationProblem();
  };

  const showNextCalibrationProblem = () => {
    const problem = generateArithmeticProblem();
    setCurrentProblem(problem);
    problemStartTime.current = Date.now();
  };

  const handleCalibrationResponse = (response: boolean) => {
    const responseTime = Date.now() - problemStartTime.current;
    const isCorrect = response === currentProblem?.isCorrect;

    if (isCorrect) {
      setCalibrationTimes((prev) => [...prev, responseTime]);
    }

    const nextTrialCount = calibrationTrials + 1;
    setCalibrationTrials(nextTrialCount);

    if (nextTrialCount >= 15) {
      finishCalibration();
    } else {
      showNextCalibrationProblem();
    }
  };

  const finishCalibration = () => {
    const validTimes = calibrationTimes.filter((t) => t > 0);
    let timeout = 5000;
    if (validTimes.length > 0) {
      const avgTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
      timeout = Math.max(3000, Math.min(Math.round(avgTime * 2.5), 10000));
      setCalibratedTimeout(timeout);
      calibratedTimeoutRef.current = timeout;
      const newData = { ...storedData, calibratedTimeout: timeout };
      saveStoredData(newData);
    }
    startSession();
  };

  const startSession = () => {
    setSessionStartTime(Date.now());
    setSessionTrials([]);
    setConsecutiveSuccesses(0);
    setConsecutiveFailures(0);
    setListLength(MIN_LIST_LENGTH);
    listLengthRef.current = MIN_LIST_LENGTH;
    startNewTrial(MIN_LIST_LENGTH);
  };

  const startNewTrial = (length?: number) => {
    const currentLength = length ?? listLengthRef.current;
    const letters: string[] = [];
    const problems: ArithmeticProblem[] = [];
    for (let i = 0; i < currentLength; i++) {
      letters.push(getRandomLetter(letters));
      problems.push(generateArithmeticProblem());
    }
    trialLettersRef.current = letters;
    trialProblemsRef.current = problems;
    currentTrialIndexRef.current = 0;
    setTrialLetters(letters);
    setTrialProblems(problems);
    setProcessingResponses([]);
    setRecalledLetters([]);
    setCurrentTrialIndex(0);
    showProcessingProblem(problems[0]);
  };

  const showProcessingProblem = (problem: ArithmeticProblem) => {
    setCurrentProblem(problem);
    setPhase("processing");
    problemStartTime.current = Date.now();

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      handleProcessingTimeout();
    }, calibratedTimeoutRef.current);
  };

  const showAnswerFeedback = (isCorrect: boolean, callback: () => void) => {
    setAnswerFeedback(isCorrect ? "correct" : "wrong");
    flashOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withTiming(0, { duration: 300 })
    );
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => {
      setAnswerFeedback(null);
      callback();
    }, 400);
  };

  const handleProcessingResponse = (response: boolean) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const isCorrect = response === currentProblem?.isCorrect;
    triggerHaptic(isCorrect ? "light" : "error");
    setProcessingResponses((prev) => [...prev, isCorrect]);
    showAnswerFeedback(isCorrect, showMemoryItem);
  };

  const handleProcessingTimeout = () => {
    triggerHaptic("error");
    setProcessingResponses((prev) => [...prev, false]);
    showAnswerFeedback(false, showMemoryItem);
  };

  const showMemoryItem = () => {
    const letter = trialLettersRef.current[currentTrialIndexRef.current];
    setCurrentLetter(letter);
    setShowingLetter(true);
    setPhase("memory");

    setTimeout(() => {
      setShowingLetter(false);
      setTimeout(() => {
        const nextIndex = currentTrialIndexRef.current + 1;
        currentTrialIndexRef.current = nextIndex;
        setCurrentTrialIndex(nextIndex);
        if (nextIndex < listLengthRef.current) {
          showProcessingProblem(trialProblemsRef.current[nextIndex]);
        } else {
          startRecall();
        }
      }, ISI_MS);
    }, LETTER_DISPLAY_MS);
  };

  const startRecall = () => {
    setPhase("recall");
    setRecalledLetters([]);
  };

  const handleLetterTap = (letter: string) => {
    triggerHaptic("light");
    if (recalledLetters.length < listLength) {
      setRecalledLetters((prev) => [...prev, letter]);
    }
  };

  const handleRecallUndo = () => {
    triggerHaptic("light");
    setRecalledLetters((prev) => prev.slice(0, -1));
  };

  const handleRecallSubmit = () => {
    triggerHaptic("medium");
    evaluateTrial();
  };

  const evaluateTrial = () => {
    const processingCorrect = processingResponses.filter(Boolean).length;
    const processingAcc = processingCorrect / listLength;

    let memoryCorrect = 0;
    for (let i = 0; i < Math.min(recalledLetters.length, trialLetters.length); i++) {
      if (recalledLetters[i] === trialLetters[i]) {
        memoryCorrect++;
      }
    }
    const memoryAcc = memoryCorrect / listLength;

    const success = processingAcc >= 0.75 && memoryAcc >= 0.8;

    const trialData: TrialData = {
      listLength,
      letters: trialLetters,
      problems: trialProblems,
      processingResponses,
      recalledLetters,
      processingAccuracy: processingAcc,
      memoryAccuracy: memoryAcc,
      success,
      timestamp: Date.now(),
    };

    setSessionTrials((prev) => [...prev, trialData]);
    setLastTrialResult(trialData);
    setPhase("feedback");

    if (success) {
      triggerHaptic("success");
      setConsecutiveSuccesses((prev) => prev + 1);
      setConsecutiveFailures(0);
    } else {
      triggerHaptic("error");
      setConsecutiveFailures((prev) => prev + 1);
      setConsecutiveSuccesses(0);
    }
  };

  const proceedAfterFeedback = () => {
    const elapsed = sessionStartTime ? (Date.now() - sessionStartTime) / 1000 : 0;

    if (elapsed >= SESSION_HARD_CAP_SECONDS) {
      endSession();
      return;
    }

    let newLength = listLengthRef.current;
    if (consecutiveSuccesses >= 2 && listLengthRef.current < MAX_LIST_LENGTH) {
      newLength = listLengthRef.current + 1;
      setConsecutiveSuccesses(0);
    } else if (consecutiveFailures >= 1 && listLengthRef.current > MIN_LIST_LENGTH) {
      newLength = listLengthRef.current - 1;
      setConsecutiveFailures(0);
    }
    listLengthRef.current = newLength;
    setListLength(newLength);

    if (elapsed >= SESSION_TARGET_SECONDS) {
      endSession();
    } else {
      startNewTrial(newLength);
    }
  };

  const endSession = () => {
    const trials = sessionTrials;
    if (trials.length === 0) {
      setPhase("summary");
      return;
    }

    const meanListLength = trials.reduce((sum, t) => sum + t.listLength, 0) / trials.length;
    const maxListLength = Math.max(...trials.map((t) => t.listLength));
    const processingAccuracy = trials.reduce((sum, t) => sum + t.processingAccuracy, 0) / trials.length;
    const recallAccuracy = trials.reduce((sum, t) => sum + t.memoryAccuracy, 0) / trials.length;
    const successfulTrials = trials.filter((t) => t.success).length;
    const attentionScore = successfulTrials / trials.length;

    const newAttempt: AttemptRecord = {
      date: new Date().toISOString().split("T")[0],
      timestamp: Date.now(),
      meanListLength,
      maxListLength,
      processingAccuracy,
      recallAccuracy,
      trialsCompleted: trials.length,
      attentionScore,
    };

    const updatedAttempts = [...storedData.attempts, newAttempt].slice(-MAX_STORED_ATTEMPTS);
    const newData = { ...storedData, attempts: updatedAttempts };
    saveStoredData(newData);

    setPhase("summary");
  };

  const handleComplete = () => {
    triggerHaptic("success");
    const trials = sessionTrials;
    const stats = trials.length > 0 ? {
      meanListLength: trials.reduce((sum, t) => sum + t.listLength, 0) / trials.length,
      maxListLength: Math.max(...trials.map((t) => t.listLength)),
      trialsCompleted: trials.length,
    } : null;

    onComplete({
      content: { type: "text", value: "OSPAN-A session completed" },
      metadata: { completedAt: Date.now(), stats },
    });
  };

  const getHighScore = (): number => {
    if (storedData.attempts.length === 0) return 0;
    return Math.max(...storedData.attempts.map((a) => a.maxListLength));
  };

  const getRecentProgress = (): { improving: boolean; trend: number } => {
    const recent = storedData.attempts.slice(-5);
    if (recent.length < 2) return { improving: false, trend: 0 };
    const first = recent.slice(0, 2).reduce((s, a) => s + a.meanListLength, 0) / 2;
    const last = recent.slice(-2).reduce((s, a) => s + a.meanListLength, 0) / 2;
    return { improving: last > first, trend: last - first };
  };

  if (isLoading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
        <View style={styles.centerContent}>
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  const renderIntro = () => {
    const highScore = getHighScore();
    const progress = getRecentProgress();

    return (
      <Animated.View entering={FadeIn} style={styles.centerContent}>
        <View style={[styles.iconContainer, { backgroundColor: theme.primary + "20" }]}>
          <Feather name="activity" size={48} color={theme.primary} />
        </View>

        <ThemedText style={styles.title}>Operation Span</ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
          Train your working memory by solving math problems while remembering letter sequences.
        </ThemedText>

        {storedData.attempts.length > 0 ? (
          <View style={[styles.statsCard, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.statRow}>
              <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>Best Span</ThemedText>
              <ThemedText style={[styles.statValue, { color: theme.primary }]}>{highScore}</ThemedText>
            </View>
            <View style={styles.statRow}>
              <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>Sessions</ThemedText>
              <ThemedText style={styles.statValue}>{storedData.attempts.length}</ThemedText>
            </View>
            {progress.improving ? (
              <View style={styles.statRow}>
                <ThemedText style={[styles.trendText, { color: theme.success }]}>
                  Improving +{progress.trend.toFixed(1)}
                </ThemedText>
              </View>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onPress={startCalibration}
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
        >
          <ThemedText style={styles.buttonText}>
            {storedData.calibratedTimeout ? "Start Training" : "Begin Calibration"}
          </ThemedText>
        </Pressable>

      </Animated.View>
    );
  };

  const renderCalibration = () => (
    <Animated.View entering={FadeIn} style={styles.centerContent}>
      <ThemedText style={[styles.phaseLabel, { color: theme.textSecondary }]}>
        Calibration {calibrationTrials + 1}/15
      </ThemedText>

      <View style={[styles.problemCard, { backgroundColor: theme.backgroundSecondary }]}>
        <ThemedText style={styles.problemText}>{currentProblem?.display}</ThemedText>
      </View>

      <View style={styles.responseRow}>
        <Pressable
          onPress={() => handleCalibrationResponse(true)}
          style={[styles.responseButton, { backgroundColor: theme.success }]}
        >
          <Feather name="check" size={32} color="white" />
          <ThemedText style={styles.responseLabel}>True</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => handleCalibrationResponse(false)}
          style={[styles.responseButton, { backgroundColor: theme.error }]}
        >
          <Feather name="x" size={32} color="white" />
          <ThemedText style={styles.responseLabel}>False</ThemedText>
        </Pressable>
      </View>
    </Animated.View>
  );

  const renderProcessing = () => {
    const flashColor = answerFeedback === "correct" ? theme.success : theme.error;
    const hasAnswered = answerFeedback !== null;

    return (
      <Animated.View entering={FadeIn} style={styles.centerContent}>
        <ThemedText style={[styles.phaseLabel, { color: theme.textSecondary }]}>
          Problem {currentTrialIndex + 1}/{listLength}
        </ThemedText>

        <View style={styles.problemCardWrapper}>
          <View style={[styles.problemCard, { backgroundColor: theme.backgroundSecondary }]}>
            <ThemedText style={styles.problemText}>{currentProblem?.display}</ThemedText>
          </View>
          {hasAnswered ? (
            <Animated.View
              style={[
                styles.problemCardFlash,
                { borderColor: flashColor },
                flashAnimatedStyle,
              ]}
            />
          ) : null}
        </View>

        <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>Is this equation correct?</ThemedText>

        <View style={styles.responseRow}>
          <Pressable
            onPress={() => handleProcessingResponse(true)}
            style={[styles.responseButton, { backgroundColor: theme.success }]}
            disabled={hasAnswered}
          >
            <Feather name="check" size={32} color="white" />
            <ThemedText style={styles.responseLabel}>True</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => handleProcessingResponse(false)}
            style={[styles.responseButton, { backgroundColor: theme.error }]}
            disabled={hasAnswered}
          >
            <Feather name="x" size={32} color="white" />
            <ThemedText style={styles.responseLabel}>False</ThemedText>
          </Pressable>
        </View>
      </Animated.View>
    );
  };

  const renderMemory = () => (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.centerContent}>
      <ThemedText style={[styles.phaseLabel, { color: theme.textSecondary }]}>Remember this letter</ThemedText>

      <View style={[styles.letterDisplay, { backgroundColor: theme.primary }]}>
        <ThemedText style={styles.letterText}>{currentLetter}</ThemedText>
      </View>
    </Animated.View>
  );

  const renderRecall = () => (
    <Animated.View entering={FadeIn} style={styles.recallContainer}>
      <ThemedText style={styles.recallTitle}>Recall the letters in order</ThemedText>

      <View style={styles.recallProgress}>
        {Array.from({ length: listLength }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.recallSlot,
              { backgroundColor: recalledLetters[i] ? theme.primary : theme.backgroundSecondary },
            ]}
          >
            <ThemedText style={[styles.recallSlotText, { color: recalledLetters[i] ? "white" : theme.textSecondary }]}>
              {recalledLetters[i] || (i + 1).toString()}
            </ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.letterGrid}>
        {LETTERS.map((letter) => (
          <Pressable
            key={letter}
            onPress={() => handleLetterTap(letter)}
            disabled={recalledLetters.length >= listLength}
            style={[
              styles.letterButton,
              { backgroundColor: theme.backgroundSecondary },
              recalledLetters.length >= listLength && styles.letterButtonDisabled,
            ]}
          >
            <ThemedText style={styles.letterButtonText}>{letter}</ThemedText>
          </Pressable>
        ))}
      </View>

      <View style={styles.recallActions}>
        <Pressable
          onPress={handleRecallUndo}
          disabled={recalledLetters.length === 0}
          style={[styles.undoButton, { borderColor: theme.border }]}
        >
          <Feather name="delete" size={20} color={theme.textSecondary} />
          <ThemedText style={[styles.undoText, { color: theme.textSecondary }]}>Undo</ThemedText>
        </Pressable>

        <Pressable
          onPress={handleRecallSubmit}
          style={[styles.submitButton, { backgroundColor: theme.primary }]}
        >
          <ThemedText style={styles.buttonText}>Submit</ThemedText>
        </Pressable>
      </View>
    </Animated.View>
  );

  const renderFeedback = () => {
    if (!lastTrialResult) return null;

    const feedback = getFeedbackMessage(
      lastTrialResult.memoryAccuracy,
      lastTrialResult.processingAccuracy,
      lastTrialResult.success
    );
    const isPerfect = lastTrialResult.memoryAccuracy === 1 && lastTrialResult.processingAccuracy === 1;
    const iconColor = isPerfect ? "#FFD700" : theme.primary;
    const iconBg = isPerfect ? "#FFD70030" : theme.primary + "20";

    return (
      <>
        <Confetti show={isPerfect} />
        <Animated.View entering={FadeIn} style={styles.centerContent}>
          <View style={[styles.feedbackIcon, { backgroundColor: iconBg }]}>
            <Feather name={feedback.icon as any} size={48} color={iconColor} />
          </View>

          <ThemedText style={styles.feedbackTitle}>{feedback.title}</ThemedText>
          <ThemedText style={[styles.feedbackSubtitle, { color: theme.textSecondary }]}>
            {feedback.subtitle}
          </ThemedText>

          <View style={[styles.feedbackCard, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.feedbackRow}>
              <ThemedText style={{ color: theme.textSecondary }}>Correct Order</ThemedText>
              <ThemedText style={styles.feedbackValue}>{trialLetters.join(" ")}</ThemedText>
            </View>
            <View style={styles.feedbackRow}>
              <ThemedText style={{ color: theme.textSecondary }}>Your Recall</ThemedText>
              <ThemedText style={styles.feedbackValue}>{recalledLetters.join(" ") || "-"}</ThemedText>
            </View>
            <View style={styles.feedbackRow}>
              <ThemedText style={{ color: theme.textSecondary }}>Memory</ThemedText>
              <ThemedText style={[styles.feedbackValue, { color: lastTrialResult.memoryAccuracy >= 0.8 ? theme.success : theme.primary }]}>
                {Math.round(lastTrialResult.memoryAccuracy * 100)}%
              </ThemedText>
            </View>
            <View style={styles.feedbackRow}>
              <ThemedText style={{ color: theme.textSecondary }}>Math</ThemedText>
              <ThemedText style={[styles.feedbackValue, { color: lastTrialResult.processingAccuracy >= 0.75 ? theme.success : theme.primary }]}>
                {Math.round(lastTrialResult.processingAccuracy * 100)}%
              </ThemedText>
            </View>
          </View>

          <Pressable
            onPress={proceedAfterFeedback}
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.buttonText}>Continue</ThemedText>
          </Pressable>
        </Animated.View>
      </>
    );
  };

  const renderSummary = () => {
    const trials = sessionTrials;
    const meanListLength = trials.length > 0 ? trials.reduce((sum, t) => sum + t.listLength, 0) / trials.length : 0;
    const maxListLength = trials.length > 0 ? Math.max(...trials.map((t) => t.listLength)) : 0;
    const processingAcc = trials.length > 0 ? trials.reduce((sum, t) => sum + t.processingAccuracy, 0) / trials.length : 0;
    const memoryAcc = trials.length > 0 ? trials.reduce((sum, t) => sum + t.memoryAccuracy, 0) / trials.length : 0;
    const successRate = trials.length > 0 ? trials.filter((t) => t.success).length / trials.length : 0;
    const highScore = getHighScore();

    return (
      <Animated.View entering={FadeIn} style={styles.summaryContainer}>
        <ScrollView contentContainerStyle={styles.summaryScroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.iconContainer, { backgroundColor: theme.success + "20" }]}>
            <Feather name="award" size={48} color={theme.success} />
          </View>

          <ThemedText style={styles.summaryTitle}>Session Complete</ThemedText>

          <View style={[styles.summaryCard, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.summaryRow}>
              <ThemedText style={{ color: theme.textSecondary }}>Average Span</ThemedText>
              <ThemedText style={[styles.summaryValue, { color: theme.primary }]}>{meanListLength.toFixed(1)}</ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={{ color: theme.textSecondary }}>Best Span</ThemedText>
              <ThemedText style={styles.summaryValue}>{maxListLength}</ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={{ color: theme.textSecondary }}>Trials Completed</ThemedText>
              <ThemedText style={styles.summaryValue}>{trials.length}</ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={{ color: theme.textSecondary }}>Math Accuracy</ThemedText>
              <ThemedText style={styles.summaryValue}>{Math.round(processingAcc * 100)}%</ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={{ color: theme.textSecondary }}>Recall Accuracy</ThemedText>
              <ThemedText style={styles.summaryValue}>{Math.round(memoryAcc * 100)}%</ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={{ color: theme.textSecondary }}>Attention Score</ThemedText>
              <ThemedText style={[styles.summaryValue, { color: theme.success }]}>{Math.round(successRate * 100)}%</ThemedText>
            </View>
          </View>

          {storedData.attempts.length > 0 ? (
            <View style={[styles.progressSection, { backgroundColor: theme.backgroundSecondary }]}>
              <ThemedText style={styles.progressTitle}>Progress (Last {storedData.attempts.length} sessions)</ThemedText>
              <View style={styles.summaryRow}>
                <ThemedText style={{ color: theme.textSecondary }}>All-Time Best</ThemedText>
                <ThemedText style={[styles.summaryValue, { color: theme.primary }]}>{highScore}</ThemedText>
              </View>
              {maxListLength >= highScore && maxListLength > 0 ? (
                <View style={[styles.newRecord, { backgroundColor: theme.success + "20" }]}>
                  <Feather name="star" size={16} color={theme.success} />
                  <ThemedText style={[styles.newRecordText, { color: theme.success }]}>New Personal Best!</ThemedText>
                </View>
              ) : null}
            </View>
          ) : null}

          <Pressable
            onPress={handleComplete}
            style={[styles.primaryButton, { backgroundColor: theme.primary, marginTop: Spacing.xl }]}
          >
            <ThemedText style={styles.buttonText}>Finish</ThemedText>
          </Pressable>
        </ScrollView>
      </Animated.View>
    );
  };

  const renderContent = () => {
    switch (phase) {
      case "intro":
        return renderIntro();
      case "calibration":
        return renderCalibration();
      case "processing":
        return renderProcessing();
      case "memory":
        return renderMemory();
      case "recall":
        return renderRecall();
      case "feedback":
        return renderFeedback();
      case "summary":
        return renderSummary();
      default:
        return null;
    }
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
      {renderContent()}
      <View style={{ height: insets.bottom + Spacing.lg }} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  loadingText: {
    fontSize: 16,
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
    fontSize: 32,
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
  statsCard: {
    width: "100%",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  statLabel: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "600",
  },
  trendText: {
    fontSize: 14,
    fontWeight: "500",
  },
  primaryButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing["3xl"],
    borderRadius: BorderRadius.md,
    minWidth: 200,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
  phaseLabel: {
    fontSize: 14,
    marginBottom: Spacing.lg,
  },
  problemCardWrapper: {
    position: "relative",
    marginBottom: Spacing.xl,
  },
  problemCard: {
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.lg,
    minWidth: 280,
    alignItems: "center",
  },
  problemCardFlash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
    borderWidth: 4,
  },
  problemText: {
    fontSize: 28,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  hint: {
    fontSize: 14,
    marginBottom: Spacing.xl,
  },
  responseRow: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  responseButton: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  responseLabel: {
    color: "white",
    fontWeight: "600",
    marginTop: Spacing.xs,
  },
  letterDisplay: {
    width: 150,
    height: 150,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  letterText: {
    fontSize: 72,
    fontWeight: "700",
    color: "white",
  },
  recallContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  recallTitle: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  recallProgress: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  recallSlot: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  recallSlotText: {
    fontSize: 18,
    fontWeight: "600",
  },
  letterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  letterButton: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  letterButtonDisabled: {
    opacity: 0.5,
  },
  letterButtonText: {
    fontSize: 24,
    fontWeight: "600",
  },
  recallActions: {
    flexDirection: "row",
    gap: Spacing.md,
    justifyContent: "center",
  },
  undoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  undoText: {
    fontSize: 14,
  },
  submitButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing["3xl"],
    borderRadius: BorderRadius.md,
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
    marginBottom: Spacing.xs,
  },
  feedbackSubtitle: {
    fontSize: 16,
    marginBottom: Spacing.xl,
    textAlign: "center",
  },
  feedbackCard: {
    width: "100%",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  feedbackRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  feedbackValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  summaryContainer: {
    flex: 1,
  },
  summaryScroll: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  summaryTitle: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: Spacing.xl,
  },
  summaryCard: {
    width: "100%",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "600",
  },
  progressSection: {
    width: "100%",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  newRecord: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  newRecordText: {
    fontWeight: "600",
  },
});
