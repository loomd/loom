import React from "react";
import { View } from "react-native";
import { colors } from "@/theme";

/**
 * 纯 View 绘制的图标件。
 * 不引入任何 emoji 或图标字体，保证不同机型渲染一致。
 */

/** 三横线菜单 */
export function MenuIcon({
  color = colors.text,
  size = 16,
}: {
  color?: string;
  size?: number;
}) {
  const barHeight = Math.max(1.5, size / 9);
  const gap = Math.max(3, size / 3.6);
  return (
    <View style={{ width: size, height: size, justifyContent: "center" }}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={{
            height: barHeight,
            borderRadius: barHeight,
            backgroundColor: color,
            marginBottom: index < 2 ? gap : 0,
          }}
        />
      ))}
    </View>
  );
}

/** 箭头（旋转 45 度的描边方块） */
export function Chevron({
  size = 12,
  color = colors.textFaint,
  direction = "right",
}: {
  size?: number;
  color?: string;
  direction?: "right" | "down" | "left";
}) {
  const rotate =
    direction === "right" ? "-45deg" : direction === "down" ? "45deg" : "135deg";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRightWidth: 1.5,
        borderBottomWidth: 1.5,
        borderColor: color,
        transform: [{ rotate }],
      }}
    />
  );
}

/** 状态圆点 */
export function StatusDot({
  color,
  size = 7,
}: {
  color: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
    />
  );
}

/** 实心方块：停止按钮图标 */
export function StopIcon({
  color = colors.danger,
  size = 9,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 1.5,
        backgroundColor: color,
      }}
    />
  );
}

/** 左侧竖线：用于工具调用、思考过程等次级块的缩进标记 */
export function VerticalRule({ color = colors.border }: { color?: string }) {
  return <View style={{ width: 2, borderRadius: 1, backgroundColor: color }} />;
}
