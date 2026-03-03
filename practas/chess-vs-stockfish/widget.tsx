import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { Spacing } from "@/constants/theme";
import type { WidgetProps } from "@/types/flow";

const PIECE_SYMBOLS = {
  K: "\u2654",
  k: "\u265A",
};

export function shouldDisplay(data: Record<string, unknown>): boolean {
  return true;
}

export default function ChessWidget({ data, theme, isDark, practaName }: WidgetProps) {
  const stats = data.stats as { gamesPlayed?: number; wins?: number } | undefined;
  const gamesPlayed = stats?.gamesPlayed ?? 0;
  const wins = stats?.wins ?? 0;

  const stat = gamesPlayed > 0
    ? `${wins}W / ${gamesPlayed - wins}L`
    : "Ready to play";

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.iconCircle, { backgroundColor: theme.accentSoft }]}>
          <ThemedText style={styles.icon}>{PIECE_SYMBOLS.K}</ThemedText>
        </View>
        <View style={styles.textContainer}>
          <ThemedText style={styles.title}>{practaName}</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>{stat}</ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 24,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
  },
});
