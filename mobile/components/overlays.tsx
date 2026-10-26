import React, { useEffect, useState } from "react";
import {
  LayoutChangeEvent,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space } from "@/theme";

interface SlideDrawerProps {
  visible: boolean;
  onClose: () => void;
  /** 抽屉宽度（像素） */
  width: number;
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * 左侧滑出抽屉。
 *
 * 打开时从左侧滑入并带背景遮罩淡入，关闭时反向滑出；
 * 内容区自带滚动能力，条目超过一屏时可上下滑动。
 */
export function SlideDrawer({
  visible,
  onClose,
  width,
  children,
  style,
}: SlideDrawerProps) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const translateX = useSharedValue(-width);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateX.value = -width;
      fade.value = 0;
      translateX.value = withTiming(0, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      });
      fade.value = withTiming(1, { duration: 200 });
    } else {
      fade.value = withTiming(0, { duration: 180 });
      translateX.value = withTiming(
        -width,
        { duration: 200, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
  }));

  if (!mounted) return null;

  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <Animated.View
        style={[styles.backdrop, backdropStyle]}
        pointerEvents="none"
      />
      <TouchableOpacity
        style={styles.backdropTouchable}
        activeOpacity={1}
        onPress={onClose}
      />
      <Animated.View
        style={[styles.panel, { width, paddingTop: insets.top }, panelStyle, style]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

interface SlideUpSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/** 底部滑出面板（模型选择等） */
export function SlideUpSheet({ visible, onClose, children }: SlideUpSheetProps) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const sheetHeight = useSharedValue(0);
  const translateY = useSharedValue(600);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      fade.value = 0;
      fade.value = withTiming(1, { duration: 200 });
      if (sheetHeight.value > 0) {
        translateY.value = withTiming(0, {
          duration: 260,
          easing: Easing.out(Easing.cubic),
        });
      }
    } else {
      fade.value = withTiming(0, { duration: 160 });
      translateY.value = withTiming(
        sheetHeight.value || 400,
        { duration: 200, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    sheetHeight.value = height;
    if (visible) {
      translateY.value = withTiming(0, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      });
    }
  };

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: translateY.value }],
  }));

  const sheetBackdropStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
  }));

  if (!mounted) return null;

  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <Animated.View
        style={[styles.backdrop, sheetBackdropStyle]}
        pointerEvents="none"
      />
      <TouchableOpacity
        style={styles.backdropTouchable}
        activeOpacity={1}
        onPress={onClose}
      />
      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }, sheetStyle]}
        onLayout={handleLayout}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    elevation: 40,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  backdropTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "76%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
});

export default SlideDrawer;
