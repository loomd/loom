import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, space } from "@/theme";
import { Chevron, MenuIcon, StatusDot } from "./icons";

interface ChatHeaderProps {
  connected: boolean;
  projectName?: string;
  modelName?: string;
  onOpenProjects: () => void;
  onOpenModels: () => void;
}

/**
 * 聊天页顶栏：左侧菜单入口，中间当前项目，右侧模型与连接状态。
 */
export const ChatHeader: React.FC<ChatHeaderProps> = ({
  connected,
  projectName,
  modelName,
  onOpenProjects,
  onOpenModels,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <TouchableOpacity
        style={styles.menuButton}
        onPress={onOpenProjects}
        activeOpacity={0.6}
        accessibilityLabel="打开项目列表"
      >
        <MenuIcon color={colors.text} size={15} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.projectArea}
        onPress={onOpenProjects}
        activeOpacity={0.6}
      >
        <Text style={styles.projectName} numberOfLines={1}>
          {projectName || "工作区"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.modelChip}
        onPress={onOpenModels}
        activeOpacity={0.6}
      >
        <Text style={styles.modelName} numberOfLines={1}>
          {modelName || "默认模型"}
        </Text>
        <Chevron size={10} color={colors.accentText} direction="down" />
      </TouchableOpacity>

      <View style={styles.statusSlot}>
        <StatusDot
          color={connected ? colors.success : colors.danger}
          size={7}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingBottom: space.sm + 2,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  projectArea: {
    flex: 1,
    marginLeft: space.md,
    marginRight: space.sm,
  },
  projectName: {
    fontSize: font.title,
    fontWeight: "600",
    color: colors.text,
  },
  modelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 132,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelName: {
    flexShrink: 1,
    fontSize: font.small,
    fontWeight: "500",
    color: colors.accentText,
  },
  statusSlot: {
    width: 18,
    alignItems: "flex-end",
  },
});

export default ChatHeader;
