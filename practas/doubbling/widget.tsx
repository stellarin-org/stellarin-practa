import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { WidgetProps } from "@/types/flow";

export function shouldDisplay(data: Record<string, unknown>): boolean {
  return true;
}

export default function MyPractaWidget({ data, theme, isDark, practaName }: WidgetProps) {
  const sessionCount = typeof data.sessionCount === "number" ? data.sessionCount : 0;
  const lastSession = typeof data.lastSession === "string" ? data.lastSession : null;

  const greeting = sessionCount > 0
    ? `${sessionCount} session${sessionCount !== 1 ? "s" : ""} completed`
    : "No sessions yet";

  const subtitle = lastSession
    ? `Last session: ${formatRelativeDate(lastSession)}`
    : "Tap to start your first session";

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.iconCircle, { backgroundColor: theme.accentSoft }]}>
          <Feather name="sun" size={20} color={theme.primary} />
        </View>
        <View style={styles.textContainer}>
          <ThemedText style={styles.title}>{practaName}</ThemedText>
          <ThemedText style={styles.stat}>{greeting}</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</ThemedText>
        </View>
      </View>
    </View>
  );
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
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
