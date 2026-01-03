import React, { useEffect, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, Platform, Linking, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

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
  sourceHints: string[];
  sourceUrls: string[];
  createdAt: string;
}

interface NewsResponse {
  generatedAt: string;
  snippetCount: number;
  snippets: NewsItem[];
}

interface GoodNewsProps extends PractaProps {}

const INITIAL_ARTICLE_COUNT = 14;

const themeColors: Record<string, { bg: string; icon: string; iconName: keyof typeof Feather.glyphMap }> = {
  "Nature Bouncing Back": { bg: "#E8F5E9", icon: "#4CAF50", iconName: "sun" },
  "Knowledge Breakthroughs": { bg: "#E3F2FD", icon: "#2196F3", iconName: "zap" },
  "Human Kindness": { bg: "#FFF3E0", icon: "#FF9800", iconName: "heart" },
  "Progress & Innovation": { bg: "#F3E5F5", icon: "#9C27B0", iconName: "trending-up" },
  "Healing & Recovery": { bg: "#FCE4EC", icon: "#E91E63", iconName: "activity" },
  "Human Ingenuity": { bg: "#E8EAF6", icon: "#3F51B5", iconName: "tool" },
  "People Helping People": { bg: "#FFF8E1", icon: "#FFC107", iconName: "users" },
  "Joy & Delight": { bg: "#FFFDE7", icon: "#FFEB3B", iconName: "smile" },
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
  
  const handleSourcePress = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    if (item.sourceUrls && item.sourceUrls.length > 0) {
      const sourceName = item.sourceHints?.[0] || "this website";
      
      Alert.alert(
        "Open Link",
        `Are you sure you want to visit ${sourceName}?`,
        [
          { text: "No", style: "cancel" },
          { 
            text: "Yes", 
            onPress: async () => {
              try {
                await Linking.openURL(item.sourceUrls[0]);
              } catch (error) {
              }
            }
          },
        ]
      );
    }
  };

  return (
    <Card style={styles.newsCard}>
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
      
      {item.sourceHints && item.sourceHints.length > 0 && item.sourceUrls && item.sourceUrls.length > 0 ? (
        <Pressable onPress={handleSourcePress} style={[styles.sourceRow, { backgroundColor: "#F0F0F0" }]}>
          <Feather name="external-link" size={11} color="#999" />
          <ThemedText style={styles.sourceText} numberOfLines={1}>
            {item.sourceHints[0].length > 30 ? item.sourceHints[0].slice(0, 30) + "..." : item.sourceHints[0]}
          </ThemedText>
        </Pressable>
      ) : null}
    </Card>
  );
}

const CDN_NEWS_PATH = "assets/shared/300a73ff-5180-43a6-b9dd-f3bac1d73dc2/news.json";

export default function GoodNews({ context, onComplete, onSkip, onSettings, showSettings }: GoodNewsProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();
  const [visibleCount, setVisibleCount] = useState(INITIAL_ARTICLE_COUNT);

  const { data: response, isLoading, error, refetch } = useQuery<NewsResponse>({
    queryKey: ["/api/cdn-proxy", CDN_NEWS_PATH],
    staleTime: 5 * 60 * 1000,
  });

  const allNews = response?.snippets || [];
  const displayedNews = allNews.slice(0, visibleCount);
  const hasMoreArticles = visibleCount < allNews.length;
  const isAtEnd = visibleCount >= allNews.length && allNews.length > 0;

  useEffect(() => {
    setConfig({
      headerMode: "default",
      title: "Good News",
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings]);

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
        itemsRead: displayedNews.length
      },
    });
  };

  const handleReadMore = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setVisibleCount((prev) => prev + INITIAL_ARTICLE_COUNT);
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
      {hasMoreArticles ? (
        <Pressable
          onPress={handleReadMore}
          style={[styles.readMoreButton, { borderColor: theme.primary }]}
        >
          <Feather name="chevron-down" size={20} color={theme.primary} />
          <ThemedText style={[styles.readMoreText, { color: theme.primary }]}>
            Read More
          </ThemedText>
        </Pressable>
      ) : null}

      {isAtEnd ? (
        <View style={styles.congratsContainer}>
          <View style={[styles.congratsIcon, { backgroundColor: "#E8F5E9" }]}>
            <Feather name="award" size={32} color="#4CAF50" />
          </View>
          <ThemedText style={styles.congratsTitle}>
            You made it to the end!
          </ThemedText>
          <ThemedText style={[styles.congratsSubtitle, { color: theme.textSecondary }]}>
            Thanks for spreading positivity today. The world is a little brighter because you chose to focus on the good.
          </ThemedText>
        </View>
      ) : null}

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

  const LoadingState = () => (
    <View style={styles.emptyState}>
      <ActivityIndicator size="large" color={theme.primary} />
      <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
        Loading good news...
      </ThemedText>
    </View>
  );

  const ErrorState = () => (
    <View style={styles.emptyState}>
      <Feather name="wifi-off" size={48} color={theme.textSecondary} />
      <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
        Could not load news
      </ThemedText>
      <Pressable 
        onPress={() => refetch()} 
        style={[styles.retryButton, { backgroundColor: theme.primary }]}
      >
        <ThemedText style={styles.retryText}>Try Again</ThemedText>
      </Pressable>
    </View>
  );

  const EmptyState = () => {
    if (isLoading) return <LoadingState />;
    if (error) return <ErrorState />;
    return (
      <View style={styles.emptyState}>
        <Feather name="inbox" size={48} color={theme.textSecondary} />
        <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
          No news available yet
        </ThemedText>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={displayedNews}
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
    alignSelf: "flex-start",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  sourceText: {
    fontSize: 12,
    fontWeight: "400",
    color: "#888",
  },
  separator: {
    height: Spacing.md,
  },
  footer: {
    paddingTop: Spacing["2xl"],
    paddingBottom: Spacing.xl,
  },
  readMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  readMoreText: {
    fontWeight: "600",
    fontSize: 16,
  },
  congratsContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  congratsIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  congratsTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  congratsSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
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
  retryButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  retryText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
});
