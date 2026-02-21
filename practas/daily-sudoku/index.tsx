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
import { GlassCard } from "@/components/GlassCard";
import { GlassBackground } from "@/components/GlassBackground";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { PractaContext, PractaCompleteHandler } from "@/types/flow";
import { ImageSourcePropType } from "react-native";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

interface MyPractaProps {
  context: PractaContext;
  onComplete: PractaCompleteHandler;
  showSettings?: boolean;
  onSettings?: () => void;
}

const GRID_SIZE_CLASSIC = 9;
const BOX_SIZE_CLASSIC = 3;
const GRID_SIZE_MINI = 6;
const BOX_ROWS_MINI = 2;
const BOX_COLS_MINI = 3;

type Difficulty = "lite" | "easy" | "medium" | "hard";
type GridType = "classic" | "mini";

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

  for (let i = 0; i < GRID_SIZE_CLASSIC; i++) {
    for (let j = 0; j < GRID_SIZE_CLASSIC; j++) {
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

const generateMiniSudoku = (difficulty: Difficulty): { grid: CellData[][]; solution: number[][] } => {
  const base: number[][] = [
    [1, 2, 3, 4, 5, 6],
    [4, 5, 6, 1, 2, 3],
    [2, 3, 1, 5, 6, 4],
    [5, 6, 4, 2, 3, 1],
    [3, 1, 2, 6, 4, 5],
    [6, 4, 5, 3, 1, 2],
  ];

  const difficultyOffset = difficulty === "lite" ? -1000 : difficulty === "easy" ? 0 : difficulty === "medium" ? 1000 : 2000;
  const seed = getTodaysSeed() + difficultyOffset + 5000;
  const random = createSeededRandom(seed);

  const shuffled = shuffleMiniBoard(base, random);
  const solution = shuffled.map((row) => [...row]);
  const cellsToRemove = difficulty === "lite" ? 8 : difficulty === "easy" ? 12 : difficulty === "medium" ? 16 : 20;
  const positions: [number, number][] = [];

  for (let i = 0; i < GRID_SIZE_MINI; i++) {
    for (let j = 0; j < GRID_SIZE_MINI; j++) {
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

const shuffleMiniBoard = (board: number[][], random: () => number): number[][] => {
  const result = board.map((row) => [...row]);

  for (let i = 0; i < 5; i++) {
    const band = Math.floor(random() * 3);
    const row1 = band * BOX_ROWS_MINI + Math.floor(random() * BOX_ROWS_MINI);
    const row2 = band * BOX_ROWS_MINI + Math.floor(random() * BOX_ROWS_MINI);
    if (row1 !== row2 && row1 < 6 && row2 < 6) {
      [result[row1], result[row2]] = [result[row2], result[row1]];
    }
  }

  for (let i = 0; i < 5; i++) {
    const stack = Math.floor(random() * 2);
    const col1 = stack * BOX_COLS_MINI + Math.floor(random() * BOX_COLS_MINI);
    const col2 = stack * BOX_COLS_MINI + Math.floor(random() * BOX_COLS_MINI);
    if (col1 !== col2 && col1 < 6 && col2 < 6) {
      for (let row = 0; row < 6; row++) {
        [result[row][col1], result[row][col2]] = [result[row][col2], result[row][col1]];
      }
    }
  }

  return result;
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
  num: number,
  gridType: GridType = "classic"
): boolean => {
  const gridSize = gridType === "mini" ? GRID_SIZE_MINI : GRID_SIZE_CLASSIC;
  const boxRows = gridType === "mini" ? BOX_ROWS_MINI : BOX_SIZE_CLASSIC;
  const boxCols = gridType === "mini" ? BOX_COLS_MINI : BOX_SIZE_CLASSIC;

  for (let i = 0; i < gridSize; i++) {
    if (i !== col && grid[row][i].value === num) return false;
    if (i !== row && grid[i][col].value === num) return false;
  }

  const boxRow = Math.floor(row / boxRows) * boxRows;
  const boxCol = Math.floor(col / boxCols) * boxCols;
  for (let i = boxRow; i < boxRow + boxRows; i++) {
    for (let j = boxCol; j < boxCol + boxCols; j++) {
      if ((i !== row || j !== col) && grid[i][j].value === num) return false;
    }
  }

  return true;
};

const checkWin = (grid: CellData[][], gridType: GridType = "classic"): boolean => {
  const gridSize = gridType === "mini" ? GRID_SIZE_MINI : GRID_SIZE_CLASSIC;
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
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

export default function MyPracta({ 
  context, 
  onComplete, 
  showSettings: propShowSettings,
  onSettings: propOnSettings 
}: MyPractaProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();

  const [gridType, setGridType] = useState<GridType>("mini");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [grid, setGrid] = useState<CellData[][]>(() => generateMiniSudoku("easy").grid);
  const [solution, setSolution] = useState<number[][]>(() => generateMiniSudoku("easy").solution);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [iconTaps, setIconTaps] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingGridType, setPendingGridType] = useState<GridType | null>(null);
  const [pendingDifficulty, setPendingDifficulty] = useState<Difficulty | null>(null);
  const [showTimer, setShowTimer] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const lastTapTime = useRef(0);
  const selectedCellRef = useRef<{ row: number; col: number } | null>(null);

  const currentGridSize = gridType === "mini" ? GRID_SIZE_MINI : GRID_SIZE_CLASSIC;
  const screenWidth = Dimensions.get("window").width;
  const screenHeight = Dimensions.get("window").height;
  const gridVisualSize = Math.min(screenWidth - Spacing["3xl"] * 2, 360);
  const cellSize = gridVisualSize / currentGridSize;

  const timerScale = useSharedValue(1);
  const headerOpacity = useSharedValue(1);
  const controlsOpacity = useSharedValue(1);
  const congratsOpacity = useSharedValue(0);
  const congratsTranslateY = useSharedValue(20);
  const idlePulse = useSharedValue(1);
  const lastActivityTime = useRef(Date.now());

  useEffect(() => {
    const checkIdle = setInterval(() => {
      const now = Date.now();
      if (now - lastActivityTime.current > 10000 && !isComplete && isRunning) {
        idlePulse.value = withSequence(
          withTiming(1.08, { duration: 1500 }),
          withTiming(1, { duration: 1500 })
        );
      }
    }, 3000);
    return () => clearInterval(checkIdle);
  }, [isComplete, isRunning]);

  const idlePulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: idlePulse.value }],
  }));

  const updateActivity = useCallback(() => {
    lastActivityTime.current = Date.now();
    if (idlePulse.value !== 1) {
      idlePulse.value = withSpring(1);
    }
  }, []);

  const openSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  useEffect(() => {
    setConfig({
      headerMode: "default",
      title: "Daily Sudoku",
      showSettings: propShowSettings ?? true,
      onSettings: openSettings,
    });
  }, [setConfig, propShowSettings, openSettings]);

  useEffect(() => {
    context.storage?.get<boolean>("showTimer").then((val) => {
      if (val === true || val === false) setShowTimer(val);
    }).catch(() => {});
    context.storage?.get<boolean>("showErrors").then((val) => {
      if (val === true || val === false) setShowErrors(val);
    }).catch(() => {});
    context.storage?.get<GridType>("gridType").then((savedGridType) => {
      const validGridType = savedGridType === "mini" || savedGridType === "classic" ? savedGridType : "mini";
      setGridType(validGridType);
      
      context.storage?.get<Difficulty>("difficulty").then((val) => {
        const validDifficulty = val === "lite" || val === "easy" || val === "medium" || val === "hard" ? val : "easy";
        setDifficulty(validDifficulty);
        const generator = validGridType === "mini" ? generateMiniSudoku : generateSudoku;
        const { grid: newGrid, solution: newSolution } = generator(validDifficulty);
        setGrid(newGrid);
        setSolution(newSolution);
      }).catch(() => {});
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
    updateActivity();
    selectedCellRef.current = { row, col };
    setSelectedCell({ row, col });
    triggerHaptic("light");
  }, [updateActivity]);

  const handleNumberPress = useCallback((num: number) => {
    updateActivity();
    const cell = selectedCellRef.current || selectedCell;
    if (!cell || isComplete) return;

    const { row, col } = cell;
    if (grid[row][col].isOriginal) return;

    triggerHaptic("medium");

    const newGrid = grid.map((r) => r.map((c) => ({ ...c })));
    const isValid = num === 0 || isValidPlacement(newGrid, row, col, num, gridType);

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

    if (checkWin(newGrid, gridType)) {
      setIsComplete(true);
      setIsRunning(false);
      triggerHaptic("success");
    }
  }, [selectedCell, grid, isComplete, gridType]);

  const handleNewGame = useCallback((diff: Difficulty, newGridType?: GridType) => {
    updateActivity();
    const typeToUse = newGridType ?? gridType;
    const generator = typeToUse === "mini" ? generateMiniSudoku : generateSudoku;
    const { grid: newGrid, solution: newSolution } = generator(diff);
    setDifficulty(diff);
    context.storage?.set("difficulty", diff).catch(() => {});
    if (newGridType) {
      setGridType(newGridType);
      context.storage?.set("gridType", newGridType).catch(() => {});
    }
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
  }, [context.storage, gridType]);

  const handleClear = useCallback(() => {
    if (!selectedCell || isComplete) return;
    handleNumberPress(0);
  }, [selectedCell, isComplete, handleNumberPress]);

  const handleIconTap = useCallback(() => {
    updateActivity();
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
    
    const boxRows = gridType === "mini" ? BOX_ROWS_MINI : BOX_SIZE_CLASSIC;
    const boxCols = gridType === "mini" ? BOX_COLS_MINI : BOX_SIZE_CLASSIC;
    
    const isSameBox =
      selectedCell &&
      Math.floor(selectedCell.row / boxRows) === Math.floor(row / boxRows) &&
      Math.floor(selectedCell.col / boxCols) === Math.floor(col / boxCols);
    const isSameValue = selectedCell && cell.value !== 0 && grid[selectedCell.row][selectedCell.col].value === cell.value;

    const isRightBorder = (col + 1) % boxCols === 0 && col < currentGridSize - 1;
    const isBottomBorder = (row + 1) % boxRows === 0 && row < currentGridSize - 1;

    let backgroundColor = "transparent";
    if (cell.isError) {
      backgroundColor = isDark ? theme.error + "59" : theme.error + "40";
    } else if (isSelected) {
      backgroundColor = theme.primary + "50";
    } else if (isSameValue) {
      backgroundColor = theme.primary + "25";
    } else if (isSameRow || isSameCol || isSameBox) {
      backgroundColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
    }

    return (
      <Animated.View key={`${row}-${col}`} style={isSelected ? idlePulseStyle : undefined}>
        <Pressable
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
      </Animated.View>
    );
  };

  const NumberButton = ({ num }: { num: number }) => {
    const count = grid.flat().filter((c) => c.value === num).length;
    const isDisabled = count >= currentGridSize;
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
            {currentGridSize - count}
          </ThemedText>
        </View>
      </AnimatedPressable>
    );
  };

  return (
    <GlassBackground style={styles.container}>
      <View style={[styles.content, { paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <Animated.View entering={FadeInDown.duration(400)} style={[styles.header, headerAnimStyle]}>
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

        <Animated.View entering={FadeIn.delay(100).duration(400)} style={[styles.currentModeRow, headerAnimStyle]}>
          <Pressable
            onPress={() => setShowSettings(true)}
            style={[
              styles.currentModeButton,
              { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)" },
            ]}
          >
            <View style={styles.currentModeInfo}>
              <Feather 
                name={gridType === "mini" ? "grid" : "hash"} 
                size={16} 
                color={theme.primary} 
              />
              <ThemedText style={[styles.currentModeText, { color: theme.text }]}>
                Playing {gridType === "mini" ? "6x6" : "9x9"} {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
              </ThemedText>
            </View>
            <View style={styles.changeModeLink}>
              <ThemedText style={[styles.changeModeText, { color: theme.primary }]}>
                Change
              </ThemedText>
              <Feather name="chevron-right" size={16} color={theme.primary} />
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(200).duration(400)}>
          <GlassCard style={styles.gridWrapper} intensity={60}>
            <View
              style={[
                styles.gridContainer,
                {
                  width: gridVisualSize,
                  height: gridVisualSize,
                  borderColor: isComplete ? theme.success : theme.primary,
                  borderWidth: 2,
                },
              ]}
            >
              {Array.from({ length: currentGridSize }, (_, row) => (
                <View key={row} style={styles.row}>
                  {Array.from({ length: currentGridSize }, (_, col) => renderCell(row, col))}
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
                <View style={[styles.hintBadge, { backgroundColor: theme.primary + "20" }]}>
                  <Feather name="lock" size={14} color={theme.primary} />
                  <ThemedText style={[styles.hintText, { color: theme.primary }]}>
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
              {Array.from({ length: currentGridSize }, (_, i) => i + 1).map((num) => (
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

      </View>

      {showSettings ? (
        <Pressable style={styles.modalOverlay} onPress={() => {
          setPendingGridType(null);
          setPendingDifficulty(null);
          setShowSettings(false);
        }}>
          <GlassCard style={styles.settingsModal} noPadding intensity={80}>
            <View style={styles.settingsHeader}>
              <ThemedText style={styles.settingsTitle}>Settings</ThemedText>
              <Pressable onPress={() => {
                setPendingGridType(null);
                setPendingDifficulty(null);
                setShowSettings(false);
              }} style={styles.closeButton}>
                <Feather name="x" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            
            <View style={styles.settingsContent}>
              <View style={styles.settingsSection}>
                <ThemedText style={[styles.settingsSectionTitle, { color: theme.textSecondary }]}>Grid Size</ThemedText>
                <View style={styles.settingsOptionRow}>
                  {(["mini", "classic"] as GridType[]).map((type) => {
                    const isSelected = (pendingGridType ?? gridType) === type;
                    return (
                      <Pressable
                        key={type}
                        onPress={() => setPendingGridType(type)}
                        style={[
                          styles.settingsOptionButton,
                          {
                            backgroundColor: isSelected 
                              ? theme.primary 
                              : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"),
                            flex: 1,
                          },
                        ]}
                      >
                        <Feather 
                          name={type === "mini" ? "grid" : "hash"} 
                          size={16} 
                          color={isSelected ? "#fff" : theme.textSecondary} 
                        />
                        <ThemedText
                          style={[
                            styles.settingsOptionText,
                            { color: isSelected ? "#fff" : theme.text },
                          ]}
                        >
                          {type === "mini" ? "6x6 Mini" : "9x9 Classic"}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.settingsSection}>
                <ThemedText style={[styles.settingsSectionTitle, { color: theme.textSecondary }]}>Difficulty</ThemedText>
                <View style={styles.settingsOptionRow}>
                  {(["lite", "easy", "medium", "hard"] as Difficulty[]).map((diff) => {
                    const isSelected = (pendingDifficulty ?? difficulty) === diff;
                    return (
                      <Pressable
                        key={diff}
                        onPress={() => setPendingDifficulty(diff)}
                        style={[
                          styles.difficultyOptionButton,
                          {
                            backgroundColor: isSelected 
                              ? theme.primary 
                              : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"),
                          },
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.settingsOptionText,
                            { color: isSelected ? "#fff" : theme.text },
                          ]}
                        >
                          {diff.charAt(0).toUpperCase() + diff.slice(1)}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.settingsDivider, { backgroundColor: theme.border }]} />

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

              <Pressable
                onPress={() => {
                  const newDiff = pendingDifficulty ?? difficulty;
                  const newType = pendingGridType ?? gridType;
                  if (pendingDifficulty || pendingGridType) {
                    handleNewGame(newDiff, newType);
                  }
                  setPendingGridType(null);
                  setPendingDifficulty(null);
                  setShowSettings(false);
                }}
                style={[styles.doneButton, { backgroundColor: theme.primary }]}
              >
                <ThemedText style={styles.doneButtonText}>Done</ThemedText>
              </Pressable>
            </View>
          </GlassCard>
        </Pressable>
      ) : null}

    </GlassBackground>
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
  statsCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
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
  currentModeRow: {
    marginBottom: Spacing.md,
    width: "100%",
  },
  currentModeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.lg,
  },
  currentModeInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  currentModeText: {
    fontSize: 15,
    fontWeight: "600",
  },
  changeModeLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  changeModeText: {
    fontSize: 14,
    fontWeight: "500",
  },
  modeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  modeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  gridWrapper: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
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
  settingsSection: {
    gap: Spacing.sm,
  },
  settingsSectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  settingsOptionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  settingsOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.md,
  },
  difficultyOptionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
  },
  settingsOptionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  settingsDivider: {
    height: 1,
    marginVertical: Spacing.sm,
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
  doneButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
