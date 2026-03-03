import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
  withRepeat,
  Easing,
  runOnJS,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { GlassBackground } from "@/components/GlassBackground";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

const API_BASE = "https://stockfish-host-stellarin.replit.app";

const PIECE_UNICODE: Record<string, string> = {
  K: "\u265A\uFE0E", k: "\u265A\uFE0E",
  Q: "\u265B\uFE0E", q: "\u265B\uFE0E",
  R: "\u265C\uFE0E", r: "\u265C\uFE0E",
  B: "\u265D\uFE0E", b: "\u265D\uFE0E",
  N: "\u265E\uFE0E", n: "\u265E\uFE0E",
  P: "\u265F\uFE0E", p: "\u265F\uFE0E",
};

const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9,
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const LIGHT_SQUARE = "#E8D0A9";
const DARK_SQUARE = "#C97B4A";
const VALID_MOVE_COLOR = "rgba(0, 150, 0, 0.4)";
const SELECTED_LIGHT = "#F5F682";
const SELECTED_DARK = "#BBCB2B";
const CHECK_LIGHT = "#FF8888";
const CHECK_DARK = "#DD4444";

type Square = string;
type GameStatus = "playing" | "check" | "checkmate" | "stalemate" | "draw";

interface MoveInfo {
  from: string;
  to: string;
  color: string;
  piece: string;
  promotion?: string;
}

interface GameState {
  fen: string;
  turn: "w" | "b";
  status: GameStatus;
  moveHistory: string[];
  capturedWhite: string[];
  capturedBlack: string[];
}

interface PieceData {
  id: string;
  piece: string;
  row: number;
  col: number;
}

interface DifficultyLevel {
  level: number;
  name: string;
  elo: number;
  description: string;
}

const DIFFICULTIES: DifficultyLevel[] = [
  { level: 1, name: "Beginner", elo: 800, description: "Complete beginner, makes frequent blunders" },
  { level: 2, name: "Novice", elo: 1000, description: "Casual player, misses tactics regularly" },
  { level: 3, name: "Elementary", elo: 1200, description: "Knows basic tactics but inconsistent" },
  { level: 4, name: "Intermediate", elo: 1350, description: "Solid fundamentals, some tactical awareness" },
  { level: 5, name: "Club Player", elo: 1500, description: "Competent club-level player" },
  { level: 6, name: "Strong Club", elo: 1700, description: "Strong club player with good positional sense" },
  { level: 7, name: "Expert", elo: 1900, description: "Expert-level tactical and positional play" },
  { level: 8, name: "Candidate Master", elo: 2100, description: "Near master-level strength" },
  { level: 9, name: "Master", elo: 2400, description: "Master-level play, very few mistakes" },
  { level: 10, name: "Maximum", elo: 3190, description: "Full engine strength, no handicap" },
];

function squareToCoords(square: string): [number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = 8 - parseInt(square[1]);
  return [rank, file];
}

function coordsToSquare(row: number, col: number): string {
  const file = String.fromCharCode(97 + col);
  const rank = 8 - row;
  return `${file}${rank}`;
}

function parseFenToGrid(fen: string): (string | null)[][] {
  const board: (string | null)[][] = [];
  const rows = fen.split(" ")[0].split("/");
  for (const row of rows) {
    const boardRow: (string | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < parseInt(ch); i++) boardRow.push(null);
      } else {
        boardRow.push(ch);
      }
    }
    board.push(boardRow);
  }
  return board;
}

function parseFenToMap(fen: string): Record<string, string> {
  const board: Record<string, string> = {};
  const [placement] = fen.split(" ");
  const rows = placement.split("/");
  for (let r = 0; r < 8; r++) {
    let col = 0;
    for (const ch of rows[r]) {
      if (ch >= "1" && ch <= "8") {
        col += parseInt(ch);
      } else {
        board[FILES[col] + RANKS[r]] = ch;
        col++;
      }
    }
  }
  return board;
}

function getTurnFromFen(fen: string): "w" | "b" {
  return fen.split(" ")[1] as "w" | "b";
}

function formatMoveNotation(from: string, to: string, piece: string, isCapture: boolean): string {
  const pieceChar = piece.toUpperCase();
  const prefix = pieceChar === "P" ? (isCapture ? from[0] : "") : pieceChar;
  const capture = isCapture ? "x" : "";
  return `${prefix}${capture}${to}`;
}

const generatePieceId = () => Math.random().toString(36).substring(2, 9);

function initializePieces(fen: string): PieceData[] {
  const grid = parseFenToGrid(fen);
  const result: PieceData[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = grid[row]?.[col];
      if (piece) {
        result.push({ id: generatePieceId(), piece, row, col });
      }
    }
  }
  return result;
}

function triggerHaptic(style: "light" | "medium" | "heavy" | "soft" | "rigid" | "success" | "warning" | "error" | "selection") {
  if (Platform.OS === "web") return;
  switch (style) {
    case "success": Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
    case "warning": Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); break;
    case "error": Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); break;
    case "selection": Haptics.selectionAsync(); break;
    case "soft": Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft); break;
    case "rigid": Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid); break;
    case "heavy": Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); break;
    case "medium": Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
    default: Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
  }
}

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

  const baseColor = isLight ? DARK_SQUARE : LIGHT_SQUARE;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: baseColor }, animatedStyle]}
    />
  );
};

const DraggablePiece = ({
  piece,
  pieceRow,
  pieceCol,
  displayRow,
  displayCol,
  squareSize,
  isPlayerPiece,
  isPlayerTurn,
  onDragEnd,
  onTap,
  snapVersion,
}: {
  piece: string;
  pieceRow: number;
  pieceCol: number;
  displayRow: number;
  displayCol: number;
  squareSize: number;
  isPlayerPiece: boolean;
  isPlayerTurn: boolean;
  onDragEnd: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  onTap: (row: number, col: number) => void;
  snapVersion: number;
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
    } else {
      isDragging.current = false;
      translateX.value = withTiming(targetX, { duration: 300, easing: Easing.out(Easing.cubic) });
      translateY.value = withTiming(targetY, { duration: 300, easing: Easing.out(Easing.cubic) });
    }
  }, [displayRow, displayCol, squareSize, snapVersion]);

  const handleDragEndJS = (toDisplayRow: number, toDisplayCol: number) => {
    onDragEnd(pieceRow, pieceCol, toDisplayRow, toDisplayCol);
  };

  const handleTapJS = () => {
    onTap(pieceRow, pieceCol);
  };

  const triggerLightHaptic = () => {
    triggerHaptic("light");
  };

  const canDrag = isPlayerPiece && isPlayerTurn;

  const panGesture = Gesture.Pan()
    .enabled(canDrag)
    .onStart(() => {
      isDragging.current = true;
      scale.value = withSpring(1.15);
      zIndex.value = 100;
      runOnJS(triggerLightHaptic)();
    })
    .onUpdate((event) => {
      translateX.value = baseX + event.translationX;
      translateY.value = baseY + event.translationY;
    })
    .onEnd((event) => {
      isDragging.current = false;
      const finalX = baseX + event.translationX;
      const finalY = baseY + event.translationY;

      const targetCol = Math.max(0, Math.min(7, Math.round(finalX / squareSize)));
      const targetRow = Math.max(0, Math.min(7, Math.round(finalY / squareSize)));

      scale.value = withSpring(1);
      zIndex.value = 1;

      const targetSnapX = targetCol * squareSize;
      const targetSnapY = targetRow * squareSize;
      translateX.value = withSpring(targetSnapX, { damping: 20, stiffness: 200 });
      translateY.value = withSpring(targetSnapY, { damping: 20, stiffness: 200 });

      runOnJS(handleDragEndJS)(targetRow, targetCol);
    });

  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(handleTapJS)();
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

  const isWhite = piece === piece.toUpperCase();

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
              color: isWhite ? "#FFFFFF" : "#000000",
            },
          ]}
        >
          {PIECE_UNICODE[piece]}
        </ThemedText>
      </Animated.View>
    </GestureDetector>
  );
};

const ChessBoard = ({
  fen,
  selectedSquare,
  legalTargets,
  lastMove,
  inCheckKing,
  playerColor,
  isPlayerTurn,
  isThinking,
  onSquarePress,
  onDragMove,
  piecesRef,
  snapVersion,
  hintMove,
}: {
  fen: string;
  selectedSquare: string | null;
  legalTargets: Set<string>;
  lastMove: { from: string; to: string } | null;
  inCheckKing: string | null;
  playerColor: "w" | "b";
  isPlayerTurn: boolean;
  isThinking: boolean;
  onSquarePress: (square: string) => void;
  onDragMove: (fromSquare: string, toSquare: string) => void;
  piecesRef: React.MutableRefObject<PieceData[]>;
  piecesVersion: number;
  snapVersion: number;
  hintMove: { from: string; to: string } | null;
}) => {
  const { theme } = useTheme();
  const { width } = Dimensions.get("window");
  const maxBoardWidth = Math.min(width - Spacing.xl * 2, 400);
  const squareSize = maxBoardWidth / 8;
  const boardWidth = squareSize * 8;

  const flipped = playerColor === "b";

  const handleDragEnd = useCallback((fromRow: number, fromCol: number, toDisplayRow: number, toDisplayCol: number) => {
    const actualToRow = flipped ? 7 - toDisplayRow : toDisplayRow;
    const actualToCol = flipped ? 7 - toDisplayCol : toDisplayCol;
    const fromSquare = coordsToSquare(fromRow, fromCol);
    const toSquare = coordsToSquare(actualToRow, actualToCol);
    onDragMove(fromSquare, toSquare);
  }, [flipped, onDragMove]);

  const handleTap = useCallback((row: number, col: number) => {
    const square = coordsToSquare(row, col);
    onSquarePress(square);
  }, [onSquarePress]);

  const rows = [];
  for (let displayRow = 0; displayRow < 8; displayRow++) {
    const actualRow = flipped ? 7 - displayRow : displayRow;
    const cols = [];
    for (let displayCol = 0; displayCol < 8; displayCol++) {
      const actualCol = flipped ? 7 - displayCol : displayCol;
      const sq = coordsToSquare(actualRow, actualCol);
      const isLight = (actualRow + actualCol) % 2 === 0;
      const isSelected = selectedSquare === sq;
      const isLegalTarget = legalTargets.has(sq);
      const isLastMove = lastMove?.from === sq || lastMove?.to === sq;
      const isInCheck = sq === inCheckKing;
      const isHintFrom = hintMove?.from === sq;
      const isHintTo = hintMove?.to === sq;

      let bgColor = isLight ? LIGHT_SQUARE : DARK_SQUARE;
      if (isLastMove) bgColor = isLight ? SELECTED_LIGHT : SELECTED_DARK;
      if (isInCheck) bgColor = isLight ? CHECK_LIGHT : CHECK_DARK;

      cols.push(
        <Pressable
          key={sq}
          onPress={() => onSquarePress(sq)}
          style={[styles.square, { width: squareSize, height: squareSize, backgroundColor: bgColor }]}
        >
          {isSelected ? <PulsingHighlight isLight={isLight} /> : null}
          {isHintFrom || isHintTo ? (
            <View style={[styles.hintHighlight, { borderColor: "#3B82F6", borderWidth: isHintTo ? 3 : 2, backgroundColor: "#3B82F620" }]} />
          ) : null}
          {displayCol === 0 ? (
            <ThemedText style={[styles.coordRank, { color: isLight ? DARK_SQUARE : LIGHT_SQUARE, fontSize: squareSize * 0.22 }]}>
              {String(8 - actualRow)}
            </ThemedText>
          ) : null}
          {displayRow === 7 ? (
            <ThemedText style={[styles.coordFile, { color: isLight ? DARK_SQUARE : LIGHT_SQUARE, fontSize: squareSize * 0.22 }]}>
              {String.fromCharCode(97 + actualCol)}
            </ThemedText>
          ) : null}
          {isLegalTarget ? (
            <View style={[styles.validMoveIndicator, { backgroundColor: VALID_MOVE_COLOR }]} />
          ) : null}
        </Pressable>
      );
    }
    rows.push(
      <View key={displayRow} style={styles.boardRow}>{cols}</View>
    );
  }

  const pieceElements = piecesRef.current.map((p) => {
    const displayRow = flipped ? 7 - p.row : p.row;
    const displayCol = flipped ? 7 - p.col : p.col;
    const isWhitePiece = p.piece === p.piece.toUpperCase();
    const isPlayerPiece = (playerColor === "w" && isWhitePiece) || (playerColor === "b" && !isWhitePiece);

    return (
      <DraggablePiece
        key={p.id}
        piece={p.piece}
        pieceRow={p.row}
        pieceCol={p.col}
        displayRow={displayRow}
        displayCol={displayCol}
        squareSize={squareSize}
        isPlayerPiece={isPlayerPiece}
        isPlayerTurn={isPlayerTurn && !isThinking}
        onDragEnd={handleDragEnd}
        onTap={handleTap}
        snapVersion={snapVersion}
      />
    );
  });

  return (
    <View style={[styles.boardBorder, { borderColor: theme.border, width: boardWidth }]}>
      {rows}
      <View style={styles.piecesLayer} pointerEvents="box-none">
        {pieceElements}
      </View>
    </View>
  );
};

export default function MyPracta({ context, onComplete, showSettings, onSettings }: PractaProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();

  const [gameStarted, setGameStarted] = useState(false);
  const [difficulty, setDifficulty] = useState(3);
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w");

  const [game, setGame] = useState<GameState>({
    fen: INITIAL_FEN,
    turn: "w",
    status: "playing",
    moveHistory: [],
    capturedWhite: [],
    capturedBlack: [],
  });

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Set<string>>(new Set());
  const [isThinking, setIsThinking] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [showPromotion, setShowPromotion] = useState<{ from: string; to: string } | null>(null);
  const [allLegalMoves, setAllLegalMoves] = useState<MoveInfo[]>([]);
  const [hintMove, setHintMove] = useState<{ from: string; to: string } | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);

  const boardShake = useSharedValue(0);
  const boardOpacity = useSharedValue(1);
  const scrollRef = useRef<ScrollView>(null);
  const piecesRef = useRef<PieceData[]>([]);
  const prevFenRef = useRef<string>("");
  const [piecesVersion, setPiecesVersion] = useState(0);
  const [snapVersion, setSnapVersion] = useState(0);

  useEffect(() => {
    setConfig({
      headerMode: "default",
      title: "Chess",
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings]);

  useEffect(() => {
    if (!gameStarted) return;
    const currentFen = game.fen;
    if (prevFenRef.current === currentFen) return;

    if (piecesRef.current.length === 0 || prevFenRef.current === "") {
      piecesRef.current = initializePieces(currentFen);
    } else if (lastMove) {
      const [fromRow, fromCol] = squareToCoords(lastMove.from);
      const [toRow, toCol] = squareToCoords(lastMove.to);

      piecesRef.current = piecesRef.current.filter(
        (p) => !(p.row === toRow && p.col === toCol)
      );

      const movedPiece = piecesRef.current.find(
        (p) => p.row === fromRow && p.col === fromCol
      );
      if (movedPiece) {
        movedPiece.row = toRow;
        movedPiece.col = toCol;

        const grid = parseFenToGrid(currentFen);
        const newPieceChar = grid[toRow]?.[toCol];
        if (newPieceChar) movedPiece.piece = newPieceChar;
      }

      const movedPieceLower = movedPiece?.piece.toLowerCase();
      if (movedPieceLower === "p" && lastMove.from[0] !== lastMove.to[0]) {
        const epRow = fromRow;
        const epCol = toCol;
        piecesRef.current = piecesRef.current.filter(
          (p) => !(p.row === epRow && p.col === epCol && p !== movedPiece)
        );
      }

      if (movedPieceLower === "k") {
        const colDiff = toCol - fromCol;
        if (Math.abs(colDiff) === 2) {
          const rookFromCol = colDiff > 0 ? 7 : 0;
          const rookToCol = colDiff > 0 ? 5 : 3;
          const rook = piecesRef.current.find(
            (p) => p.row === fromRow && p.col === rookFromCol
          );
          if (rook) {
            rook.col = rookToCol;
          }
        }
      }

      const finalGrid = parseFenToGrid(currentFen);
      const boardPieceCount = finalGrid.flat().filter(Boolean).length;
      if (boardPieceCount !== piecesRef.current.length) {
        piecesRef.current = initializePieces(currentFen);
      }
    }

    prevFenRef.current = currentFen;
    setPiecesVersion((v) => v + 1);
  }, [game.fen, gameStarted, lastMove]);

  const fetchLegalMoves = useCallback(async (fen: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/moves?fen=${encodeURIComponent(fen)}`);
      const data = await res.json();
      setAllLegalMoves(data.moves || []);
      return data.moves || [];
    } catch {
      setAllLegalMoves([]);
      return [];
    }
  }, []);

  useEffect(() => {
    if (gameStarted && (game.status === "playing" || game.status === "check")) {
      fetchLegalMoves(game.fen);
    }
  }, [game.fen, gameStarted, game.status, fetchLegalMoves]);

  useEffect(() => {
    if (gameStarted && game.turn !== playerColor && (game.status === "playing" || game.status === "check")) {
      makeEngineMove();
    }
  }, [game.turn, gameStarted, game.status, playerColor]);

  const saveGameResult = useCallback(async (won: boolean) => {
    if (!context.storage) return;
    try {
      const prev = await context.storage.get<{ gamesPlayed: number; wins: number }>("stats");
      const stats = prev || { gamesPlayed: 0, wins: 0 };
      stats.gamesPlayed += 1;
      if (won) stats.wins += 1;
      await context.storage.set("stats", stats);
    } catch {}
  }, [context.storage]);

  useEffect(() => {
    if (game.status === "checkmate") {
      const playerWon = game.turn !== playerColor;
      saveGameResult(playerWon);
    }
  }, [game.status]);

  const makeEngineMove = async () => {
    setIsThinking(true);
    try {
      const res = await fetch(`${API_BASE}/api/bestmove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: game.fen, difficulty }),
      });
      const data = await res.json();
      if (data.bestmove) {
        const from = data.bestmove.substring(0, 2);
        const to = data.bestmove.substring(2, 4);
        const promotion = data.bestmove.length > 4 ? data.bestmove[4] : undefined;
        await executeMove(from, to, promotion);
      }
    } catch {}
    setIsThinking(false);
  };

  const requestHint = async () => {
    if (game.turn !== playerColor || isThinking || isLoadingHint) return;
    setIsLoadingHint(true);
    setHintMove(null);
    try {
      const res = await fetch(`${API_BASE}/api/bestmove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: game.fen, difficulty: 10 }),
      });
      const data = await res.json();
      if (data.bestmove) {
        const from = data.bestmove.substring(0, 2);
        const to = data.bestmove.substring(2, 4);
        setHintMove({ from, to });
        setSelectedSquare(from as Square);
        const targets = allLegalMoves.filter((m) => m.from === from).map((m) => m.to);
        setLegalTargets(new Set(targets));
        triggerHaptic("success");
      }
    } catch {}
    setIsLoadingHint(false);
  };

  const executeMove = async (from: string, to: string, promotion?: string) => {
    try {
      const body: any = { fen: game.fen, from, to };
      if (promotion) body.promotion = promotion;

      const res = await fetch(`${API_BASE}/api/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.valid) {
        const boardBefore = parseFenToMap(game.fen);
        const movedPiece = data.move.piece.toLowerCase();
        const isEnPassant = movedPiece === "p" && from[0] !== to[0] && !boardBefore[to];
        const capturedPiece = isEnPassant
          ? (data.move.color === "w" ? "p" : "P")
          : boardBefore[to];
        const isCapture = !!capturedPiece || isEnPassant;
        const moveNotation = formatMoveNotation(from, to, data.move.piece, isCapture);

        let newStatus: GameStatus = "playing";
        if (data.isCheckmate) newStatus = "checkmate";
        else if (data.isGameOver) newStatus = "stalemate";
        else if (data.isCheck) newStatus = "check";

        const newCapturedWhite = [...game.capturedWhite];
        const newCapturedBlack = [...game.capturedBlack];
        if (capturedPiece || isEnPassant) {
          const captured = capturedPiece || (data.move.color === "w" ? "p" : "P");
          if (captured === captured.toUpperCase()) {
            newCapturedBlack.push(captured.toLowerCase());
          } else {
            newCapturedWhite.push(captured);
          }
        }

        setLastMove({ from, to });

        setGame((prev) => ({
          fen: data.fen,
          turn: getTurnFromFen(data.fen),
          status: newStatus,
          moveHistory: [...prev.moveHistory, moveNotation + (data.isCheck && !data.isCheckmate ? "+" : "") + (data.isCheckmate ? "#" : "")],
          capturedWhite: newCapturedWhite,
          capturedBlack: newCapturedBlack,
        }));

        setSelectedSquare(null);
        setLegalTargets(new Set());
        setHintMove(null);

        if (data.isCheck && !data.isCheckmate) {
          triggerHaptic("warning");
          boardShake.value = withSequence(
            withTiming(-3, { duration: 50 }),
            withTiming(3, { duration: 50 }),
            withTiming(-2, { duration: 50 }),
            withTiming(2, { duration: 50 }),
            withTiming(0, { duration: 50 }),
          );
        } else if (data.isCheckmate) {
          triggerHaptic("error");
        } else if (isCapture) {
          triggerHaptic("medium");
        } else {
          triggerHaptic("light");
        }

        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }, 100);

        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const isGameOver = game.status === "checkmate" || game.status === "stalemate" || game.status === "draw";

  const handleSquarePress = useCallback(async (square: Square) => {
    if (game.turn !== playerColor || isThinking || isGameOver) return;

    const boardMap = parseFenToMap(game.fen);
    const piece = boardMap[square];

    if (selectedSquare && legalTargets.has(square)) {
      const selectedPiece = boardMap[selectedSquare];
      if (selectedPiece && (selectedPiece === "P" || selectedPiece === "p")) {
        const targetRank = square[1];
        if ((playerColor === "w" && targetRank === "8") || (playerColor === "b" && targetRank === "1")) {
          setShowPromotion({ from: selectedSquare, to: square });
          return;
        }
      }
      await executeMove(selectedSquare, square);
      return;
    }

    if (piece) {
      const isWhitePiece = piece === piece.toUpperCase();
      const isPlayerPiece = (playerColor === "w" && isWhitePiece) || (playerColor === "b" && !isWhitePiece);

      if (isPlayerPiece) {
        setSelectedSquare(square);
        const targets = allLegalMoves.filter((m) => m.from === square).map((m) => m.to);
        setLegalTargets(new Set(targets));
        triggerHaptic("selection");
        return;
      }
    }

    setSelectedSquare(null);
    setLegalTargets(new Set());
  }, [game.fen, game.turn, playerColor, isThinking, isGameOver, selectedSquare, legalTargets, allLegalMoves]);

  const handleDragMove = useCallback(async (fromSquare: string, toSquare: string) => {
    if (game.turn !== playerColor || isThinking || isGameOver) {
      setSnapVersion((v) => v + 1);
      return;
    }
    if (fromSquare === toSquare) return;

    const boardMap = parseFenToMap(game.fen);
    const piece = boardMap[fromSquare];
    if (!piece) return;

    const isLegal = allLegalMoves.some((m) => m.from === fromSquare && m.to === toSquare);
    if (!isLegal) {
      triggerHaptic("soft");
      boardOpacity.value = withSequence(
        withTiming(0.7, { duration: 150, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) })
      );
      setSnapVersion((v) => v + 1);
      return;
    }

    if ((piece === "P" || piece === "p")) {
      const targetRank = toSquare[1];
      if ((playerColor === "w" && targetRank === "8") || (playerColor === "b" && targetRank === "1")) {
        setShowPromotion({ from: fromSquare, to: toSquare });
        return;
      }
    }

    await executeMove(fromSquare, toSquare);
  }, [game.fen, game.turn, playerColor, isThinking, isGameOver, allLegalMoves]);

  const handlePromotion = async (piece: string) => {
    if (showPromotion) {
      await executeMove(showPromotion.from, showPromotion.to, piece);
      setShowPromotion(null);
    }
  };

  const startGame = () => {
    piecesRef.current = initializePieces(INITIAL_FEN);
    prevFenRef.current = "";
    setGameStarted(true);
    triggerHaptic("medium");
  };

  const resetGame = () => {
    setGame({
      fen: INITIAL_FEN,
      turn: "w",
      status: "playing",
      moveHistory: [],
      capturedWhite: [],
      capturedBlack: [],
    });
    setSelectedSquare(null);
    setLegalTargets(new Set());
    setAllLegalMoves([]);
    setLastMove(null);
    setShowPromotion(null);
    setIsThinking(false);
    piecesRef.current = [];
    prevFenRef.current = "";
    setGameStarted(false);
    triggerHaptic("light");
  };

  const handleComplete = () => {
    triggerHaptic("success");
    onComplete({
      content: {
        type: "text",
        value: game.status === "checkmate"
          ? `Game ended in checkmate after ${game.moveHistory.length} moves`
          : `Chess session completed after ${game.moveHistory.length} moves`,
      },
      metadata: {
        completedAt: Date.now(),
        totalMoves: game.moveHistory.length,
        result: game.status,
      },
    });
  };

  const boardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: boardShake.value }],
    opacity: boardOpacity.value,
  }));

  const boardMap = parseFenToMap(game.fen);
  const findKingSquare = (color: "w" | "b"): string | null => {
    const kingChar = color === "w" ? "K" : "k";
    for (const [sq, piece] of Object.entries(boardMap)) {
      if (piece === kingChar) return sq;
    }
    return null;
  };

  const inCheckKing = game.status === "check" || game.status === "checkmate" ? findKingSquare(game.turn) : null;

  const getCapturedScore = (side: "w" | "b"): number => {
    const captured = side === "w" ? game.capturedWhite : game.capturedBlack;
    return captured.reduce((sum, p) => sum + (PIECE_VALUES[p.toLowerCase()] || 0), 0);
  };

  const whiteScore = getCapturedScore("w");
  const blackScore = getCapturedScore("b");
  const advantage = whiteScore - blackScore;

  if (!gameStarted) {
    return (
      <GlassBackground style={[styles.container, { paddingTop: headerHeight + Spacing.sm }]}>
        <View style={[styles.setupContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.setupHeader}>
            <View style={[styles.iconWrap, { backgroundColor: theme.primary + "15" }]}>
              <ThemedText style={styles.kingIcon}>{PIECE_UNICODE.K}</ThemedText>
            </View>
            <View>
              <ThemedText style={styles.setupTitle}>Chess</ThemedText>
              <ThemedText style={[styles.setupSubtitle, { color: theme.textSecondary }]}>
                vs Stockfish 16
              </ThemedText>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.sectionWrap}>
            <ThemedText style={styles.sectionLabel}>Play as</ThemedText>
            <View style={styles.colorRow}>
              {(["w", "b"] as const).map((c) => (
                <Pressable
                  key={c}
                  onPress={() => { setPlayerColor(c); triggerHaptic("selection"); }}
                  style={[
                    styles.colorOption,
                    {
                      backgroundColor: playerColor === c ? theme.primary + "20" : theme.backgroundSecondary,
                      borderColor: playerColor === c ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <ThemedText style={[styles.colorPiece, { color: c === "w" ? "#FFFFFF" : "#000000" }]}>
                    {PIECE_UNICODE[c === "w" ? "K" : "k"]}
                  </ThemedText>
                  <ThemedText style={[styles.colorLabel, playerColor === c ? { color: theme.primary } : {}]}>
                    {c === "w" ? "White" : "Black"}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.sectionWrap}>
            <ThemedText style={styles.sectionLabel}>Difficulty</ThemedText>
            {(() => {
              const selected = DIFFICULTIES.find((d) => d.level === difficulty) || DIFFICULTIES[2];
              return (
                <>
                  <View style={[styles.diffCard, { backgroundColor: theme.backgroundSecondary, borderColor: theme.primary + "40" }]}>
                    <View style={styles.diffCardTop}>
                      <View>
                        <ThemedText style={[styles.diffCardName, { color: theme.primary }]}>{selected.name}</ThemedText>
                        <ThemedText style={[styles.diffCardDesc, { color: theme.textSecondary }]}>{selected.description}</ThemedText>
                      </View>
                      <View style={[styles.diffCardEloWrap, { backgroundColor: theme.primary + "15" }]}>
                        <ThemedText style={[styles.diffCardElo, { color: theme.primary }]}>{selected.elo}</ThemedText>
                        <ThemedText style={[styles.diffCardEloLabel, { color: theme.primary }]}>Elo</ThemedText>
                      </View>
                    </View>
                    <Slider
                      style={styles.diffSlider}
                      minimumValue={1}
                      maximumValue={10}
                      step={1}
                      value={difficulty}
                      onValueChange={(v) => { setDifficulty(Math.round(v)); triggerHaptic("selection"); }}
                      minimumTrackTintColor={theme.primary}
                      maximumTrackTintColor={theme.border}
                      thumbTintColor={theme.primary}
                    />
                    <View style={styles.diffSliderLabels}>
                      <ThemedText style={[styles.diffSliderLabel, { color: theme.textSecondary }]}>Beginner</ThemedText>
                      <ThemedText style={[styles.diffSliderLabel, { color: theme.textSecondary }]}>Level {difficulty}/10</ThemedText>
                      <ThemedText style={[styles.diffSliderLabel, { color: theme.textSecondary }]}>Maximum</ThemedText>
                    </View>
                  </View>
                </>
              );
            })()}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).duration(400)} style={{ marginTop: Spacing.md }}>
            <Pressable
              onPress={startGame}
              style={[styles.startBtn, { backgroundColor: theme.primary }]}
            >
              <Feather name="play" size={20} color="#FFF" style={{ marginRight: Spacing.sm }} />
              <ThemedText style={styles.startBtnText}>Start Game</ThemedText>
            </Pressable>
          </Animated.View>
        </View>
      </GlassBackground>
    );
  }

  const renderCaptured = (pieces: string[], side: "w" | "b") => {
    if (pieces.length === 0) return null;
    const sorted = [...pieces].sort((a, b) => (PIECE_VALUES[b.toLowerCase()] || 0) - (PIECE_VALUES[a.toLowerCase()] || 0));
    const adv = side === "w" ? advantage : -advantage;
    return (
      <View style={styles.capturedRow}>
        <View style={styles.capturedPieces}>
          {sorted.map((p, i) => (
            <ThemedText key={i} style={[styles.capturedPiece, { color: side === "w" ? "#FFFFFF" : "#000000" }]}>
              {PIECE_UNICODE[side === "w" ? p.toUpperCase() : p.toLowerCase()] || ""}
            </ThemedText>
          ))}
        </View>
        {adv > 0 ? (
          <ThemedText style={[styles.advantageText, { color: theme.textSecondary }]}>
            +{adv}
          </ThemedText>
        ) : null}
      </View>
    );
  };

  const topColor = playerColor === "w" ? "b" : "w";
  const bottomColor = playerColor;
  const topCaptured = topColor === "w" ? game.capturedWhite : game.capturedBlack;
  const bottomCaptured = bottomColor === "w" ? game.capturedWhite : game.capturedBlack;

  return (
    <GlassBackground style={[styles.container, { paddingTop: headerHeight + Spacing.sm }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.gameHeader}>
          <View style={styles.playerInfo}>
            <ThemedText style={[styles.playerPiece, { color: topColor === "w" ? "#FFFFFF" : "#000000" }]}>
              {PIECE_UNICODE[topColor === "w" ? "K" : "k"]}
            </ThemedText>
            <ThemedText style={styles.playerName}>
              {topColor === playerColor ? "You" : "Stockfish"}
            </ThemedText>
            {isThinking && topColor !== playerColor ? (
              <ActivityIndicator size="small" color={theme.primary} style={{ marginLeft: Spacing.sm }} />
            ) : null}
          </View>
          {renderCaptured(topCaptured, topColor)}
        </View>

        <Animated.View style={[styles.boardWrap, boardAnimStyle]}>
          <ChessBoard
            fen={game.fen}
            selectedSquare={selectedSquare}
            legalTargets={legalTargets}
            lastMove={lastMove}
            inCheckKing={inCheckKing}
            playerColor={playerColor}
            isPlayerTurn={game.turn === playerColor}
            isThinking={isThinking}
            onSquarePress={handleSquarePress}
            onDragMove={handleDragMove}
            piecesRef={piecesRef}
            piecesVersion={piecesVersion}
            snapVersion={snapVersion}
            hintMove={hintMove}
          />
        </Animated.View>

        <View style={styles.gameHeader}>
          <View style={styles.playerInfo}>
            <ThemedText style={[styles.playerPiece, { color: bottomColor === "w" ? "#FFFFFF" : "#000000" }]}>
              {PIECE_UNICODE[bottomColor === "w" ? "K" : "k"]}
            </ThemedText>
            <ThemedText style={styles.playerName}>
              {bottomColor === playerColor ? "You" : "Stockfish"}
            </ThemedText>
            {isThinking && bottomColor !== playerColor ? (
              <ActivityIndicator size="small" color={theme.primary} style={{ marginLeft: Spacing.sm }} />
            ) : null}
          </View>
          {renderCaptured(bottomCaptured, bottomColor)}
        </View>

        {isGameOver ? (
          <Animated.View entering={FadeIn.duration(400)} style={[styles.resultCard, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
            <ThemedText style={styles.resultTitle}>
              {game.status === "checkmate"
                ? game.turn === playerColor
                  ? "Stockfish wins"
                  : "You win!"
                : "Draw"}
            </ThemedText>
            <ThemedText style={[styles.resultSub, { color: theme.textSecondary }]}>
              {game.status === "checkmate" ? "Checkmate" : game.status === "stalemate" ? "Stalemate" : "Game drawn"}
              {" \u00B7 "}
              {game.moveHistory.length} moves
            </ThemedText>
            <View style={styles.resultBtns}>
              <Pressable
                onPress={resetGame}
                style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              >
                <Feather name="rotate-ccw" size={16} color="#FFF" />
                <ThemedText style={styles.primaryButtonText}>New Game</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleComplete}
                style={[styles.secondaryButton, { borderColor: theme.border }]}
              >
                <Feather name="check" size={16} color={theme.text} />
                <ThemedText style={[styles.secondaryButtonText, { color: theme.text }]}>Done</ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        ) : null}

        {game.status === "check" ? (
          <View style={[styles.checkBanner, { backgroundColor: theme.error + "15" }]}>
            <Feather name="alert-triangle" size={14} color={theme.error} />
            <ThemedText style={[styles.checkText, { color: theme.error }]}>Check!</ThemedText>
          </View>
        ) : null}

        {game.moveHistory.length > 0 ? (
          <View style={[styles.movesCard, { backgroundColor: theme.backgroundSecondary }]}>
            <ThemedText style={[styles.movesTitle, { color: theme.textSecondary }]}>Moves</ThemedText>
            <View style={styles.movesGrid}>
              {Array.from({ length: Math.ceil(game.moveHistory.length / 2) }).map((_, i) => (
                <View key={i} style={styles.moveRow}>
                  <ThemedText style={[styles.moveNum, { color: theme.textSecondary }]}>{i + 1}.</ThemedText>
                  <ThemedText style={styles.moveText}>{game.moveHistory[i * 2]}</ThemedText>
                  {game.moveHistory[i * 2 + 1] ? (
                    <ThemedText style={styles.moveText}>{game.moveHistory[i * 2 + 1]}</ThemedText>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          {!isGameOver && game.turn === playerColor ? (
            <Pressable
              onPress={requestHint}
              disabled={isLoadingHint || isThinking}
              style={[styles.actionBtn, { backgroundColor: theme.backgroundSecondary, opacity: isLoadingHint || isThinking ? 0.5 : 1 }]}
            >
              <Feather name={isLoadingHint ? "loader" : "compass"} size={16} color="#3B82F6" />
              <ThemedText style={[styles.actionBtnText, { color: "#3B82F6" }]}>
                {isLoadingHint ? "Thinking..." : "Hint"}
              </ThemedText>
            </Pressable>
          ) : null}
          <Pressable
            onPress={resetGame}
            style={[styles.actionBtn, { backgroundColor: theme.backgroundSecondary }]}
          >
            <Feather name="rotate-ccw" size={16} color={theme.text} />
            <ThemedText style={styles.actionBtnText}>New Game</ThemedText>
          </Pressable>
        </View>
      </ScrollView>

      {showPromotion ? (
        <View style={styles.promoOverlay}>
          <View style={[styles.promoCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
            <ThemedText style={styles.promoTitle}>Promote pawn</ThemedText>
            <View style={styles.promoRow}>
              {["q", "r", "b", "n"].map((p) => (
                <Pressable
                  key={p}
                  onPress={() => handlePromotion(p)}
                  style={[styles.promoBtn, { backgroundColor: theme.backgroundSecondary }]}
                >
                  <ThemedText style={[styles.promoPiece, { color: playerColor === "w" ? "#FFFFFF" : "#000000" }]}>
                    {PIECE_UNICODE[playerColor === "w" ? p.toUpperCase() : p] || ""}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      ) : null}
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  setupContent: {
    paddingHorizontal: Spacing.xl,
    flex: 1,
    justifyContent: "center",
  },
  setupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  kingIcon: {
    fontSize: 30,
    color: "#FFFFFF",
  },
  setupTitle: {
    fontSize: 26,
    fontWeight: "700",
  },
  setupSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  sectionWrap: {
    width: "100%",
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  colorRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  colorOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
  },
  colorPiece: {
    fontSize: 28,
  },
  colorLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  diffCard: {
    width: "100%",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  diffCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  diffCardName: {
    fontSize: 16,
    fontWeight: "700",
  },
  diffCardDesc: {
    fontSize: 12,
    marginTop: 2,
    maxWidth: "80%",
  },
  diffCardEloWrap: {
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    minWidth: 52,
  },
  diffCardElo: {
    fontSize: 16,
    fontWeight: "700",
  },
  diffCardEloLabel: {
    fontSize: 10,
    fontWeight: "500",
    opacity: 0.7,
  },
  diffSlider: {
    width: "100%",
    height: 36,
  },
  diffSliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -4,
  },
  diffSliderLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing["3xl"],
    borderRadius: BorderRadius.md,
    minHeight: 52,
  },
  startBtnText: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "600",
  },
  gameHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerPiece: {
    fontSize: 22,
    marginRight: Spacing.sm,
  },
  playerName: {
    fontSize: 15,
    fontWeight: "600",
  },
  capturedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    paddingLeft: Spacing["3xl"],
  },
  capturedPieces: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  capturedPiece: {
    fontSize: 14,
    marginRight: 1,
  },
  advantageText: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: Spacing.xs,
  },
  boardWrap: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
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
    position: "relative",
  },
  piece: {
    fontWeight: "400",
    textAlign: "center",
    ...Platform.select({
      web: { userSelect: "none" as any },
      default: {},
    }),
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
  coordRank: {
    position: "absolute",
    top: 1,
    left: 2,
    fontWeight: "700",
    opacity: 0.7,
  },
  coordFile: {
    position: "absolute",
    bottom: 1,
    right: 2,
    fontWeight: "700",
    opacity: 0.7,
  },
  validMoveIndicator: {
    position: "absolute",
    width: "35%",
    height: "35%",
    borderRadius: 100,
  },
  hintHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 2,
  },
  checkBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  checkText: {
    fontWeight: "600",
    fontSize: 14,
  },
  resultCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: "700",
  },
  resultSub: {
    fontSize: 14,
    marginTop: Spacing.xs,
  },
  resultBtns: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
    minHeight: 48,
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 14,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.xs,
    minHeight: 48,
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontWeight: "600",
    fontSize: 14,
  },
  movesCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  movesTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  movesGrid: {
    gap: 2,
  },
  moveRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  moveNum: {
    width: 28,
    fontSize: 13,
    fontWeight: "500",
  },
  moveText: {
    fontSize: 13,
    fontWeight: "500",
    width: 60,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.lg,
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "500",
  },
  promoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  promoCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: "center",
  },
  promoTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: Spacing.lg,
  },
  promoRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  promoBtn: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  promoPiece: {
    fontSize: 36,
  },
});
