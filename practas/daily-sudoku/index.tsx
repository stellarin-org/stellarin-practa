import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { PractaContext, PractaCompleteHandler } from "@/types/flow";

interface MyPractaProps {
  context: PractaContext;
  onComplete: PractaCompleteHandler;
  onSkip?: () => void;
}

const GRID_SIZE = 9;
const BOX_SIZE = 3;

type Difficulty = "easy" | "medium" | "hard";

interface CellData {
  value: number;
  isOriginal: boolean;
  isError: boolean;
}

const generateSudoku = (difficulty: Difficulty): CellData[][] => {
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

  const shuffled = shuffleBoard(base);
  const cellsToRemove = difficulty === "easy" ? 35 : difficulty === "medium" ? 45 : 55;
  const positions: [number, number][] = [];

  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      positions.push([i, j]);
    }
  }

  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  const grid: CellData[][] = shuffled.map((row) =>
    row.map((value) => ({ value, isOriginal: true, isError: false }))
  );

  for (let i = 0; i < cellsToRemove; i++) {
    const [row, col] = positions[i];
    grid[row][col] = { value: 0, isOriginal: false, isError: false };
  }

  return grid;
};

const shuffleBoard = (board: number[][]): number[][] => {
  const result = board.map((row) => [...row]);

  for (let i = 0; i < 5; i++) {
    const band = Math.floor(Math.random() * 3);
    const row1 = band * 3 + Math.floor(Math.random() * 3);
    const row2 = band * 3 + Math.floor(Math.random() * 3);
    if (row1 !== row2) {
      [result[row1], result[row2]] = [result[row2], result[row1]];
    }
  }

  for (let i = 0; i < 5; i++) {
    const stack = Math.floor(Math.random() * 3);
    const col1 = stack * 3 + Math.floor(Math.random() * 3);
    const col2 = stack * 3 + Math.floor(Math.random() * 3);
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

export default function MyPracta({ context, onComplete, onSkip }: MyPractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [grid, setGrid] = useState<CellData[][]>(() => generateSudoku("easy"));
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(true);

  const screenWidth = Dimensions.get("window").width;
  const gridSize = Math.min(screenWidth - Spacing.xl * 2, 340);
  const cellSize = gridSize / GRID_SIZE;

  React.useEffect(() => {
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

  const handleCellPress = useCallback((row: number, col: number) => {
    setSelectedCell({ row, col });
    triggerHaptic("light");
  }, []);

  const handleNumberPress = useCallback((num: number) => {
    if (!selectedCell || isComplete) return;

    const { row, col } = selectedCell;
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
    setDifficulty(diff);
    setGrid(generateSudoku(diff));
    setSelectedCell(null);
    setIsComplete(false);
    setMistakes(0);
    setTimer(0);
    setIsRunning(true);
    triggerHaptic("medium");
  }, []);

  const handleClear = useCallback(() => {
    if (!selectedCell || isComplete) return;
    handleNumberPress(0);
  }, [selectedCell, isComplete, handleNumberPress]);

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

    let backgroundColor = theme.backgroundDefault;
    if (isSelected) {
      backgroundColor = theme.primary + "40";
    } else if (isSameValue) {
      backgroundColor = theme.primary + "20";
    } else if (isSameRow || isSameCol || isSameBox) {
      backgroundColor = theme.backgroundSecondary;
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
            borderColor: theme.border,
          },
        ]}
      >
        {cell.value !== 0 ? (
          <ThemedText
            style={[
              styles.cellText,
              {
                color: cell.isOriginal
                  ? theme.text
                  : cell.isError
                  ? theme.error
                  : theme.primary,
                fontWeight: cell.isOriginal ? "600" : "400",
              },
            ]}
          >
            {cell.value}
          </ThemedText>
        ) : null}
      </Pressable>
    );
  };

  const renderNumberButton = (num: number) => {
    const count = grid.flat().filter((c) => c.value === num).length;
    const isDisabled = count >= 9;

    return (
      <Pressable
        key={num}
        onPress={() => handleNumberPress(num)}
        disabled={isDisabled}
        style={[
          styles.numberButton,
          {
            backgroundColor: isDisabled ? theme.backgroundSecondary : theme.backgroundDefault,
            opacity: isDisabled ? 0.5 : 1,
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
        <ThemedText style={[styles.countText, { color: theme.textSecondary }]}>
          {9 - count}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.lg }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Sudoku</ThemedText>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Feather name="clock" size={16} color={theme.textSecondary} />
              <ThemedText style={[styles.statText, { color: theme.textSecondary }]}>
                {formatTime(timer)}
              </ThemedText>
            </View>
            <View style={styles.stat}>
              <Feather name="x-circle" size={16} color={theme.error} />
              <ThemedText style={[styles.statText, { color: theme.error }]}>
                {mistakes}
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.difficultyRow}>
          {(["easy", "medium", "hard"] as Difficulty[]).map((diff) => (
            <Pressable
              key={diff}
              onPress={() => handleNewGame(diff)}
              style={[
                styles.difficultyButton,
                {
                  backgroundColor:
                    difficulty === diff ? theme.primary : theme.backgroundSecondary,
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.difficultyText,
                  { color: difficulty === diff ? "#fff" : theme.text },
                ]}
              >
                {diff.charAt(0).toUpperCase() + diff.slice(1)}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <View
          style={[
            styles.gridContainer,
            {
              width: gridSize,
              height: gridSize,
              borderColor: theme.text,
              backgroundColor: theme.backgroundDefault,
            },
          ]}
        >
          {Array.from({ length: GRID_SIZE }, (_, row) => (
            <View key={row} style={styles.row}>
              {Array.from({ length: GRID_SIZE }, (_, col) => renderCell(row, col))}
            </View>
          ))}
        </View>

        {isComplete ? (
          <View style={styles.completeBanner}>
            <ThemedText style={[styles.completeText, { color: theme.success }]}>
              Puzzle Complete!
            </ThemedText>
            <ThemedText style={[styles.completeSubtext, { color: theme.textSecondary }]}>
              Time: {formatTime(timer)} | Mistakes: {mistakes}
            </ThemedText>
            <View style={styles.completeButtons}>
              <Pressable
                onPress={() => handleNewGame(difficulty)}
                style={[styles.secondaryButton, { borderColor: theme.primary }]}
              >
                <ThemedText style={[styles.secondaryButtonText, { color: theme.primary }]}>
                  New Game
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleComplete}
                style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              >
                <ThemedText style={styles.primaryButtonText}>Complete</ThemedText>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.controls}>
            {selectedCell && grid[selectedCell.row][selectedCell.col].isOriginal ? (
              <ThemedText style={[styles.hintText, { color: theme.textSecondary }]}>
                This cell cannot be changed
              </ThemedText>
            ) : !selectedCell ? (
              <ThemedText style={[styles.hintText, { color: theme.textSecondary }]}>
                Tap an empty cell to select it
              </ThemedText>
            ) : null}
            <View style={styles.numberPad}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(renderNumberButton)}
            </View>
            <Pressable
              onPress={handleClear}
              style={[styles.clearButton, { backgroundColor: theme.backgroundSecondary }]}
            >
              <Feather name="delete" size={24} color={theme.text} />
              <ThemedText style={{ marginLeft: Spacing.sm, color: theme.text }}>
                Clear
              </ThemedText>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {onSkip ? (
        <Pressable
          onPress={onSkip}
          style={[styles.skipButton, { paddingBottom: insets.bottom + Spacing.md }]}
        >
          <ThemedText style={[styles.skipText, { color: theme.textSecondary }]}>
            Skip
          </ThemedText>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  header: {
    width: "100%",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.xl,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statText: {
    fontSize: 14,
    fontWeight: "500",
  },
  difficultyRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  difficultyButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  difficultyText: {
    fontSize: 13,
    fontWeight: "600",
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
    fontSize: 18,
  },
  controls: {
    marginTop: Spacing.lg,
    width: "100%",
    alignItems: "center",
  },
  hintText: {
    fontSize: 14,
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  numberPad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.sm,
    maxWidth: 320,
  },
  numberButton: {
    width: 52,
    height: 58,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  numberButtonText: {
    fontSize: 22,
    fontWeight: "600",
  },
  countText: {
    fontSize: 10,
    marginTop: 1,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
  },
  completeBanner: {
    marginTop: Spacing.xl,
    alignItems: "center",
  },
  completeText: {
    fontSize: 24,
    fontWeight: "700",
  },
  completeSubtext: {
    fontSize: 14,
    marginTop: Spacing.sm,
  },
  completeButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  primaryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  skipButton: {
    alignItems: "center",
    padding: Spacing.md,
  },
  skipText: {
    fontSize: 14,
  },
});
