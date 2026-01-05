import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius } from "@/constants/theme";

interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const { theme } = useTheme();
  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}>
      <View
        style={[
          styles.fill,
          { backgroundColor: theme.primary, width: `${progress}%` },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 6,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: BorderRadius.sm,
  },
});
