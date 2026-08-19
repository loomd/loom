import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import { describe, it, expect, vi } from "vitest";
import { I18nProvider } from "../I18nContext";

function t(key: string, params?: Record<string, string>): string {
  return `${key}${params ? JSON.stringify(params) : ""}`;
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

const sampleMarkdown = `# v0.6.5 更新内容

- 多开窗口支持任意拖拽调节大小
- 新增两种多开模式

## 代码块

\`\`\`
console.log("hi");
\`\`\`

**粗体**文本`;

const singleEntry = [{ version: "0.6.5", content: sampleMarkdown }];

const multiEntries = [
  { version: "0.6.4", content: "- 修复了某个 bug" },
  { version: "0.6.5", content: "- 多开窗口支持任意拖拽调节大小" },
];

async function renderDialog(overrides: Record<string, unknown> = {}) {
  const { default: WhatsNewDialog } = await import("../components/WhatsNewDialog");
  return render(
    <TestWrapper>
      <WhatsNewDialog
        entries={singleEntry}
        t={t}
        onClose={vi.fn()}
        {...overrides}
      />
    </TestWrapper>
  );
}

describe("WhatsNewDialog", () => {
  it("renders title and close button", async () => {
    await renderDialog();
    expect(screen.getByText(/whatsnew.title/)).toBeInTheDocument();
    expect(screen.getByText(/whatsnew.close/)).toBeInTheDocument();
  });

  it("renders version heading for each entry", async () => {
    await renderDialog();
    expect(screen.getByText("v0.6.5")).toBeInTheDocument();
  });

  it("renders markdown headings and list items", async () => {
    await renderDialog();
    expect(screen.getByText("v0.6.5 更新内容")).toBeInTheDocument();
    expect(screen.getByText("多开窗口支持任意拖拽调节大小")).toBeInTheDocument();
    expect(screen.getByText("新增两种多开模式")).toBeInTheDocument();
  });

  it("renders code blocks", async () => {
    await renderDialog();
    expect(screen.getByText('console.log("hi");')).toBeInTheDocument();
  });

  it("renders bold text", async () => {
    await renderDialog();
    const bold = screen.getByText("粗体");
    expect(bold.tagName).toBe("STRONG");
  });

  it("renders all entries in aggregate mode", async () => {
    await renderDialog({ entries: multiEntries });
    expect(screen.getByText("v0.6.4")).toBeInTheDocument();
    expect(screen.getByText("v0.6.5")).toBeInTheDocument();
    expect(screen.getByText("修复了某个 bug")).toBeInTheDocument();
    expect(screen.getByText("多开窗口支持任意拖拽调节大小")).toBeInTheDocument();
  });

  it("calls onClose when backdrop clicked", async () => {
    const onClose = vi.fn();
    const { container } = await renderDialog({ onClose });

    fireEvent.click(container.querySelector(".modal-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the dialog", async () => {
    const onClose = vi.fn();
    const { container } = await renderDialog({ onClose });

    fireEvent.click(container.querySelector(".modal-content")!);
    expect(onClose).not.toHaveBeenCalled();
  });
});