import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Svg, { Polyline } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { GlassBackground } from "@/components/GlassBackground";
import { useTheme } from "@/hooks/useTheme";
import { useHaptics } from "@/hooks/useHaptics";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

interface Cell {
  x: number;
  y: number;
  blocked: boolean;
  label: number | null;
  bridge: boolean;
}

interface Level {
  id: number;
  width: number;
  height: number;
  blocked: number[][];
  labels: Record<string, number>;
  bridges: number[][];
  solution: [number, number][];
}

interface GameState {
  path: Cell[];
  visited: Set<string>;
  currentCell: Cell | null;
  nextRequiredLabel: number;
}

const CELL_GAP = 4;
const MIN_CELL_SIZE = 40;
const MAX_CELL_SIZE = 68;

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function buildGrid(level: Level): Cell[][] {
  const bridgeSet = new Set((level.bridges || []).map(([bx, by]) => cellKey(bx, by)));
  const grid: Cell[][] = [];
  for (let y = 0; y < level.height; y++) {
    grid[y] = [];
    for (let x = 0; x < level.width; x++) {
      const blocked = level.blocked.some(([bx, by]) => bx === x && by === y);
      const key = cellKey(x, y);
      const label = level.labels[key] ?? null;
      grid[y][x] = { x, y, blocked, label, bridge: bridgeSet.has(key) };
    }
  }
  return grid;
}

function getFreeCellCount(grid: Cell[][]): number {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (!cell.blocked) count++;
    }
  }
  return count;
}

function getBridgeCount(grid: Cell[][]): number {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.bridge) count++;
    }
  }
  return count;
}

function getMaxLabel(level: Level): number {
  return Math.max(...Object.values(level.labels));
}

function isAdjacent(a: Cell, b: Cell): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

function initialGameState(): GameState {
  return {
    path: [],
    visited: new Set(),
    currentCell: null,
    nextRequiredLabel: 1,
  };
}

function recomputeNextLabel(path: Cell[]): number {
  let next = 1;
  for (const cell of path) {
    if (cell.label !== null && cell.label === next) {
      next++;
    }
  }
  return next;
}

function mulberry32(seed: number) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashDateString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash;
}

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDisplayDate(): string {
  const now = new Date();
  return now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface TutorialLesson {
  level: Level;
  title: string;
  instruction: string;
  icon: "move" | "hash" | "slash" | "git-commit";
}

const TUTORIAL_LESSONS: TutorialLesson[] = [
  {
    level: {
      id: -1,
      width: 3,
      height: 3,
      blocked: [],
      labels: { "0,0": 1, "2,2": 2 },
      bridges: [],
      solution: [],
    },
    title: "Draw a Path",
    instruction: "Drag from 1 to 2, visiting every cell exactly once",
    icon: "move",
  },
  {
    level: {
      id: -2,
      width: 3,
      height: 4,
      blocked: [],
      labels: { "0,0": 1, "2,1": 2, "0,3": 3 },
      bridges: [],
      solution: [],
    },
    title: "Follow the Numbers",
    instruction: "Pass through each number in order - 1, 2, 3",
    icon: "hash",
  },
  {
    level: {
      id: -3,
      width: 3,
      height: 3,
      blocked: [[1, 1]],
      labels: { "0,0": 1, "2,0": 2, "0,1": 3 },
      bridges: [],
      solution: [],
    },
    title: "Avoid Blocked Cells",
    instruction: "The dotted cell is blocked - find a way around it",
    icon: "slash",
  },
];

const BRIDGE_TUTORIAL: TutorialLesson = {
  level: {
    id: -4,
    width: 5,
    height: 3,
    blocked: [],
    labels: { "0,0": 1, "3,0": 2 },
    bridges: [[2, 1]],
    solution: [],
  },
  title: "Cross the Bridge",
  instruction: "The B cell is a bridge - cross it twice by going straight through",
  icon: "git-commit",
};

const INTRO_GRID = { w: 17, h: 11 };
const INTRO_CELL_GAP = 2;

const INTRO_LETTERS: [number, number][][] = [
  [[1,4],[1,3],[1,2],[1,1],[1,0],[2,0],[3,1],[2,2]],
  [[5,4],[5,3],[5,2],[5,1],[6,0],[7,1],[7,2],[7,3],[7,4],[6,2]],
  [[9,0],[10,0],[11,0],[10,1],[10,2],[10,3],[10,4]],
  [[13,0],[13,1],[13,2],[13,3],[13,4],[15,4],[15,3],[15,2],[15,1],[15,0],[14,2]],
  [[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[0,9],[0,10]],
  [[4,6],[4,7],[4,8],[4,9],[4,10],[5,10],[6,10]],
  [[9,6],[8,7],[8,8],[8,9],[9,10],[10,9],[10,8],[10,7]],
  [[12,6],[12,7],[12,8],[12,9],[13,9],[13,10],[14,8],[15,10],[15,9],[16,9],[16,8],[16,7],[16,6]],
];

const INTRO_WORD1 = INTRO_LETTERS.slice(0, 4).flat();
const INTRO_WORD2 = INTRO_LETTERS.slice(4).flat();
const INTRO_FILLED_SET = new Set(
  INTRO_LETTERS.flatMap((l) => l.map(([x, y]) => `${x},${y}`))
);

type DailyDifficulty = "easy" | "medium" | "hard";

interface DailyConfig {
  label: string;
  icon: "sun" | "cloud" | "zap";
  sizes: { w: number; h: number }[];
  blockedRange: [number, number];
  waypointDensity: number;
}

const DAILY_CONFIGS: Record<DailyDifficulty, DailyConfig> = {
  easy: {
    label: "Easy",
    icon: "sun",
    sizes: [{ w: 4, h: 4 }, { w: 4, h: 5 }, { w: 5, h: 4 }],
    blockedRange: [0, 1],
    waypointDensity: 3,
  },
  medium: {
    label: "Medium",
    icon: "cloud",
    sizes: [{ w: 5, h: 5 }, { w: 5, h: 6 }, { w: 6, h: 5 }],
    blockedRange: [1, 3],
    waypointDensity: 4,
  },
  hard: {
    label: "Hard",
    icon: "zap",
    sizes: [{ w: 6, h: 6 }, { w: 6, h: 7 }, { w: 7, h: 6 }],
    blockedRange: [2, 5],
    waypointDensity: 5,
  },
};

const DAILY_DIFFICULTIES: DailyDifficulty[] = ["easy", "medium", "hard"];

function generateHardWithBridge(dateStr: string): Level {
  const seed = hashDateString("pathflow-hard-" + dateStr);
  const rng = mulberry32(seed);

  const sizes = [{ w: 6, h: 6 }, { w: 6, h: 7 }, { w: 7, h: 6 }];
  const sizeIdx = Math.floor(rng() * sizes.length);
  const { w, h } = sizes[sizeIdx];

  const dirs: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  const numBlocked = 2 + Math.floor(rng() * 3);
  const blockedSet = new Set<string>();
  for (let attempt = 0; attempt < numBlocked * 20 && blockedSet.size < numBlocked; attempt++) {
    const bx = Math.floor(rng() * w);
    const by = Math.floor(rng() * h);
    if (bx === 0 && by === 0) continue;
    if (bx === w - 1 && by === h - 1) continue;
    blockedSet.add(cellKey(bx, by));
  }

  const blocked: number[][] = [];
  blockedSet.forEach((k) => {
    const [x, y] = k.split(",").map(Number);
    blocked.push([x, y]);
  });

  const candidates: [number, number][] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = cellKey(x, y);
      if (blockedSet.has(k)) continue;
      let openN = 0;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && !blockedSet.has(cellKey(nx, ny))) openN++;
      }
      if (openN >= 4) candidates.push([x, y]);
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  function warnsdorffBridge(
    bk: string, bSet: Set<string>, gw: number, gh: number,
    rngFn: () => number, maxTrials: number, targetLen: number
  ): [number, number][] {
    function getN(x: number, y: number, vc: Map<string, number>): [number, number][] {
      const r: [number, number][] = [];
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
        const nk = cellKey(nx, ny);
        if (bSet.has(nk)) continue;
        const maxV = nk === bk ? 2 : 1;
        if ((vc.get(nk) || 0) >= maxV) continue;
        r.push([nx, ny]);
      }
      return r;
    }
    let best: [number, number][] = [];
    for (let t = 0; t < maxTrials; t++) {
      const sx = Math.floor(rngFn() * gw);
      const sy = Math.floor(rngFn() * gh);
      const sk = cellKey(sx, sy);
      if (bSet.has(sk)) continue;
      const vc = new Map<string, number>([[sk, 1]]);
      const path: [number, number][] = [[sx, sy]];
      let cx = sx, cy = sy;
      const maxSteps = gw * gh + 1;
      for (let step = 0; step < maxSteps; step++) {
        const neighbors = getN(cx, cy, vc);
        if (neighbors.length === 0) break;
        neighbors.sort((a, b) => getN(a[0], a[1], vc).length - getN(b[0], b[1], vc).length);
        const minD = getN(neighbors[0][0], neighbors[0][1], vc).length;
        const ties = neighbors.filter(n => getN(n[0], n[1], vc).length === minD);
        const pick = ties[Math.floor(rngFn() * ties.length)];
        cx = pick[0]; cy = pick[1];
        const pk = cellKey(cx, cy);
        vc.set(pk, (vc.get(pk) || 0) + 1);
        path.push([cx, cy]);
      }
      if (path.length > best.length) best = path;
      if (path.length >= targetLen) break;
    }
    return best;
  }

  function warnsdorffStandard(
    bSet: Set<string>, gw: number, gh: number,
    rngFn: () => number, maxTrials: number, targetLen: number
  ): [number, number][] {
    function getN(x: number, y: number, vis: Set<string>): [number, number][] {
      const r: [number, number][] = [];
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
        const nk = cellKey(nx, ny);
        if (bSet.has(nk) || vis.has(nk)) continue;
        r.push([nx, ny]);
      }
      return r;
    }
    let best: [number, number][] = [];
    for (let t = 0; t < maxTrials; t++) {
      const sx = Math.floor(rngFn() * gw);
      const sy = Math.floor(rngFn() * gh);
      const sk = cellKey(sx, sy);
      if (bSet.has(sk)) continue;
      const vis = new Set<string>([sk]);
      const path: [number, number][] = [[sx, sy]];
      let cx = sx, cy = sy;
      const maxSteps = gw * gh;
      for (let step = 0; step < maxSteps; step++) {
        const neighbors = getN(cx, cy, vis);
        if (neighbors.length === 0) break;
        neighbors.sort((a, b) => getN(a[0], a[1], vis).length - getN(b[0], b[1], vis).length);
        const minD = getN(neighbors[0][0], neighbors[0][1], vis).length;
        const ties = neighbors.filter(n => getN(n[0], n[1], vis).length === minD);
        const pick = ties[Math.floor(rngFn() * ties.length)];
        cx = pick[0]; cy = pick[1];
        vis.add(cellKey(cx, cy));
        path.push([cx, cy]);
      }
      if (path.length > best.length) best = path;
      if (path.length >= targetLen) break;
    }
    return best;
  }

  const freeCells = w * h - blocked.length;
  const totalRequired = freeCells + 1;

  let bestPath: [number, number][] = [];
  let chosenBridge: [number, number] | null = null;
  let bridgeFound = false;

  const verifyRng = mulberry32(seed + 9999);

  function isInvalidBridgePath(path: [number, number][], bk: string): boolean {
    const crossings: number[] = [];
    for (let i = 0; i < path.length; i++) {
      if (cellKey(path[i][0], path[i][1]) === bk) crossings.push(i);
    }
    if (crossings.length < 2) return false;

    const gap = crossings[1] - crossings[0];
    if (gap < 8) return true;

    for (const ci of crossings) {
      if (ci === 0 || ci === path.length - 1) return true;
      const dx_in = path[ci][0] - path[ci - 1][0];
      const dy_in = path[ci][1] - path[ci - 1][1];
      const dx_out = path[ci + 1][0] - path[ci][0];
      const dy_out = path[ci + 1][1] - path[ci][1];
      if (dx_in !== dx_out || dy_in !== dy_out) return true;
    }

    return false;
  }

  for (const [bx, by] of candidates.slice(0, 15)) {
    const bk = cellKey(bx, by);
    const bridgePath = warnsdorffBridge(bk, blockedSet, w, h, rng, 200, totalRequired);

    if (bridgePath.length < totalRequired) continue;

    const bridgeVisits = bridgePath.filter(([px, py]) => cellKey(px, py) === bk).length;
    if (bridgeVisits < 2) continue;

    const uniqueCells = new Set(bridgePath.map(([px, py]) => cellKey(px, py)));
    if (uniqueCells.size !== freeCells) continue;

    if (isInvalidBridgePath(bridgePath, bk)) continue;

    bestPath = bridgePath;
    chosenBridge = [bx, by];
    bridgeFound = true;
    break;
  }

  if (!bridgeFound && candidates.length > 0) {
    for (const [bx, by] of candidates.slice(0, 5)) {
      const bk = cellKey(bx, by);
      const bridgePath = warnsdorffBridge(bk, blockedSet, w, h, rng, 400, totalRequired);
      if (bridgePath.length >= totalRequired) {
        const bv = bridgePath.filter(([px, py]) => cellKey(px, py) === bk).length;
        const uniqueCells = new Set(bridgePath.map(([px, py]) => cellKey(px, py)));
        if (bv >= 2 && uniqueCells.size === freeCells && !isInvalidBridgePath(bridgePath, bk)) {
          bestPath = bridgePath;
          chosenBridge = [bx, by];
          bridgeFound = true;
          break;
        }
      }
    }
  }

  if (bridgeFound && chosenBridge) {
    const bridgeKey = cellKey(chosenBridge[0], chosenBridge[1]);

    const pathLen = bestPath.length;
    const hardBaseWp = Math.ceil(pathLen / 5) + 1;
    const hardVariance = Math.floor(rng() * 4) - 2;
    const numWaypoints = Math.max(2, Math.min(hardBaseWp + hardVariance, 9));
    const labels: Record<string, number> = {};

    const findNonBridgeIdx = (target: number, dir: number): number => {
      let i = target;
      while (i >= 0 && i < pathLen && cellKey(bestPath[i][0], bestPath[i][1]) === bridgeKey) i += dir;
      if (i < 0 || i >= pathLen) {
        i = target;
        while (i >= 0 && i < pathLen && cellKey(bestPath[i][0], bestPath[i][1]) === bridgeKey) i -= dir;
      }
      return Math.max(0, Math.min(pathLen - 1, i));
    };

    const startIdx = findNonBridgeIdx(0, 1);
    const endIdx = findNonBridgeIdx(pathLen - 1, -1);
    labels[cellKey(bestPath[startIdx][0], bestPath[startIdx][1])] = 1;
    labels[cellKey(bestPath[endIdx][0], bestPath[endIdx][1])] = numWaypoints;

    if (numWaypoints > 2) {
      const interior = numWaypoints - 2;
      const spacing = pathLen / (numWaypoints - 1);
      for (let i = 1; i <= interior; i++) {
        const idx = Math.round(spacing * i);
        const clampedIdx = Math.max(1, Math.min(pathLen - 2, idx));
        const safeIdx = findNonBridgeIdx(clampedIdx, 1);
        const [px, py] = bestPath[safeIdx];
        labels[cellKey(px, py)] = i + 1;
      }
    }

    return {
      id: hashDateString("hard" + dateStr),
      width: w,
      height: h,
      blocked,
      labels,
      bridges: [chosenBridge],
      solution: bestPath.map(([x, y]) => [x, y] as [number, number]),
    };
  }

  const fallbackRng = mulberry32(seed + 7777);
  const stdPath = warnsdorffStandard(blockedSet, w, h, fallbackRng, 500, freeCells);

  if (stdPath.length < freeCells) {
    const visitedInStd = new Set(stdPath.map(([x, y]) => cellKey(x, y)));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = cellKey(x, y);
        if (!visitedInStd.has(k) && !blockedSet.has(k)) {
          blocked.push([x, y]);
        }
      }
    }
  }

  const pathLen = stdPath.length;
  const fbBaseWp = Math.ceil(pathLen / 5) + 1;
  const fbVariance = Math.floor(rng() * 4) - 2;
  const numWaypoints = Math.max(2, Math.min(fbBaseWp + fbVariance, 9));
  const labels: Record<string, number> = {};
  labels[cellKey(stdPath[0][0], stdPath[0][1])] = 1;
  labels[cellKey(stdPath[pathLen - 1][0], stdPath[pathLen - 1][1])] = numWaypoints;

  if (numWaypoints > 2) {
    const interior = numWaypoints - 2;
    const spacing = pathLen / (numWaypoints - 1);
    for (let i = 1; i <= interior; i++) {
      const idx = Math.round(spacing * i);
      const clampedIdx = Math.max(1, Math.min(pathLen - 2, idx));
      const [px, py] = stdPath[clampedIdx];
      labels[cellKey(px, py)] = i + 1;
    }
  }

  return {
    id: hashDateString("hard" + dateStr),
    width: w,
    height: h,
    blocked,
    labels,
    bridges: [],
    solution: stdPath as [number, number][],
  };
}

function generateDailyPuzzle(dateStr: string, difficulty: DailyDifficulty): Level {
  if (difficulty === "hard") {
    return generateHardWithBridge(dateStr);
  }

  const config = DAILY_CONFIGS[difficulty];
  const seed = hashDateString("pathflow-" + difficulty + "-" + dateStr);
  const rng = mulberry32(seed);

  const sizeIdx = Math.floor(rng() * config.sizes.length);
  const { w, h } = config.sizes[sizeIdx];

  const [minBlocked, maxBlocked] = config.blockedRange;
  const numBlocked = minBlocked + Math.floor(rng() * (maxBlocked - minBlocked + 1));
  const blockedSet = new Set<string>();

  for (let attempt = 0; attempt < numBlocked * 15 && blockedSet.size < numBlocked; attempt++) {
    const bx = Math.floor(rng() * w);
    const by = Math.floor(rng() * h);
    if (bx === 0 && by === 0) continue;
    if (bx === w - 1 && by === h - 1) continue;
    blockedSet.add(cellKey(bx, by));
  }

  const blocked: number[][] = [];
  blockedSet.forEach((k) => {
    const [x, y] = k.split(",").map(Number);
    blocked.push([x, y]);
  });

  const totalCells = w * h - blocked.length;

  const dirs = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];

  function getNeighbors(x: number, y: number, visited: Set<string>): [number, number][] {
    const result: [number, number][] = [];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const nk = cellKey(nx, ny);
      if (visited.has(nk) || blockedSet.has(nk)) continue;
      result.push([nx, ny]);
    }
    return result;
  }

  function countUnvisitedNeighbors(x: number, y: number, visited: Set<string>): number {
    return getNeighbors(x, y, visited).length;
  }

  let bestPath: [number, number][] = [];

  for (let trial = 0; trial < 200; trial++) {
    const sx = Math.floor(rng() * w);
    const sy = Math.floor(rng() * h);
    if (blockedSet.has(cellKey(sx, sy))) continue;

    const visited = new Set<string>([cellKey(sx, sy)]);
    const path: [number, number][] = [[sx, sy]];
    let cx = sx;
    let cy = sy;

    const maxSteps = w * h;
    for (let step = 0; step < maxSteps; step++) {
      const neighbors = getNeighbors(cx, cy, visited);
      if (neighbors.length === 0) break;
      neighbors.sort((a, b) => {
        return countUnvisitedNeighbors(a[0], a[1], visited) - countUnvisitedNeighbors(b[0], b[1], visited);
      });
      const minDeg = countUnvisitedNeighbors(neighbors[0][0], neighbors[0][1], visited);
      const ties = neighbors.filter((n) => countUnvisitedNeighbors(n[0], n[1], visited) === minDeg);
      const pick = ties[Math.floor(rng() * ties.length)];
      cx = pick[0];
      cy = pick[1];
      visited.add(cellKey(cx, cy));
      path.push([cx, cy]);
    }

    if (path.length > bestPath.length) bestPath = path;
    if (path.length === totalCells) break;
  }

  if (bestPath.length < totalCells) {
    const visitedInBest = new Set(bestPath.map(([x, y]) => cellKey(x, y)));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = cellKey(x, y);
        if (!visitedInBest.has(k) && !blockedSet.has(k)) {
          blocked.push([x, y]);
          blockedSet.add(k);
        }
      }
    }
  }

  const finalFreeCells = w * h - blocked.length;
  const solutionUnique = new Set(bestPath.map(([x, y]) => cellKey(x, y)));

  if (solutionUnique.size < finalFreeCells) {
    const allFree: [number, number][] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!blockedSet.has(cellKey(x, y))) allFree.push([x, y]);
      }
    }
    const missingCells = allFree.filter(([x, y]) => !solutionUnique.has(cellKey(x, y)));
    for (const [mx, my] of missingCells) {
      blocked.push([mx, my]);
    }
  }

  const pathLen = bestPath.length;
  const baseWaypoints = Math.ceil(pathLen / config.waypointDensity) + 1;
  const variance = Math.floor(rng() * 4) - 2;
  const numWaypoints = Math.max(2, Math.min(baseWaypoints + variance, 9));
  const labels: Record<string, number> = {};
  labels[cellKey(bestPath[0][0], bestPath[0][1])] = 1;
  labels[cellKey(bestPath[pathLen - 1][0], bestPath[pathLen - 1][1])] = numWaypoints;

  if (numWaypoints > 2) {
    const interior = numWaypoints - 2;
    const spacing = pathLen / (numWaypoints - 1);
    for (let i = 1; i <= interior; i++) {
      const idx = Math.round(spacing * i);
      const clampedIdx = Math.max(1, Math.min(pathLen - 2, idx));
      const [px, py] = bestPath[clampedIdx];
      labels[cellKey(px, py)] = i + 1;
    }
  }

  return {
    id: hashDateString(difficulty + dateStr),
    width: w,
    height: h,
    blocked,
    labels,
    bridges: [],
    solution: bestPath as [number, number][],
  };
}

export default function ZipPuzzle({
  context,
  onComplete,
  showSettings,
  onSettings,
}: PractaProps) {
  const { theme, isDark } = useTheme();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();

  const [gameState, setGameState] = useState<GameState>(initialGameState());
  const [hasWon, setHasWon] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [solveTime, setSolveTime] = useState<number>(0);
  const [dailyDifficulty, setDailyDifficulty] = useState<DailyDifficulty>("medium");
  const [dailyCompletedMap, setDailyCompletedMap] = useState<Record<string, string>>({});

  const [replayPhase, setReplayPhase] = useState<"none" | "replaying" | "done">("none");
  const [replayIndex, setReplayIndex] = useState(0);
  const [winningPath, setWinningPath] = useState<Cell[]>([]);

  const [tutorialDone, setTutorialDone] = useState<boolean | null>(null);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialWon, setTutorialWon] = useState(false);
  const [bridgeTutorialDone, setBridgeTutorialDone] = useState(true);
  const [showBridgeTutorial, setShowBridgeTutorial] = useState(false);

  const [missedCellsHint, setMissedCellsHint] = useState(false);
  const missedCellsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hintCells, setHintCells] = useState<Set<string>>(new Set());
  const [hintsUsed, setHintsUsed] = useState(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [introPhase, setIntroPhase] = useState<"playing" | "holding" | "done">("playing");
  const [introTick, setIntroTick] = useState(0);
  const introOpacity = useSharedValue(1);
  const maxLen = Math.max(INTRO_WORD1.length, INTRO_WORD2.length);

  const introRevealed = useMemo(() => {
    const cells: [number, number][] = [];
    const w1Count = Math.min(introTick, INTRO_WORD1.length);
    const w2Count = Math.min(introTick, INTRO_WORD2.length);
    for (let i = 0; i < w1Count; i++) cells.push(INTRO_WORD1[i]);
    for (let i = 0; i < w2Count; i++) cells.push(INTRO_WORD2[i]);
    return cells;
  }, [introTick]);

  useEffect(() => {
    if (introPhase === "playing") {
      if (introTick >= maxLen) {
        setIntroPhase("holding");
        return;
      }
      const timer = setTimeout(() => setIntroTick((c) => c + 1), 55);
      return () => clearTimeout(timer);
    }
    if (introPhase === "holding") {
      const hold = setTimeout(() => {
        introOpacity.value = withTiming(0, { duration: 1000, easing: Easing.out(Easing.ease) }, (finished) => {
          if (finished) runOnJS(setIntroPhase)("done");
        });
      }, 1500);
      return () => clearTimeout(hold);
    }
  }, [introPhase, introTick]);

  const introAnimStyle = useAnimatedStyle(() => ({
    opacity: introOpacity.value,
  }));

  const todayStr = useMemo(() => getTodayString(), []);
  const displayDate = useMemo(() => getDisplayDate(), []);
  const dailyLevels = useMemo(() => ({
    easy: generateDailyPuzzle(todayStr, "easy"),
    medium: generateDailyPuzzle(todayStr, "medium"),
    hard: generateDailyPuzzle(todayStr, "hard"),
  }), [todayStr]);

  const isTutorialMode = tutorialDone === false;
  const isBridgeTutorial = showBridgeTutorial && !isTutorialMode;
  const tutorialLesson = isTutorialMode ? TUTORIAL_LESSONS[tutorialStep] : isBridgeTutorial ? BRIDGE_TUTORIAL : null;
  const activeLevel = tutorialLesson ? tutorialLesson.level : dailyLevels[dailyDifficulty];
  const grid = useMemo(() => buildGrid(activeLevel), [activeLevel]);
  const freeCellCount = useMemo(() => getFreeCellCount(grid), [grid]);
  const bridgeCount = useMemo(() => getBridgeCount(grid), [grid]);
  const totalRequired = useMemo(() => freeCellCount + bridgeCount, [freeCellCount, bridgeCount]);
  const maxLabel = useMemo(() => getMaxLabel(activeLevel), [activeLevel]);

  const gridRef = useRef<View>(null);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const hasWonRef = useRef(hasWon);
  hasWonRef.current = hasWon;
  const lastCellRef = useRef<string | null>(null);
  const gridOriginRef = useRef({ x: 0, y: 0 });

  const modalSlide = useSharedValue(400);
  const modalOpacity = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);

  const gridRef2 = useRef(grid);
  gridRef2.current = grid;
  const levelRef = useRef(activeLevel);
  levelRef.current = activeLevel;
  const freeCellCountRef = useRef(freeCellCount);
  freeCellCountRef.current = freeCellCount;
  const totalRequiredRef = useRef(totalRequired);
  totalRequiredRef.current = totalRequired;
  const maxLabelRef = useRef(maxLabel);
  maxLabelRef.current = maxLabel;

  const screenWidth = Dimensions.get("window").width;
  const availableWidth = screenWidth - Spacing.lg * 2;

  const cellSize = Math.min(
    MAX_CELL_SIZE,
    Math.max(MIN_CELL_SIZE, Math.floor((availableWidth - (activeLevel.width - 1) * CELL_GAP) / activeLevel.width))
  );

  const gridWidth = cellSize * activeLevel.width + (activeLevel.width - 1) * CELL_GAP;
  const gridHeight = cellSize * activeLevel.height + (activeLevel.height - 1) * CELL_GAP;
  const step = cellSize + CELL_GAP;

  const cellSizeRef = useRef(cellSize);
  cellSizeRef.current = cellSize;
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    setConfig({
      headerMode: "default",
      title: "Pathflow",
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings]);

  useEffect(() => {
    if (context.storage) {
      context.storage.get<Record<string, string>>("dailyCompletedMap").then((saved) => {
        if (saved) setDailyCompletedMap(saved);
      }).catch(() => {});
      context.storage.get<boolean>("tutorialComplete").then((saved) => {
        setTutorialDone(saved === true);
      }).catch(() => {
        setTutorialDone(false);
      });
      context.storage.get<boolean>("bridgeTutorialComplete").then((saved) => {
        setBridgeTutorialDone(saved === true);
      }).catch(() => {});
    } else {
      setTutorialDone(true);
    }
  }, []);

  const measureGrid = useCallback(() => {
    if (gridRef.current) {
      gridRef.current.measureInWindow((x, y) => {
        gridOriginRef.current = { x, y };
      });
    }
  }, []);

  const getCellAt = useCallback(
    (pageX: number, pageY: number): Cell | null => {
      const lvl = levelRef.current;
      const g = gridRef2.current;
      if (!lvl) return null;
      const cs = cellSizeRef.current;
      const s = stepRef.current;
      const relX = pageX - gridOriginRef.current.x;
      const relY = pageY - gridOriginRef.current.y;
      const col = Math.floor(relX / s);
      const row = Math.floor(relY / s);
      if (col < 0 || col >= lvl.width || row < 0 || row >= lvl.height) return null;
      const cellLocalX = relX - col * s;
      const cellLocalY = relY - row * s;
      if (cellLocalX > cs + 2 || cellLocalY > cs + 2) return null;
      return g[row]?.[col] ?? null;
    },
    []
  );

  const showSuccessModal = useCallback(() => {
    setReplayPhase("done");
    overlayOpacity.value = withTiming(1, { duration: 300 });
    modalSlide.value = withSpring(0, { damping: 18, stiffness: 120 });
    modalOpacity.value = withTiming(1, { duration: 250 });
  }, [overlayOpacity, modalSlide, modalOpacity]);

  const startPathReplay = useCallback((path: Cell[]) => {
    setWinningPath(path);
    setGameState(initialGameState());
    setReplayPhase("replaying");
    setReplayIndex(0);
  }, []);

  useEffect(() => {
    if (replayPhase !== "replaying" || winningPath.length === 0) return;

    if (replayIndex >= winningPath.length) {
      setTimeout(() => {
        haptics.success();
        showSuccessModal();
      }, 300);
      return;
    }

    const speed = Math.max(30, 800 / winningPath.length);
    const timer = setTimeout(() => {
      setReplayIndex((prev) => prev + 1);
      if (replayIndex % 3 === 0) haptics.light();
    }, speed);

    return () => clearTimeout(timer);
  }, [replayPhase, replayIndex, winningPath, haptics, showSuccessModal]);

  const replayVisiblePath = useMemo(() => {
    if (replayPhase !== "replaying" && replayPhase !== "done") return [];
    return winningPath.slice(0, replayIndex);
  }, [replayPhase, winningPath, replayIndex]);

  const replayVisitedSet = useMemo(() => {
    return new Set(replayVisiblePath.map((c) => cellKey(c.x, c.y)));
  }, [replayVisiblePath]);

  const triggerWin = useCallback(() => {
    setHasWon(true);
    haptics.success();
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    setSolveTime(elapsed);

    if (isTutorialMode || isBridgeTutorial) {
      setTutorialWon(true);
      return;
    }

    setDailyCompletedMap((prev) => {
      const next = { ...prev, [dailyDifficulty]: todayStr };
      if (context.storage) {
        context.storage.set("dailyCompletedMap", next).catch(() => {});
      }
      return next;
    });

    const savedPath = [...gameStateRef.current.path];
    setTimeout(() => startPathReplay(savedPath), 600);
  }, [haptics, startTime, context.storage, dailyDifficulty, todayStr, startPathReplay, isTutorialMode, isBridgeTutorial]);

  const handleTutorialNext = useCallback(() => {
    if (tutorialStep < TUTORIAL_LESSONS.length - 1) {
      setTutorialStep((prev) => prev + 1);
      setGameState(initialGameState());
      setHasWon(false);
      setTutorialWon(false);
      lastCellRef.current = null;
      haptics.medium();
    } else {
      setTutorialDone(true);
      setTutorialWon(false);
      setGameState(initialGameState());
      setHasWon(false);
      lastCellRef.current = null;
      haptics.success();
      if (context.storage) {
        context.storage.set("tutorialComplete", true).catch(() => {});
      }
    }
  }, [tutorialStep, haptics, context.storage]);

  const handleBridgeTutorialDone = useCallback(() => {
    setBridgeTutorialDone(true);
    setShowBridgeTutorial(false);
    setTutorialWon(false);
    setGameState(initialGameState());
    setHasWon(false);
    lastCellRef.current = null;
    setDailyDifficulty("hard");
    haptics.success();
    if (context.storage) {
      context.storage.set("bridgeTutorialComplete", true).catch(() => {});
    }
  }, [haptics, context.storage]);

  const findBridge = useCallback(
    (from: Cell, to: Cell, state: GameState): Cell[] | null => {
      const lvl = levelRef.current;
      const g = gridRef2.current;
      if (!lvl) return null;
      const maxDist = 6;
      const toKey = cellKey(to.x, to.y);
      const fromKey = cellKey(from.x, from.y);
      const queue: { cell: Cell; path: Cell[] }[] = [{ cell: from, path: [] }];
      const seen = new Set<string>([fromKey]);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = [
          { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
          { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        ];
        for (const { dx, dy } of neighbors) {
          const nx = current.cell.x + dx;
          const ny = current.cell.y + dy;
          if (nx < 0 || nx >= lvl.width || ny < 0 || ny >= lvl.height) continue;
          const neighbor = g[ny]?.[nx];
          if (!neighbor || neighbor.blocked) continue;
          const nKey = cellKey(nx, ny);
          if (seen.has(nKey)) continue;
          if (state.visited.has(nKey) && nKey !== toKey) {
            if (neighbor.bridge) {
              const pv = state.path.filter((c) => c.x === nx && c.y === ny).length;
              if (pv >= 2) continue;
              const exitX = nx + dx;
              const exitY = ny + dy;
              if (exitX < 0 || exitX >= lvl.width || exitY < 0 || exitY >= lvl.height) continue;
              const exitCell = g[exitY]?.[exitX];
              if (!exitCell || exitCell.blocked) continue;
              const exitKey = cellKey(exitX, exitY);
              if (state.visited.has(exitKey) && exitKey !== toKey) continue;
              if (seen.has(exitKey)) continue;
              const bridgePath = [...current.path, neighbor, exitCell];
              if (bridgePath.length > maxDist) continue;
              let valid = true;
              let tempNextLabel = state.nextRequiredLabel;
              for (const s of bridgePath) {
                if (s.label !== null) {
                  if (s.label !== tempNextLabel) { valid = false; break; }
                  tempNextLabel++;
                }
              }
              if (!valid) continue;
              if (exitKey === toKey) return bridgePath;
              seen.add(nKey);
              seen.add(exitKey);
              queue.push({ cell: exitCell, path: bridgePath });
            } else {
              continue;
            }
          } else {
            const bridgePath = [...current.path, neighbor];
            if (bridgePath.length > maxDist) continue;
            let valid = true;
            let tempNextLabel = state.nextRequiredLabel;
            for (const s of bridgePath) {
              if (s.label !== null) {
                if (s.label !== tempNextLabel) { valid = false; break; }
                tempNextLabel++;
              }
            }
            if (!valid) continue;
            if (nKey === toKey) return bridgePath;
            seen.add(nKey);
            queue.push({ cell: neighbor, path: bridgePath });
          }
        }
      }
      return null;
    },
    []
  );

  const applyMove = useCallback(
    (cell: Cell, state: GameState): GameState => {
      const key = cellKey(cell.x, cell.y);
      const newPath = [...state.path, cell];
      const newVisited = new Set(state.visited);
      newVisited.add(key);
      const nextLabel = cell.label === state.nextRequiredLabel
        ? state.nextRequiredLabel + 1
        : state.nextRequiredLabel;
      return { path: newPath, visited: newVisited, currentCell: cell, nextRequiredLabel: nextLabel };
    },
    []
  );

  const processTouch = useCallback(
    (pageX: number, pageY: number) => {
      try {
      if (hasWonRef.current) return;
      const cell = getCellAt(pageX, pageY);
      if (!cell || cell.blocked) return;
      const key = cellKey(cell.x, cell.y);
      if (key === lastCellRef.current) return;
      const state = gameStateRef.current;

      const showMissedHint = (c: Cell, pathLen: number) => {
        if (c.label === maxLabelRef.current && pathLen < totalRequiredRef.current) {
          if (missedCellsTimer.current) clearTimeout(missedCellsTimer.current);
          setMissedCellsHint(true);
          missedCellsTimer.current = setTimeout(() => setMissedCellsHint(false), 3000);
        }
      };

      const checkWin = (s: GameState, lastC: Cell) => {
        if (s.path.length === totalRequiredRef.current && s.nextRequiredLabel === maxLabelRef.current + 1 && lastC.label === maxLabelRef.current) {
          setTimeout(() => triggerWin(), 100);
          return true;
        }
        return false;
      };

      if (state.path.length === 0) {
        if (cell.label !== 1) return;
        lastCellRef.current = key;
        haptics.medium();
        setStartTime(Date.now());
        setGameState({ path: [cell], visited: new Set([key]), currentCell: cell, nextRequiredLabel: 2 });
        return;
      }
      if (!state.currentCell) return;

      if (state.visited.has(key)) {
        if (cell.bridge && isAdjacent(state.currentCell, cell)) {
          const pathVisits = state.path.filter((c) => c.x === cell.x && c.y === cell.y).length;
          if (pathVisits < 2) {
            const dx = cell.x - state.currentCell.x;
            const dy = cell.y - state.currentCell.y;
            const exitX = cell.x + dx;
            const exitY = cell.y + dy;
            const lvl = levelRef.current;
            const g = gridRef2.current;
            if (lvl && exitX >= 0 && exitX < lvl.width && exitY >= 0 && exitY < lvl.height) {
              const exitCell = g[exitY]?.[exitX];
              if (exitCell && !exitCell.blocked && !state.visited.has(cellKey(exitX, exitY))) {
                lastCellRef.current = cellKey(exitX, exitY);
                const bridgeState = applyMove(cell, state);
                const exitState = applyMove(exitCell, bridgeState);
                haptics.medium();
                setGameState(exitState);
                if (!checkWin(exitState, exitCell)) showMissedHint(exitCell, exitState.path.length);
                return;
              }
            }
          }
        }
        let idx = -1;
        for (let i = state.path.length - 1; i >= 0; i--) {
          if (state.path[i].x === cell.x && state.path[i].y === cell.y) { idx = i; break; }
        }
        if (idx === -1) return;
        lastCellRef.current = key;
        const newPath = state.path.slice(0, idx + 1);
        const newVisited = new Set(newPath.map((c) => cellKey(c.x, c.y)));
        haptics.selection();
        setGameState({ path: newPath, visited: newVisited, currentCell: cell, nextRequiredLabel: recomputeNextLabel(newPath) });
        return;
      }

      if (cell.label !== null && cell.label !== state.nextRequiredLabel) return;

      if (isAdjacent(state.currentCell, cell)) {
        lastCellRef.current = key;
        const newState = applyMove(cell, state);
        if (cell.label !== null) haptics.medium(); else haptics.selection();
        setGameState(newState);
        if (!checkWin(newState, cell)) showMissedHint(cell, newState.path.length);
        return;
      }

      const bridge = findBridge(state.currentCell, cell, state);
      if (!bridge || bridge.length === 0) return;
      lastCellRef.current = key;
      let current = state;
      for (const s of bridge) current = applyMove(s, current);
      haptics.selection();
      setGameState(current);
      const lastCell = bridge[bridge.length - 1];
      if (!checkWin(current, lastCell)) showMissedHint(lastCell, current.path.length);
      } catch (_e) {}
    },
    [getCellAt, haptics, triggerWin, findBridge, applyMove]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          const { pageX, pageY } = evt.nativeEvent;
          measureGrid();
          setTimeout(() => processTouch(pageX, pageY), 0);
        },
        onPanResponderMove: (_evt: GestureResponderEvent, gs: PanResponderGestureState) => {
          processTouch(gs.moveX, gs.moveY);
        },
        onPanResponderRelease: () => { lastCellRef.current = null; },
        onPanResponderTerminate: () => { lastCellRef.current = null; },
      }),
    [measureGrid, processTouch]
  );

  const handleUndo = () => {
    if (hasWon) return;
    setMissedCellsHint(false);
    setGameState((prev) => {
      if (prev.path.length <= 1) return initialGameState();
      const newPath = prev.path.slice(0, -1);
      const newVisited = new Set(newPath.map((c) => cellKey(c.x, c.y)));
      return { path: newPath, visited: newVisited, currentCell: newPath[newPath.length - 1], nextRequiredLabel: recomputeNextLabel(newPath) };
    });
    lastCellRef.current = null;
    haptics.light();
  };

  const handleReset = () => {
    setGameState(initialGameState());
    setHasWon(false);
    setReplayPhase("none");
    setReplayIndex(0);
    setWinningPath([]);
    setMissedCellsHint(false);
    setHintCells(new Set());
    setHintsUsed(0);
    if (missedCellsTimer.current) clearTimeout(missedCellsTimer.current);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    lastCellRef.current = null;
    modalSlide.value = 400;
    modalOpacity.value = 0;
    overlayOpacity.value = 0;
    haptics.medium();
  };

  const handleHint = () => {
    if (hasWon || isTutorialMode || isBridgeTutorial) return;
    const sol = activeLevel.solution;
    if (sol.length === 0) return;

    if (hintTimer.current) clearTimeout(hintTimer.current);

    const { path } = gameState;
    const segment = new Set<string>();

    let startIdx = 0;

    if (path.length > 0) {
      const pathMatchesSolution = path.every((c, i) => {
        if (i >= sol.length) return false;
        return c.x === sol[i][0] && c.y === sol[i][1];
      });

      if (pathMatchesSolution && path.length < sol.length) {
        startIdx = path.length;
      } else {
        startIdx = 0;
      }
    }

    if (startIdx >= sol.length) {
      setHintCells(new Set());
      return;
    }

    segment.add(cellKey(sol[startIdx][0], sol[startIdx][1]));

    if (startIdx + 1 < sol.length) {
      const dx = sol[startIdx + 1][0] - sol[startIdx][0];
      const dy = sol[startIdx + 1][1] - sol[startIdx][1];

      for (let i = startIdx + 1; i < sol.length; i++) {
        const cdx = sol[i][0] - sol[i - 1][0];
        const cdy = sol[i][1] - sol[i - 1][1];
        if (cdx !== dx || cdy !== dy) break;
        segment.add(cellKey(sol[i][0], sol[i][1]));
      }
    }

    setHintCells(segment);
    setHintsUsed((prev) => prev + 1);
    haptics.light();

    hintTimer.current = setTimeout(() => setHintCells(new Set()), 3000);
  };

  const switchDifficulty = (diff: DailyDifficulty) => {
    if (diff === dailyDifficulty && !showBridgeTutorial) return;
    if (diff === "hard" && !bridgeTutorialDone) {
      setShowBridgeTutorial(true);
      setTutorialWon(false);
      setGameState(initialGameState());
      setHasWon(false);
      lastCellRef.current = null;
      return;
    }
    setShowBridgeTutorial(false);
    setDailyDifficulty(diff);
    setGameState(initialGameState());
    setHasWon(false);
    setReplayPhase("none");
    setReplayIndex(0);
    setWinningPath([]);
    setHintCells(new Set());
    setHintsUsed(0);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    lastCellRef.current = null;
    modalSlide.value = 400;
    modalOpacity.value = 0;
    overlayOpacity.value = 0;
  };

  const handleContinue = () => {
    haptics.success();
    onComplete({
      content: {
        type: "text",
        value: `Solved today's ${DAILY_CONFIGS[dailyDifficulty].label} challenge in ${solveTime}s`,
      },
      metadata: {
        difficulty: dailyDifficulty,
        solveTime,
        dailyCompleted: dailyCompletedMap,
      },
    });
  };

  const modalAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: modalSlide.value }],
    opacity: modalOpacity.value,
  }));

  const overlayAnimStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const isReplaying = replayPhase === "replaying" || replayPhase === "done";

  const displayPath = isReplaying ? replayVisiblePath : gameState.path;
  const displayVisited = isReplaying ? replayVisitedSet : gameState.visited;
  const displayHead = isReplaying
    ? (replayVisiblePath.length > 0 ? replayVisiblePath[replayVisiblePath.length - 1] : null)
    : gameState.currentCell;

  const halfCell = cellSize / 2;
  const pathPoints = displayPath
    .map((c) => `${c.x * step + halfCell},${c.y * step + halfCell}`)
    .join(" ");

  const progress = totalRequired > 0
    ? (isReplaying ? replayVisiblePath.length / totalRequired : gameState.path.length / totalRequired)
    : 0;

  const isDone = dailyCompletedMap[dailyDifficulty] === todayStr;

  if (introPhase !== "done") {
    const skipIntro = () => {
      introOpacity.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) }, (finished) => {
        if (finished) runOnJS(setIntroPhase)("done");
      });
    };
    const iw = screenWidth - Spacing.xl * 4;
    const iCellSize = Math.floor((iw - (INTRO_GRID.w - 1) * INTRO_CELL_GAP) / INTRO_GRID.w);
    const iStep = iCellSize + INTRO_CELL_GAP;
    const iGridW = iStep * INTRO_GRID.w - INTRO_CELL_GAP;
    const iGridH = iStep * INTRO_GRID.h - INTRO_CELL_GAP;
    const iRadius = Math.max(3, iCellSize * 0.3);
    const iHalf = iCellSize / 2;
    const iStrokeW = Math.max(3, iCellSize * 0.14);

    const revealedMap = new Map<string, number>();
    const total = introRevealed.length;
    for (let i = 0; i < total; i++) {
      const [cx, cy] = introRevealed[i];
      revealedMap.set(`${cx},${cy}`, total - i);
    }

    const letterReveals: number[] = [];
    for (const letter of INTRO_LETTERS) {
      let count = 0;
      for (const [cx, cy] of letter) {
        if (revealedMap.has(`${cx},${cy}`)) count++;
      }
      letterReveals.push(count);
    }

    const trailLen = 8;
    const settledAlpha = introPhase === "holding" ? "60" : "30";
    return (
      <Animated.View style={[styles.introContainer, { backgroundColor: isDark ? "#06060C" : "#F6F6FC" }, introAnimStyle]}>
        <Pressable onPress={skipIntro} style={[styles.introGrid, { width: iGridW, height: iGridH }]}>
          {Array.from({ length: INTRO_GRID.h }, (_, iy) =>
            Array.from({ length: INTRO_GRID.w }, (_, ix) => {
              const k = `${ix},${iy}`;
              const isLetter = INTRO_FILLED_SET.has(k);
              if (!isLetter) return null;
              const recency = revealedMap.get(k);
              const isRevealed = recency !== undefined;

              let bg: string;
              if (!isRevealed) {
                bg = isDark ? "#111118" : "#E8E8F2";
              } else if (recency! <= 1) {
                bg = theme.primary;
              } else if (recency! <= trailLen) {
                const t = (recency! - 1) / (trailLen - 1);
                const alpha = Math.round(255 * (0.9 - t * 0.55)).toString(16).padStart(2, "0");
                bg = theme.primary + alpha;
              } else {
                bg = theme.primary + settledAlpha;
              }

              return (
                <View
                  key={k}
                  style={{
                    position: "absolute",
                    left: ix * iStep,
                    top: iy * iStep,
                    width: iCellSize,
                    height: iCellSize,
                    borderRadius: iRadius,
                    backgroundColor: bg,
                  }}
                />
              );
            })
          )}
          <Svg
            width={iGridW}
            height={iGridH}
            style={[StyleSheet.absoluteFill, { zIndex: 3 }]}
            pointerEvents="none"
          >
            {INTRO_LETTERS.map((letter, li) => {
              const count = letterReveals[li];
              if (count < 2) return null;
              const revealedCells = letter.slice(0, count);
              const pts = revealedCells
                .map(([cx, cy]) => `${cx * iStep + iHalf},${cy * iStep + iHalf}`)
                .join(" ");
              return (
                <Polyline
                  key={li}
                  points={pts}
                  stroke={theme.primary}
                  strokeWidth={iStrokeW}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.35}
                />
              );
            })}
          </Svg>
        </Pressable>
      </Animated.View>
    );
  }

  if (tutorialDone === null) {
    return (
      <GlassBackground style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
        <View style={styles.centerContent}>
          <ThemedText style={[styles.dateText, { color: theme.textSecondary }]}>Loading...</ThemedText>
        </View>
      </GlassBackground>
    );
  }

  const renderTopBar = () => {
    if (isTutorialMode || isBridgeTutorial) {
      return (
        <View style={styles.tutorialTopSection}>
          <View style={styles.tutorialProgressRow}>
            {isTutorialMode ? TUTORIAL_LESSONS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.tutorialDot,
                  {
                    backgroundColor: i < tutorialStep
                      ? theme.success
                      : i === tutorialStep
                      ? theme.primary
                      : theme.backgroundSecondary,
                    borderColor: i === tutorialStep ? theme.primary : "transparent",
                    borderWidth: i === tutorialStep ? 2 : 0,
                  },
                ]}
              />
            )) : (
              <View
                style={[
                  styles.tutorialDot,
                  { backgroundColor: theme.primary, borderColor: theme.primary, borderWidth: 2 },
                ]}
              />
            )}
            <Pressable
              onPress={() => {
                if (isBridgeTutorial) {
                  handleBridgeTutorialDone();
                } else {
                  setTutorialDone(true);
                  setTutorialWon(false);
                  setGameState(initialGameState());
                  setHasWon(false);
                  lastCellRef.current = null;
                  haptics.light();
                  if (context.storage) {
                    context.storage.set("tutorialComplete", true).catch(() => {});
                  }
                }
              }}
              hitSlop={8}
              style={{ marginLeft: "auto" }}
            >
              <ThemedText style={{ fontSize: 13, fontWeight: "500", color: theme.textSecondary }}>
                Skip
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.tutorialHeader}>
            <View style={[styles.tutorialIconWrap, { backgroundColor: theme.primary + "15" }]}>
              <Feather name={tutorialLesson?.icon ?? "move"} size={20} color={theme.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <ThemedText style={[styles.tutorialTitle, { color: theme.text }]}>
                {tutorialLesson?.title}
              </ThemedText>
              <ThemedText style={[styles.tutorialInstruction, { color: theme.textSecondary }]}>
                {tutorialLesson?.instruction}
              </ThemedText>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.topSection}>
        <View style={styles.dateRow}>
          <Feather name="calendar" size={15} color={theme.primary} style={{ marginRight: 6 }} />
          <ThemedText style={[styles.dateText, { color: theme.text }]}>
            {displayDate}
          </ThemedText>
        </View>

        <View style={[styles.diffToggle, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
          {DAILY_DIFFICULTIES.map((diff) => {
            const active = diff === dailyDifficulty;
            const done = dailyCompletedMap[diff] === todayStr;
            return (
              <Pressable
                key={diff}
                onPress={() => switchDifficulty(diff)}
                style={[
                  styles.diffOption,
                  active ? { backgroundColor: theme.primary } : null,
                ]}
                disabled={hasWon || isReplaying}
              >
                {done && !active ? (
                  <Feather name="check" size={12} color={theme.success} style={{ marginRight: 4 }} />
                ) : null}
                <ThemedText style={[
                  styles.diffText,
                  { color: active ? "#FFFFFF" : theme.text },
                ]}>
                  {DAILY_CONFIGS[diff].label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.topBarActions}>
          <Pressable
            onPress={handleHint}
            style={[styles.iconBtn, { backgroundColor: theme.backgroundSecondary }]}
            disabled={hasWon || isTutorialMode || activeLevel.solution.length === 0}
            hitSlop={8}
          >
            <Feather
              name="help-circle"
              size={18}
              color={hasWon || isTutorialMode ? theme.textSecondary + "40" : theme.warning}
            />
          </Pressable>
          <Pressable
            onPress={handleUndo}
            style={[styles.iconBtn, { backgroundColor: theme.backgroundSecondary, marginLeft: Spacing.xs }]}
            disabled={gameState.path.length === 0 || hasWon}
            hitSlop={8}
          >
            <Feather
              name="corner-up-left"
              size={18}
              color={gameState.path.length === 0 || hasWon ? theme.textSecondary + "40" : theme.text}
            />
          </Pressable>
          <Pressable
            onPress={handleReset}
            style={[styles.iconBtn, { backgroundColor: theme.backgroundSecondary, marginLeft: Spacing.xs }]}
            disabled={gameState.path.length === 0 && !hasWon}
            hitSlop={8}
          >
            <Feather
              name="rotate-ccw"
              size={18}
              color={gameState.path.length === 0 && !hasWon ? theme.textSecondary + "40" : theme.text}
            />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <GlassBackground style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
      {renderTopBar()}

      <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSecondary }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: isReplaying || hasWon ? theme.success : theme.primary,
              width: `${Math.round(progress * 100)}%`,
            },
          ]}
        />
      </View>

      <View style={styles.gridWrapper}>
        <View
          ref={gridRef}
          onLayout={measureGrid}
          style={[styles.gridContainer, { width: gridWidth, height: gridHeight }]}
          {...(isReplaying ? {} : panResponder.panHandlers)}
        >
          <Svg
            width={gridWidth}
            height={gridHeight}
            style={[StyleSheet.absoluteFill, { zIndex: 3 }]}
            pointerEvents="none"
          >
            {displayPath.length >= 2 ? (
              <Polyline
                points={pathPoints}
                stroke={isReplaying ? theme.success : hasWon ? theme.success : theme.primary}
                strokeWidth={Math.max(4, cellSize * 0.14)}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={0.55}
              />
            ) : null}
          </Svg>

          {grid.map((row) =>
            row.map((cell) => {
              if (cell.blocked) {
                return (
                  <View
                    key={cellKey(cell.x, cell.y)}
                    style={[
                      styles.cell,
                      {
                        width: cellSize,
                        height: cellSize,
                        left: cell.x * step,
                        top: cell.y * step,
                        backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)",
                        borderRadius: cellSize * 0.18,
                      },
                    ]}
                  >
                    <View
                      style={{
                        width: cellSize * 0.3,
                        height: cellSize * 0.3,
                        borderRadius: cellSize,
                        backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
                      }}
                    />
                  </View>
                );
              }

              const key = cellKey(cell.x, cell.y);
              const isVisited = displayVisited.has(key);
              const isHead = displayHead?.x === cell.x && displayHead?.y === cell.y;
              const isNextRequired = !isReplaying && cell.label === gameState.nextRequiredLabel && !isVisited;
              const bridgeVisits = cell.bridge ? displayPath.filter((c) => c.x === cell.x && c.y === cell.y).length : 0;
              const isBridgeCrossed = cell.bridge && bridgeVisits >= 2;
              const isHinted = hintCells.has(key);

              let bgColor = isDark ? theme.backgroundSecondary : theme.backgroundTertiary;
              if (isHinted && !isVisited) {
                bgColor = theme.warning + "30";
              } else if (isReplaying && isVisited) {
                bgColor = theme.success + "30";
              } else if (isHead && !isReplaying) {
                bgColor = theme.primary;
              } else if (isHead && isReplaying) {
                bgColor = theme.success;
              } else if (isVisited && hasWon) {
                bgColor = theme.success + "25";
              } else if (isBridgeCrossed) {
                bgColor = theme.primary + "55";
              } else if (isVisited) {
                bgColor = theme.primary + "35";
              } else if (isNextRequired) {
                bgColor = theme.primary + "12";
              }

              let textColor = theme.text;
              if (isHead) {
                textColor = "#FFFFFF";
              } else if (isReplaying && isVisited && cell.label !== null) {
                textColor = theme.success;
              } else if (isVisited && cell.label !== null) {
                textColor = theme.primary;
              } else if (isNextRequired) {
                textColor = theme.primary;
              }

              return (
                <View
                  key={key}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      left: cell.x * step,
                      top: cell.y * step,
                      backgroundColor: bgColor,
                      borderRadius: cellSize * 0.18,
                      borderWidth: isHinted && !isVisited ? 2.5 : isHead ? 2.5 : cell.bridge ? 1.5 : isNextRequired ? 1.5 : 0,
                      borderColor: isHinted && !isVisited
                        ? theme.warning
                        : isHead
                        ? (isReplaying ? theme.success : theme.primary)
                        : cell.bridge
                        ? (isBridgeCrossed ? theme.primary + "70" : isVisited ? theme.primary + "40" : (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"))
                        : isNextRequired
                        ? theme.primary + "50"
                        : "transparent",
                      borderStyle: cell.bridge && !isHead ? "dashed" as const : "solid" as const,
                      zIndex: isHead ? 4 : 1,
                    },
                  ]}
                >
                  {cell.label !== null ? (
                    <ThemedText
                      style={[
                        styles.cellLabel,
                        {
                          color: textColor,
                          fontSize: cellSize > 50 ? 20 : cellSize > 40 ? 17 : 14,
                          fontWeight: "700",
                        },
                      ]}
                    >
                      {cell.label}
                    </ThemedText>
                  ) : null}

                  {isHead && !cell.label ? (
                    <View
                      style={{
                        backgroundColor: "rgba(255,255,255,0.85)",
                        width: Math.max(7, cellSize * 0.2),
                        height: Math.max(7, cellSize * 0.2),
                        borderRadius: cellSize,
                      }}
                    />
                  ) : null}

                  {cell.bridge && !isHead ? (
                    <ThemedText style={{
                      fontSize: Math.max(10, cellSize * 0.35),
                      fontWeight: "700",
                      color: isBridgeCrossed ? theme.primary + "90" : isVisited ? theme.primary + "50" : (isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.18)"),
                    }}>B</ThemedText>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </View>

      {gameState.path.length === 0 && !hasWon && !isReplaying && !isTutorialMode && !isBridgeTutorial ? (
        <View style={styles.hintContainer}>
          <View style={[styles.hintPill, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="navigation" size={14} color={theme.primary} style={{ marginRight: 6 }} />
            <ThemedText style={[styles.hintText, { color: theme.textSecondary }]}>
              {isDone ? "Already solved - replay for fun" : "Drag from 1 to draw your path"}
            </ThemedText>
          </View>
        </View>
      ) : null}

      {replayPhase === "replaying" ? (
        <View style={styles.hintContainer}>
          <View style={[styles.hintPill, { backgroundColor: theme.success + "15" }]}>
            <Feather name="zap" size={14} color={theme.success} style={{ marginRight: 6 }} />
            <ThemedText style={[styles.hintText, { color: theme.success }]}>
              Replaying your solution...
            </ThemedText>
          </View>
        </View>
      ) : null}

      {missedCellsHint ? (
        <View style={styles.hintContainer}>
          <View style={[styles.hintPill, { backgroundColor: theme.warning + "15" }]}>
            <Feather name="alert-circle" size={14} color={theme.warning} style={{ marginRight: 6 }} />
            <ThemedText style={[styles.hintText, { color: theme.warning }]}>
              Visit every empty cell before reaching the end
            </ThemedText>
          </View>
        </View>
      ) : null}

      {(isTutorialMode || isBridgeTutorial) && tutorialWon ? (
        <View style={styles.tutorialWinBar}>
          <View style={[styles.tutorialWinPill, { backgroundColor: theme.success + "12", borderColor: theme.success + "30" }]}>
            <Feather name="check-circle" size={18} color={theme.success} style={{ marginRight: 8 }} />
            <ThemedText style={[styles.tutorialWinText, { color: theme.success }]}>
              {isBridgeTutorial ? "Bridge mastered" : tutorialStep < TUTORIAL_LESSONS.length - 1 ? "Got it" : "You're ready"}
            </ThemedText>
            <Pressable
              onPress={isBridgeTutorial ? handleBridgeTutorialDone : handleTutorialNext}
              style={[styles.tutorialNextBtn, { backgroundColor: theme.primary }]}
            >
              <ThemedText style={styles.tutorialNextBtnText}>
                {isBridgeTutorial ? "Play Hard Mode" : tutorialStep < TUTORIAL_LESSONS.length - 1 ? "Next Lesson" : "Start Playing"}
              </ThemedText>
              <Feather name="arrow-right" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {(isTutorialMode || isBridgeTutorial) && !tutorialWon && gameState.path.length === 0 ? (
        <View style={styles.hintContainer}>
          <View style={[styles.hintPill, { backgroundColor: theme.primary + "10" }]}>
            <Feather name="info" size={14} color={theme.primary} style={{ marginRight: 6 }} />
            <ThemedText style={[styles.hintText, { color: theme.primary }]}>
              Start by tapping the cell marked 1
            </ThemedText>
          </View>
        </View>
      ) : null}

      {replayPhase === "done" ? (
        <>
          <Animated.View style={[styles.successOverlay, overlayAnimStyle]} pointerEvents="box-none" />
          <Animated.View style={[styles.successModalWrap, modalAnimStyle]}>
            <View style={[styles.successModal, { backgroundColor: theme.backgroundDefault }]}>
              <View style={[styles.successIconRing, { backgroundColor: theme.success + "15" }]}>
                <View style={[styles.successIconInner, { backgroundColor: theme.success + "25" }]}>
                  <Feather name="award" size={44} color={theme.success} />
                </View>
              </View>

              <ThemedText style={[styles.successTitle, { color: theme.text }]}>
                Brilliant
              </ThemedText>
              <ThemedText style={[styles.successSubtitle, { color: theme.textSecondary }]}>
                {DAILY_CONFIGS[dailyDifficulty].label} challenge complete
              </ThemedText>

              <View style={[styles.statRow, { borderColor: theme.border }]}>
                <View style={styles.statItem}>
                  <ThemedText style={[styles.statValue, { color: theme.primary }]}>
                    {solveTime}s
                  </ThemedText>
                  <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
                    Time
                  </ThemedText>
                </View>
                <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
                <View style={styles.statItem}>
                  <ThemedText style={[styles.statValue, { color: theme.primary }]}>
                    {activeLevel.width}x{activeLevel.height}
                  </ThemedText>
                  <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
                    Grid
                  </ThemedText>
                </View>
                <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
                <View style={styles.statItem}>
                  <ThemedText style={[styles.statValue, { color: theme.primary }]}>
                    {winningPath.length}
                  </ThemedText>
                  <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
                    Steps
                  </ThemedText>
                </View>
              </View>

              <Pressable
                onPress={handleContinue}
                style={[styles.continueBtn, { backgroundColor: theme.primary }]}
              >
                <ThemedText style={styles.continueBtnText}>Continue</ThemedText>
                <Feather name="arrow-right" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
              </Pressable>
            </View>
          </Animated.View>
        </>
      ) : null}

      <View style={{ paddingBottom: insets.bottom + Spacing.sm }} />
    </GlassBackground>
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
  },
  topSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dateText: {
    fontSize: 13,
    fontWeight: "600",
  },
  diffToggle: {
    flex: 1,
    flexDirection: "row",
    borderRadius: BorderRadius.full,
    padding: 3,
    borderWidth: 1,
  },
  diffOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  diffText: {
    fontSize: 12,
    fontWeight: "600",
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    height: 4,
    marginHorizontal: Spacing.lg,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  gridWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gridContainer: {
    position: "relative",
  },
  cell: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  cellLabel: {
    fontVariant: ["tabular-nums"],
  },
  hintContainer: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  hintPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  hintText: {
    fontSize: 14,
    fontWeight: "500",
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 10,
  },
  successModalWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "center",
    zIndex: 11,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 60,
  },
  successModal: {
    width: "100%",
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
    alignItems: "center",
    elevation: 20,
  },
  successIconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  successIconInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: 32,
    fontWeight: "800",
    marginBottom: Spacing.xs,
  },
  successSubtitle: {
    fontSize: 16,
    marginBottom: Spacing.lg,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xl,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
  },
  continueBtn: {
    flexDirection: "row",
    width: "100%",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 17,
  },
  tutorialTopSection: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  tutorialProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  tutorialDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tutorialHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  tutorialIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  tutorialTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 2,
  },
  tutorialInstruction: {
    fontSize: 14,
  },
  tutorialWinBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  tutorialWinPill: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  tutorialWinText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  tutorialNextBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  tutorialNextBtnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  introContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  introGrid: {
    position: "relative",
  },
});
