import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface CodeBlockProps {
  code: string;
  language?: string;
  onCopy?: (text: string) => void;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language, onCopy }) => {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    if (onCopy) {
      onCopy(code);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.langText}>{language || "text"}</Text>
        <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.7}>
          <Text style={styles.copyText}>{copied ? "已复制" : "复制代码"}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.codeContainer}>
        <Text style={styles.codeText} selectable>
          {code}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    borderRadius: 8,
    backgroundColor: "#111118",
    borderWidth: 1,
    borderColor: "#27272a",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#181824",
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  langText: {
    fontSize: 11,
    color: "#a1a1aa",
    fontFamily: "monospace",
    textTransform: "lowercase",
  },
  copyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#27272a",
  },
  copyText: {
    fontSize: 10,
    color: "#d4d4d8",
    fontWeight: "500",
  },
  codeContainer: {
    padding: 12,
  },
  codeText: {
    fontSize: 12,
    color: "#e4e4e7",
    fontFamily: "monospace",
    lineHeight: 18,
  },
});

export default CodeBlock;
