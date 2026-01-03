import React, { useEffect } from "react";
import { View, StyleSheet, FlatList, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

interface NewsItem {
  id: string;
  title: string;
  body: string;
  theme: string;
  tone: string;
  date: string;
  source_hints: string[];
  source_urls: string[];
  created_at: string;
}

interface GoodNewsProps extends PractaProps {}

const themeColors: Record<string, { bg: string; icon: string; iconName: keyof typeof Feather.glyphMap }> = {
  "Nature Bouncing Back": { bg: "#E8F5E9", icon: "#4CAF50", iconName: "sun" },
  "Knowledge Breakthroughs": { bg: "#E3F2FD", icon: "#2196F3", iconName: "zap" },
  "Human Kindness": { bg: "#FFF3E0", icon: "#FF9800", iconName: "heart" },
  "Progress & Innovation": { bg: "#F3E5F5", icon: "#9C27B0", iconName: "trending-up" },
};

function getThemeStyle(theme: string) {
  return themeColors[theme] || { bg: "#FFF8E1", icon: "#FFC107", iconName: "star" as keyof typeof Feather.glyphMap };
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function NewsCard({ item, theme: appTheme }: { item: NewsItem; theme: any }) {
  const themeStyle = getThemeStyle(item.theme);
  
  const handlePress = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    if (item.source_urls && item.source_urls.length > 0) {
      try {
        await Linking.openURL(item.source_urls[0]);
      } catch (error) {
      }
    }
  };

  return (
    <Card style={styles.newsCard} onPress={handlePress}>
      <View style={styles.cardHeader}>
        <View style={[styles.themeIcon, { backgroundColor: themeStyle.bg }]}>
          <Feather name={themeStyle.iconName} size={18} color={themeStyle.icon} />
        </View>
        <View style={styles.cardMeta}>
          <ThemedText style={[styles.themeBadge, { color: themeStyle.icon }]}>
            {item.theme}
          </ThemedText>
          <ThemedText style={[styles.dateText, { color: appTheme.textSecondary }]}>
            {formatDate(item.date)}
          </ThemedText>
        </View>
      </View>
      
      <ThemedText style={styles.newsTitle}>{item.title}</ThemedText>
      <ThemedText style={[styles.newsBody, { color: appTheme.textSecondary }]}>
        {item.body}
      </ThemedText>
      
      {item.source_hints && item.source_hints.length > 0 ? (
        <View style={styles.sourceRow}>
          <Feather name="external-link" size={12} color={appTheme.textSecondary} />
          <ThemedText style={[styles.sourceText, { color: appTheme.textSecondary }]}>
            {item.source_hints[0]}
          </ThemedText>
        </View>
      ) : null}
    </Card>
  );
}

export default function GoodNews({ context, onComplete, onSkip, onSettings, showSettings }: GoodNewsProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();

  useEffect(() => {
    setConfig({
      headerMode: "default",
      title: "Good News",
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings]);

  const newsData = (context.assets?.news as NewsItem[]) || [];

  const handleComplete = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onComplete({
      content: { 
        type: "text", 
        value: "Finished reading good news!"
      },
      metadata: { 
        completedAt: Date.now(),
        itemsRead: newsData.length
      },
    });
  };

  const renderItem = ({ item }: { item: NewsItem }) => (
    <NewsCard item={item} theme={theme} />
  );

  const ListHeader = () => (
    <View style={styles.listHeader}>
      <ThemedText style={styles.headerTitle}>Today's Good News</ThemedText>
      <ThemedText style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
        Positive stories from around the world
      </ThemedText>
    </View>
  );

  const ListFooter = () => (
    <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.xl }]}>
      <Pressable
        onPress={handleComplete}
        style={[styles.completeButton, { backgroundColor: theme.primary }]}
      >
        <Feather name="check-circle" size={20} color="white" />
        <ThemedText style={styles.completeButtonText}>Done Reading</ThemedText>
      </Pressable>
      
      {onSkip ? (
        <Pressable onPress={onSkip} style={styles.skipButton}>
          <ThemedText style={[styles.skipText, { color: theme.textSecondary }]}>
            Skip for now
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Feather name="inbox" size={48} color={theme.textSecondary} />
      <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
        No news available yet
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={newsData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: headerHeight + Spacing.lg },
        ]}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={EmptyState}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  listHeader: {
    marginBottom: Spacing.lg,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  headerSubtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  newsCard: {
    padding: Spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  themeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  cardMeta: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  themeBadge: {
    fontSize: 12,
    fontWeight: "600",
  },
  dateText: {
    fontSize: 12,
  },
  newsTitle: {
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
    marginBottom: Spacing.sm,
  },
  newsBody: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  sourceText: {
    fontSize: 12,
  },
  separator: {
    height: Spacing.md,
  },
  footer: {
    paddingTop: Spacing["2xl"],
    paddingBottom: Spacing.xl,
  },
  completeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  completeButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
  skipButton: {
    padding: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  skipText: {
    fontSize: 14,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["5xl"],
  },
  emptyText: {
    marginTop: Spacing.md,
    fontSize: 16,
  },
});
