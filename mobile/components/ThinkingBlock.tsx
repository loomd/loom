import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, font, monoFont, space } from "@/theme";
import { Chevron, VerticalRule } from "./icons";

interface ThinkingBlockProps {
  content: string;
}

/**
 * 思考过程折叠块。
 *
 * 思考内容通常很长，默认收起为一行摘要，点击才展开全文；
 * 位置跟随真实到达顺序，位于其所对应的正文之间。
 */
export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ content }) => {
  const [expanded, setExpanded] = useState(false);

  if (!content || !content.trim()) return null;

  const preview = content.trim().replace(/\s+/g, " ").slice(0, 60);

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <VerticalRule color={colors.border} />
        <TouchableOpacity
          style={styles.summary}
          onPress={() => setExpanded((prev) => !prev)}
          activeOpacity={0.6}
        >
          <Text style={styles.title}>思考过程</Text>
          {!expanded ? (
            <Text style={styles.preview} numberOfLines={1}>
              {preview}
            </Text>
          ) : null}
          <Chevron
            size={11}
            color={colors.textFaint}
            direction={expanded ? "down" : "right"}
          />
        </TouchableOpacity>
      </View>

      {expanded ? (
        <View style={styles.contentBox}>
          <Text style={styles.contentText}>{content.trim()}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginLeft: space.lg,
    marginRight: space.lg,
    marginBottom: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  summary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingLeft: space.sm,
    gap: space.sm,
  },
  title: {
    fontSize: font.small,
    color: colors.textFaint,
  },
  preview: {
    flex: 1,
    fontSize: font.small,
    color: colors.textFaint,
  },
  contentBox: {
    marginTop: space.xs,
    marginLeft: space.lg + space.sm,
    paddingLeft: space.md,
    paddingRight: space.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  contentText: {
    fontSize: font.small,
    color: colors.textMuted,
    lineHeight: 20,
    fontFamily: monoFont,
  },
});

export default ThinkingBlock;
