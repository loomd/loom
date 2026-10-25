import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface ThinkingBlockProps {
  content: string;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ content }) => {
  const [expanded, setExpanded] = useState<boolean>(false);

  if (!content || !content.trim()) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={styles.indicatorDot} />
          <Text style={styles.headerTitle}>思考过程</Text>
        </View>
        <Text style={styles.toggleText}>{expanded ? "收起" : "展开"}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.contentContainer}>
          <Text style={styles.contentText}>{content.trim()}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3b3b4f",
    backgroundColor: "#13131e",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#1c1c2b",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#818cf8",
    marginRight: 6,
  },
  headerTitle: {
    fontSize: 12,
    color: "#a5b4fc",
    fontWeight: "600",
  },
  toggleText: {
    fontSize: 11,
    color: "#71717a",
  },
  contentContainer: {
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#27273a",
  },
  contentText: {
    fontSize: 12,
    color: "#94a3b8",
    lineHeight: 18,
    fontFamily: "monospace",
  },
});

export default ThinkingBlock;
