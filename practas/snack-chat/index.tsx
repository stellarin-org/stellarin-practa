import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  FlatList,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  SlideInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  runOnJS,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

interface FollowUpOption {
  text: string;
  npc_response: string;
}

interface DialogOption {
  text: string;
  strategy: string;
  npc_response: string;
  follow_up_options: FollowUpOption[];
}

interface Conversation {
  conv_id: string;
  context: string;
  npc_opening: string;
  dialog_tree: DialogOption[];
}

type ChatMessage = {
  id: string;
  text: string;
  sender: "npc" | "user";
  strategy?: string;
};

type ChatPhase = "opening" | "choose-response" | "npc-reply" | "choose-followup" | "npc-closing" | "done";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TypingIndicator({ theme }: { theme: any }) {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    dot1.value = withRepeat(
      withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 300 })),
      -1,
      false
    );
    dot2.value = withDelay(
      150,
      withRepeat(
        withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 300 })),
        -1,
        false
      )
    );
    dot3.value = withDelay(
      300,
      withRepeat(
        withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 300 })),
        -1,
        false
      )
    );
  }, []);

  const animDot1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
  const animDot2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
  const animDot3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[styles.typingContainer, { backgroundColor: theme.backgroundTertiary }]}
    >
      <Animated.View style={[styles.typingDot, { backgroundColor: theme.textSecondary }, animDot1]} />
      <Animated.View style={[styles.typingDot, { backgroundColor: theme.textSecondary }, animDot2]} />
      <Animated.View style={[styles.typingDot, { backgroundColor: theme.textSecondary }, animDot3]} />
    </Animated.View>
  );
}

function MessageBubble({ message, theme, index }: { message: ChatMessage; theme: any; index: number }) {
  const isUser = message.sender === "user";

  return (
    <Animated.View
      entering={FadeInUp.delay(50).duration(300).springify().damping(15)}
      style={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowRight : styles.bubbleRowLeft,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.userBubble, { backgroundColor: theme.primary }]
            : [styles.npcBubble, { backgroundColor: theme.backgroundTertiary }],
        ]}
      >
        <ThemedText
          style={[
            styles.bubbleText,
            { color: isUser ? "#FFFFFF" : theme.text },
          ]}
        >
          {message.text}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

function ResponseOption({
  text,
  theme,
  onPress,
  index,
}: {
  text: string;
  theme: any;
  onPress: () => void;
  index: number;
}) {
  return (
    <AnimatedPressable
      entering={SlideInDown.delay(index * 80 + 150).duration(350).springify().damping(14)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={text}
      style={({ pressed }) => [
        styles.optionButton,
        {
          backgroundColor: pressed ? theme.backgroundTertiary : theme.backgroundSecondary,
          borderColor: theme.textSecondary + "40",
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <ThemedText style={[styles.optionText, { color: theme.text }]}>
        {text}
      </ThemedText>
      <Feather name="chevron-right" size={16} color={theme.textSecondary} />
    </AnimatedPressable>
  );
}

export default function SnackChat({
  context,
  onComplete,
  showSettings,
  onSettings,
}: PractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();
  const flatListRef = useRef<FlatList>(null);

  const allConversations = (context.assets?.chats ?? []) as Conversation[];
  const [convIndex, setConvIndex] = useState(() =>
    Math.floor(Math.random() * Math.max(allConversations.length, 1))
  );
  const conversation = allConversations[convIndex] ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<ChatPhase>("opening");
  const [isTyping, setIsTyping] = useState(false);
  const [selectedOption, setSelectedOption] = useState<DialogOption | null>(null);
  const [startTime] = useState(Date.now());
  const [chatCount, setChatCount] = useState(0);

  useEffect(() => {
    setConfig({
      headerMode: "minimal",
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings]);

  const triggerHaptic = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const addNpcMessage = useCallback((text: string, callback?: () => void) => {
    setIsTyping(true);
    const delay = Math.min(800 + text.length * 12, 2000);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: `npc-${Date.now()}`, text, sender: "npc" },
      ]);
      if (callback) {
        setTimeout(callback, 300);
      }
    }, delay);
  }, []);

  useEffect(() => {
    if (conversation && phase === "opening") {
      addNpcMessage(conversation.npc_opening, () => {
        setPhase("choose-response");
      });
    }
  }, [conversation, phase === "opening"]);

  const handleResponseSelect = useCallback(
    (option: DialogOption) => {
      triggerHaptic();
      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          text: option.text,
          sender: "user",
          strategy: option.strategy,
        },
      ]);
      setSelectedOption(option);
      setPhase("npc-reply");

      setTimeout(() => {
        addNpcMessage(option.npc_response, () => {
          setPhase("choose-followup");
        });
      }, 400);
    },
    [triggerHaptic, addNpcMessage]
  );

  const handleFollowUpSelect = useCallback(
    (followUp: FollowUpOption) => {
      triggerHaptic();
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, text: followUp.text, sender: "user" },
      ]);
      setPhase("npc-closing");

      setTimeout(() => {
        addNpcMessage(followUp.npc_response, () => {
          setPhase("done");
        });
      }, 400);
    },
    [triggerHaptic, addNpcMessage]
  );

  const handleNextChat = useCallback(() => {
    triggerHaptic();
    const nextIndex = (convIndex + 1) % allConversations.length;
    setConvIndex(nextIndex);
    setMessages([]);
    setPhase("opening");
    setSelectedOption(null);
    setChatCount((c) => c + 1);
  }, [triggerHaptic, convIndex, allConversations.length]);

  const handleFinish = useCallback(() => {
    triggerHaptic();
    const duration = Math.round((Date.now() - startTime) / 1000);
    onComplete({
      content: {
        type: "text",
        value: `Completed ${chatCount + 1} conversation${chatCount > 0 ? "s" : ""}`,
      },
      metadata: {
        source: "user",
        duration,
        conversationsCompleted: chatCount + 1,
        emotionTags: conversation ? [conversation.context] : [],
      },
    });
  }, [triggerHaptic, startTime, chatCount, onComplete, conversation]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, isTyping]);

  if (!conversation) {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
        <View style={styles.emptyState}>
          <Feather name="message-circle" size={48} color={theme.textSecondary} />
          <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
            No conversations available
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  const contextLabel = conversation.context.charAt(0).toUpperCase() + conversation.context.slice(1);

  const renderOptions = () => {
    if (phase === "choose-response") {
      return (
        <View style={styles.optionsList}>
          {conversation.dialog_tree.map((option, i) => (
            <ResponseOption
              key={option.strategy}
              text={option.text}
              theme={theme}
              onPress={() => handleResponseSelect(option)}
              index={i}
            />
          ))}
        </View>
      );
    }

    if (phase === "choose-followup" && selectedOption) {
      return (
        <View style={styles.optionsList}>
          {selectedOption.follow_up_options.map((followUp, i) => (
            <ResponseOption
              key={i}
              text={followUp.text}
              theme={theme}
              onPress={() => handleFollowUpSelect(followUp)}
              index={i}
            />
          ))}
        </View>
      );
    }

    if (phase === "done") {
      return (
        <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.doneContainer}>
          <View style={[styles.doneCard, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="check-circle" size={28} color={theme.success ?? theme.primary} />
            <ThemedText style={[styles.doneTitle, { color: theme.text }]}>
              Chat complete
            </ThemedText>
          </View>
          <View style={styles.doneActions}>
            <Pressable
              onPress={handleNextChat}
              style={[styles.doneButton, { backgroundColor: theme.primary }]}
            >
              <Feather name="refresh-cw" size={16} color="#FFFFFF" />
              <ThemedText style={styles.doneButtonText}>Next Chat</ThemedText>
            </Pressable>
            <Pressable
              onPress={handleFinish}
              style={[styles.doneButtonSecondary, { borderColor: theme.border }]}
            >
              <ThemedText style={[styles.doneButtonSecondaryText, { color: theme.text }]}>
                Done
              </ThemedText>
            </Pressable>
          </View>
        </Animated.View>
      );
    }

    return null;
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.chatHeader, { paddingTop: headerHeight + Spacing.sm, backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.chatHeaderInner}>
          <View style={[styles.avatar, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="user" size={20} color={theme.primary} />
          </View>
          <View style={styles.chatHeaderInfo}>
            <ThemedText style={[styles.chatHeaderName, { color: theme.text }]}>
              SnackChat
            </ThemedText>
            <View style={styles.contextRow}>
              <View style={[styles.contextDot, { backgroundColor: theme.primary }]} />
              <ThemedText style={[styles.contextLabel, { color: theme.textSecondary }]}>
                Feeling {contextLabel.toLowerCase()}
              </ThemedText>
            </View>
          </View>
          {chatCount > 0 ? (
            <View style={[styles.chatCountBadge, { backgroundColor: theme.primary }]}>
              <ThemedText style={styles.chatCountText}>{chatCount + 1}</ThemedText>
            </View>
          ) : null}
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <MessageBubble message={item} theme={theme} index={index} />
        )}
        contentContainerStyle={[
          styles.messageList,
          { paddingBottom: Spacing.md },
        ]}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={isTyping ? <TypingIndicator theme={theme} /> : null}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }}
      />

      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + Spacing.sm }]}>
        {renderOptions()}
      </View>
    </ThemedView>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MAX_BUBBLE_WIDTH = Math.min(SCREEN_WIDTH * 0.78, 340);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatHeader: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  chatHeaderInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  chatHeaderInfo: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  chatHeaderName: {
    fontSize: 17,
    fontWeight: "600",
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  contextDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  contextLabel: {
    fontSize: 13,
  },
  chatCountBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  chatCountText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  messageList: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  bubbleRow: {
    marginBottom: Spacing.sm,
    maxWidth: MAX_BUBBLE_WIDTH,
  },
  bubbleRowLeft: {
    alignSelf: "flex-start",
  },
  bubbleRowRight: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  bubble: {
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md + 2,
    borderRadius: BorderRadius.md,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  npcBubble: {
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  typingContainer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.md,
    borderBottomLeftRadius: 4,
    gap: 5,
    marginBottom: Spacing.sm,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  bottomArea: {
    paddingHorizontal: Spacing.lg,
  },
  optionsList: {
    gap: Spacing.md,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
  },
  doneContainer: {
    alignItems: "center",
    gap: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  doneCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  doneTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  doneActions: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
  },
  doneButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: 8,
  },
  doneButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
  },
  doneButtonSecondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  doneButtonSecondaryText: {
    fontWeight: "600",
    fontSize: 15,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 16,
  },
});
