import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Spacing } from "@/constants/theme";
import type { WidgetProps } from "@/types/flow";

export function shouldDisplay(data: Record<string, unknown>): boolean {
  return true;
}

export default function PathflowWidget({ data, theme, isDark, practaName }: WidgetProps) {
  const completedLevels = Array.isArray(data.completedLevels) ? data.completedLevels.length : 0;

  const status = completedLevels > 0
    ? `${completedLevels} puzzle${completedLevels !== 1 ? "s" : ""} solved`
    : "No puzzles solved yet";

  const subtitle = completedLevels > 0
    ? "Tap to continue"
    : "Tap to start your first puzzle";

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.iconCircle, { backgroundColor: theme.accentSoft }]}>
          <Feather name="grid" size={20} color={theme.primary} />
        </View>
        <View style={styles.textContainer}>
          <ThemedText style={styles.title}>{practaName}</ThemedText>
          <ThemedText style={styles.stat}>{status}</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</ThemedText>
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
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  stat: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
  },
});
