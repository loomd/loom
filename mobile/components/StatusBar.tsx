import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface StatusBarProps {
  connected: boolean;
  currentProjectName?: string;
  currentModelName?: string;
  onOpenProjects: () => void;
  onOpenModels: () => void;
  onDisconnect: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  connected,
  currentProjectName,
  currentModelName,
  onOpenProjects,
  onOpenModels,
  onDisconnect,
}) => {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "android" ? Math.max(insets.top, 24) : insets.top;

  return (
    <View style={[styles.statusBar, { paddingTop: topPadding + 6 }]}>
      <View style={styles.leftSection}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={onOpenProjects}
          activeOpacity={0.7}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.projectPill}
          onPress={onOpenProjects}
          activeOpacity={0.7}
        >
          <Text style={styles.projectIcon}>📁</Text>
          <Text style={styles.projectText} numberOfLines={1}>
            {currentProjectName || "所有项目"}
          </Text>
          <Text style={styles.arrowIcon}>▾</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.rightSection}>
        <TouchableOpacity
          style={styles.modelPill}
          onPress={onOpenModels}
          activeOpacity={0.7}
        >
          <Text style={styles.modelIcon}>🤖</Text>
          <Text style={styles.modelText} numberOfLines={1}>
            {currentModelName || "mcode"}
          </Text>
          <Text style={styles.arrowIconSmall}>▾</Text>
        </TouchableOpacity>

        <View
          style={[
            styles.statusDot,
            connected ? styles.statusDotOnline : styles.statusDotOffline,
          ]}
        />

        <TouchableOpacity
          style={styles.disconnectButton}
          onPress={onDisconnect}
          activeOpacity={0.7}
        >
          <Text style={styles.disconnectText}>断开</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#16161d",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#222230",
    borderWidth: 1,
    borderColor: "#333345",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  menuIcon: {
    color: "#f4f4f5",
    fontSize: 18,
    fontWeight: "700",
  },
  projectPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#20202a",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333345",
    maxWidth: 150,
  },
  projectIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  projectText: {
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "600",
  },
  arrowIcon: {
    color: "#a1a1aa",
    fontSize: 11,
    marginLeft: 4,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
  },
  modelPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#242436",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3c3c55",
    marginRight: 8,
    maxWidth: 120,
  },
  modelIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  modelText: {
    color: "#c7d2fe",
    fontSize: 12,
    fontWeight: "600",
  },
  arrowIconSmall: {
    color: "#a5b4fc",
    fontSize: 10,
    marginLeft: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusDotOnline: {
    backgroundColor: "#22c55e",
  },
  statusDotOffline: {
    backgroundColor: "#ef4444",
  },
  disconnectButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#27272a",
  },
  disconnectText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "600",
  },
});

export default StatusBar;
