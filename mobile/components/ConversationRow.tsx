import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { type ConversationRowItem } from "@/services/conversation";
import { colors, font, radius, space } from "@/theme";
import { MarkdownText } from "./MarkdownText";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallGroup } from "./ToolCallGroup";

export type { ConversationRowItem };

interface ConversationRowProps {
  item: ConversationRowItem;
}

/** 单行渲染分发 */
export const ConversationRow: React.FC<ConversationRowProps> = ({ item }) => {
  if (item.type === "tools") {
    return <ToolCallGroup tools={item.tools} />;
  }

  const message = item.message;

  if (message.role === "user") {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.content}</Text>
        </View>
        {message.status === "sending" ? (
          <Text style={styles.userStatus}>发送中</Text>
        ) : message.status === "queued" ? (
          <Text style={styles.userStatus}>排队中</Text>
        ) : message.status === "cancelled" ? (
          <Text style={[styles.userStatus, styles.userStatusCancelled]}>
            已取消
          </Text>
        ) : null}
      </View>
    );
  }

  if (message.kind === "thinking") {
    return <ThinkingBlock content={message.content} />;
  }

  if (message.kind === "error") {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>{message.content}</Text>
      </View>
    );
  }

  // Agent 正文：横向占满整行，用 Markdown 渲染
  return (
    <View style={styles.agentRow}>
      <MarkdownText content={message.content} />
    </View>
  );
};

const styles = StyleSheet.create({
  userRow: {
    alignItems: "flex-end",
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  userBubble: {
    maxWidth: "86%",
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
  userText: {
    color: "#ffffff",
    fontSize: font.body,
    lineHeight: 22,
  },
  userStatus: {
    fontSize: font.tiny,
    color: colors.textFaint,
    marginTop: 4,
    marginRight: 2,
  },
  userStatusCancelled: {
    color: colors.danger,
  },
  agentRow: {
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  errorBox: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: "rgba(240, 101, 111, 0.08)",
  },
  errorText: {
    color: colors.danger,
    fontSize: font.small,
    lineHeight: 20,
  },
});

export default ConversationRow;
