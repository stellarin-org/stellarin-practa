import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withDelay,
  runOnJS,
  FadeIn,
  FadeInDown,
  SlideInUp,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { PractaContext, PractaCompleteHandler } from "@/types/flow";
import { ImageSourcePropType } from "react-native";

interface MyPractaProps {
  context: PractaContext;
  onComplete: PractaCompleteHandler;
  onSkip?: () => void;
}

const GRID_SIZE = 9;
const BOX_SIZE = 3;

type Difficulty = "lite" | "easy" | "medium" | "hard";

interface CellData {
  value: number;
  isOriginal: boolean;
  isError: boolean;
}

const createSeededRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
};

const getTodaysSeed = (): number => {
  const now = new Date();
  const dateString = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dateString.length; i++) {
    const char = dateString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

const generateSudoku = (difficulty: Difficulty): { grid: CellData[][]; solution: number[][] } => {
  const base: number[][] = [
    [5, 3, 4, 6, 7, 8, 9, 1, 2],
    [6, 7, 2, 1, 9, 5, 3, 4, 8],
    [1, 9, 8, 3, 4, 2, 5, 6, 7],
    [8, 5, 9, 7, 6, 1, 4, 2, 3],
    [4, 2, 6, 8, 5, 3, 7, 9, 1],
    [7, 1, 3, 9, 2, 4, 8, 5, 6],
    [9, 6, 1, 5, 3, 7, 2, 8, 4],
    [2, 8, 7, 4, 1, 9, 6, 3, 5],
    [3, 4, 5, 2, 8, 6, 1, 7, 9],
  ];

  const difficultyOffset = difficulty === "lite" ? -1000 : difficulty === "easy" ? 0 : difficulty === "medium" ? 1000 : 2000;
  const seed = getTodaysSeed() + difficultyOffset;
  const random = createSeededRandom(seed);

  const shuffled = shuffleBoard(base, random);
  const solution = shuffled.map((row) => [...row]);
  const cellsToRemove = difficulty === "lite" ? 25 : difficulty === "easy" ? 35 : difficulty === "medium" ? 45 : 55;
  const positions: [number, number][] = [];

  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      positions.push([i, j]);
    }
  }

  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  const grid: CellData[][] = shuffled.map((row) =>
    row.map((value) => ({ value, isOriginal: true, isError: false }))
  );

  for (let i = 0; i < cellsToRemove; i++) {
    const [row, col] = positions[i];
    grid[row][col] = { value: 0, isOriginal: false, isError: false };
  }

  return { grid, solution };
};

const shuffleBoard = (board: number[][], random: () => number): number[][] => {
  const result = board.map((row) => [...row]);

  for (let i = 0; i < 5; i++) {
    const band = Math.floor(random() * 3);
    const row1 = band * 3 + Math.floor(random() * 3);
    const row2 = band * 3 + Math.floor(random() * 3);
    if (row1 !== row2) {
      [result[row1], result[row2]] = [result[row2], result[row1]];
    }
  }

  for (let i = 0; i < 5; i++) {
    const stack = Math.floor(random() * 3);
    const col1 = stack * 3 + Math.floor(random() * 3);
    const col2 = stack * 3 + Math.floor(random() * 3);
    if (col1 !== col2) {
      for (let row = 0; row < 9; row++) {
        [result[row][col1], result[row][col2]] = [result[row][col2], result[row][col1]];
      }
    }
  }

  return result;
};

const isValidPlacement = (
  grid: CellData[][],
  row: number,
  col: number,
  num: number
): boolean => {
  for (let i = 0; i < GRID_SIZE; i++) {
    if (i !== col && grid[row][i].value === num) return false;
    if (i !== row && grid[i][col].value === num) return false;
  }

  const boxRow = Math.floor(row / BOX_SIZE) * BOX_SIZE;
  const boxCol = Math.floor(col / BOX_SIZE) * BOX_SIZE;
  for (let i = boxRow; i < boxRow + BOX_SIZE; i++) {
    for (let j = boxCol; j < boxCol + BOX_SIZE; j++) {
      if ((i !== row || j !== col) && grid[i][j].value === num) return false;
    }
  }

  return true;
};

const checkWin = (grid: CellData[][]): boolean => {
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (grid[row][col].value === 0) return false;
      if (grid[row][col].isError) return false;
    }
  }
  return true;
};

const triggerHaptic = (style: "light" | "medium" | "error" | "success") => {
  if (Platform.OS === "web") return;
  if (style === "light") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } else if (style === "medium") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } else if (style === "error") {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } else if (style === "success") {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const CONFETTI_COLORS = ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"];
const CONFETTI_COUNT = 50;

const ConfettiPiece = ({ delay, screenWidth, screenHeight }: { delay: number; screenWidth: number; screenHeight: number }) => {
  const translateY = useSharedValue(-50);
  const translateX = useSharedValue(Math.random() * screenWidth);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(0.5 + Math.random() * 0.5);
  const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
  const size = 8 + Math.random() * 8;

  useEffect(() => {
    const duration = 2500 + Math.random() * 1500;
    translateY.value = withTiming(screenHeight + 100, { duration: duration + delay });
    translateX.value = withTiming(translateX.value + (Math.random() - 0.5) * 200, { duration: duration + delay });
    rotate.value = withTiming(360 * (2 + Math.random() * 3), { duration: duration + delay });
    opacity.value = withTiming(0, { duration: duration + delay });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
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
          width: size,
          height: size * 0.6,
          backgroundColor: color,
          borderRadius: 2,
        },
        animStyle,
      ]}
    />
  );
};

const Confetti = ({ screenWidth, screenHeight }: { screenWidth: number; screenHeight: number }) => {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
        <ConfettiPiece key={i} delay={i * 30} screenWidth={screenWidth} screenHeight={screenHeight} />
      ))}
    </View>
  );
};

const GlassCard = ({ children, style, intensity = 40 }: { children: React.ReactNode; style?: any; intensity?: number }) => {
  const { isDark } = useTheme();
  
  if (Platform.OS === "web") {
    return (
      <View style={[styles.glassCardFallback, { backgroundColor: isDark ? "rgba(40,40,40,0.85)" : "rgba(255,255,255,0.85)" }, style]}>
        {children}
      </View>
    );
  }
  
  return (
    <BlurView intensity={intensity} tint={isDark ? "dark" : "light"} style={[styles.glassCard, style]}>
      {children}
    </BlurView>
  );
};

export default function MyPracta({ context, onComplete, onSkip }: MyPractaProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [grid, setGrid] = useState<CellData[][]>(() => generateSudoku("easy").grid);
  const [solution, setSolution] = useState<number[][]>(() => generateSudoku("easy").solution);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [iconTaps, setIconTaps] = useState(0);
  const [showSplash, setShowSplash] = useState(true);
  const [splashImageLoaded, setSplashImageLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const lastTapTime = useRef(0);
  const selectedCellRef = useRef<{ row: number; col: number } | null>(null);

  const screenWidth = Dimensions.get("window").width;
  const screenHeight = Dimensions.get("window").height;
  const gridSize = Math.min(screenWidth - Spacing["3xl"] * 2, 360);
  const cellSize = gridSize / GRID_SIZE;

  const timerScale = useSharedValue(1);
  const headerOpacity = useSharedValue(1);
  const controlsOpacity = useSharedValue(1);
  const congratsOpacity = useSharedValue(0);
  const congratsTranslateY = useSharedValue(20);
  const splashOpacity = useSharedValue(1);
  const splashImageOpacity = useSharedValue(0);

  const hideSplash = useCallback(() => {
    setShowSplash(false);
    setIsRunning(true);
  }, []);

  const handleSplashImageLoad = useCallback(() => {
    setSplashImageLoaded(true);
  }, []);

  const handleSplashImageError = useCallback(() => {
    hideSplash();
  }, [hideSplash]);

  useEffect(() => {
    if (!splashImageLoaded) return;
    
    splashImageOpacity.value = withTiming(1, { duration: 400 });
    splashOpacity.value = withDelay(2400, withTiming(0, { duration: 400 }));
    const timeout = setTimeout(() => {
      hideSplash();
    }, 2800);
    return () => clearTimeout(timeout);
  }, [splashImageLoaded]);

  useEffect(() => {
    if (!showSplash) return;
    const timeoutFallback = setTimeout(() => {
      if (!splashImageLoaded) {
        hideSplash();
      }
    }, 5000);
    return () => clearTimeout(timeoutFallback);
  }, [showSplash, splashImageLoaded, hideSplash]);

  useEffect(() => {
    context.storage?.get<boolean>("showTimer").then((val) => {
      if (val === true || val === false) setShowTimer(val);
    }).catch(() => {});
    context.storage?.get<boolean>("showErrors").then((val) => {
      if (val === true || val === false) setShowErrors(val);
    }).catch(() => {});
  }, []);

  const handleToggleTimer = useCallback(() => {
    setShowTimer((prev) => {
      const newVal = !prev;
      context.storage?.set("showTimer", newVal).catch(() => {});
      return newVal;
    });
  }, [context.storage]);

  const handleToggleErrors = useCallback(() => {
    setShowErrors((prev) => {
      const newVal = !prev;
      context.storage?.set("showErrors", newVal).catch(() => {});
      return newVal;
    });
  }, [context.storage]);

  const splashAnimStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
  }));

  const splashImageAnimStyle = useAnimatedStyle(() => ({
    opacity: splashImageOpacity.value,
  }));

  useEffect(() => {
    if (isComplete) {
      headerOpacity.value = withTiming(0, { duration: 400 });
      controlsOpacity.value = withTiming(0, { duration: 400 });
      congratsOpacity.value = withTiming(1, { duration: 500 });
      congratsTranslateY.value = withSpring(0, { damping: 15, stiffness: 100 });
    } else {
      headerOpacity.value = withTiming(1, { duration: 300 });
      controlsOpacity.value = withTiming(1, { duration: 300 });
      congratsOpacity.value = 0;
      congratsTranslateY.value = 20;
    }
  }, [isComplete]);

  const headerAnimStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const controlsAnimStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const congratsAnimStyle = useAnimatedStyle(() => ({
    opacity: congratsOpacity.value,
    transform: [{ translateY: congratsTranslateY.value }],
  }));

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && !isComplete) {
      interval = setInterval(() => {
        setTimer((t) => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, isComplete]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getTodaysDate = (): string => {
    const now = new Date();
    return now.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const handleCellPress = useCallback((row: number, col: number) => {
    selectedCellRef.current = { row, col };
    setSelectedCell({ row, col });
    triggerHaptic("light");
  }, []);

  const handleNumberPress = useCallback((num: number) => {
    const cell = selectedCellRef.current || selectedCell;
    if (!cell || isComplete) return;

    const { row, col } = cell;
    if (grid[row][col].isOriginal) return;

    triggerHaptic("medium");

    const newGrid = grid.map((r) => r.map((c) => ({ ...c })));
    const isValid = num === 0 || isValidPlacement(newGrid, row, col, num);

    newGrid[row][col] = {
      value: num,
      isOriginal: false,
      isError: !isValid && num !== 0,
    };

    if (!isValid && num !== 0) {
      setMistakes((m) => m + 1);
      triggerHaptic("error");
    }

    setGrid(newGrid);

    if (checkWin(newGrid)) {
      setIsComplete(true);
      setIsRunning(false);
      triggerHaptic("success");
    }
  }, [selectedCell, grid, isComplete]);

  const handleNewGame = useCallback((diff: Difficulty) => {
    const { grid: newGrid, solution: newSolution } = generateSudoku(diff);
    setDifficulty(diff);
    setGrid(newGrid);
    setSolution(newSolution);
    selectedCellRef.current = null;
    setSelectedCell(null);
    setIsComplete(false);
    setMistakes(0);
    setTimer(0);
    setIsRunning(true);
    setIconTaps(0);
    triggerHaptic("medium");
  }, []);

  const handleClear = useCallback(() => {
    if (!selectedCell || isComplete) return;
    handleNumberPress(0);
  }, [selectedCell, isComplete, handleNumberPress]);

  const handleIconTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTime.current > 500) {
      setIconTaps(1);
    } else {
      setIconTaps((prev) => {
        const newCount = prev + 1;
        if (newCount >= 10) {
          const newGrid = grid.map((r, rowIdx) => 
            r.map((c, colIdx) => ({
              value: solution[rowIdx][colIdx],
              isOriginal: c.isOriginal,
              isError: false,
            }))
          );
          setGrid(newGrid);
          triggerHaptic("success");
          setIsComplete(true);
          setIsRunning(false);
          return 0;
        }
        return newCount;
      });
    }
    lastTapTime.current = now;
    triggerHaptic("light");
  }, [grid, solution]);

  const handleComplete = () => {
    triggerHaptic("success");
    onComplete({
      content: {
        type: "text",
        value: `Sudoku completed in ${formatTime(timer)} with ${mistakes} mistakes`,
      },
      metadata: {
        completedAt: Date.now(),
        difficulty,
        time: timer,
        mistakes,
      },
    });
  };

  const timerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: timerScale.value }],
  }));

  const renderCell = (row: number, col: number) => {
    const cell = grid[row][col];
    const isSelected = selectedCell?.row === row && selectedCell?.col === col;
    const isSameRow = selectedCell?.row === row;
    const isSameCol = selectedCell?.col === col;
    const isSameBox =
      selectedCell &&
      Math.floor(selectedCell.row / BOX_SIZE) === Math.floor(row / BOX_SIZE) &&
      Math.floor(selectedCell.col / BOX_SIZE) === Math.floor(col / BOX_SIZE);
    const isSameValue = selectedCell && cell.value !== 0 && grid[selectedCell.row][selectedCell.col].value === cell.value;

    const isRightBorder = (col + 1) % BOX_SIZE === 0 && col < GRID_SIZE - 1;
    const isBottomBorder = (row + 1) % BOX_SIZE === 0 && row < GRID_SIZE - 1;

    let backgroundColor = "transparent";
    if (cell.isError) {
      backgroundColor = isDark ? "rgba(239,68,68,0.35)" : "rgba(239,68,68,0.25)";
    } else if (isSelected) {
      backgroundColor = theme.primary + "50";
    } else if (isSameValue) {
      backgroundColor = theme.primary + "25";
    } else if (isSameRow || isSameCol || isSameBox) {
      backgroundColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
    }

    return (
      <Pressable
        key={`${row}-${col}`}
        onPress={() => handleCellPress(row, col)}
        style={[
          styles.cell,
          {
            width: cellSize,
            height: cellSize,
            backgroundColor,
            borderRightWidth: isRightBorder ? 2 : 0.5,
            borderBottomWidth: isBottomBorder ? 2 : 0.5,
            borderRightColor: isRightBorder ? theme.primary + "60" : (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"),
            borderBottomColor: isBottomBorder ? theme.primary + "60" : (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"),
          },
        ]}
      >
        {cell.value !== 0 ? (
          <ThemedText
            style={[
              styles.cellText,
              {
                fontSize: cellSize * 0.5,
                color: cell.isOriginal
                  ? theme.text
                  : cell.isError
                  ? theme.error
                  : theme.primary,
                fontWeight: cell.isOriginal ? "700" : "500",
              },
            ]}
          >
            {cell.value}
          </ThemedText>
        ) : null}
      </Pressable>
    );
  };

  const NumberButton = ({ num }: { num: number }) => {
    const count = grid.flat().filter((c) => c.value === num).length;
    const isDisabled = count >= 9;
    const scale = useSharedValue(1);

    const animStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const handlePress = () => {
      scale.value = withSequence(
        withSpring(0.9, { damping: 15 }),
        withSpring(1, { damping: 10 })
      );
      handleNumberPress(num);
    };

    return (
      <AnimatedPressable
        onPress={handlePress}
        disabled={isDisabled}
        style={[
          styles.numberButton,
          animStyle,
          {
            backgroundColor: isDisabled 
              ? (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)")
              : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"),
            opacity: isDisabled ? 0.4 : 1,
          },
        ]}
      >
        <ThemedText
          style={[
            styles.numberButtonText,
            { color: isDisabled ? theme.textSecondary : theme.text },
          ]}
        >
          {num}
        </ThemedText>
        <View style={[styles.countBadge, { backgroundColor: theme.primary + "20" }]}>
          <ThemedText style={[styles.countText, { color: theme.primary }]}>
            {9 - count}
          </ThemedText>
        </View>
      </AnimatedPressable>
    );
  };

  const gradientColors = isDark 
    ? ["#1a1a2e", "#16213e", "#0f3460"] as const
    : ["#ffffff", "#f8f9fa", "#f1f3f5"] as const;

  return (
    <View style={styles.container}>
      <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFill} />
      
      <View style={[styles.content, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <Animated.View entering={FadeInDown.duration(400)} style={[styles.header, headerAnimStyle]}>
          <View style={styles.titleRow}>
            <Pressable onPress={handleIconTap} style={[styles.iconContainer, { backgroundColor: theme.primary }]}>
              <Feather name="grid" size={20} color="#fff" />
            </Pressable>
            <View style={styles.titleTextContainer}>
              <ThemedText style={styles.title}>Daily Sudoku</ThemedText>
              <ThemedText style={[styles.dateText, { color: theme.textSecondary }]}>
                {getTodaysDate()}
              </ThemedText>
            </View>
            <Pressable onPress={() => setShowSettings(true)} style={[styles.settingsButton, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)" }]}>
              <Feather name="settings" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          {showTimer || showErrors ? (
            <GlassCard style={styles.statsCard}>
              <View style={styles.statsRow}>
                {showTimer ? (
                  <View style={styles.stat}>
                    <Feather name="clock" size={18} color={theme.primary} />
                    <Animated.View style={timerAnimStyle}>
                      <ThemedText style={[styles.statValue, { color: theme.text }]}>
                        {formatTime(timer)}
                      </ThemedText>
                    </Animated.View>
                  </View>
                ) : null}
                {showTimer && showErrors ? (
                  <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
                ) : null}
                {showErrors ? (
                  <View style={styles.stat}>
                    <Feather name="x-circle" size={18} color={mistakes > 0 ? theme.error : theme.textSecondary} />
                    <ThemedText style={[styles.statValue, { color: mistakes > 0 ? theme.error : theme.text }]}>
                      {mistakes}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            </GlassCard>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeIn.delay(100).duration(400)} style={[styles.difficultyRow, headerAnimStyle]}>
          {(["lite", "easy", "medium", "hard"] as Difficulty[]).map((diff) => (
            <Pressable
              key={diff}
              onPress={() => handleNewGame(diff)}
              style={[
                styles.difficultyButton,
                {
                  backgroundColor: difficulty === diff 
                    ? theme.primary 
                    : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"),
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.difficultyText,
                  { color: difficulty === diff ? "#fff" : theme.textSecondary },
                ]}
              >
                {diff.charAt(0).toUpperCase() + diff.slice(1)}
              </ThemedText>
            </Pressable>
          ))}
        </Animated.View>

        <Animated.View entering={FadeIn.delay(200).duration(400)}>
          <GlassCard style={[styles.gridWrapper, { padding: Spacing.sm }, isComplete && { borderColor: theme.success + "30" }]} intensity={60}>
            <View
              style={[
                styles.gridContainer,
                {
                  width: gridSize,
                  height: gridSize,
                  borderColor: isComplete ? theme.success + "40" : theme.primary + "40",
                },
              ]}
            >
              {Array.from({ length: GRID_SIZE }, (_, row) => (
                <View key={row} style={styles.row}>
                  {Array.from({ length: GRID_SIZE }, (_, col) => renderCell(row, col))}
                </View>
              ))}
            </View>
          </GlassCard>
        </Animated.View>

        {isComplete ? (
          <Animated.View style={[styles.congratsContainer, congratsAnimStyle]}>
            <Confetti screenWidth={screenWidth} screenHeight={screenHeight} />
            <View style={styles.completeHeader}>
              <View style={[styles.successIconSmall, { backgroundColor: theme.success + "20" }]}>
                <Feather name="check-circle" size={28} color={theme.success} />
              </View>
              <View>
                <ThemedText style={[styles.completeTextSmall, { color: theme.success }]}>
                  Puzzle Complete!
                </ThemedText>
                <ThemedText style={[styles.completeSubtextSmall, { color: theme.textSecondary }]}>
                  {formatTime(timer)} | {mistakes} {mistakes === 1 ? "mistake" : "mistakes"}
                </ThemedText>
              </View>
            </View>
            <Pressable
              onPress={handleComplete}
              style={[styles.primaryButton, { backgroundColor: theme.primary, marginTop: Spacing.lg }]}
            >
              <ThemedText style={styles.primaryButtonText}>Done</ThemedText>
              <Feather name="arrow-right" size={16} color="#fff" style={{ marginLeft: Spacing.xs }} />
            </Pressable>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeIn.delay(300).duration(400)} style={[styles.controls, controlsAnimStyle]}>
            <View style={styles.hintContainer}>
              {selectedCell && grid[selectedCell.row][selectedCell.col].isOriginal ? (
                <View style={[styles.hintBadge, { backgroundColor: theme.warning + "20" }]}>
                  <Feather name="lock" size={14} color={theme.warning} />
                  <ThemedText style={[styles.hintText, { color: theme.warning }]}>
                    Fixed cell
                  </ThemedText>
                </View>
              ) : !selectedCell ? (
                <View style={[styles.hintBadge, { backgroundColor: theme.primary + "15" }]}>
                  <Feather name="target" size={14} color={theme.primary} />
                  <ThemedText style={[styles.hintText, { color: theme.primary }]}>
                    Tap a cell to select
                  </ThemedText>
                </View>
              ) : null}
            </View>
            
            <View style={styles.numberPad}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <NumberButton key={num} num={num} />
              ))}
              <Pressable
                onPress={handleClear}
                style={[
                  styles.numberButton,
                  { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)" },
                ]}
              >
                <Feather name="delete" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
          </Animated.View>

        {onSkip && !isComplete ? (
          <Pressable onPress={onSkip} style={styles.skipButton}>
            <ThemedText style={[styles.skipText, { color: theme.textSecondary }]}>
              Skip
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      {showSettings ? (
        <Pressable style={styles.modalOverlay} onPress={() => setShowSettings(false)}>
          <Pressable style={[styles.settingsModal, { backgroundColor: isDark ? "#2a2a2a" : "#fff" }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.settingsHeader}>
              <ThemedText style={styles.settingsTitle}>Settings</ThemedText>
              <Pressable onPress={() => setShowSettings(false)} style={styles.closeButton}>
                <Feather name="x" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            
            <View style={styles.settingsContent}>
              <Pressable style={styles.settingRow} onPress={handleToggleTimer}>
                <View style={styles.settingInfo}>
                  <Feather name="clock" size={20} color={theme.primary} />
                  <ThemedText style={styles.settingLabel}>Show Timer</ThemedText>
                </View>
                <View style={[styles.toggle, { backgroundColor: showTimer ? theme.primary : (isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)") }]}>
                  <View style={[styles.toggleKnob, { transform: [{ translateX: showTimer ? 18 : 2 }] }]} />
                </View>
              </Pressable>
              
              <Pressable style={styles.settingRow} onPress={handleToggleErrors}>
                <View style={styles.settingInfo}>
                  <Feather name="x-circle" size={20} color={theme.error} />
                  <ThemedText style={styles.settingLabel}>Show Mistake Count</ThemedText>
                </View>
                <View style={[styles.toggle, { backgroundColor: showErrors ? theme.primary : (isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)") }]}>
                  <View style={[styles.toggleKnob, { transform: [{ translateX: showErrors ? 18 : 2 }] }]} />
                </View>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      ) : null}

      {showSplash ? (
        <Animated.View style={[styles.splashOverlay, { backgroundColor: "#fff" }, splashAnimStyle]}>
          {context.assets?.splash ? (
            <Animated.Image
              source={context.assets.splash as ImageSourcePropType}
              style={[styles.splashImage, splashImageAnimStyle]}
              resizeMode="cover"
              onLoad={handleSplashImageLoad}
              onError={handleSplashImageError}
            />
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  header: {
    width: "100%",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  dateText: {
    fontSize: 13,
    marginTop: 2,
  },
  glassCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  glassCardFallback: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  statsCard: {
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xl,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  statDivider: {
    width: 1,
    height: 24,
  },
  difficultyRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  difficultyButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
  },
  difficultyText: {
    fontSize: 13,
    fontWeight: "600",
  },
  gridWrapper: {
    marginBottom: Spacing.lg,
  },
  gridContainer: {
    borderWidth: 2,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
  },
  cell: {
    justifyContent: "center",
    alignItems: "center",
  },
  cellText: {
    fontWeight: "600",
  },
  controls: {
    width: "100%",
    alignItems: "center",
    flex: 1,
  },
  hintContainer: {
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  hintBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
  },
  hintText: {
    fontSize: 13,
    fontWeight: "500",
  },
  numberPad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.sm,
    maxWidth: 340,
  },
  numberButton: {
    width: 58,
    height: 64,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  numberButtonText: {
    fontSize: 24,
    fontWeight: "600",
  },
  countBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  countText: {
    fontSize: 10,
    fontWeight: "700",
  },
  congratsContainer: {
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  completeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  successIconSmall: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  completeTextSmall: {
    fontSize: 20,
    fontWeight: "700",
  },
  completeSubtextSmall: {
    fontSize: 13,
    marginTop: 2,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.md + 2,
    borderRadius: BorderRadius.full,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  skipButton: {
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "500",
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  splashImage: {
    width: "100%",
    height: "100%",
  },
  titleTextContainer: {
    flex: 1,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 90,
  },
  settingsModal: {
    width: "85%",
    maxWidth: 340,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  settingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.2)",
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  closeButton: {
    padding: Spacing.xs,
  },
  settingsContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  settingInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
  },
});
