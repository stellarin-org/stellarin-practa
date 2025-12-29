import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { View, StyleSheet, Pressable, Platform, ScrollView, Dimensions } from "react-native";
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
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaContext, PractaCompleteHandler } from "@/types/flow";

interface MyPractaProps {
  context: PractaContext;
  onComplete: PractaCompleteHandler;
  onSkip?: () => void;
}

type Difficulty = "beginner" | "casual" | "club" | "advanced" | "expert";

interface Puzzle {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  difficulty: number;
}

interface PuzzlesData {
  metadata?: {
    total_puzzles: number;
    description: string;
  };
  puzzles: Record<Difficulty, Puzzle[]>;
}

const DIFFICULTIES: { key: Difficulty; label: string; color: string; icon: string }[] = [
  { key: "beginner", label: "Beginner", color: "#4CAF50", icon: "smile" },
  { key: "casual", label: "Casual", color: "#8BC34A", icon: "coffee" },
  { key: "club", label: "Club", color: "#FF9800", icon: "users" },
  { key: "advanced", label: "Advanced", color: "#FF5722", icon: "target" },
  { key: "expert", label: "Expert", color: "#E91E63", icon: "award" },
];

const PIECE_UNICODE: { [key: string]: string } = {
  K: "\u265A", k: "\u265A",
  Q: "\u265B", q: "\u265B",
  R: "\u265C", r: "\u265C",
  B: "\u265D", b: "\u265D",
  N: "\u265E", n: "\u265E",
  P: "\u265F", p: "\u265F",
};

const getDayOfYear = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

const getDeterministicPuzzleIndex = (difficulty: Difficulty): number => {
  const today = new Date();
  const dayOfYear = getDayOfYear(today);
  const year = today.getFullYear();
  const seed = (year * 365 + dayOfYear) % 1000;
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
  squareSize,
  flipped,
  isPlayerTurn,
  onDragEnd,
  onTap,
}: {
  piece: string;
  pieceRow: number;
  pieceCol: number;
  squareSize: number;
  flipped: boolean;
  isPlayerTurn: boolean;
  onDragEnd: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  onTap: (row: number, col: number) => void;
}) => {
  const displayRow = flipped ? 7 - pieceRow : pieceRow;
  const displayCol = flipped ? 7 - pieceCol : pieceCol;
  
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
    const actualToRow = flipped ? 7 - toDisplayRow : toDisplayRow;
    const actualToCol = flipped ? 7 - toDisplayCol : toDisplayCol;
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
      
      const clampedCol = Math.max(0, Math.min(7, targetDisplayCol));
      const clampedRow = Math.max(0, Math.min(7, targetDisplayRow));
      
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
}) => {
  const { theme } = useTheme();
  const { width } = Dimensions.get("window");
  const boardSize = Math.min(width - Spacing.xl * 2, 360);
  const squareSize = boardSize / 8;

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

  return (
    <View style={[styles.boardContainer, { width: boardSize, height: boardSize }]}>
      <View style={[styles.boardBorder, { borderColor: theme.border }]}>
        {Array.from({ length: 8 }).map((_, displayRowIndex) => (
          <View key={displayRowIndex} style={styles.boardRow}>
            {Array.from({ length: 8 }).map((_, displayColIndex) => {
              const actualRow = flipped ? 7 - displayRowIndex : displayRowIndex;
              const actualCol = flipped ? 7 - displayColIndex : displayColIndex;
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

              const rankNumber = flipped ? displayRowIndex + 1 : 8 - displayRowIndex;
              const fileChar = flipped 
                ? String.fromCharCode(104 - displayColIndex) 
                : String.fromCharCode(97 + displayColIndex);

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
                  {isValidMove ? (
                    <View style={[styles.validMoveIndicator, { backgroundColor: validMoveColor }]} />
                  ) : null}
                  {displayColIndex === 0 ? (
                    <ThemedText
                      style={[
                        styles.coordLabel,
                        styles.rankLabel,
                        { color: isLight ? darkSquare : lightSquare, fontSize: squareSize * 0.18 },
                      ]}
                    >
                      {rankNumber}
                    </ThemedText>
                  ) : null}
                  {displayRowIndex === 7 ? (
                    <ThemedText
                      style={[
                        styles.coordLabel,
                        styles.fileLabel,
                        { color: isLight ? darkSquare : lightSquare, fontSize: squareSize * 0.18 },
                      ]}
                    >
                      {fileChar}
                    </ThemedText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={styles.piecesLayer} pointerEvents="box-none">
          {pieces.map((p) => (
            <DraggablePiece
              key={p.id}
              piece={p.piece}
              pieceRow={p.row}
              pieceCol={p.col}
              squareSize={squareSize}
              flipped={flipped}
              isPlayerTurn={isPlayerTurn}
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
          ))}
        </View>
      </View>
    </View>
  );
};

export default function MyPracta({ context, onComplete, onSkip }: MyPractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null);
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

  const selectDifficulty = useCallback((difficulty: Difficulty) => {
    triggerHaptic("light");
    setSelectedDifficulty(difficulty);
    
    const puzzlesData = context.assets?.puzzles as PuzzlesData | undefined;
    if (!puzzlesData?.puzzles) return;
    
    const puzzles = puzzlesData.puzzles[difficulty];
    const index = getDeterministicPuzzleIndex(difficulty) % puzzles.length;
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
    
    const fenParts = puzzle.fen.split(" ");
    const activeColor = fenParts[1];
    const isWhite = activeColor === "b";
    setPlayerIsWhite(isWhite);
    
    const initialBoard = parseFEN(puzzle.fen);
    setBoard(initialBoard);
    
    setTimeout(() => {
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
    }, 1200);
  }, [context.assets]);

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
          
          setTimeout(() => {
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
        
        setTimeout(() => {
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
    setSelectedDifficulty(null);
    setCurrentPuzzle(null);
    setPuzzleSolved(false);
    setWrongMove(false);
    setSelectedSquare(null);
    setAttempts(0);
    setHintSquare(null);
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
  const difficultyInfo = DIFFICULTIES.find(d => d.key === selectedDifficulty);

  if (!selectedDifficulty) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: theme.primary + "15" }]}>
              <Feather name="grid" size={40} color={theme.primary} />
            </View>
            <ThemedText style={styles.title}>Daily Chess Puzzles</ThemedText>
            <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
              Train your tactics with a new puzzle each day
            </ThemedText>
          </View>

          <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            Choose Your Difficulty
          </ThemedText>

          <View style={styles.difficultyGrid}>
            {DIFFICULTIES.map((diff) => (
              <Pressable
                key={diff.key}
                onPress={() => selectDifficulty(diff.key)}
                style={({ pressed }) => [
                  styles.difficultyCard,
                  {
                    backgroundColor: theme.backgroundDefault,
                    borderColor: theme.border,
                    opacity: pressed ? 0.8 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                <View style={[styles.difficultyIcon, { backgroundColor: diff.color + "20" }]}>
                  <Feather name={diff.icon as any} size={24} color={diff.color} />
                </View>
                <ThemedText style={styles.difficultyLabel}>{diff.label}</ThemedText>
                <View style={[styles.difficultyBadge, { backgroundColor: diff.color }]}>
                  <ThemedText style={styles.difficultyBadgeText}>Today</ThemedText>
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {onSkip ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <Pressable onPress={onSkip} style={styles.skipButton}>
              <ThemedText style={[styles.skipText, { color: theme.textSecondary }]}>
                Skip for now
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.lg }]}>
      <View style={styles.puzzleHeader}>
        <Pressable onPress={handleTryAnother} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.puzzleStats}>
          <View style={[styles.statPill, { backgroundColor: difficultyInfo?.color + "20" }]}>
            <Feather name="layers" size={14} color={difficultyInfo?.color} />
            <ThemedText style={[styles.statPillText, { color: difficultyInfo?.color }]}>
              {difficultyInfo?.label}
            </ThemedText>
          </View>
          {currentPuzzle ? (
            <View style={[styles.statPill, { backgroundColor: theme.primary + "15" }]}>
              <Feather name="bar-chart-2" size={14} color={theme.primary} />
              <ThemedText style={[styles.statPillText, { color: theme.primary }]}>
                {currentPuzzle.rating}
              </ThemedText>
            </View>
          ) : null}
        </View>
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
        />
      </Animated.View>

      <View style={styles.statusContainer}>
        {puzzleSolved ? (
          <Animated.View style={[styles.successBanner, { backgroundColor: theme.success + "20" }, successAnimatedStyle]}>
            <Feather name="check-circle" size={24} color={theme.success} />
            <ThemedText style={[styles.successText, { color: theme.success }]}>
              Puzzle Solved!
            </ThemedText>
          </Animated.View>
        ) : wrongMove ? (
          <View style={[styles.hintBanner, { backgroundColor: theme.textSecondary + "15" }]}>
            <Feather name="refresh-cw" size={18} color={theme.textSecondary} />
            <ThemedText style={[styles.hintText, { color: theme.textSecondary }]}>
              Not quite - try another move
            </ThemedText>
          </View>
        ) : (
          <View style={[styles.hintBanner, { backgroundColor: theme.primary + "15" }]}>
            <Feather name="info" size={20} color={theme.primary} />
            <ThemedText style={[styles.hintText, { color: theme.text }]}>
              {isPlayerTurn ? "Your turn - Find the best move" : "Opponent is moving..."}
            </ThemedText>
          </View>
        )}

      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {puzzleSolved ? (
          <View style={styles.completedActions}>
            <Pressable
              onPress={handleComplete}
              style={[styles.button, { backgroundColor: theme.success }]}
            >
              <ThemedText style={styles.buttonText}>Complete</ThemedText>
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
          <View style={styles.gameActions}>
            <Pressable
              onPress={handleHint}
              style={[styles.hintButton, { backgroundColor: theme.primary + "12", borderColor: theme.primary + "30" }]}
              disabled={!isPlayerTurn}
            >
              <Feather name="eye" size={16} color={theme.primary} />
              <ThemedText style={[styles.hintButtonText, { color: theme.primary }]}>
                Show Hint
              </ThemedText>
            </Pressable>
            <View style={[styles.attemptsPill, { backgroundColor: theme.card }]}>
              <Feather name="target" size={14} color={theme.textSecondary} />
              <ThemedText style={[styles.attemptsText, { color: theme.text }]}>
                {attempts > 0 ? `${attempts} ${attempts === 1 ? "try" : "tries"}` : "First try"}
              </ThemedText>
            </View>
          </View>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing["3xl"],
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing["3xl"],
    marginTop: Spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
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
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.lg,
  },
  difficultyGrid: {
    gap: Spacing.md,
  },
  difficultyCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  difficultyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  difficultyLabel: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    marginLeft: Spacing.md,
  },
  difficultyBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  difficultyBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "white",
    textTransform: "uppercase",
  },
  footer: {
    paddingHorizontal: Spacing.lg,
  },
  skipButton: {
    padding: Spacing.md,
    alignItems: "center",
  },
  skipText: {
    fontSize: 14,
  },
  puzzleHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  backButton: {
    padding: Spacing.sm,
    marginRight: Spacing.sm,
  },
  puzzleStats: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: Spacing.sm,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statPillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  boardWrapper: {
    alignItems: "center",
    marginVertical: Spacing.lg,
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
  coordLabel: {
    position: "absolute",
    fontWeight: "600",
  },
  rankLabel: {
    top: 2,
    left: 3,
  },
  fileLabel: {
    bottom: 1,
    right: 3,
  },
  statusContainer: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  successText: {
    fontSize: 18,
    fontWeight: "600",
  },
  hintBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  hintText: {
    fontSize: 15,
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
  secondaryButton: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontWeight: "600",
    fontSize: 16,
  },
  completedActions: {
    gap: Spacing.sm,
  },
  gameActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  hintButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  hintButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  attemptsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  attemptsText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
