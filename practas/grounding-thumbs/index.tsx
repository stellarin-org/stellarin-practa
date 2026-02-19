/**
 * Squeeze & Release Practa
 * 
 * A relaxation exercise using multitouch - users place both thumbs on circle spots,
 * hold and squeeze, then slowly release. The circles grow with hold duration and
 * haptic feedback increases with intensity.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform, Dimensions, Vibration } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  interpolate,
  interpolateColor,
  Easing,
  runOnJS,
  cancelAnimation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const BASE_CIRCLE_SIZE = 100;
const MAX_CIRCLE_SIZE = 180;
const HOLD_DURATION = 8000;
const SQUEEZE_DURATION = 6000;
const SQUEEZE_HARDER_DURATION = 6000;
const RELEASE_DURATION = 12000;
const DEEP_RELEASE_DURATION = 8000;

const COLORS = {
  calm: "#6366F1",
  building: "#8B5CF6", 
  intense: "#EC4899",
  peak: "#DC2626",
  release: "#10B981",
  deepRelease: "#059669",
};

type Phase = "place" | "hold" | "squeeze" | "squeeze_harder" | "release" | "deep_release" | "complete";

export default function SqueezeRelease({ context, onComplete, showSettings, onSettings }: PractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [phase, setPhase] = useState<Phase>("place");
  const [leftActive, setLeftActive] = useState(false);
  const [rightActive, setRightActive] = useState(false);
  const [bothTouching, setBothTouching] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const leftScale = useSharedValue(1);
  const rightScale = useSharedValue(1);
  const leftOpacity = useSharedValue(1);
  const rightOpacity = useSharedValue(1);
  const leftGlow = useSharedValue(0);
  const rightGlow = useSharedValue(0);
  const progress = useSharedValue(0);
  const intensity = useSharedValue(0);
  const pulseRing = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);
  const colorPhase = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const attentionRing1 = useSharedValue(2);
  const attentionRing2 = useSharedValue(2.5);
  const attentionRing3 = useSharedValue(3);
  const attentionOpacity1 = useSharedValue(0);
  const attentionOpacity2 = useSharedValue(0);
  const attentionOpacity3 = useSharedValue(0);
  
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hapticIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const escalationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);
  const hapticLevelRef = useRef(0);
  const currentBpmRef = useRef(80);
  const targetBpmRef = useRef(80);
  const exerciseStartTimeRef = useRef(0);
  const heartbeatRunningRef = useRef(false);

  const clearAllTimers = useCallback(() => {
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
    if (hapticIntervalRef.current) {
      clearInterval(hapticIntervalRef.current);
      hapticIntervalRef.current = null;
    }
    if (escalationIntervalRef.current) {
      clearInterval(escalationIntervalRef.current);
      escalationIntervalRef.current = null;
    }
    hapticLevelRef.current = 0;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearAllTimers();
      cancelAnimation(leftScale);
      cancelAnimation(rightScale);
      cancelAnimation(leftOpacity);
      cancelAnimation(rightOpacity);
      cancelAnimation(leftGlow);
      cancelAnimation(rightGlow);
      cancelAnimation(progress);
      cancelAnimation(intensity);
      cancelAnimation(pulseRing);
      cancelAnimation(pulseOpacity);
      cancelAnimation(colorPhase);
    };
  }, [clearAllTimers]);

  const triggerHaptic = useCallback((style: Haptics.ImpactFeedbackStyle) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(style);
    }
  }, []);

  const triggerSuccessHaptic = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  const triggerRigidHaptic = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    }
  }, []);

  const bpmToMs = useCallback((bpm: number) => 60000 / bpm, []);
  
  const triggerHeartbeat = useCallback(async () => {
    if (!isMountedRef.current) return;
    if (Platform.OS === 'web') return;
    
    if (Platform.OS === 'ios') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeout(async () => {
        if (isMountedRef.current) await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }, 100);
    } else {
      Vibration.vibrate([0, 40, 60, 20]);
    }
  }, []);

  const startContinuousHeartbeat = useCallback((initialTargetBpm: number = 100) => {
    if (heartbeatRunningRef.current) return;
    heartbeatRunningRef.current = true;
    exerciseStartTimeRef.current = Date.now();
    currentBpmRef.current = initialTargetBpm;
    targetBpmRef.current = initialTargetBpm;
    
    const runHeartbeat = () => {
      if (!isMountedRef.current || !heartbeatRunningRef.current) return;
      
      const current = currentBpmRef.current;
      const target = targetBpmRef.current;
      
      const smoothingFactor = 0.08;
      currentBpmRef.current = current + (target - current) * smoothingFactor;
      
      triggerHeartbeat();
      
      const interval = bpmToMs(currentBpmRef.current);
      hapticIntervalRef.current = setTimeout(runHeartbeat, interval);
    };
    
    runHeartbeat();
  }, [triggerHeartbeat, bpmToMs]);

  const setHeartbeatTarget = useCallback((targetBpm: number) => {
    targetBpmRef.current = targetBpm;
  }, []);

  const stopContinuousHeartbeat = useCallback(() => {
    heartbeatRunningRef.current = false;
    if (hapticIntervalRef.current) {
      clearTimeout(hapticIntervalRef.current as ReturnType<typeof setTimeout>);
      hapticIntervalRef.current = null;
    }
  }, []);

  const stopHapticPulse = useCallback(() => {
    if (hapticIntervalRef.current) {
      clearTimeout(hapticIntervalRef.current as ReturnType<typeof setTimeout>);
      clearInterval(hapticIntervalRef.current as ReturnType<typeof setInterval>);
      hapticIntervalRef.current = null;
    }
    if (escalationIntervalRef.current) {
      clearInterval(escalationIntervalRef.current);
      escalationIntervalRef.current = null;
    }
    hapticLevelRef.current = 0;
  }, []);

  const startPulsingRing = useCallback(() => {
    pulseOpacity.value = 0.6;
    pulseRing.value = 1;
    pulseRing.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 800, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 0 })
      ),
      -1
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 800, easing: Easing.out(Easing.ease) }),
        withTiming(0.6, { duration: 0 })
      ),
      -1
    );
  }, [pulseRing, pulseOpacity]);

  const stopPulsingRing = useCallback(() => {
    cancelAnimation(pulseRing);
    cancelAnimation(pulseOpacity);
    pulseRing.value = 1;
    pulseOpacity.value = 0;
  }, [pulseRing, pulseOpacity]);

  const animateCirclesGrow = useCallback((targetScale: number, duration: number) => {
    leftScale.value = withTiming(targetScale, { duration, easing: Easing.out(Easing.ease) });
    rightScale.value = withTiming(targetScale, { duration, easing: Easing.out(Easing.ease) });
    leftOpacity.value = withTiming(1, { duration });
    rightOpacity.value = withTiming(1, { duration });
    leftGlow.value = withTiming(1, { duration });
    rightGlow.value = withTiming(1, { duration });
  }, [leftScale, rightScale, leftOpacity, rightOpacity, leftGlow, rightGlow]);

  const animateCirclesShrink = useCallback((duration: number) => {
    leftScale.value = withTiming(1, { duration, easing: Easing.inOut(Easing.ease) });
    rightScale.value = withTiming(1, { duration, easing: Easing.inOut(Easing.ease) });
    leftOpacity.value = withTiming(1, { duration });
    rightOpacity.value = withTiming(1, { duration });
    leftGlow.value = withTiming(0, { duration });
    rightGlow.value = withTiming(0, { duration });
  }, [leftScale, rightScale, leftOpacity, rightOpacity, leftGlow, rightGlow]);

  const resetCircles = useCallback(() => {
    leftScale.value = withSpring(1);
    rightScale.value = withSpring(1);
    leftOpacity.value = withTiming(1, { duration: 300 });
    rightOpacity.value = withTiming(1, { duration: 300 });
    leftGlow.value = withTiming(0, { duration: 300 });
    rightGlow.value = withTiming(0, { duration: 300 });
  }, [leftScale, rightScale, leftOpacity, rightOpacity, leftGlow, rightGlow]);

  const stopAttentionAnimation = useCallback(() => {
    cancelAnimation(attentionRing1);
    cancelAnimation(attentionRing2);
    cancelAnimation(attentionRing3);
    cancelAnimation(attentionOpacity1);
    cancelAnimation(attentionOpacity2);
    cancelAnimation(attentionOpacity3);
    attentionOpacity1.value = withTiming(0, { duration: 300 });
    attentionOpacity2.value = withTiming(0, { duration: 300 });
    attentionOpacity3.value = withTiming(0, { duration: 300 });
  }, [attentionRing1, attentionRing2, attentionRing3, attentionOpacity1, attentionOpacity2, attentionOpacity3]);

  const handleBothTouching = useCallback((touching: boolean) => {
    setBothTouching(touching);
    
    if (touching && phase === "place") {
      stopAttentionAnimation();
      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
      setPhase("hold");
      progress.value = 0;
      progress.value = withTiming(0.2, { duration: HOLD_DURATION });
      intensity.value = withTiming(0.4, { duration: HOLD_DURATION });
      colorPhase.value = withTiming(1, { duration: HOLD_DURATION });
      animateCirclesGrow(1.3, HOLD_DURATION);
      startContinuousHeartbeat(100);
      startPulsingRing();
      
      phaseTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        setPhase("squeeze");
        triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
        progress.value = withTiming(0.4, { duration: SQUEEZE_DURATION });
        intensity.value = withTiming(0.7, { duration: SQUEEZE_DURATION });
        colorPhase.value = withTiming(2, { duration: SQUEEZE_DURATION });
        animateCirclesGrow(1.6, SQUEEZE_DURATION);
        setHeartbeatTarget(130);
        
        phaseTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setPhase("squeeze_harder");
          triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
          progress.value = withTiming(0.6, { duration: SQUEEZE_HARDER_DURATION });
          intensity.value = withTiming(1, { duration: SQUEEZE_HARDER_DURATION });
          colorPhase.value = withTiming(3, { duration: SQUEEZE_HARDER_DURATION });
          animateCirclesGrow(1.9, SQUEEZE_HARDER_DURATION);
          setHeartbeatTarget(160);
          
          phaseTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            setPhase("release");
            triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
            progress.value = withTiming(0.8, { duration: RELEASE_DURATION });
            intensity.value = withTiming(0.5, { duration: RELEASE_DURATION });
            colorPhase.value = withTiming(4, { duration: RELEASE_DURATION });
            animateCirclesShrink(RELEASE_DURATION);
            setHeartbeatTarget(80);
            stopPulsingRing();
            
            phaseTimerRef.current = setTimeout(() => {
              if (!isMountedRef.current) return;
              setPhase("deep_release");
              triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
              progress.value = withTiming(1, { duration: DEEP_RELEASE_DURATION });
              intensity.value = withTiming(0, { duration: DEEP_RELEASE_DURATION });
              colorPhase.value = withTiming(5, { duration: DEEP_RELEASE_DURATION });
              animateCirclesShrink(DEEP_RELEASE_DURATION);
              setHeartbeatTarget(60);
              
              phaseTimerRef.current = setTimeout(() => {
                if (!isMountedRef.current) return;
                stopContinuousHeartbeat();
                setPhase("complete");
              }, DEEP_RELEASE_DURATION);
            }, RELEASE_DURATION);
          }, SQUEEZE_HARDER_DURATION);
        }, SQUEEZE_DURATION);
      }, HOLD_DURATION);
    } else if (!touching && phase !== "place" && phase !== "complete") {
      if (phase === "release" || phase === "deep_release") {
        clearAllTimers();
        stopContinuousHeartbeat();
        stopPulsingRing();
        progress.value = withTiming(1, { duration: 300 });
        intensity.value = withTiming(0, { duration: 300 });
        setPhase("complete");
      } else {
        clearAllTimers();
        stopContinuousHeartbeat();
        stopPulsingRing();
        resetCircles();
        progress.value = withTiming(0, { duration: 300 });
        intensity.value = withTiming(0, { duration: 300 });
        colorPhase.value = withTiming(0, { duration: 300 });
        setPhase("place");
      }
    }
  }, [phase, progress, intensity, colorPhase, animateCirclesGrow, animateCirclesShrink, resetCircles, 
      startContinuousHeartbeat, setHeartbeatTarget, stopContinuousHeartbeat, startPulsingRing, stopPulsingRing, triggerHaptic, triggerSuccessHaptic, clearAllTimers, stopAttentionAnimation]);

  useEffect(() => {
    const newBothTouching = leftActive && rightActive;
    if (newBothTouching !== bothTouching) {
      handleBothTouching(newBothTouching);
    }
  }, [leftActive, rightActive, bothTouching, handleBothTouching]);

  const handleComplete = () => {
    triggerSuccessHaptic();
    onComplete({
      content: { 
        type: "text", 
        value: "Completed the squeeze and release exercise. Feeling relaxed and centered."
      },
      metadata: { 
        exerciseType: "squeeze-release",
        holdDuration: HOLD_DURATION / 1000,
        squeezeDuration: SQUEEZE_DURATION / 1000,
        squeezeHarderDuration: SQUEEZE_HARDER_DURATION / 1000,
        releaseDuration: RELEASE_DURATION / 1000,
        deepReleaseDuration: DEEP_RELEASE_DURATION / 1000,
        totalDuration: (HOLD_DURATION + SQUEEZE_DURATION + SQUEEZE_HARDER_DURATION + RELEASE_DURATION + DEEP_RELEASE_DURATION) / 1000,
        completedAt: Date.now(),
      },
    });
  };

  const updateLeftActive = useCallback((active: boolean) => {
    setLeftActive(active);
    if (active) {
      leftScale.value = withSpring(0.95);
    } else if (phase === "place") {
      leftScale.value = withSpring(1);
    }
  }, [leftScale, phase]);

  const updateRightActive = useCallback((active: boolean) => {
    setRightActive(active);
    if (active) {
      rightScale.value = withSpring(0.95);
    } else if (phase === "place") {
      rightScale.value = withSpring(1);
    }
  }, [rightScale, phase]);

  const leftGesture = Gesture.Manual()
    .onTouchesDown(() => {
      runOnJS(updateLeftActive)(true);
    })
    .onTouchesUp(() => {
      runOnJS(updateLeftActive)(false);
    })
    .onTouchesCancelled(() => {
      runOnJS(updateLeftActive)(false);
    });

  const rightGesture = Gesture.Manual()
    .onTouchesDown(() => {
      runOnJS(updateRightActive)(true);
    })
    .onTouchesUp(() => {
      runOnJS(updateRightActive)(false);
    })
    .onTouchesCancelled(() => {
      runOnJS(updateRightActive)(false);
    });

  const circleColorStyle = useAnimatedStyle(() => {
    const bgColor = interpolateColor(
      colorPhase.value,
      [0, 1, 2, 3, 4, 5],
      [COLORS.calm, COLORS.building, COLORS.intense, COLORS.peak, COLORS.release, COLORS.deepRelease]
    );
    return { backgroundColor: bgColor };
  });

  const leftAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: leftScale.value }],
    opacity: leftOpacity.value,
  }));

  const rightAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rightScale.value }],
    opacity: rightOpacity.value,
  }));

  const leftGlowStyle = useAnimatedStyle(() => {
    const glowColor = interpolateColor(
      colorPhase.value,
      [0, 1, 2, 3, 4, 5],
      [COLORS.calm, COLORS.building, COLORS.intense, COLORS.peak, COLORS.release, COLORS.deepRelease]
    );
    return {
      opacity: leftGlow.value * 0.6,
      transform: [{ scale: interpolate(leftGlow.value, [0, 1], [1, 1.4]) }],
      backgroundColor: glowColor,
    };
  });

  const rightGlowStyle = useAnimatedStyle(() => {
    const glowColor = interpolateColor(
      colorPhase.value,
      [0, 1, 2, 3, 4, 5],
      [COLORS.calm, COLORS.building, COLORS.intense, COLORS.peak, COLORS.release, COLORS.deepRelease]
    );
    return {
      opacity: rightGlow.value * 0.6,
      transform: [{ scale: interpolate(rightGlow.value, [0, 1], [1, 1.4]) }],
      backgroundColor: glowColor,
    };
  });

  const pulseRingStyle = useAnimatedStyle(() => {
    const ringColor = interpolateColor(
      colorPhase.value,
      [0, 1, 2, 3, 4, 5],
      [COLORS.calm, COLORS.building, COLORS.intense, COLORS.peak, COLORS.release, COLORS.deepRelease]
    );
    return {
      transform: [{ scale: pulseRing.value }],
      opacity: pulseOpacity.value,
      borderColor: ringColor,
    };
  });

  const brightnessOverlayStyle = useAnimatedStyle(() => {
    return {
      opacity: intensity.value,
    };
  });

  const textColorStyle = useAnimatedStyle(() => {
    const textColor = interpolateColor(
      intensity.value,
      [0, 1],
      ["#FFFFFF", "#006a9c"]
    );
    return {
      color: textColor,
    };
  });

  const subtitleColorStyle = useAnimatedStyle(() => {
    const textColor = interpolateColor(
      intensity.value,
      [0, 1],
      ["rgba(255,255,255,0.85)", "#0089c9"]
    );
    return {
      color: textColor,
    };
  });

  const decorativeLineStyle = useAnimatedStyle(() => {
    const lineColor = interpolateColor(
      intensity.value,
      [0, 1],
      ["rgba(255,255,255,0.4)", "rgba(0,106,156,0.4)"]
    );
    return {
      backgroundColor: lineColor,
    };
  });

  const contentAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: contentOpacity.value,
    };
  });

  const attentionRingStyle1 = useAnimatedStyle(() => {
    return {
      transform: [{ scale: attentionRing1.value }],
      opacity: attentionOpacity1.value,
    };
  });

  const attentionRingStyle2 = useAnimatedStyle(() => {
    return {
      transform: [{ scale: attentionRing2.value }],
      opacity: attentionOpacity2.value,
    };
  });

  const attentionRingStyle3 = useAnimatedStyle(() => {
    return {
      transform: [{ scale: attentionRing3.value }],
      opacity: attentionOpacity3.value,
    };
  });

  const startAttentionAnimation = useCallback(() => {
    const animateRing = (ringScale: any, ringOpacity: any, delay: number) => {
      ringScale.value = 1.8;
      ringOpacity.value = 0;
      setTimeout(() => {
        ringScale.value = withRepeat(
          withSequence(
            withTiming(1.8, { duration: 0 }),
            withTiming(1, { duration: 3000, easing: Easing.out(Easing.cubic) })
          ),
          -1,
          false
        );
        ringOpacity.value = withRepeat(
          withSequence(
            withTiming(0.3, { duration: 800, easing: Easing.out(Easing.ease) }),
            withTiming(0, { duration: 2200, easing: Easing.in(Easing.ease) })
          ),
          -1,
          false
        );
      }, delay);
    };
    
    animateRing(attentionRing1, attentionOpacity1, 0);
    animateRing(attentionRing2, attentionOpacity2, 1000);
    animateRing(attentionRing3, attentionOpacity3, 2000);
  }, [attentionRing1, attentionRing2, attentionRing3, attentionOpacity1, attentionOpacity2, attentionOpacity3]);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    contentOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) });
    startAttentionAnimation();
  }, [contentOpacity, startAttentionAnimation]);

  const cfg = context.config ?? {};

  const getPhaseText = () => {
    switch (phase) {
      case "place":
        return cfg.placeTitle ?? "Place both thumbs on the circles";
      case "hold":
        return cfg.holdTitle ?? "Hold...";
      case "squeeze":
        return cfg.squeezeTitle ?? "Squeeze a little...";
      case "squeeze_harder":
        return cfg.squeezeHarderTitle ?? "Just a little tighter";
      case "release":
        return cfg.releaseTitle ?? "Slowly Release";
      case "deep_release":
        return cfg.deepReleaseTitle ?? "Let go, briefly closing your eyes";
      case "complete":
        return cfg.completeTitle ?? "Well Done";
    }
  };

  const getSubtext = () => {
    switch (phase) {
      case "place":
        return cfg.placeSubtext ?? "This exercise will ground you";
      case "hold":
        return cfg.holdSubtext ?? "Keep holding, feel a little tension build";
      case "squeeze":
        return cfg.squeezeSubtext ?? "Building tension in your thumbs";
      case "squeeze_harder":
        return cfg.squeezeHarderSubtext ?? "Holding the phone firmly in your hands";
      case "release":
        return cfg.releaseSubtext ?? "Let a little tension melt away slowly";
      case "deep_release":
        return cfg.deepReleaseSubtext ?? "Sink deeper into relaxation";
      case "complete":
        return cfg.completeSubtext ?? "You released a little tension. Feel the calm.";
    }
  };

  const showCircles = phase !== "complete" && phase !== "deep_release";

  // Position circles in lower portion of screen (on the ottoman)
  const OTTOMAN_TOP = SCREEN_HEIGHT * 0.55 + 100;

  useEffect(() => {
    handleImageLoad();
  }, [handleImageLoad]);

  return (
    <LinearGradient 
      colors={["#0089c9", "#006a9c"]} 
      style={styles.fullscreenContainer}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <Animated.View style={[styles.brightnessOverlay, brightnessOverlayStyle]} pointerEvents="none" />
      
      {/* Main content wrapper */}
      <Animated.View style={[styles.mainContainer, contentAnimatedStyle]}>
        
        {/* Settings button - positioned absolutely */}
        {showSettings && onSettings ? (
          <View style={[styles.closeButtonRow, { top: insets.top + 10 }]}>
            <Pressable onPress={onSettings} style={styles.closeButton}>
              <Feather name="settings" size={24} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </View>
        ) : null}
        
        {/* Top section - Title text centered in available space above circles */}
        <View style={[styles.topSection, { height: OTTOMAN_TOP, paddingTop: insets.top }]}>
          <View style={styles.headerContent}>
            <Animated.View style={[styles.decorativeLine, decorativeLineStyle]} />
            <Animated.Text style={[styles.title, textColorStyle]}>{getPhaseText()}</Animated.Text>
            <Animated.Text style={[styles.subtitle, subtitleColorStyle]}>
              {getSubtext()}
            </Animated.Text>
            <Animated.View style={[styles.decorativeLine, decorativeLineStyle]} />
          </View>
        </View>

        {/* Middle section - Circles positioned on ottoman */}
        {showCircles ? (
          <View style={[styles.circlesSection, { top: OTTOMAN_TOP }]}>
            <View style={styles.circlesRow}>
              <View style={styles.circleWrapper}>
                <View style={styles.circleContainer}>
                  {phase === "place" ? (
                    <>
                      <Animated.View style={[styles.attentionRing, attentionRingStyle1]} />
                      <Animated.View style={[styles.attentionRing, attentionRingStyle2]} />
                      <Animated.View style={[styles.attentionRing, attentionRingStyle3]} />
                    </>
                  ) : null}
                  <Animated.View style={[styles.pulseRing, pulseRingStyle]} />
                  <Animated.View style={[styles.circleGlow, leftGlowStyle]} />
                  <GestureDetector gesture={leftGesture}>
                    <Animated.View style={[styles.circle, styles.orangeCircle, leftAnimatedStyle]}>
                      {leftActive ? (
                        <Feather name="check" size={32} color="white" />
                      ) : null}
                    </Animated.View>
                  </GestureDetector>
                </View>
                <ThemedText style={[styles.circleLabel, { color: "rgba(255,255,255,0.7)" }]}>
                  Left thumb
                </ThemedText>
              </View>

              <View style={styles.circleWrapper}>
                <View style={styles.circleContainer}>
                  {phase === "place" ? (
                    <>
                      <Animated.View style={[styles.attentionRing, attentionRingStyle1]} />
                      <Animated.View style={[styles.attentionRing, attentionRingStyle2]} />
                      <Animated.View style={[styles.attentionRing, attentionRingStyle3]} />
                    </>
                  ) : null}
                  <Animated.View style={[styles.pulseRing, pulseRingStyle]} />
                  <Animated.View style={[styles.circleGlow, rightGlowStyle]} />
                  <GestureDetector gesture={rightGesture}>
                    <Animated.View style={[styles.circle, styles.orangeCircle, rightAnimatedStyle]}>
                      {rightActive ? (
                        <Feather name="check" size={32} color="white" />
                      ) : null}
                    </Animated.View>
                  </GestureDetector>
                </View>
                <ThemedText style={[styles.circleLabel, { color: "rgba(255,255,255,0.7)" }]}>
                  Right thumb
                </ThemedText>
              </View>
            </View>
          </View>
        ) : null}

        {/* Bottom section - Footer */}
        <View style={styles.bottomSection}>
          {phase === "complete" ? (
            <Pressable
              onPress={handleComplete}
              style={[styles.button, { backgroundColor: theme.primary }]}
            >
              <ThemedText style={styles.buttonText}>Complete</ThemedText>
            </Pressable>
          ) : (
            <>
              {phase === "place" && showSettings && onSettings ? (
                <Pressable onPress={onSettings} style={styles.hintPressable}>
                  <ThemedText style={[styles.progressHint, { color: "rgba(255,255,255,0.7)" }]}>
                    Skip
                  </ThemedText>
                </Pressable>
              ) : (
                <ThemedText style={[styles.progressHint, { color: "rgba(255,255,255,0.7)" }]}>
                  {phase === "place" 
                    ? " "
                    : phase === "release" || phase === "deep_release"
                      ? "Release your thumbs slowly when ready" 
                      : phase === "squeeze_harder"
                        ? "Maximum tension - hold it!"
                        : "Keep both thumbs pressed"}
                </ThemedText>
              )}
            </>
          )}
        </View>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fullscreenContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  backgroundImage: {
    resizeMode: "cover",
  },
  brightnessOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "white",
    zIndex: 1,
  },
  mainContainer: {
    flex: 1,
    zIndex: 2,
  },
  topSection: {
    justifyContent: "center",
    alignItems: "center",
  },
  closeButton: {
    padding: Spacing.sm,
  },
  circlesSection: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  circlesRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    width: "100%",
    paddingHorizontal: Spacing.md,
  },
  bottomSection: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
  },
  closeButtonRow: {
    position: "absolute",
    right: Spacing.lg,
    zIndex: 10,
  },
  headerContent: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  decorativeLine: {
    width: 40,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 1,
    marginVertical: Spacing.md,
  },
  title: {
    fontSize: 32,
    fontWeight: "300",
    textAlign: "center",
    color: "white",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "300",
  },
  circleWrapper: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: BASE_CIRCLE_SIZE + 40,
  },
  circleContainer: {
    width: BASE_CIRCLE_SIZE,
    height: BASE_CIRCLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    width: BASE_CIRCLE_SIZE,
    height: BASE_CIRCLE_SIZE,
    borderRadius: BASE_CIRCLE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  orangeCircle: {
    backgroundColor: "#fb9338",
  },
  circleGlow: {
    position: "absolute",
    width: BASE_CIRCLE_SIZE,
    height: BASE_CIRCLE_SIZE,
    borderRadius: BASE_CIRCLE_SIZE / 2,
    zIndex: 1,
  },
  pulseRing: {
    position: "absolute",
    width: BASE_CIRCLE_SIZE,
    height: BASE_CIRCLE_SIZE,
    borderRadius: BASE_CIRCLE_SIZE / 2,
    borderWidth: 3,
    borderColor: COLORS.calm,
    zIndex: 0,
  },
  attentionRing: {
    position: "absolute",
    width: BASE_CIRCLE_SIZE,
    height: BASE_CIRCLE_SIZE,
    borderRadius: BASE_CIRCLE_SIZE / 2,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
    zIndex: -1,
  },
  circleLabel: {
    marginTop: Spacing.md,
    fontSize: 14,
  },
  thumbIcon: {
    opacity: 0.8,
  },
  button: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
  hintPressable: {
    alignItems: "center",
  },
  progressHint: {
    fontSize: 14,
    textAlign: "center",
    marginTop: Spacing.md,
  },
});
