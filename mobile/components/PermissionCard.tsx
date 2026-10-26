import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, font, radius, space } from "@/theme";

export interface PermissionOption {
  id: string;
  label: string;
  description?: string;
}

export interface PermissionRequest {
  id: string;
  title: string;
  description: string;
  type?: "confirmation" | "options";
  multiple?: boolean;
  options?: PermissionOption[];
}

interface PermissionCardProps {
  request: PermissionRequest;
  onApprove: (requestId: string, selectedOptions?: string[]) => void;
  onReject: (requestId: string) => void;
}

/** 扁平化的权限审批卡片 */
export const PermissionCard: React.FC<PermissionCardProps> = ({
  request,
  onApprove,
  onReject,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleToggleOption = (id: string) => {
    if (request.multiple) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
      );
    } else {
      setSelectedIds([id]);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>需要授权</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {request.title}
        </Text>
      </View>

      {request.description ? (
        <Text style={styles.desc}>{request.description}</Text>
      ) : null}

      {request.options && request.options.length > 0 ? (
        <View style={styles.optionsList}>
          {request.options.map((opt) => {
            const isSelected = selectedIds.includes(opt.id);
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                onPress={() => handleToggleOption(opt.id)}
                activeOpacity={0.7}
              >
                <View
                  style={[styles.checkbox, isSelected && styles.checkboxSelected]}
                >
                  {isSelected ? <View style={styles.checkboxInner} /> : null}
                </View>
                <View style={styles.optionContent}>
                  <Text
                    style={[
                      styles.optionLabel,
                      isSelected && styles.optionLabelSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {opt.description ? (
                    <Text style={styles.optionDesc}>{opt.description}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.rejectBtn}
          onPress={() => onReject(request.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.rejectText}>拒绝</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.approveBtn}
          onPress={() => onApprove(request.id, selectedIds)}
          activeOpacity={0.7}
        >
          <Text style={styles.approveText}>允许并继续</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.lg,
    marginVertical: space.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.sm,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  badgeText: {
    color: colors.accentText,
    fontSize: font.tiny,
    fontWeight: "600",
  },
  title: {
    flex: 1,
    fontSize: font.body,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 21,
  },
  desc: {
    fontSize: font.small,
    color: colors.textMuted,
    lineHeight: 19,
    marginBottom: space.md,
  },
  optionsList: {
    gap: space.sm,
    marginBottom: space.md,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionItemSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    marginRight: space.md,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    borderColor: colors.accent,
  },
  checkboxInner: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: font.small,
    color: colors.text,
  },
  optionLabelSelected: {
    color: colors.accentText,
    fontWeight: "600",
  },
  optionDesc: {
    fontSize: font.tiny,
    color: colors.textFaint,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: space.sm,
    justifyContent: "flex-end",
  },
  rejectBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
  },
  rejectText: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "600",
  },
  approveBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  approveText: {
    color: "#ffffff",
    fontSize: font.small,
    fontWeight: "600",
  },
});

export default PermissionCard;
