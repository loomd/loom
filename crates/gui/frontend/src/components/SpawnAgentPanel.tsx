import React, { useState, useEffect, useRef, useCallback } from "react";
import { getTemplates } from "../api";
import type { Template } from "../types";

interface Props {
  onSpawn: (template: Template) => void;
  onClose: () => void;
}

export default function SpawnAgentPanel({ onSpawn, onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getTemplates()
      .then((data) => {
        setTemplates(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedClamped = filtered.length === 0 ? -1 : Math.min(selectedIndex, filtered.length - 1);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev <= 0 ? Math.max(filtered.length - 1, 0) : prev - 1,
        );
      } else if (e.key === "Enter" && filtered[selectedClamped]) {
        e.preventDefault();
        onSpawn(filtered[selectedClamped]);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [filtered, selectedClamped, onSpawn, onClose],
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const item = el.children[selectedClamped] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedClamped]);

  return (
    <div
      className="spawn-agent-overlay"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="spawn-agent-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spawn-agent-input-wrap">
          <svg className="spawn-agent-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            className="spawn-agent-input"
            type="text"
            placeholder="搜索 Agent..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedIndex(0); }}
          />
        </div>

        <div className="spawn-agent-list" ref={listRef}>
          {loading ? (
            <div className="spawn-agent-empty">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="spawn-agent-empty">
              {templates.length === 0 ? "暂无派生模板" : "无匹配结果"}
            </div>
          ) : (
            filtered.map((tpl, i) => (
              <div
                key={tpl.id}
                className={`spawn-agent-item${i === selectedClamped ? " selected" : ""}`}
                onClick={() => onSpawn(tpl)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className="spawn-agent-item-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 3 21 3 21 8" />
                    <line x1="4" y1="20" x2="21" y2="3" />
                    <polyline points="21 16 21 21 16 21" />
                    <line x1="15" y1="15" x2="21" y2="21" />
                    <line x1="4" y1="4" x2="9" y2="9" />
                  </svg>
                </div>
                <div className="spawn-agent-item-info">
                  <div className="spawn-agent-item-name">{tpl.name}</div>
                  <div className="spawn-agent-item-path">{tpl.args?.join(" ") || "无参数"}</div>
                </div>
                <div className="spawn-agent-item-badge">派生</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
