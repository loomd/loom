import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import { colors, font, monoFont, radius, space } from "@/theme";

interface MarkdownTextProps {
  content: string;
}

/** 围栏代码块：带语言标签的扁平代码面板 */
function CodePanel({
  language,
  code,
  keyName,
}: {
  language: string;
  code: string;
  keyName: string;
}) {
  return (
    <View key={keyName} style={styles.codeBlock}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLang}>{language}</Text>
      </View>
      <Text style={styles.codeText} selectable>
        {code}
      </Text>
    </View>
  );
}

/**
 * Markdown 渲染器。
 *
 * 桌面端回复里包含标题、列表、表格、代码块等结构化内容，
 * 这里统一交给 markdown-display 渲染，避免纯文本直出导致的排版错乱。
 */
export const MarkdownText: React.FC<MarkdownTextProps> = ({ content }) => {
  if (!content || !content.trim()) return null;

  return (
    <Markdown style={markdownStyles} rules={rules}>
      {content}
    </Markdown>
  );
};

const rules = {
  fence: (node: any) => {
    const language = String(node?.sourceInfo ?? "").trim().split(/\s+/)[0] || "text";
    const code = String(node?.content ?? "").replace(/\n$/, "");
    return <CodePanel language={language} code={code} keyName={node?.key ?? "code"} />;
  },
  code_block: (node: any) => {
    const code = String(node?.content ?? "").replace(/\n$/, "");
    return <CodePanel language="text" code={code} keyName={node?.key ?? "code"} />;
  },
  // 表格：库自带的规则在 RN 上会出现单元格不撑开、文字不可见，这里自己接管
  table: (node: any, children: React.ReactNode) => (
    <View key={node?.key ?? "table"} style={styles.table}>
      {children}
    </View>
  ),
  thead: (node: any, children: React.ReactNode) => (
    <View key={node?.key ?? "thead"} style={styles.thead}>
      {children}
    </View>
  ),
  tbody: (node: any, children: React.ReactNode) => (
    <View key={node?.key ?? "tbody"} style={styles.tbody}>
      {children}
    </View>
  ),
  tr: (node: any, children: React.ReactNode) => (
    <View key={node?.key ?? "tr"} style={styles.tr}>
      {children}
    </View>
  ),
  th: (node: any, children: React.ReactNode) => (
    <View key={node?.key ?? "th"} style={styles.cell}>
      {children}
    </View>
  ),
  td: (node: any, children: React.ReactNode) => (
    <View key={node?.key ?? "td"} style={styles.cell}>
      {children}
    </View>
  ),
};

const markdownStyles = StyleSheet.create({
  body: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 23,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: space.md,
    color: colors.text,
    fontSize: font.body,
    lineHeight: 23,
  },
  heading1: {
    fontSize: 19,
    fontWeight: "700",
    color: "#ffffff",
    marginTop: space.lg,
    marginBottom: space.sm,
    lineHeight: 26,
  },
  heading2: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffffff",
    marginTop: space.lg,
    marginBottom: space.sm,
    lineHeight: 24,
  },
  heading3: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#f4f4f6",
    marginTop: space.md,
    marginBottom: space.sm,
    lineHeight: 22,
  },
  heading4: {
    fontSize: font.body,
    fontWeight: "700",
    color: colors.text,
    marginTop: space.md,
    marginBottom: space.xs,
  },
  heading5: {
    fontSize: font.small,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: space.sm,
    marginBottom: space.xs,
  },
  heading6: {
    fontSize: font.small,
    fontWeight: "600",
    color: colors.textFaint,
    marginTop: space.sm,
    marginBottom: space.xs,
  },
  strong: {
    fontWeight: "700",
    color: "#ffffff",
  },
  em: {
    fontStyle: "italic",
    color: colors.text,
  },
  s: {
    textDecorationLine: "line-through",
    color: colors.textFaint,
  },
  link: {
    color: colors.accentText,
    textDecorationLine: "underline",
  },
  blockquote: {
    backgroundColor: colors.surfaceAlt,
    borderLeftWidth: 2,
    borderLeftColor: colors.borderStrong,
    paddingLeft: space.md,
    paddingRight: space.sm,
    marginLeft: 0,
    marginBottom: space.md,
  },
  bullet_list: {
    marginBottom: space.sm,
    marginTop: 0,
  },
  ordered_list: {
    marginBottom: space.sm,
    marginTop: 0,
  },
  list_item: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: space.xs,
  },
  bullet_list_icon: {
    marginLeft: 0,
    marginTop: 4,
    marginRight: space.sm,
    fontSize: font.body,
    color: colors.textFaint,
  },
  ordered_list_icon: {
    marginLeft: 0,
    marginTop: 4,
    marginRight: space.sm,
    fontSize: font.body,
    color: colors.textFaint,
  },
  code_inline: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 0,
    color: colors.accentText,
    fontFamily: monoFont,
    fontSize: font.code,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  fence: {
    backgroundColor: colors.codeBg,
    color: "#d7d7de",
    fontFamily: monoFont,
    fontSize: font.code,
    lineHeight: 19,
  },
  code_block: {
    backgroundColor: colors.codeBg,
    color: "#d7d7de",
    fontFamily: monoFont,
    fontSize: font.code,
    lineHeight: 19,
  },
  hr: {
    backgroundColor: colors.border,
    height: 1,
    marginTop: space.lg,
    marginBottom: space.lg,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    marginBottom: space.md,
    overflow: "hidden",
    alignSelf: "stretch",
  },
  thead: {
    backgroundColor: colors.surfaceAlt,
  },
  tbody: {},
  tr: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignSelf: "stretch",
  },
  th: {
    flex: 1,
    flexShrink: 1,
    padding: space.sm,
  },
  td: {
    flex: 1,
    flexShrink: 1,
    padding: space.sm,
  },
  /** 文本块统一上色：叶子文本不依赖父级继承，避免暗色主题下变黑看不见 */
  textgroup: {
    color: colors.text,
  },
});

const styles = StyleSheet.create({
  codeBlock: {
    backgroundColor: colors.codeBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: space.xs,
    marginBottom: space.md,
    overflow: "hidden",
  },
  codeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: 6,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  codeLang: {
    fontSize: font.tiny,
    color: colors.textFaint,
    fontFamily: monoFont,
  },
  codeText: {
    fontSize: font.code,
    color: "#d7d7de",
    fontFamily: monoFont,
    lineHeight: 19,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  /** 表格：自绘规则对应的样式 */
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    marginBottom: space.md,
    overflow: "hidden",
    alignSelf: "stretch",
  },
  thead: {
    backgroundColor: colors.surfaceAlt,
    alignSelf: "stretch",
  },
  tbody: {
    alignSelf: "stretch",
  },
  tr: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignSelf: "stretch",
  },
  cell: {
    flex: 1,
    flexShrink: 1,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
});

export default MarkdownText;
