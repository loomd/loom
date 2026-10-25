import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

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
          <Text style={styles.badgeText}>操作审批</Text>
        </View>
        <Text style={styles.title}>{request.title}</Text>
      </View>

      {request.description ? (
        <Text style={styles.desc}>{request.description}</Text>
      ) : null}

      {request.options && request.options.length > 0 && (
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
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <View style={styles.checkboxInner} />}
                </View>
                <View style={styles.optionContent}>
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
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
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.rejectBtn}
          onPress={() => onReject(request.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.rejectText}>拒绝操作</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.approveBtn}
          onPress={() => onApprove(request.id, selectedIds)}
          activeOpacity={0.7}
        >
          <Text style={styles.approveText}>确认授权并继续</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1c1c28",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3f3f50",
    padding: 16,
    marginVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  badge: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    borderWidth: 1,
    borderColor: "#6366f1",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  badgeText: {
    color: "#a5b4fc",
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
    flex: 1,
  },
  desc: {
    fontSize: 12,
    color: "#a1a1aa",
    lineHeight: 18,
    marginBottom: 12,
  },
  optionsList: {
    gap: 8,
    marginBottom: 14,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 6,
    backgroundColor: "#161620",
    borderWidth: 1,
    borderColor: "#27273a",
  },
  optionItemSelected: {
    borderColor: "#6366f1",
    backgroundColor: "rgba(99, 102, 241, 0.08)",
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#52525b",
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    borderColor: "#6366f1",
  },
  checkboxInner: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: "#6366f1",
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 13,
    color: "#e4e4e7",
  },
  optionLabelSelected: {
    color: "#a5b4fc",
    fontWeight: "600",
  },
  optionDesc: {
    fontSize: 11,
    color: "#71717a",
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 4,
  },
  rejectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#3f3f46",
    backgroundColor: "#181820",
  },
  rejectText: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "600",
  },
  approveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#6366f1",
  },
  approveText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
});

export default PermissionCard;
