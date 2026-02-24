import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  withDelay,
  Easing,
  runOnJS,
  interpolateColor,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { GlassBackground } from "@/components/GlassBackground";
import { useTheme } from "@/hooks/useTheme";
import { useHaptics } from "@/hooks/useHaptics";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

type Direction = "up" | "down" | "left" | "right";
type DifficultyKey = "easy" | "medium" | "hard" | "expert";

interface DifficultyConfig {
  label: string;
  gridSize: number;
  target: number;
  description: string;
}

const DIFFICULTIES: Record<DifficultyKey, DifficultyConfig> = {
  easy: { label: "Easy", gridSize: 5, target: 256, description: "5x5 grid" },
  medium: { label: "Medium", gridSize: 4, target: 512, description: "4x4 grid" },
  hard: { label: "Hard", gridSize: 4, target: 2048, description: "4x4 grid" },
  expert: { label: "Expert", gridSize: 3, target: 512, description: "3x3 grid" },
};

const DIFFICULTY_ORDER: DifficultyKey[] = ["easy", "medium", "hard", "expert"];

interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
  prevRow?: number;
  prevCol?: number;
  mergedFrom?: boolean;
  isNew?: boolean;
}

interface StoredScores {
  easy: number;
  medium: number;
  hard: number;
  expert: number;
  gamesPlayed: number;
  gamesWon: number;
}

const DEFAULT_SCORES: StoredScores = {
  easy: 0,
  medium: 0,
  hard: 0,
  expert: 0,
  gamesPlayed: 0,
  gamesWon: 0,
};

let nextTileId = 1;

function createEmptyGrid(size: number): (Tile | null)[][] {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function getEmptyCells(grid: (Tile | null)[][]): { row: number; col: number }[] {
  const empty: { row: number; col: number }[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (!grid[r][c]) empty.push({ row: r, col: c });
    }
  }
  return empty;
}

function getSpawnValue(highestTile: number): number {
  const tiers: { threshold: number; values: number[] }[] = [
    { threshold: 256, values: [2, 4, 8, 16] },
    { threshold: 128, values: [2, 4, 8] },
    { threshold: 64, values: [2, 4] },
  ];
  for (const tier of tiers) {
    if (highestTile >= tier.threshold) {
      const vals = tier.values;
      const weights = vals.map((v) => {
        const ratio = highestTile / v;
        return Math.max(1, Math.pow(ratio, 1.5));
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      for (let i = 0; i < vals.length; i++) {
        r -= weights[i];
        if (r <= 0) return vals[i];
      }
      return vals[0];
    }
  }
  return Math.random() < 0.9 ? 2 : 4;
}

function addRandomTile(grid: (Tile | null)[][]): (Tile | null)[][] {
  const empty = getEmptyCells(grid);
  if (empty.length === 0) return grid;
  const { row, col } = empty[Math.floor(Math.random() * empty.length)];
  const highest = getHighestTile(grid);
  const newGrid = grid.map((r) => [...r]);
  newGrid[row][col] = {
    id: nextTileId++,
    value: getSpawnValue(highest),
    row,
    col,
    isNew: true,
  };
  return newGrid;
}

function initializeGrid(size: number): (Tile | null)[][] {
  let grid = createEmptyGrid(size);
  grid = addRandomTile(grid);
  grid = addRandomTile(grid);
  return grid;
}

function cloneGrid(grid: (Tile | null)[][]): (Tile | null)[][] {
  return grid.map((row) =>
    row.map((cell) => (cell ? { ...cell, mergedFrom: false, isNew: false, prevRow: cell.row, prevCol: cell.col } : null))
  );
}

function moveGrid(
  grid: (Tile | null)[][],
  direction: Direction
): { grid: (Tile | null)[][]; score: number; moved: boolean } {
  const size = grid.length;
  let newGrid = cloneGrid(grid);
  let score = 0;
  let moved = false;

  const processLine = (line: (Tile | null)[]): { result: (Tile | null)[]; lineScore: number; lineMoved: boolean } => {
    const tiles = line.filter((t) => t !== null) as Tile[];
    const result: (Tile | null)[] = [];
    let lineScore = 0;
    let lineMoved = false;
    let i = 0;

    while (i < tiles.length) {
      if (i + 1 < tiles.length && tiles[i].value === tiles[i + 1].value) {
        const mergedValue = tiles[i].value * 2;
        const sourceTile = tiles[i + 1];
        result.push({
          id: nextTileId++,
          value: mergedValue,
          row: 0,
          col: 0,
          mergedFrom: true,
          prevRow: sourceTile.prevRow !== undefined ? sourceTile.prevRow : sourceTile.row,
          prevCol: sourceTile.prevCol !== undefined ? sourceTile.prevCol : sourceTile.col,
        });
        lineScore += mergedValue;
        lineMoved = true;
        i += 2;
      } else {
        result.push({ ...tiles[i] });
        i++;
      }
    }

    while (result.length < line.length) {
      result.push(null);
    }

    for (let j = 0; j < line.length; j++) {
      const orig = line[j];
      const res = result[j];
      if ((orig === null) !== (res === null)) lineMoved = true;
      else if (orig && res && orig.id !== res.id) lineMoved = true;
    }

    return { result, lineScore, lineMoved };
  };

  if (direction === "left") {
    for (let r = 0; r < size; r++) {
      const line = newGrid[r];
      const { result, lineScore, lineMoved } = processLine(line);
      result.forEach((t, c) => { if (t) { t.row = r; t.col = c; } });
      newGrid[r] = result;
      score += lineScore;
      if (lineMoved) moved = true;
    }
  } else if (direction === "right") {
    for (let r = 0; r < size; r++) {
      const line = [...newGrid[r]].reverse();
      const { result, lineScore, lineMoved } = processLine(line);
      const reversed = result.reverse();
      reversed.forEach((t, c) => { if (t) { t.row = r; t.col = c; } });
      newGrid[r] = reversed;
      score += lineScore;
      if (lineMoved) moved = true;
    }
  } else if (direction === "up") {
    for (let c = 0; c < size; c++) {
      const line = [];
      for (let r = 0; r < size; r++) line.push(newGrid[r][c]);
      const { result, lineScore, lineMoved } = processLine(line);
      result.forEach((t, r) => {
        if (t) { t.row = r; t.col = c; }
        newGrid[r][c] = t;
      });
      score += lineScore;
      if (lineMoved) moved = true;
    }
  } else {
    for (let c = 0; c < size; c++) {
      const line = [];
      for (let r = size - 1; r >= 0; r--) line.push(newGrid[r][c]);
      const { result, lineScore, lineMoved } = processLine(line);
      const reversed = result.reverse();
      reversed.forEach((t, r) => {
        if (t) { t.row = r; t.col = c; }
        newGrid[r][c] = t;
      });
      score += lineScore;
      if (lineMoved) moved = true;
    }
  }

  return { grid: newGrid, score, moved };
}

function hasMovesLeft(grid: (Tile | null)[][]): boolean {
  const size = grid.length;
  if (getEmptyCells(grid).length > 0) return true;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = grid[r][c]?.value;
      if (val === undefined) continue;
      if (c + 1 < size && grid[r][c + 1]?.value === val) return true;
      if (r + 1 < size && grid[r + 1]?.[c]?.value === val) return true;
    }
  }
  return false;
}

const ALL_DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

function evaluateGrid(grid: (Tile | null)[][]): number {
  const size = grid.length;
  let score = 0;
  const emptyCells = getEmptyCells(grid).length;
  score += emptyCells * 10;
  let maxVal = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = grid[r][c]?.value ?? 0;
      if (val > maxVal) maxVal = val;
      if (c + 1 < size) {
        const neighbor = grid[r][c + 1]?.value ?? 0;
        if (val === neighbor && val > 0) score += val * 2;
      }
      if (r + 1 < size) {
        const neighbor = grid[r + 1]?.[c]?.value ?? 0;
        if (val === neighbor && val > 0) score += val * 2;
      }
    }
  }
  score += maxVal;
  const corners = [
    grid[0]?.[0],
    grid[0]?.[size - 1],
    grid[size - 1]?.[0],
    grid[size - 1]?.[size - 1],
  ];
  for (const corner of corners) {
    if (corner?.value === maxVal) {
      score += maxVal * 3;
      break;
    }
  }
  return score;
}

function findBestMove(grid: (Tile | null)[][], depth: number = 3): Direction | null {
  let bestDir: Direction | null = null;
  let bestScore = -Infinity;

  for (const dir of ALL_DIRECTIONS) {
    const result = moveGrid(grid, dir);
    if (!result.moved) continue;
    const afterSpawn = addRandomTile(result.grid);
    let moveScore = result.score + evaluateGrid(afterSpawn);
    if (depth > 1) {
      let futureScore = 0;
      let futureCount = 0;
      for (const nextDir of ALL_DIRECTIONS) {
        const nextResult = moveGrid(afterSpawn, nextDir);
        if (!nextResult.moved) continue;
        futureScore += nextResult.score + evaluateGrid(nextResult.grid);
        futureCount++;
      }
      if (futureCount > 0) moveScore += (futureScore / futureCount) * 0.5;
    }
    if (moveScore > bestScore) {
      bestScore = moveScore;
      bestDir = dir;
    }
  }
  return bestDir;
}

function getHighestTile(grid: (Tile | null)[][]): number {
  let max = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell && cell.value > max) max = cell.value;
    }
  }
  return max;
}

function getTileColors(
  value: number,
  theme: any
): { bg: string; text: string; glow: string } {
  const isDark = theme.backgroundRoot === "#1A1A1A";
  const colors: Record<number, { bg: string; text: string; glow: string }> = isDark
    ? {
        2: { bg: "#3D3D4A", text: "#E0E0EA", glow: "#5A5A6A" },
        4: { bg: "#4A4540", text: "#F0E8D8", glow: "#6A6050" },
        8: { bg: "#C47234", text: "#FFFFFF", glow: "#E89050" },
        16: { bg: "#D46830", text: "#FFFFFF", glow: "#F08848" },
        32: { bg: "#E05535", text: "#FFFFFF", glow: "#FF7755" },
        64: { bg: "#E83C28", text: "#FFFFFF", glow: "#FF5540" },
        128: { bg: "#E8B830", text: "#FFFFFF", glow: "#FFD850" },
        256: { bg: "#46B87A", text: "#FFFFFF", glow: "#60E098" },
        512: { bg: "#3898D8", text: "#FFFFFF", glow: "#58B8F8" },
        1024: { bg: "#8850D0", text: "#FFFFFF", glow: "#A870F0" },
        2048: { bg: "#E83888", text: "#FFFFFF", glow: "#FF58A8" },
        4096: { bg: "#D02020", text: "#FFFFFF", glow: "#FF4040" },
        8192: { bg: "#18B8B8", text: "#FFFFFF", glow: "#40E8E8" },
      }
    : {
        2: { bg: "#EEE4DA", text: "#776E65", glow: "#EEE4DA" },
        4: { bg: "#ECE0CA", text: "#776E65", glow: "#ECE0CA" },
        8: { bg: "#F5A862", text: "#FFFFFF", glow: "#F5C89A" },
        16: { bg: "#F48952", text: "#FFFFFF", glow: "#F8B088" },
        32: { bg: "#F06848", text: "#FFFFFF", glow: "#F89878" },
        64: { bg: "#EE4828", text: "#FFFFFF", glow: "#F87858" },
        128: { bg: "#EDCF60", text: "#FFFFFF", glow: "#F8E888" },
        256: { bg: "#3BAE78", text: "#FFFFFF", glow: "#58D098" },
        512: { bg: "#3090D0", text: "#FFFFFF", glow: "#58B0F0" },
        1024: { bg: "#7848C8", text: "#FFFFFF", glow: "#9868E8" },
        2048: { bg: "#E03080", text: "#FFFFFF", glow: "#F850A0" },
        4096: { bg: "#C81818", text: "#FFFFFF", glow: "#F04040" },
        8192: { bg: "#10A8A8", text: "#FFFFFF", glow: "#38D8D8" },
      };
  return colors[value] || (isDark
    ? { bg: "#C020C0", text: "#FFFFFF", glow: "#E040E0" }
    : { bg: "#A818A8", text: "#FFFFFF", glow: "#D040D0" });
}

function getAmbientGlowColor(highestValue: number, isDark: boolean): string {
  if (highestValue >= 2048) return isDark ? "#E8388845" : "#E0308035";
  if (highestValue >= 1024) return isDark ? "#8850D040" : "#7848C830";
  if (highestValue >= 512) return isDark ? "#3898D838" : "#3090D028";
  if (highestValue >= 256) return isDark ? "#46B87A35" : "#3BAE7825";
  if (highestValue >= 128) return isDark ? "#E8B83028" : "#EDCF6020";
  if (highestValue >= 64) return isDark ? "#EE482820" : "#EE482815";
  if (highestValue >= 32) return isDark ? "#F0684818" : "#F0684810";
  return isDark ? "#00000000" : "#00000000";
}

function getMergeIntensity(value: number, target: number): number {
  if (value >= target) return 4;
  if (value >= target / 2) return 3;
  if (value >= 256) return 2.5;
  if (value >= 128) return 2;
  if (value >= 32) return 1.5;
  return 1;
}

function AnimatedTile({
  tile,
  cellSize,
  gap,
  theme,
  gridSize,
  target,
}: {
  tile: Tile;
  cellSize: number;
  gap: number;
  theme: any;
  gridSize: number;
  target: number;
}) {
  const targetLeft = tile.col * (cellSize + gap) + gap;
  const targetTop = tile.row * (cellSize + gap) + gap;
  const startLeft = tile.prevCol !== undefined ? tile.prevCol * (cellSize + gap) + gap : targetLeft;
  const startTop = tile.prevRow !== undefined ? tile.prevRow * (cellSize + gap) + gap : targetTop;
  const hasMoved = !tile.isNew && (startLeft !== targetLeft || startTop !== targetTop);

  const posX = useSharedValue(hasMoved ? startLeft : targetLeft);
  const posY = useSharedValue(hasMoved ? startTop : targetTop);
  const tileOpacity = useSharedValue(tile.isNew ? 0 : 1);
  const scale = useSharedValue(tile.mergedFrom ? 0.8 : 1);
  const shimmerOpacity = useSharedValue(0);
  const squishX = useSharedValue(1);
  const squishY = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0.8);
  const ringOpacity = useSharedValue(0);
  const { bg, text, glow } = getTileColors(tile.value, theme);
  const tileRadius = Math.max(6, cellSize * 0.12);
  const intensity = tile.mergedFrom ? getMergeIntensity(tile.value, target) : 0;
  const isTargetMerge = tile.value >= target && tile.mergedFrom;
  const isHorizontalMerge = tile.prevCol !== undefined && tile.prevCol !== tile.col;
  const isVerticalMerge = tile.prevRow !== undefined && tile.prevRow !== tile.row;

  useEffect(() => {
    if (hasMoved) {
      posX.value = withTiming(targetLeft, { duration: 120, easing: Easing.out(Easing.quad) });
      posY.value = withTiming(targetTop, { duration: 120, easing: Easing.out(Easing.quad) });
    } else {
      posX.value = targetLeft;
      posY.value = targetTop;
    }

    if (tile.isNew) {
      tileOpacity.value = withDelay(80, withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }));
      shimmerOpacity.value = withDelay(80, withSequence(
        withTiming(0.3, { duration: 300, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 1200, easing: Easing.in(Easing.quad) })
      ));
    } else if (tile.mergedFrom) {
      const slideDelay = hasMoved ? 100 : 0;
      const squishAmount = Math.min(0.35, 0.12 + intensity * 0.05);
      const squishIn = 1 - squishAmount;
      const squishOut = 1 + squishAmount * 0.6;
      const squishAxis = isHorizontalMerge ? "x" : "y";

      if (squishAxis === "x") {
        squishX.value = withDelay(slideDelay, withSequence(
          withTiming(squishIn, { duration: 60, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 8, stiffness: 300 })
        ));
        squishY.value = withDelay(slideDelay, withSequence(
          withTiming(squishOut, { duration: 60, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 8, stiffness: 300 })
        ));
      } else {
        squishY.value = withDelay(slideDelay, withSequence(
          withTiming(squishIn, { duration: 60, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 8, stiffness: 300 })
        ));
        squishX.value = withDelay(slideDelay, withSequence(
          withTiming(squishOut, { duration: 60, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 8, stiffness: 300 })
        ));
      }

      const mergeDelay = slideDelay + 40;

      if (isTargetMerge) {
        scale.value = withDelay(mergeDelay, withSequence(
          withTiming(1.6, { duration: 250, easing: Easing.out(Easing.quad) }),
          withTiming(1.5, { duration: 200 }),
          withDelay(700, withSpring(1, { damping: 3, stiffness: 50 }))
        ));
        glowOpacity.value = withDelay(mergeDelay, withSequence(
          withTiming(1, { duration: 200 }),
          withTiming(0.8, { duration: 600 }),
          withTiming(0.4, { duration: 800 }),
          withTiming(0, { duration: 500 })
        ));
        ringScale.value = 0.6;
        ringOpacity.value = 0;
        ringScale.value = withDelay(mergeDelay, withTiming(4.5, { duration: 1600, easing: Easing.out(Easing.cubic) }));
        ringOpacity.value = withDelay(mergeDelay, withSequence(
          withTiming(1, { duration: 200 }),
          withTiming(0, { duration: 1400 })
        ));
      } else if (intensity >= 3) {
        scale.value = withDelay(mergeDelay, withSequence(
          withTiming(1.35, { duration: 160, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 4, stiffness: 100 })
        ));
        glowOpacity.value = withDelay(mergeDelay, withSequence(
          withTiming(0.9, { duration: 140 }),
          withTiming(0, { duration: 500 })
        ));
        ringScale.value = 0.7;
        ringOpacity.value = 0;
        ringScale.value = withDelay(mergeDelay, withTiming(3.0, { duration: 600, easing: Easing.out(Easing.cubic) }));
        ringOpacity.value = withDelay(mergeDelay, withSequence(
          withTiming(0.8, { duration: 120 }),
          withTiming(0, { duration: 480 })
        ));
      } else if (intensity >= 2) {
        scale.value = withDelay(mergeDelay, withSequence(
          withTiming(1.22, { duration: 130, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 6, stiffness: 140 })
        ));
        glowOpacity.value = withDelay(mergeDelay, withSequence(
          withTiming(0.7, { duration: 120 }),
          withTiming(0, { duration: 400 })
        ));
        ringScale.value = 0.8;
        ringOpacity.value = 0;
        ringScale.value = withDelay(mergeDelay, withTiming(2.2, { duration: 450, easing: Easing.out(Easing.quad) }));
        ringOpacity.value = withDelay(mergeDelay, withSequence(
          withTiming(0.6, { duration: 100 }),
          withTiming(0, { duration: 350 })
        ));
      } else if (intensity >= 1.5) {
        scale.value = withDelay(mergeDelay, withSequence(
          withTiming(1.15, { duration: 110, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 8, stiffness: 180 })
        ));
        glowOpacity.value = withDelay(mergeDelay, withSequence(
          withTiming(0.5, { duration: 100 }),
          withTiming(0, { duration: 300 })
        ));
      } else {
        scale.value = withDelay(mergeDelay, withSequence(
          withTiming(1.08, { duration: 90, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 12, stiffness: 220 })
        ));
        glowOpacity.value = withDelay(mergeDelay, withSequence(
          withTiming(0.3, { duration: 80 }),
          withTiming(0, { duration: 200 })
        ));
      }
    }
  }, [tile.id, tile.row, tile.col, cellSize, gap]);

  const posStyle = useAnimatedStyle(() => ({
    left: posX.value,
    top: posY.value,
    opacity: tileOpacity.value,
    transform: [
      { scale: scale.value },
      { scaleX: squishX.value },
      { scaleY: squishY.value },
    ],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmerOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const fontSize = gridSize >= 5
    ? (tile.value >= 1000 ? 14 : tile.value >= 100 ? 16 : 20)
    : (tile.value >= 1000 ? 18 : tile.value >= 100 ? 22 : 28);

  return (
    <Animated.View
      style={[
        styles.tile,
        {
          width: cellSize,
          height: cellSize,
          borderRadius: tileRadius,
          backgroundColor: bg,
          position: "absolute",
          zIndex: tile.mergedFrom ? 2 : 1,
        },
        posStyle,
      ]}
    >
      {intensity >= 2 ? (
        <Animated.View
          style={[
            {
              position: "absolute",
              width: cellSize,
              height: cellSize,
              borderRadius: tileRadius,
              borderWidth: isTargetMerge ? 4 : intensity >= 3 ? 3 : 2,
              borderColor: glow,
            },
            ringStyle,
          ]}
        />
      ) : null}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius: tileRadius,
            backgroundColor: glow,
          },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius: tileRadius,
            backgroundColor: "#4ADE80",
          },
          shimmerStyle,
        ]}
      />
      <ThemedText
        style={[
          styles.tileText,
          { color: text, fontSize },
        ]}
      >
        {tile.value}
      </ThemedText>
    </Animated.View>
  );
}

function AnimatedScore({ value, theme }: { value: number; theme: any }) {
  const displayValue = useSharedValue(value);
  const flashOpacity = useSharedValue(0);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      const diff = value - prevValueRef.current;
      displayValue.value = withTiming(value, { duration: 300, easing: Easing.out(Easing.quad) });
      if (diff > 0) {
        flashOpacity.value = withSequence(
          withTiming(1, { duration: 100 }),
          withTiming(0, { duration: 400 })
        );
      }
      prevValueRef.current = value;
    }
  }, [value]);

  const scoreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + flashOpacity.value * 0.08 }],
  }));

  return (
    <Animated.View style={scoreStyle}>
      <ThemedText style={[styles.scoreInlineValue, { color: theme.text }]}>
        {value}
      </ThemedText>
    </Animated.View>
  );
}

function Tutorial({
  theme,
  target,
  gridSize,
  onDismiss,
}: {
  theme: any;
  target: number;
  gridSize: number;
  onDismiss: () => void;
}) {
  const overlayOpacity = useSharedValue(0);
  const tile1X = useSharedValue(0);
  const tile1Opacity = useSharedValue(1);
  const mergedScale = useSharedValue(0);
  const mergedShimmer = useSharedValue(0);
  const swipeIndicatorX = useSharedValue(0);
  const swipeIndicatorOpacity = useSharedValue(0);
  const goalOpacity = useSharedValue(0);
  const goalScale = useSharedValue(0.8);
  const tapPromptOpacity = useSharedValue(0);
  const demoSize = 70;
  const demoGap = 12;
  const isDark = theme.backgroundRoot === "#1A1A1A";
  const tile2Color = getTileColors(2, theme);
  const tile4Color = getTileColors(4, theme);
  const targetColor = getTileColors(target, theme);

  useEffect(() => {
    overlayOpacity.value = withTiming(1, { duration: 400 });

    const startX = -(demoSize + demoGap);
    tile1X.value = startX;
    swipeIndicatorX.value = startX - 20;

    const t1 = setTimeout(() => {
      swipeIndicatorOpacity.value = withTiming(1, { duration: 200 });
    }, 600);

    const t2 = setTimeout(() => {
      swipeIndicatorX.value = withTiming(-10, { duration: 500, easing: Easing.inOut(Easing.quad) });
      tile1X.value = withTiming(0, { duration: 500, easing: Easing.inOut(Easing.quad) });
    }, 1000);

    const t3 = setTimeout(() => {
      swipeIndicatorOpacity.value = withTiming(0, { duration: 200 });
      tile1Opacity.value = withTiming(0, { duration: 100 });
      mergedScale.value = withSequence(
        withTiming(1.2, { duration: 150, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 8, stiffness: 200 })
      );
      mergedShimmer.value = withSequence(
        withTiming(0.5, { duration: 150 }),
        withTiming(0, { duration: 600 })
      );
    }, 1600);

    const t4 = setTimeout(() => {
      goalOpacity.value = withTiming(1, { duration: 500 });
      goalScale.value = withSpring(1, { damping: 12, stiffness: 150 });
    }, 2400);

    const t5 = setTimeout(() => {
      tapPromptOpacity.value = withSequence(
        withTiming(0.6, { duration: 600 }),
        withTiming(0.3, { duration: 600 }),
        withTiming(0.6, { duration: 600 }),
        withTiming(0.3, { duration: 600 }),
        withTiming(0.6, { duration: 600 }),
      );
    }, 3200);

    return () => { [t1, t2, t3, t4, t5].forEach(clearTimeout); };
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const tile1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: tile1X.value }],
    opacity: tile1Opacity.value,
  }));
  const mergedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: mergedScale.value }],
  }));
  const shimmerAnim = useAnimatedStyle(() => ({ opacity: mergedShimmer.value }));
  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeIndicatorX.value }],
    opacity: swipeIndicatorOpacity.value,
  }));
  const goalAnimStyle = useAnimatedStyle(() => ({
    opacity: goalOpacity.value,
    transform: [{ scale: goalScale.value }],
  }));
  const tapStyle = useAnimatedStyle(() => ({ opacity: tapPromptOpacity.value }));

  const handleDismiss = () => {
    overlayOpacity.value = withTiming(0, { duration: 300 });
    setTimeout(onDismiss, 300);
  };

  return (
    <Pressable
      style={StyleSheet.absoluteFillObject}
      onPress={handleDismiss}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: isDark ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" },
          overlayStyle,
        ]}
      >
        <View style={{ alignItems: "center", gap: 40 }}>
          <View style={{ flexDirection: "row", alignItems: "center", height: demoSize }}>
            <View style={{ width: demoSize * 2 + demoGap, height: demoSize, position: "relative" }}>
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    right: 0,
                    width: demoSize,
                    height: demoSize,
                    borderRadius: 12,
                    backgroundColor: tile2Color.bg,
                    justifyContent: "center",
                    alignItems: "center",
                  },
                ]}
              >
                <ThemedText style={{ color: tile2Color.text, fontSize: 28, fontWeight: "700" }}>2</ThemedText>
              </Animated.View>

              <Animated.View
                style={[
                  {
                    position: "absolute",
                    right: 0,
                    width: demoSize,
                    height: demoSize,
                    borderRadius: 12,
                    backgroundColor: tile2Color.bg,
                    justifyContent: "center",
                    alignItems: "center",
                  },
                  tile1Style,
                ]}
              >
                <ThemedText style={{ color: tile2Color.text, fontSize: 28, fontWeight: "700" }}>2</ThemedText>
              </Animated.View>

              <Animated.View
                style={[
                  {
                    position: "absolute",
                    right: 0,
                    width: demoSize,
                    height: demoSize,
                    borderRadius: 12,
                    backgroundColor: tile4Color.bg,
                    justifyContent: "center",
                    alignItems: "center",
                    overflow: "hidden",
                  },
                  mergedStyle,
                ]}
              >
                <Animated.View
                  style={[
                    StyleSheet.absoluteFillObject,
                    { backgroundColor: "#4ADE80", borderRadius: 12 },
                    shimmerAnim,
                  ]}
                />
                <ThemedText style={{ color: tile4Color.text, fontSize: 28, fontWeight: "700" }}>4</ThemedText>
              </Animated.View>
            </View>

            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: 0,
                  top: demoSize / 2 - 16,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: "rgba(255,255,255,0.25)",
                  borderWidth: 2,
                  borderColor: "rgba(255,255,255,0.5)",
                },
                swipeStyle,
              ]}
            />
          </View>

          <Animated.View style={[{ alignItems: "center", gap: 12 }, goalAnimStyle]}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 16,
                backgroundColor: targetColor.bg,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <ThemedText style={{ color: targetColor.text, fontSize: 24, fontWeight: "800" }}>
                {target}
              </ThemedText>
            </View>
            <ThemedText style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "600", opacity: 0.9 }}>
              Build the {target} tile
            </ThemedText>
            <ThemedText style={{ color: "#FFFFFF", fontSize: 14, opacity: 0.5 }}>
              {gridSize}x{gridSize} grid
            </ThemedText>
          </Animated.View>

          <Animated.View style={tapStyle}>
            <ThemedText style={{ color: "#FFFFFF", fontSize: 14, opacity: 0.8 }}>
              Tap to start
            </ThemedText>
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function NumberMerge({
  context,
  onComplete,
  showSettings,
  onSettings,
}: PractaProps) {
  const { theme } = useTheme();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();

  const [difficulty, setDifficulty] = useState<DifficultyKey>("easy");
  const [grid, setGrid] = useState<(Tile | null)[][]>(() =>
    initializeGrid(DIFFICULTIES.easy.gridSize)
  );
  const [score, setScore] = useState(0);
  const [bestScores, setBestScores] = useState<StoredScores>(DEFAULT_SCORES);
  const [gameState, setGameState] = useState<"playing" | "won" | "lost">("playing");
  const [continueAfterWin, setContinueAfterWin] = useState(false);
  const [boardSize, setBoardSize] = useState(Math.min(Dimensions.get("window").width - Spacing.lg * 2, 400));
  const [autoMovesLeft, setAutoMovesLeft] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [showWinModal, setShowWinModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const winModalAnim = useSharedValue(0);
  const boardShakeX = useSharedValue(0);
  const pendingWinRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const moveCountRef = useRef(0);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPlayScoreRef = useRef(0);

  const config = DIFFICULTIES[difficulty];
  const gap = config.gridSize >= 5 ? 6 : 8;
  const cellSize = (boardSize - gap * (config.gridSize + 1)) / config.gridSize;

  useEffect(() => {
    setConfig({
      headerMode: "default",
      title: "Doubbling",
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings]);

  useEffect(() => {
    context.storage
      ?.get<StoredScores>("scores")
      .then((saved) => {
        if (saved) setBestScores(saved);
      })
      .catch(() => {});
    context.storage
      ?.get<DifficultyKey>("difficulty")
      .then((saved) => {
        if (saved && DIFFICULTIES[saved]) {
          setDifficulty(saved);
          nextTileId = 1;
          setGrid(initializeGrid(DIFFICULTIES[saved].gridSize));
        }
      })
      .catch(() => {});
    context.storage
      ?.get<boolean>("tutorialSeen")
      .then((seen) => {
        if (!seen) setShowTutorial(true);
      })
      .catch(() => { setShowTutorial(true); });
  }, []);

  const saveBestScore = useCallback(
    (diffKey: DifficultyKey, newScore: number, won: boolean) => {
      setBestScores((prev) => {
        const updated = {
          ...prev,
          gamesPlayed: prev.gamesPlayed + 1,
          gamesWon: won ? prev.gamesWon + 1 : prev.gamesWon,
          [diffKey]: Math.max(prev[diffKey], newScore),
        };
        context.storage?.set("scores", updated).catch(() => {});
        return updated;
      });
    },
    [context.storage]
  );

  const startNewGame = useCallback(
    (diffKey: DifficultyKey) => {
      nextTileId = 1;
      pendingWinRef.current = false;
      setDifficulty(diffKey);
      setGrid(initializeGrid(DIFFICULTIES[diffKey].gridSize));
      setScore(0);
      setGameState("playing");
      setContinueAfterWin(false);
      setShowWinModal(false);
      winModalAnim.value = 0;
      startTimeRef.current = Date.now();
      moveCountRef.current = 0;
      context.storage?.set("difficulty", diffKey).catch(() => {});
    },
    [context.storage]
  );

  const handleMove = useCallback(
    (direction: Direction) => {
      if (gameState === "lost") return;
      if (gameState === "won" && !continueAfterWin) return;
      if (pendingWinRef.current) return;

      setGrid((prevGrid) => {
        const { grid: newGrid, score: moveScore, moved } = moveGrid(prevGrid, direction);
        if (!moved) return prevGrid;

        haptics.light();
        moveCountRef.current++;
        const withNew = addRandomTile(newGrid);

        setScore((prev) => {
          const newTotal = prev + moveScore;
          return newTotal;
        });

        if (moveScore > 0) {
          haptics.medium();
          if (moveScore >= 256) {
            boardShakeX.value = withSequence(
              withTiming(6, { duration: 35 }),
              withTiming(-6, { duration: 35 }),
              withTiming(5, { duration: 35 }),
              withTiming(-5, { duration: 35 }),
              withTiming(3, { duration: 35 }),
              withTiming(-3, { duration: 35 }),
              withTiming(0, { duration: 35 })
            );
            haptics.heavy();
          } else if (moveScore >= 64) {
            boardShakeX.value = withSequence(
              withTiming(4, { duration: 40 }),
              withTiming(-4, { duration: 40 }),
              withTiming(2, { duration: 40 }),
              withTiming(-2, { duration: 40 }),
              withTiming(0, { duration: 40 })
            );
            haptics.heavy();
          }
        }

        const highest = getHighestTile(withNew);
        if (highest >= config.target && gameState !== "won" && !continueAfterWin) {
          haptics.success();
          pendingWinRef.current = true;
          setTimeout(() => {
            pendingWinRef.current = false;
            setGameState("won");
          }, 2200);
        } else if (!hasMovesLeft(withNew)) {
          haptics.error();
          setGameState("lost");
        }

        return withNew;
      });
    },
    [gameState, continueAfterWin, config.target, haptics]
  );

  const handleMoveJS = useCallback(
    (dir: Direction) => {
      handleMove(dir);
    },
    [handleMove]
  );

  const swipeGesture = Gesture.Pan()
    .minDistance(20)
    .onEnd((e) => {
      const { translationX, translationY } = e;
      const absX = Math.abs(translationX);
      const absY = Math.abs(translationY);

      if (absX > absY) {
        runOnJS(handleMoveJS)(translationX > 0 ? "right" : "left");
      } else {
        runOnJS(handleMoveJS)(translationY > 0 ? "down" : "up");
      }
    });

  useEffect(() => {
    if (gameState === "won" && !continueAfterWin) {
      winModalAnim.value = 0;
      setShowWinModal(false);
      const timer = setTimeout(() => {
        setShowWinModal(true);
        winModalAnim.value = withSpring(1, { damping: 14, stiffness: 120 });
      }, 400);
      return () => clearTimeout(timer);
    } else {
      setShowWinModal(false);
      winModalAnim.value = 0;
    }
  }, [gameState, continueAfterWin]);

  const winOverlayStyle = useAnimatedStyle(() => ({
    opacity: winModalAnim.value,
  }));

  const winContentStyle = useAnimatedStyle(() => ({
    opacity: winModalAnim.value,
    transform: [
      { translateY: (1 - winModalAnim.value) * 80 },
      { scale: 0.9 + winModalAnim.value * 0.1 },
    ],
  }));

  const boardShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: boardShakeX.value }],
  }));

  const isDark = theme.backgroundRoot === "#1A1A1A";
  const highestOnBoard = getHighestTile(grid);
  const ambientColor = getAmbientGlowColor(highestOnBoard, isDark);

  const handleContinuePlaying = () => {
    setContinueAfterWin(true);
    setGameState("playing");
  };

  const handleCompleteSession = () => {
    const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
    saveBestScore(difficulty, score, gameState === "won");
    haptics.success();
    onComplete({
      content: {
        type: "text",
        value: `Reached ${getHighestTile(grid)} on ${config.label} difficulty with a score of ${score}`,
      },
      metadata: {
        difficulty,
        score,
        highestTile: getHighestTile(grid),
        moves: moveCountRef.current,
        duration,
        won: gameState === "won",
      },
    });
  };

  const handleHelpMe = useCallback(() => {
    if (isAutoPlaying || gameState !== "playing") return;
    haptics.medium();
    autoPlayScoreRef.current = 0;
    setAutoMovesLeft(10);
    setIsAutoPlaying(true);
  }, [isAutoPlaying, gameState, haptics]);

  const applyHelpPenalty = useCallback(() => {
    const penalty = Math.floor(autoPlayScoreRef.current * 0.5);
    if (penalty > 0) {
      setScore((prev) => Math.max(0, prev - penalty));
    }
    autoPlayScoreRef.current = 0;
  }, []);

  useEffect(() => {
    if (!isAutoPlaying || autoMovesLeft <= 0) {
      if (isAutoPlaying) {
        applyHelpPenalty();
      }
      setIsAutoPlaying(false);
      setAutoMovesLeft(0);
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
      return;
    }
    if (gameState !== "playing") {
      applyHelpPenalty();
      setIsAutoPlaying(false);
      setAutoMovesLeft(0);
      return;
    }

    autoPlayTimerRef.current = setTimeout(() => {
      setGrid((currentGrid) => {
        const bestDir = findBestMove(currentGrid);
        if (!bestDir) {
          applyHelpPenalty();
          setIsAutoPlaying(false);
          setAutoMovesLeft(0);
          return currentGrid;
        }

        const { grid: newGrid, score: moveScore, moved } = moveGrid(currentGrid, bestDir);
        if (!moved) {
          applyHelpPenalty();
          setIsAutoPlaying(false);
          setAutoMovesLeft(0);
          return currentGrid;
        }

        haptics.light();
        moveCountRef.current++;
        const withNew = addRandomTile(newGrid);

        autoPlayScoreRef.current += moveScore;
        setScore((prev) => prev + moveScore);
        if (moveScore > 0) haptics.medium();

        const highest = getHighestTile(withNew);
        if (highest >= config.target && !continueAfterWin) {
          haptics.success();
          applyHelpPenalty();
          setIsAutoPlaying(false);
          setAutoMovesLeft(0);
          pendingWinRef.current = true;
          setTimeout(() => {
            pendingWinRef.current = false;
            setGameState("won");
          }, 2200);
        } else if (!hasMovesLeft(withNew)) {
          haptics.error();
          setGameState("lost");
          applyHelpPenalty();
          setIsAutoPlaying(false);
          setAutoMovesLeft(0);
        } else {
          setAutoMovesLeft((prev) => prev - 1);
        }

        return withNew;
      });
    }, 350);

    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
    };
  }, [isAutoPlaying, autoMovesLeft, gameState, continueAfterWin, config.target, haptics, applyHelpPenalty]);

  const handleBoardLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      const maxSize = Math.min(width, height, 500);
      setBoardSize(maxSize);
    }
  };

  const tiles: Tile[] = [];
  for (const row of grid) {
    for (const cell of row) {
      if (cell) tiles.push(cell);
    }
  }

  const currentBest = bestScores[difficulty];

  return (
    <GlassBackground style={[styles.container, { paddingTop: headerHeight + Spacing.sm }]}>
      <View style={[styles.topBar, { borderBottomColor: theme.border + "30" }]}>
        <View style={styles.scoreInline}>
          <AnimatedScore value={score} theme={theme} />
          <ThemedText style={[styles.scoreInlineLabel, { color: theme.textSecondary }]}>
            {currentBest > 0 ? `Best ${currentBest}` : `Goal ${config.target}`}
          </ThemedText>
        </View>
        <View style={[styles.difficultyPills, { backgroundColor: theme.backgroundSecondary + "80" }]}>
          {DIFFICULTY_ORDER.map((key) => {
            const d = DIFFICULTIES[key];
            const isSelected = key === difficulty;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  if (key !== difficulty) {
                    haptics.selection();
                    startNewGame(key);
                  }
                }}
                style={[
                  styles.difficultyPill,
                  isSelected ? { backgroundColor: theme.primary } : null,
                ]}
              >
                <ThemedText
                  style={[
                    styles.difficultyPillText,
                    { color: isSelected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {d.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.boardContainer} onLayout={handleBoardLayout}>
        <View style={[
          styles.ambientGlow,
          {
            width: boardSize + 40,
            height: boardSize + 40,
            borderRadius: Math.max(28, boardSize * 0.06),
            backgroundColor: ambientColor,
          },
        ]} />
        <GestureDetector gesture={swipeGesture}>
          <Animated.View
            style={[
              styles.board,
              {
                backgroundColor: theme.backgroundTertiary + "CC",
                borderRadius: Math.max(8, boardSize * 0.03),
                width: boardSize,
                height: boardSize,
              },
              boardShakeStyle,
            ]}
          >
            {Array.from({ length: config.gridSize }).map((_, r) =>
              Array.from({ length: config.gridSize }).map((_, c) => {
                const emptyCellRadius = Math.max(6, cellSize * 0.12);
                return (
                  <View
                    key={`cell-${r}-${c}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      borderRadius: emptyCellRadius,
                      backgroundColor: theme.backgroundSecondary + "60",
                      position: "absolute",
                      left: c * (cellSize + gap) + gap,
                      top: r * (cellSize + gap) + gap,
                    }}
                  />
                );
              })
            )}
            {tiles.map((tile) => (
              <AnimatedTile
                key={tile.id}
                tile={tile}
                cellSize={cellSize}
                gap={gap}
                theme={theme}
                gridSize={config.gridSize}
                target={config.target}
              />
            ))}
          </Animated.View>
        </GestureDetector>
      </View>

      {showWinModal ? (
        <Animated.View style={[styles.overlay, winOverlayStyle]}>
          <Animated.View style={[styles.winContent, { backgroundColor: theme.backgroundDefault }, winContentStyle]}>
            <View style={[styles.winBadge, { backgroundColor: theme.primary + "20" }]}>
              <ThemedText style={[styles.winBadgeNumber, { color: theme.primary }]}>
                {config.target}
              </ThemedText>
            </View>
            <ThemedText style={[styles.winTitle, { color: theme.primary }]}>
              Amazing!
            </ThemedText>
            <ThemedText style={[styles.winMessage, { color: theme.text }]}>
              You reached {config.target} on the {config.gridSize}x{config.gridSize} grid
            </ThemedText>
            <ThemedText style={[styles.winScore, { color: theme.textSecondary }]}>
              Score: {score}  {score > bestScores[difficulty] ? "  New Best!" : ""}
            </ThemedText>
            <Pressable
              onPress={handleCompleteSession}
              style={[styles.winPrimaryButton, { backgroundColor: theme.primary }]}
            >
              <ThemedText style={[styles.winPrimaryButtonText, { color: "#FFFFFF" }]}>
                Complete Session
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={handleContinuePlaying}
              style={styles.winSecondaryButton}
            >
              <ThemedText style={[styles.winSecondaryText, { color: theme.textSecondary }]}>
                Keep Playing
              </ThemedText>
            </Pressable>
          </Animated.View>
        </Animated.View>
      ) : gameState === "lost" ? (() => {
        const endHighest = getHighestTile(grid);
        const endColors = getTileColors(endHighest, theme);
        const isNewBest = score > bestScores[difficulty];
        const encouragement = endHighest >= 512
          ? "Incredible run!"
          : endHighest >= 256
          ? "Impressive!"
          : endHighest >= 128
          ? "Great effort!"
          : endHighest >= 64
          ? "Nice work!"
          : "Good start!";
        return (
        <View style={[styles.overlay]}>
          <View style={[styles.overlayContent, { backgroundColor: theme.backgroundDefault }]}>
            <View style={[styles.winBadge, { backgroundColor: endColors.bg + "25" }]}>
              <ThemedText style={[styles.winBadgeNumber, { color: endColors.bg }]}>
                {endHighest}
              </ThemedText>
            </View>
            <ThemedText style={[styles.lostTitle, { color: endColors.bg }]}>
              {encouragement}
            </ThemedText>
            <ThemedText style={[styles.lostSubtitle, { color: theme.text }]}>
              You built a {endHighest} tile on the {config.gridSize}x{config.gridSize} grid
            </ThemedText>
            <ThemedText style={[styles.lostScore, { color: theme.textSecondary }]}>
              Score: {score}{isNewBest ? "  New Best!" : ""}
            </ThemedText>
            <Pressable
              onPress={() => {
                saveBestScore(difficulty, score, false);
                startNewGame(difficulty);
              }}
              style={[styles.overlayButton, { backgroundColor: endColors.bg }]}
            >
              <ThemedText style={[styles.overlayButtonText, { color: "#FFFFFF" }]}>
                Play Again
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={handleCompleteSession}
              style={styles.winSecondaryButton}
            >
              <ThemedText style={[styles.winSecondaryText, { color: theme.textSecondary }]}>
                Complete Session
              </ThemedText>
            </Pressable>
          </View>
        </View>
        );
      })() : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.xs }]}>
        <View style={styles.footerRow}>
          <Pressable
            onPress={() => startNewGame(difficulty)}
            style={styles.footerLink}
          >
            <ThemedText style={[styles.newGameText, { color: theme.textSecondary }]}>
              New Game
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={handleHelpMe}
            disabled={isAutoPlaying || gameState !== "playing"}
            style={[
              styles.helpButton,
              {
                backgroundColor: isAutoPlaying ? theme.backgroundTertiary : theme.primary,
                opacity: gameState !== "playing" ? 0.4 : 1,
              },
            ]}
          >
            <ThemedText style={[styles.helpButtonText, { color: "#FFFFFF" }]}>
              {isAutoPlaying ? `Thinking... (${autoMovesLeft})` : "Help Me"}
            </ThemedText>
          </Pressable>
        </View>
      </View>
      {showTutorial ? (
        <Tutorial
          theme={theme}
          target={config.target}
          gridSize={config.gridSize}
          onDismiss={() => {
            setShowTutorial(false);
            context.storage?.set("tutorialSeen", true).catch(() => {});
          }}
        />
      ) : null}
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  scoreInline: {
    flexDirection: "column",
  },
  scoreInlineValue: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32,
  },
  scoreInlineLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  difficultyPills: {
    flexDirection: "row",
    borderRadius: 20,
    padding: 3,
  },
  difficultyPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 17,
  },
  difficultyPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  boardContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  ambientGlow: {
    position: "absolute",
  },
  board: {
    overflow: "hidden",
  },
  tile: {
    justifyContent: "center",
    alignItems: "center",
  },
  tileText: {
    fontWeight: "800",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 10,
  },
  winContent: {
    padding: Spacing["4xl"],
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    width: "85%",
    gap: Spacing.md,
  },
  winBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  winBadgeNumber: {
    fontSize: 28,
    fontWeight: "800",
  },
  winTitle: {
    fontSize: 36,
    fontWeight: "800",
    textAlign: "center",
  },
  winMessage: {
    fontSize: 18,
    fontWeight: "500",
    textAlign: "center",
  },
  winScore: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  winPrimaryButton: {
    width: "100%",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  winPrimaryButtonText: {
    fontSize: 17,
    fontWeight: "700",
  },
  winSecondaryButton: {
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  winSecondaryText: {
    fontSize: 15,
    fontWeight: "500",
  },
  overlayContent: {
    padding: Spacing["3xl"],
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    width: "85%",
    gap: Spacing.md,
  },
  lostTitle: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  lostSubtitle: {
    fontSize: 17,
    textAlign: "center",
  },
  lostScore: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  overlayButton: {
    width: "100%",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  overlayButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    paddingTop: Spacing.xs,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerLink: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  newGameText: {
    fontSize: 13,
    fontWeight: "500",
  },
  helpButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  helpButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
