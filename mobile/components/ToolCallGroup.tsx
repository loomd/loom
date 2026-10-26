import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { ToolCallInfo } from "@/types";
import { colors, font, radius, space } from "@/theme";
import { Chevron, StatusDot, VerticalRule } from "./icons";

interface ToolCallGroupProps {
  tools: ToolCallInfo[];
}

/** 工具状态 → 中文文案 */
const STATUS_TEXT: Record<string, string> = {
  pending: "待执行",
  in_progress: "执行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  pending: colors.textFaint,
  in_progress: colors.warning,
  completed: colors.success,
  failed: colors.danger,
  cancelled: colors.textFaint,
};

function statusText(status: string): string {
  return STATUS_TEXT[status] ?? status ?? "未知";
}

function statusColor(status: string): string {
  return STATUS_COLOR[status] ?? colors.textFaint;
}

/** 汇总一组工具调用的状态：全部完成 / 有失败 / 有进行中 */
function aggregateStatus(tools: ToolCallInfo[]): string {
  if (tools.some((t) => t.status === "failed")) return "failed";
  if (tools.some((t) => t.status === "in_progress")) return "in_progress";
  if (tools.some((t) => t.status === "pending")) return "pending";
  if (tools.every((t) => t.status === "completed")) return "completed";
  return "pending";
}

/**
 * 连续的工具调用折叠为一行。
 *
 * 桌面端一轮回复里常见「正文 → 多个工具调用 → 正文」的节奏，
 * 这里把中间连续的工具调用合并成一条缩进的摘要行，点击才展开明细，
 * 避免工具卡片在对话流里堆成一长条。
 */
export const ToolCallGroup: React.FC<ToolCallGroupProps> = ({ tools }) => {
  const [expanded, setExpanded] = useState(false);

  if (tools.length === 0) return null;

  const summary = aggregateStatus(tools);
  const names = tools
    .map((t) => t.name || t.title)
    .filter(Boolean)
    .join("、");

  const headline =
    tools.length === 1
      ? `${tools[0].name || tools[0].title || "工具"} · ${statusText(tools[0].status)}`
      : `${tools.length} 个工具调用${names ? ` · ${names}` : ""}`;

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <VerticalRule color={colors.border} />
        <TouchableOpacity
          style={styles.summary}
          onPress={() => setExpanded((prev) => !prev)}
          activeOpacity={0.6}
        >
          <StatusDot color={statusColor(summary)} />
          <Text style={styles.summaryText} numberOfLines={1}>
            {headline}
          </Text>
          <Chevron
            size={11}
            color={colors.textFaint}
            direction={expanded ? "down" : "right"}
          />
        </TouchableOpacity>
      </View>

      {expanded ? (
        <View style={styles.details}>
          {tools.map((tool, index) => (
            <View key={tool.toolCallId || `${tool.name}-${index}`} style={styles.detailRow}>
              <StatusDot color={statusColor(tool.status)} size={6} />
              <Text style={styles.detailName} numberOfLines={1}>
                {tool.name || tool.title || "工具"}
              </Text>
              <Text style={styles.detailStatus}>{statusText(tool.status)}</Text>
            </View>
          ))}
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
  summaryText: {
    flex: 1,
    fontSize: font.small,
    color: colors.textMuted,
  },
  details: {
    marginTop: space.xs,
    marginLeft: space.lg + space.sm,
    paddingLeft: space.md,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    gap: 6,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  detailName: {
    flex: 1,
    fontSize: font.small,
    color: colors.text,
    fontFamily: "monospace",
  },
  detailStatus: {
    fontSize: font.tiny,
    color: colors.textFaint,
  },
});

export default ToolCallGroup;
