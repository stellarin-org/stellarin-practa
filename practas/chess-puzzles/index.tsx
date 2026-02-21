import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { View, StyleSheet, Pressable, Platform, Dimensions, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
  runOnJS,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { GlassCard } from "@/components/GlassCard";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaContext, PractaCompleteHandler } from "@/types/flow";

interface MyPractaProps {
  context: PractaContext;
  onComplete: PractaCompleteHandler;
  showSettings?: boolean;
  onSettings?: () => void;
}

type Difficulty = "beginner" | "casual" | "club" | "advanced" | "expert";
type PuzzleMode = "mini" | "full";

interface BoundingBox {
  min_file: number;
  max_file: number;
  min_rank: number;
  max_rank: number;
  width: number;
  height: number;
}

interface Puzzle {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  difficulty: number;
  metadata?: {
    bounding_box: BoundingBox;
    orientation: "white" | "black";
  };
}

interface PuzzlesData {
  metadata?: {
    total_puzzles: number;
    description: string;
  };
  puzzles: Record<Difficulty, Puzzle[]>;
}

const DIFFICULTIES: { key: Difficulty; label: string; color: string; icon: string; description: string; rating: string }[] = [
  { key: "beginner", label: "Beginner", color: "#4CAF50", icon: "smile", description: "Simple one-move puzzles", rating: "< 1000" },
  { key: "casual", label: "Casual", color: "#8BC34A", icon: "coffee", description: "Light tactical challenges", rating: "1000-1400" },
  { key: "club", label: "Club", color: "#FF9800", icon: "users", description: "Club-level combinations", rating: "1400-1800" },
  { key: "advanced", label: "Advanced", color: "#FF5722", icon: "target", description: "Complex multi-move tactics", rating: "1800-2200" },
  { key: "expert", label: "Expert", color: "#E91E63", icon: "award", description: "Master-level challenges", rating: "2200+" },
];

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDifficulty: Difficulty;
  onSelectDifficulty: (difficulty: Difficulty) => void;
  puzzleMode: PuzzleMode;
  onTogglePuzzleMode: () => void;
}

function SettingsModal({ visible, onClose, selectedDifficulty, onSelectDifficulty, puzzleMode, onTogglePuzzleMode }: SettingsModalProps) {
  const { theme, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();

  const handleSelect = (difficulty: Difficulty) => {
    onSelectDifficulty(difficulty);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <Pressable 
        style={[settingsStyles.overlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ maxHeight: "80%" }}
        >
          <GlassCard
            style={{
              borderTopLeftRadius: BorderRadius.xl,
              borderTopRightRadius: BorderRadius.xl,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              paddingBottom: insets.bottom + Spacing.lg,
            }}
            noPadding
          >
          <View style={settingsStyles.header}>
            <ThemedText style={[settingsStyles.title, { color: theme.text }]}>
              Game Settings
            </ThemedText>
            <Pressable onPress={onClose} style={settingsStyles.closeButton}>
              <Feather name="x" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View style={settingsStyles.modeSection}>
            <ThemedText style={[settingsStyles.sectionLabel, { color: theme.textSecondary }]}>
              Appearance
            </ThemedText>
            <Pressable
              onPress={toggleTheme}
              style={[
                settingsStyles.modeOption,
                { borderColor: theme.border, flexDirection: "row", flex: 0, paddingHorizontal: Spacing.lg },
              ]}
            >
              <Feather name={isDark ? "moon" : "sun"} size={18} color={theme.primary} />
              <ThemedText style={[settingsStyles.modeOptionText, { color: theme.text }]}>
                {isDark ? "Dark Mode" : "Light Mode"}
              </ThemedText>
              <Feather name="refresh-cw" size={14} color={theme.textSecondary} style={{ marginLeft: "auto" }} />
            </Pressable>
          </View>

          <View style={settingsStyles.modeSection}>
            <ThemedText style={[settingsStyles.sectionLabel, { color: theme.textSecondary }]}>
              Board Size
            </ThemedText>
            <View style={settingsStyles.modeToggle}>
              <Pressable
                onPress={() => { if (puzzleMode !== "mini") onTogglePuzzleMode(); }}
                style={[
                  settingsStyles.modeOption,
                  puzzleMode === "mini" && { backgroundColor: theme.primary + "20" },
                  { borderColor: puzzleMode === "mini" ? theme.primary : theme.border },
                ]}
              >
                <Feather name="minimize-2" size={18} color={puzzleMode === "mini" ? theme.primary : theme.textSecondary} />
                <ThemedText style={[settingsStyles.modeOptionText, { color: puzzleMode === "mini" ? theme.primary : theme.text }]}>
                  Mini
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => { if (puzzleMode !== "full") onTogglePuzzleMode(); }}
                style={[
                  settingsStyles.modeOption,
                  puzzleMode === "full" && { backgroundColor: theme.primary + "20" },
                  { borderColor: puzzleMode === "full" ? theme.primary : theme.border },
                ]}
              >
                <Feather name="maximize-2" size={18} color={puzzleMode === "full" ? theme.primary : theme.textSecondary} />
                <ThemedText style={[settingsStyles.modeOptionText, { color: puzzleMode === "full" ? theme.primary : theme.text }]}>
                  Full Board
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={settingsStyles.divider} />

          <ThemedText style={[settingsStyles.sectionLabel, { color: theme.textSecondary, paddingHorizontal: Spacing.lg }]}>
            Difficulty
          </ThemedText>

          <ScrollView style={settingsStyles.list} showsVerticalScrollIndicator={false}>
            {DIFFICULTIES.map((diff) => {
              const isSelected = diff.key === selectedDifficulty;
              return (
                <Pressable
                  key={diff.key}
                  onPress={() => handleSelect(diff.key)}
                  style={[
                    settingsStyles.item,
                    { 
                      backgroundColor: isSelected ? theme.accentSoft : "transparent",
                      borderColor: isSelected ? diff.color : theme.border,
                    },
                  ]}
                >
                  <View style={[settingsStyles.iconContainer, { backgroundColor: diff.color + "20" }]}>
                    <Feather name={diff.icon as any} size={20} color={diff.color} />
                  </View>
                  <View style={settingsStyles.itemContent}>
                    <View style={settingsStyles.itemHeader}>
                      <ThemedText style={[settingsStyles.itemLabel, { color: isSelected ? diff.color : theme.text }]}>
                        {diff.label}
                      </ThemedText>
                      <ThemedText style={[settingsStyles.itemRating, { color: theme.textSecondary }]}>
                        {diff.rating}
                      </ThemedText>
                    </View>
                    <ThemedText style={[settingsStyles.itemDescription, { color: theme.textSecondary }]}>
                      {diff.description}
                    </ThemedText>
                  </View>
                  {isSelected ? (
                    <Feather name="check" size={20} color={diff.color} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
          </GlassCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const settingsStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  container: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.lg,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  closeButton: {
    padding: Spacing.sm,
  },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  itemRating: {
    fontSize: 12,
    fontWeight: "500",
  },
  itemDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  modeSection: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  modeToggle: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  modeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  modeOptionText: {
    fontSize: 15,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
  },
});

// Adding \uFE0E (Variation Selector 15) forces text rendering instead of emoji on iOS
const PIECE_UNICODE: { [key: string]: string } = {
  K: "\u265A\uFE0E", k: "\u265A\uFE0E",
  Q: "\u265B\uFE0E", q: "\u265B\uFE0E",
  R: "\u265C\uFE0E", r: "\u265C\uFE0E",
  B: "\u265D\uFE0E", b: "\u265D\uFE0E",
  N: "\u265E\uFE0E", n: "\u265E\uFE0E",
  P: "\u265F\uFE0E", p: "\u265F\uFE0E",
};

const getDayOfYear = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

const getDeterministicPuzzleIndex = (difficulty: Difficulty, mode: PuzzleMode = "mini"): number => {
  const today = new Date();
  const dayOfYear = getDayOfYear(today);
  const year = today.getFullYear();
  const modeOffset = mode === "full" ? 500 : 0;
  const seed = (year * 365 + dayOfYear + modeOffset) % 1000;
  return seed;
};

const parseFEN = (fen: string): (string | null)[][] => {
  const board: (string | null)[][] = [];
  const rows = fen.split(" ")[0].split("/");

  for (const row of rows) {
    const boardRow: (string | null)[] = [];
    for (const char of row) {
      if (/\d/.test(char)) {
        for (let i = 0; i < parseInt(char); i++) {
          boardRow.push(null);
        }
      } else {
        boardRow.push(char);
      }
    }
    board.push(boardRow);
  }

  return board;
};

const squareToCoords = (square: string): [number, number] => {
  const file = square.charCodeAt(0) - 97;
  const rank = 8 - parseInt(square[1]);
  return [rank, file];
};

const coordsToSquare = (row: number, col: number): string => {
  const file = String.fromCharCode(97 + col);
  const rank = 8 - row;
  return `${file}${rank}`;
};

const applyMove = (board: (string | null)[][], move: string): (string | null)[][] => {
  const newBoard = board.map(row => [...row]);
  const from = move.substring(0, 2);
  const to = move.substring(2, 4);
  const promotion = move.length > 4 ? move[4] : null;

  const [fromRow, fromCol] = squareToCoords(from);
  const [toRow, toCol] = squareToCoords(to);

  let piece = newBoard[fromRow][fromCol];

  if (promotion && piece) {
    const isWhite = piece === piece.toUpperCase();
    piece = isWhite ? promotion.toUpperCase() : promotion.toLowerCase();
  }

  newBoard[toRow][toCol] = piece;
  newBoard[fromRow][fromCol] = null;

  return newBoard;
};

interface PieceData {
  id: string;
  piece: string;
  row: number;
  col: number;
}

const DraggablePiece = ({
  piece,
  pieceRow,
  pieceCol,
  displayRow,
  displayCol,
  squareSize,
  flipped,
  isPlayerTurn,
  isMiniMode,
  rowCount,
  colCount,
  minRow,
  maxRow,
  minCol,
  maxCol,
  onDragEnd,
  onTap,
}: {
  piece: string;
  pieceRow: number;
  pieceCol: number;
  displayRow: number;
  displayCol: number;
  squareSize: number;
  flipped: boolean;
  isPlayerTurn: boolean;
  isMiniMode: boolean;
  rowCount: number;
  colCount: number;
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
  onDragEnd: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  onTap: (row: number, col: number) => void;
}) => {
  const baseX = displayCol * squareSize;
  const baseY = displayRow * squareSize;

  const translateX = useSharedValue(baseX);
  const translateY = useSharedValue(baseY);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(1);
  const isFirstRender = useRef(true);
  const isDragging = useRef(false);

  useEffect(() => {
    const targetX = displayCol * squareSize;
    const targetY = displayRow * squareSize;

    if (isFirstRender.current) {
      translateX.value = targetX;
      translateY.value = targetY;
      isFirstRender.current = false;
    } else if (!isDragging.current) {
      translateX.value = withTiming(targetX, { duration: 300, easing: Easing.out(Easing.cubic) });
      translateY.value = withTiming(targetY, { duration: 300, easing: Easing.out(Easing.cubic) });
    }
  }, [displayRow, displayCol, squareSize]);

  const triggerHapticFeedback = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleDragEnd = (toDisplayRow: number, toDisplayCol: number) => {
    let actualToRow: number;
    let actualToCol: number;
    
    if (isMiniMode) {
      // Convert display coordinates back to actual board coordinates
      actualToRow = flipped 
        ? maxRow - toDisplayRow 
        : minRow + toDisplayRow;
      actualToCol = flipped 
        ? maxCol - toDisplayCol 
        : minCol + toDisplayCol;
    } else {
      actualToRow = flipped ? 7 - toDisplayRow : toDisplayRow;
      actualToCol = flipped ? 7 - toDisplayCol : toDisplayCol;
    }
    onDragEnd(pieceRow, pieceCol, actualToRow, actualToCol);
  };

  const handleTap = () => {
    onTap(pieceRow, pieceCol);
  };

  const panGesture = Gesture.Pan()
    .enabled(isPlayerTurn)
    .onStart(() => {
      isDragging.current = true;
      scale.value = withSpring(1.15);
      zIndex.value = 100;
      runOnJS(triggerHapticFeedback)();
    })
    .onUpdate((event) => {
      translateX.value = baseX + event.translationX;
      translateY.value = baseY + event.translationY;
    })
    .onEnd((event) => {
      isDragging.current = false;
      const finalX = baseX + event.translationX;
      const finalY = baseY + event.translationY;

      const targetDisplayCol = Math.round(finalX / squareSize);
      const targetDisplayRow = Math.round(finalY / squareSize);

      const maxColIndex = colCount - 1;
      const maxRowIndex = rowCount - 1;
      const clampedCol = Math.max(0, Math.min(maxColIndex, targetDisplayCol));
      const clampedRow = Math.max(0, Math.min(maxRowIndex, targetDisplayRow));

      scale.value = withSpring(1);
      zIndex.value = 1;

      translateX.value = withSpring(baseX);
      translateY.value = withSpring(baseY);

      runOnJS(handleDragEnd)(clampedRow, clampedCol);
    });

  const tapGesture = Gesture.Tap()
    .enabled(isPlayerTurn)
    .onEnd(() => {
      runOnJS(handleTap)();
    });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          styles.animatedPiece,
          { width: squareSize, height: squareSize },
          animatedStyle,
        ]}
      >
        <ThemedText
          style={[
            styles.piece,
            {
              fontSize: squareSize * 0.75,
              color: piece === piece.toUpperCase() ? "#FFFFFF" : "#000000",
            },
          ]}
        >
          {PIECE_UNICODE[piece]}
        </ThemedText>
      </Animated.View>
    </GestureDetector>
  );
};

const PulsingHighlight = ({ isLight }: { isLight: boolean }) => {
  const pulseOpacity = useSharedValue(0.3);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const baseColor = isLight ? "#C97B4A" : "#E8D0A9";

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: baseColor },
        animatedStyle,
      ]}
    />
  );
};

const GlowingHint = () => {
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: "#FFD700" },
        animatedStyle,
      ]}
    />
  );
};

const generatePieceId = () => Math.random().toString(36).substring(2, 9);

const initializePieces = (board: (string | null)[][]): PieceData[] => {
  const result: PieceData[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]?.[col];
      if (piece) {
        result.push({
          id: generatePieceId(),
          piece,
          row,
          col,
        });
      }
    }
  }
  return result;
};

const ChessBoard = ({
  board,
  selectedSquare,
  validMoves,
  lastMove,
  hintSquare,
  onSquarePress,
  onDragMove,
  isPlayerTurn,
  flipped,
  puzzleMode,
  boundingBox,
}: {
  board: (string | null)[][];
  selectedSquare: string | null;
  validMoves: string[];
  lastMove: { from: string; to: string } | null;
  hintSquare: string | null;
  onSquarePress: (square: string) => void;
  onDragMove: (fromSquare: string, toSquare: string) => void;
  isPlayerTurn: boolean;
  flipped: boolean;
  puzzleMode: PuzzleMode;
  boundingBox?: BoundingBox;
}) => {
  const { theme } = useTheme();
  const { width } = Dimensions.get("window");
  
  const isMiniMode = puzzleMode === "mini" && !!boundingBox;
  const colCount = isMiniMode ? boundingBox.width : 8;
  const rowCount = isMiniMode ? boundingBox.height : 8;
  const maxBoardWidth = Math.min(width - Spacing.xl * 2, 360);
  const squareSize = maxBoardWidth / colCount;
  const boardWidth = squareSize * colCount;
  const boardHeight = squareSize * rowCount;
  
  // Bounding box uses: min_file/max_file (0-7 for a-h), min_rank/max_rank (0-7 for ranks 1-8)
  // Board array uses: row 0 = rank 8, row 7 = rank 1; col 0 = file a, col 7 = file h
  const minCol = isMiniMode ? boundingBox.min_file : 0;
  const maxCol = isMiniMode ? boundingBox.max_file : 7;
  // Convert rank (0=rank1, 7=rank8) to board row (0=rank8, 7=rank1)
  const minRow = isMiniMode ? (7 - boundingBox.max_rank) : 0; // top row of cropped area
  const maxRow = isMiniMode ? (7 - boundingBox.min_rank) : 7; // bottom row of cropped area

  const lightSquare = "#E8D0A9";
  const darkSquare = "#C97B4A";
  const validMoveColor = "rgba(0, 150, 0, 0.4)";

  const piecesRef = useRef<PieceData[]>([]);
  const prevBoardRef = useRef<string>("");

  const currentBoardStr = JSON.stringify(board);

  if (prevBoardRef.current !== currentBoardStr) {
    if (piecesRef.current.length === 0) {
      piecesRef.current = initializePieces(board);
    } else if (lastMove) {
      const [fromRow, fromCol] = squareToCoords(lastMove.from);
      const [toRow, toCol] = squareToCoords(lastMove.to);
      const movedPiece = piecesRef.current.find(p => p.row === fromRow && p.col === fromCol);
      const capturedPieceIdx = piecesRef.current.findIndex(p => p.row === toRow && p.col === toCol && p !== movedPiece);

      if (capturedPieceIdx !== -1) {
        piecesRef.current.splice(capturedPieceIdx, 1);
      }

      if (movedPiece) {
        movedPiece.row = toRow;
        movedPiece.col = toCol;
        const newPieceType = board[toRow]?.[toCol];
        if (newPieceType) {
          movedPiece.piece = newPieceType;
        }
      }
    } else {
      piecesRef.current = initializePieces(board);
    }
    prevBoardRef.current = currentBoardStr;
  }

  const pieces = piecesRef.current;

  // Convert display coordinates to actual board coordinates
  const getActualCoordsFromDisplay = (displayRow: number, displayCol: number): [number, number] => {
    if (isMiniMode) {
      // Not flipped (white's view): display row 0 = minRow (top), display col 0 = minCol (left)
      // Flipped (black's view): display row 0 = maxRow (bottom becomes top), display col 0 = maxCol (right becomes left)
      const actualRow = flipped 
        ? maxRow - displayRow 
        : minRow + displayRow;
      const actualCol = flipped 
        ? maxCol - displayCol 
        : minCol + displayCol;
      return [actualRow, actualCol];
    }
    // Full board mode
    const actualRow = flipped ? 7 - displayRow : displayRow;
    const actualCol = flipped ? 7 - displayCol : displayCol;
    return [actualRow, actualCol];
  };

  // Convert actual board coordinates to display coordinates
  const getDisplayCoordsFromActual = (actualRow: number, actualCol: number): [number, number] => {
    if (isMiniMode) {
      const displayRow = flipped 
        ? maxRow - actualRow 
        : actualRow - minRow;
      const displayCol = flipped 
        ? maxCol - actualCol 
        : actualCol - minCol;
      return [displayRow, displayCol];
    }
    // Full board mode
    const displayRow = flipped ? 7 - actualRow : actualRow;
    const displayCol = flipped ? 7 - actualCol : actualCol;
    return [displayRow, displayCol];
  };

  const visiblePieces = isMiniMode 
    ? pieces.filter(p => {
        return p.row >= minRow && p.row <= maxRow && p.col >= minCol && p.col <= maxCol;
      })
    : pieces;

  return (
    <View style={[styles.boardContainer, { width: boardWidth, height: boardHeight }]}>
      <View style={[styles.boardBorder, { borderColor: theme.border }]}>
        {Array.from({ length: rowCount }).map((_, displayRowIndex) => (
          <View key={displayRowIndex} style={styles.boardRow}>
            {Array.from({ length: colCount }).map((_, displayColIndex) => {
              const [actualRow, actualCol] = getActualCoordsFromDisplay(displayRowIndex, displayColIndex);
              const square = coordsToSquare(actualRow, actualCol);
              const isLight = (actualRow + actualCol) % 2 === 0;
              const isSelected = selectedSquare === square;
              const isValidMove = validMoves.includes(square);
              const isLastMoveSquare = lastMove && (lastMove.from === square || lastMove.to === square);
              const isHint = hintSquare === square;

              let backgroundColor = isLight ? lightSquare : darkSquare;
              if (isLastMoveSquare) {
                backgroundColor = isLight ? "#AED6F1" : "#5DADE2";
              }

              return (
                <Pressable
                  key={displayColIndex}
                  onPress={() => onSquarePress(square)}
                  style={[
                    styles.square,
                    {
                      width: squareSize,
                      height: squareSize,
                      backgroundColor,
                    },
                  ]}
                >
                  {isHint ? (
                    <GlowingHint />
                  ) : isSelected ? (
                    <PulsingHighlight isLight={isLight} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={[styles.piecesLayer, { width: boardWidth, height: boardHeight }]} pointerEvents="box-none">
          {visiblePieces.map((p) => {
            const [displayRow, displayCol] = getDisplayCoordsFromActual(p.row, p.col);
            
            return (
              <DraggablePiece
                key={p.id}
                piece={p.piece}
                pieceRow={p.row}
                pieceCol={p.col}
                displayRow={displayRow}
                displayCol={displayCol}
                squareSize={squareSize}
                flipped={flipped}
                isPlayerTurn={isPlayerTurn}
                isMiniMode={isMiniMode}
                rowCount={rowCount}
                colCount={colCount}
                minRow={minRow}
                maxRow={maxRow}
                minCol={minCol}
                maxCol={maxCol}
                onDragEnd={(fromRow, fromCol, toRow, toCol) => {
                  const fromSquare = coordsToSquare(fromRow, fromCol);
                  const toSquare = coordsToSquare(toRow, toCol);
                  if (fromSquare !== toSquare) {
                    onDragMove(fromSquare, toSquare);
                  }
                }}
                onTap={(row, col) => {
                  const square = coordsToSquare(row, col);
                  onSquarePress(square);
                }}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
};

const DEFAULT_DIFFICULTY: Difficulty = "casual";
const DEFAULT_MODE: PuzzleMode = "full";

export default function MyPracta({ context, onComplete, showSettings, onSettings }: MyPractaProps) {
  const { theme } = useTheme();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const piecesRef = useRef<PieceData[]>([]);
  const firstMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const opponentMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [puzzleMode, setPuzzleMode] = useState<PuzzleMode>(DEFAULT_MODE);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [board, setBoard] = useState<(string | null)[][]>([]);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [moveIndex, setMoveIndex] = useState(0);
  const [moves, setMoves] = useState<string[]>([]);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);
  const [puzzleSolved, setPuzzleSolved] = useState(false);
  const [wrongMove, setWrongMove] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [playerIsWhite, setPlayerIsWhite] = useState(true);
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [puzzleOffset, setPuzzleOffset] = useState(0);

  const currentDifficultyInfo = useMemo(() => {
    return DIFFICULTIES.find(d => d.key === selectedDifficulty) || DIFFICULTIES[1];
  }, [selectedDifficulty]);

  const boardSizeLabel = useMemo(() => {
    if (puzzleMode === "mini" && currentPuzzle?.metadata?.bounding_box) {
      const { width, height } = currentPuzzle.metadata.bounding_box;
      return `${width}x${height}`;
    }
    return "8x8";
  }, [puzzleMode, currentPuzzle?.metadata?.bounding_box]);

  const successScale = useSharedValue(1);
  const boardOpacity = useSharedValue(1);

  const successAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
  }));

  const boardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: boardOpacity.value,
  }));

  const triggerHaptic = (type: "light" | "success" | "soft") => {
    if (Platform.OS !== "web") {
      if (type === "light") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (type === "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      }
    }
  };

  const loadPuzzle = useCallback((difficulty: Difficulty, mode: PuzzleMode, offsetOverride?: number) => {
    setLoadError(null);
    const puzzlesData = mode === "mini" 
      ? context.assets?.miniPuzzles as PuzzlesData | undefined
      : context.assets?.fullBoardPuzzles as PuzzlesData | undefined;
    
    if (!puzzlesData?.puzzles) {
      setLoadError(`Unable to load ${mode === "mini" ? "mini" : "full board"} puzzle data`);
      setIsLoading(false);
      return;
    }

    const puzzles = puzzlesData.puzzles[difficulty];
    if (!puzzles || puzzles.length === 0) {
      setLoadError(`No puzzles available for ${difficulty} difficulty`);
      setIsLoading(false);
      return;
    }

    const effectiveOffset = offsetOverride !== undefined ? offsetOverride : puzzleOffset;
    const baseIndex = getDeterministicPuzzleIndex(difficulty, mode);
    const index = (baseIndex + effectiveOffset) % puzzles.length;
    const puzzle = puzzles[index];

    setCurrentPuzzle(puzzle);
    setMoves(puzzle.moves.split(" "));
    setMoveIndex(0);
    setIsPlayerTurn(false);
    setSelectedSquare(null);
    setPuzzleSolved(false);
    setWrongMove(false);
    setLastMove(null);
    setAttempts(0);
    setHintSquare(null);

    const fenParts = puzzle.fen.split(" ");
    const activeColor = fenParts[1];
    const isWhite = activeColor === "b";
    setPlayerIsWhite(isWhite);

    const initialBoard = parseFEN(puzzle.fen);
    setBoard(initialBoard);
    piecesRef.current = [];
    setIsLoading(false);

    if (firstMoveTimeoutRef.current) {
      clearTimeout(firstMoveTimeoutRef.current);
    }
    firstMoveTimeoutRef.current = setTimeout(() => {
      const firstMove = puzzle.moves.split(" ")[0];
      const newBoard = applyMove(initialBoard, firstMove);
      setBoard(newBoard);
      setLastMove({
        from: firstMove.substring(0, 2),
        to: firstMove.substring(2, 4),
      });
      setMoveIndex(1);
      setIsPlayerTurn(true);
      triggerHaptic("light");
      firstMoveTimeoutRef.current = null;
    }, 1200);
  }, [context.assets, puzzleOffset]);

  useEffect(() => {
    const puzzlesData = puzzleMode === "mini" 
      ? context.assets?.miniPuzzles as PuzzlesData | undefined
      : context.assets?.fullBoardPuzzles as PuzzlesData | undefined;
    if (puzzlesData?.puzzles && isLoading && !currentPuzzle && !loadError) {
      loadPuzzle(selectedDifficulty, puzzleMode);
    }
  }, [context.assets, isLoading, currentPuzzle, selectedDifficulty, puzzleMode, loadPuzzle, loadError]);

  useEffect(() => {
    return () => {
      if (firstMoveTimeoutRef.current) clearTimeout(firstMoveTimeoutRef.current);
      if (opponentMoveTimeoutRef.current) clearTimeout(opponentMoveTimeoutRef.current);
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, []);

  const resetPuzzleState = useCallback(() => {
    if (firstMoveTimeoutRef.current) {
      clearTimeout(firstMoveTimeoutRef.current);
      firstMoveTimeoutRef.current = null;
    }
    if (opponentMoveTimeoutRef.current) {
      clearTimeout(opponentMoveTimeoutRef.current);
      opponentMoveTimeoutRef.current = null;
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    setCurrentPuzzle(null);
    setBoard([]);
    setMoves([]);
    setMoveIndex(0);
    setIsPlayerTurn(false);
    setSelectedSquare(null);
    setPuzzleSolved(false);
    setWrongMove(false);
    setLastMove(null);
    setAttempts(0);
    setHintSquare(null);
    setLoadError(null);
    piecesRef.current = [];
  }, []);

  const selectDifficulty = useCallback((difficulty: Difficulty) => {
    if (difficulty === selectedDifficulty && !puzzleSolved) return;
    triggerHaptic("light");
    setSelectedDifficulty(difficulty);
    resetPuzzleState();
    setIsLoading(true);
    loadTimeoutRef.current = setTimeout(() => {
      loadPuzzle(difficulty, puzzleMode);
      loadTimeoutRef.current = null;
    }, 100);
  }, [selectedDifficulty, puzzleSolved, puzzleMode, loadPuzzle, resetPuzzleState]);

  const openSettingsModal = useCallback(() => {
    triggerHaptic("light");
    setShowSettingsModal(true);
  }, []);

  const togglePuzzleMode = useCallback(() => {
    const newMode: PuzzleMode = puzzleMode === "mini" ? "full" : "mini";
    triggerHaptic("light");
    setPuzzleMode(newMode);
    resetPuzzleState();
    setIsLoading(true);
    loadTimeoutRef.current = setTimeout(() => {
      loadPuzzle(selectedDifficulty, newMode);
      loadTimeoutRef.current = null;
    }, 100);
  }, [puzzleMode, selectedDifficulty, loadPuzzle, resetPuzzleState]);

  useEffect(() => {
    const difficultyLabel = DIFFICULTIES.find(d => d.key === selectedDifficulty)?.label || "Casual";
    const titleText = currentPuzzle 
      ? `${difficultyLabel} - Rating ${currentPuzzle.rating}`
      : `Daily Chess Puzzles`;

    setConfig({
      headerMode: "default",
      title: titleText,
      showSettings: showSettings ?? true,
      onSettings: onSettings ?? openSettingsModal,
    });
  }, [currentPuzzle, selectedDifficulty, setConfig, showSettings, onSettings, openSettingsModal]);

  const getValidMovesForSquare = useCallback((square: string): string[] => {
    if (!isPlayerTurn || puzzleSolved || moveIndex >= moves.length) return [];

    const expectedMove = moves[moveIndex];
    const from = expectedMove.substring(0, 2);

    if (square === from) {
      return [expectedMove.substring(2, 4)];
    }

    return [];
  }, [isPlayerTurn, puzzleSolved, moveIndex, moves]);

  const handleSquarePress = useCallback((square: string) => {
    if (!isPlayerTurn || puzzleSolved) return;

    const [row, col] = squareToCoords(square);
    const piece = board[row][col];

    if (selectedSquare) {
      const expectedMove = moves[moveIndex];
      const attemptedMove = selectedSquare + square;

      if (attemptedMove.substring(0, 4) === expectedMove.substring(0, 4)) {
        triggerHaptic("success");

        const newBoard = applyMove(board, expectedMove);
        setBoard(newBoard);
        setLastMove({ from: selectedSquare, to: square });
        setSelectedSquare(null);

        if (moveIndex + 1 >= moves.length) {
          setPuzzleSolved(true);
          successScale.value = withSequence(
            withTiming(1.05, { duration: 300, easing: Easing.out(Easing.ease) }),
            withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) })
          );
        } else {
          setIsPlayerTurn(false);
          setMoveIndex(moveIndex + 1);

          if (opponentMoveTimeoutRef.current) {
            clearTimeout(opponentMoveTimeoutRef.current);
          }
          opponentMoveTimeoutRef.current = setTimeout(() => {
            const opponentMove = moves[moveIndex + 1];
            if (opponentMove) {
              const afterOpponentBoard = applyMove(newBoard, opponentMove);
              setBoard(afterOpponentBoard);
              setLastMove({
                from: opponentMove.substring(0, 2),
                to: opponentMove.substring(2, 4),
              });
              setMoveIndex(moveIndex + 2);
              setIsPlayerTurn(true);
              triggerHaptic("light");

              if (moveIndex + 2 >= moves.length) {
                setPuzzleSolved(true);
                successScale.value = withSequence(
                  withTiming(1.05, { duration: 300, easing: Easing.out(Easing.ease) }),
                  withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) })
                );
              }
            }
            opponentMoveTimeoutRef.current = null;
          }, 900);
        }
      } else {
        if (piece && isPlayerPiece(piece)) {
          setSelectedSquare(square);
          triggerHaptic("light");
        } else {
          triggerHaptic("soft");
          setWrongMove(true);
          setAttempts(a => a + 1);
          boardOpacity.value = withSequence(
            withTiming(0.7, { duration: 150, easing: Easing.out(Easing.ease) }),
            withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) })
          );
          setTimeout(() => setWrongMove(false), 2000);
          setSelectedSquare(null);
        }
      }
    } else {
      if (piece && isPlayerPiece(piece)) {
        setSelectedSquare(square);
        triggerHaptic("light");
      }
    }
  }, [selectedSquare, board, moves, moveIndex, isPlayerTurn, puzzleSolved]);

  const handleDragMove = useCallback((fromSquare: string, toSquare: string) => {
    if (!isPlayerTurn || puzzleSolved) return;

    const expectedMove = moves[moveIndex];
    const attemptedMove = fromSquare + toSquare;

    if (attemptedMove.substring(0, 4) === expectedMove.substring(0, 4)) {
      triggerHaptic("success");

      const newBoard = applyMove(board, expectedMove);
      setBoard(newBoard);
      setLastMove({ from: fromSquare, to: toSquare });
      setSelectedSquare(null);

      if (moveIndex + 1 >= moves.length) {
        setPuzzleSolved(true);
        successScale.value = withSequence(
          withTiming(1.05, { duration: 300, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) })
        );
      } else {
        setIsPlayerTurn(false);
        setMoveIndex(moveIndex + 1);

        if (opponentMoveTimeoutRef.current) {
          clearTimeout(opponentMoveTimeoutRef.current);
        }
        opponentMoveTimeoutRef.current = setTimeout(() => {
          const opponentMove = moves[moveIndex + 1];
          if (opponentMove) {
            const afterOpponentBoard = applyMove(newBoard, opponentMove);
            setBoard(afterOpponentBoard);
            setLastMove({
              from: opponentMove.substring(0, 2),
              to: opponentMove.substring(2, 4),
            });
            setMoveIndex(moveIndex + 2);
            setIsPlayerTurn(true);
            triggerHaptic("light");

            if (moveIndex + 2 >= moves.length) {
              setPuzzleSolved(true);
              successScale.value = withSequence(
                withTiming(1.05, { duration: 300, easing: Easing.out(Easing.ease) }),
                withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) })
              );
            }
          }
          opponentMoveTimeoutRef.current = null;
        }, 900);
      }
    } else {
      triggerHaptic("soft");
      setWrongMove(true);
      setAttempts(a => a + 1);
      boardOpacity.value = withSequence(
        withTiming(0.7, { duration: 150, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) })
      );
      setTimeout(() => setWrongMove(false), 2000);
    }
  }, [board, moves, moveIndex, isPlayerTurn, puzzleSolved]);

  const isPlayerPiece = (piece: string): boolean => {
    const isWhitePiece = piece === piece.toUpperCase();
    return playerIsWhite === isWhitePiece;
  };

  const handleComplete = () => {
    triggerHaptic("success");
    onComplete({
      content: {
        type: "text",
        value: `Solved ${selectedDifficulty} puzzle in ${attempts + 1} attempt${attempts === 0 ? "" : "s"}!`,
      },
      metadata: {
        completedAt: Date.now(),
        difficulty: selectedDifficulty,
        puzzleId: currentPuzzle?.id,
        attempts: attempts + 1,
      },
    });
  };

  const handleTryAnother = () => {
    // Use random offset to get a different puzzle
    const newOffset = puzzleOffset + Math.floor(Math.random() * 100) + 1;
    setPuzzleOffset(newOffset);
    resetPuzzleState();
    setIsLoading(true);
    loadTimeoutRef.current = setTimeout(() => {
      loadPuzzle(selectedDifficulty, puzzleMode, newOffset);
      loadTimeoutRef.current = null;
    }, 100);
  };

  const handleHint = () => {
    if (!isPlayerTurn || puzzleSolved) return;
    const expectedMove = moves[moveIndex];
    if (expectedMove) {
      const fromSquare = expectedMove.substring(0, 2);
      setHintSquare(fromSquare);
      triggerHaptic("light");
      setTimeout(() => setHintSquare(null), 3000);
    }
  };

  const validMoves = selectedSquare ? getValidMovesForSquare(selectedSquare) : [];

  if (loadError) {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight }]}>
        <View style={styles.loadingContainer}>
          <Feather name="alert-circle" size={48} color={theme.textSecondary} />
          <ThemedText style={[styles.loadingText, { color: theme.textSecondary }]}>
            {loadError}
          </ThemedText>
          <Pressable
            onPress={() => {
              resetPuzzleState();
              setIsLoading(true);
              loadTimeoutRef.current = setTimeout(() => {
                loadPuzzle(selectedDifficulty, puzzleMode);
                loadTimeoutRef.current = null;
              }, 100);
            }}
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  if (isLoading || !currentPuzzle) {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight }]}>
        <View style={styles.loadingContainer}>
          <Feather name="grid" size={48} color={theme.primary} />
          <ThemedText style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading puzzle...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: headerHeight }]}>
      <View style={styles.modeDisplayWidget}>
        <GlassCard style={styles.modeDisplayContainer} noPadding>
          <View style={styles.modeDisplayInner}>
            <ThemedText style={[styles.modeDisplayText, { color: theme.textSecondary }]}>
              Playing {boardSizeLabel} {currentDifficultyInfo.label}
            </ThemedText>
            <Pressable
              onPress={() => setShowSettingsModal(true)}
              style={[styles.changeButton, { backgroundColor: theme.primary + "15" }]}
            >
              <ThemedText style={[styles.changeButtonText, { color: theme.primary }]}>
                Change
              </ThemedText>
              <Feather name="chevron-right" size={16} color={theme.primary} />
            </Pressable>
          </View>
        </GlassCard>
      </View>

      <Animated.View style={[styles.boardWrapper, boardAnimatedStyle]}>
        <ChessBoard
          board={board}
          selectedSquare={selectedSquare}
          validMoves={validMoves}
          lastMove={lastMove}
          hintSquare={hintSquare}
          onSquarePress={handleSquarePress}
          onDragMove={handleDragMove}
          isPlayerTurn={isPlayerTurn}
          flipped={!playerIsWhite}
          puzzleMode={puzzleMode}
          boundingBox={currentPuzzle?.metadata?.bounding_box}
        />
      </Animated.View>

      <View style={styles.statusContainer}>
        {puzzleSolved ? (
          <Animated.View style={successAnimatedStyle}>
            <GlassCard style={styles.successBanner}>
              <View style={styles.successContent}>
                <Feather name="check-circle" size={20} color={theme.success} />
                <ThemedText style={[styles.successText, { color: theme.success }]}>
                  Puzzle Solved!
                </ThemedText>
              </View>
            </GlassCard>
          </Animated.View>
        ) : wrongMove ? (
          <View style={styles.statusMessage}>
            <ThemedText style={[styles.statusText, { color: theme.textSecondary }]}>
              Not quite - try again
            </ThemedText>
          </View>
        ) : (
          <View style={styles.statusMessage}>
            <ThemedText style={[styles.statusText, { color: theme.textSecondary }]}>
              {isPlayerTurn ? "Find the best move" : "Opponent moving..."}
            </ThemedText>
          </View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.xl }]}>
        {puzzleSolved ? (
          <View style={styles.completedActions}>
            <Pressable
              onPress={handleComplete}
              style={[styles.primaryButton, { backgroundColor: theme.success }]}
            >
              <ThemedText style={styles.primaryButtonText}>Complete</ThemedText>
            </Pressable>
            <Pressable
              onPress={handleTryAnother}
              style={[styles.secondaryButton, { borderColor: theme.border }]}
            >
              <ThemedText style={[styles.secondaryButtonText, { color: theme.text }]}>
                Try Another
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.gameActionsContainer}>
            <View style={styles.gameActions}>
              <View style={styles.leftActions}>
                <Pressable
                  onPress={handleHint}
                  style={[styles.hintButton, { borderColor: theme.border }]}
                  disabled={!isPlayerTurn}
                >
                  <Feather name="eye" size={18} color={theme.primary} />
                  <ThemedText style={[styles.hintButtonText, { color: theme.primary }]}>
                    Hint
                  </ThemedText>
                </Pressable>
              </View>
              <ThemedText style={[styles.attemptsText, { color: theme.textSecondary }]}>
                {attempts === 0 ? "First attempt" : `${attempts} ${attempts === 1 ? "attempt" : "attempts"}`}
              </ThemedText>
            </View>
          </View>
        )}
      </View>

      <SettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        selectedDifficulty={selectedDifficulty}
        onSelectDifficulty={selectDifficulty}
        puzzleMode={puzzleMode}
        onTogglePuzzleMode={togglePuzzleMode}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  retryButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  retryButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    marginTop: "auto",
  },
  boardWrapper: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  boardContainer: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  boardBorder: {
    borderWidth: 2,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  boardRow: {
    flexDirection: "row",
  },
  square: {
    alignItems: "center",
    justifyContent: "center",
  },
  piece: {
    fontWeight: "400",
  },
  validMoveIndicator: {
    position: "absolute",
    width: "35%",
    height: "35%",
    borderRadius: 100,
  },
  piecesLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  animatedPiece: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  statusContainer: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  successContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  successText: {
    fontSize: 16,
    fontWeight: "600",
  },
  statusMessage: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  statusText: {
    fontSize: 15,
    fontWeight: "500",
  },
  primaryButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    minHeight: 52,
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontWeight: "600",
    fontSize: 16,
  },
  completedActions: {
    gap: Spacing.md,
  },
  gameActionsContainer: {
    gap: Spacing.md,
  },
  modeDisplayWidget: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  modeDisplayContainer: {
    borderRadius: BorderRadius.md,
  },
  modeDisplayInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  modeDisplayText: {
    fontSize: 15,
    fontWeight: "500",
  },
  changeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  changeButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  gameActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  hintButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    minHeight: 48,
  },
  hintButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  difficultyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  difficultyButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  attemptsText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
