import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface StatusBarProps {
  connected: boolean;
  workspaceDir?: string;
  onDisconnect: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  connected,
  workspaceDir,
  onDisconnect,
}) => {
  return (
    <View style={styles.statusBar}>
      <View style={styles.statusIndicator}>
        <View
          style={[
            styles.statusDot,
            connected ? styles.statusDotOnline : styles.statusDotOffline,
          ]}
        />
        <View style={styles.textContainer}>
          <Text style={styles.statusText}>
            {connected ? "已连接工作区" : "连接中断 / 等待重连"}
          </Text>
          {workspaceDir ? (
            <Text style={styles.workspaceText} numberOfLines={1}>
              {workspaceDir}
            </Text>
          ) : null}
        </View>
      </View>
      <TouchableOpacity
        style={styles.disconnectButton}
        onPress={onDisconnect}
        activeOpacity={0.7}
      >
        <Text style={styles.disconnectText}>断开</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#16161d",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
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
  textContainer: {
    flex: 1,
  },
  statusText: {
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "600",
  },
  workspaceText: {
    color: "#71717a",
    fontSize: 11,
    marginTop: 2,
  },
  disconnectButton: {
    paddingHorizontal: 12,
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
