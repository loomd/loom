import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { ChatMessage } from "@/types";
import { ThinkingBlock } from "./ThinkingBlock";
import { CodeBlock } from "./CodeBlock";

interface ChatBubbleProps {
  message: ChatMessage;
  onCopyText?: (text: string) => void;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, onCopyText }) => {
  const isUser = message.role === "user";

  // 解析是否有思考过程：<thinking>...</thinking>
  let thinkingContent = "";
  let displayContent = message.content;

  const thinkingMatch = displayContent.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (thinkingMatch) {
    thinkingContent = thinkingMatch[1];
    displayContent = displayContent.replace(/<thinking>[\s\S]*?<\/thinking>/i, "").trim();
  }

  // 检测是否包含代码块 ```lang ... ```
  const codeBlocks: { lang: string; code: string }[] = [];
  const parts: (string | { type: "code"; lang: string; code: string })[] = [];

  const codeRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeRegex.exec(displayContent)) !== null) {
    if (match.index > lastIndex) {
      parts.push(displayContent.substring(lastIndex, match.index));
    }
    parts.push({
      type: "code",
      lang: match[1] || "text",
      code: match[2],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < displayContent.length) {
    parts.push(displayContent.substring(lastIndex));
  }

  return (
    <View
      style={[
        styles.bubbleContainer,
        isUser ? styles.userContainer : styles.agentContainer,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.agentBubble,
        ]}
      >
        {/* 如果有思考过程 */}
        {!isUser && thinkingContent ? (
          <ThinkingBlock content={thinkingContent} />
        ) : null}

        {/* 主内容 */}
        {parts.length === 0 ? (
          <Text style={[styles.text, isUser ? styles.userText : styles.agentText]}>
            {displayContent}
          </Text>
        ) : (
          parts.map((p, idx) => {
            if (typeof p === "string") {
              if (!p.trim()) return null;
              return (
                <Text
                  key={idx}
                  style={[styles.text, isUser ? styles.userText : styles.agentText]}
                >
                  {p}
                </Text>
              );
            }
            return (
              <CodeBlock
                key={idx}
                language={p.lang}
                code={p.code}
                onCopy={onCopyText}
              />
            );
          })
        )}

        <View style={styles.footer}>
          <Text style={styles.timeText}>
            {new Date(message.timestamp).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          {isUser && message.status ? (
            <Text style={styles.statusText}>
              {message.status === "sending" ? "发送中" : message.status === "sent" ? "已送达" : ""}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bubbleContainer: {
    marginVertical: 4,
    paddingHorizontal: 12,
    width: "100%",
    flexDirection: "row",
  },
  userContainer: {
    justifyContent: "flex-end",
  },
  agentContainer: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: "#6366f1",
    borderBottomRightRadius: 2,
  },
  agentBubble: {
    backgroundColor: "#1c1c28",
    borderWidth: 1,
    borderColor: "#2e2e3e",
    borderBottomLeftRadius: 2,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: "#ffffff",
  },
  agentText: {
    color: "#f1f1f5",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 6,
    gap: 6,
  },
  timeText: {
    fontSize: 10,
    color: "#71717a",
  },
  statusText: {
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.6)",
  },
});

export default ChatBubble;
