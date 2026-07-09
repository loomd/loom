import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { I18nProvider } from "../I18nContext";
import { ToastProvider } from "../ToastContext";

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

const mockOnContentDirtyChange = vi.fn();

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange, language, theme }: {
    value?: string; onChange?: (v: string | undefined) => void; language?: string; theme?: string;
  }) => (
    <textarea
      data-testid="monaco-editor"
      data-language={language}
      data-theme={theme}
      value={value || ""}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FileEditor", () => {
  it("shows loading state initially", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockImplementation(() => new Promise(() => {}));

    const { FileEditor } = await import("../components/FileEditor");
    render(
      <TestWrapper>
        <FileEditor filePath="/test/file.ts" onContentDirtyChange={mockOnContentDirtyChange} />
      </TestWrapper>
    );
    expect(screen.getByText((c) => c.includes("正在加载文件内容"))).toBeInTheDocument();
  });

  it("loads and displays file content", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "read_text_file") return Promise.resolve("console.log('hello');");
      return Promise.resolve(undefined);
    });

    const { FileEditor } = await import("../components/FileEditor");
    render(
      <TestWrapper>
        <FileEditor filePath="/test/file.ts" onContentDirtyChange={mockOnContentDirtyChange} />
      </TestWrapper>
    );

    await waitFor(() => {
      const editor = screen.getByTestId("monaco-editor") as HTMLTextAreaElement;
      expect(editor.value).toContain("console.log");
    });
  });

  it("displays file path in header", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "read_text_file") return Promise.resolve("content");
      return Promise.resolve(undefined);
    });

    const { FileEditor } = await import("../components/FileEditor");
    render(
      <TestWrapper>
        <FileEditor filePath="/test/file.ts" onContentDirtyChange={mockOnContentDirtyChange} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("/test/file.ts")).toBeInTheDocument();
    });
  });

  it("detects language from file extension", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "read_text_file") return Promise.resolve("content");
      return Promise.resolve(undefined);
    });

    const { FileEditor } = await import("../components/FileEditor");
    const { rerender } = render(
      <TestWrapper>
        <FileEditor filePath="/test/file.ts" onContentDirtyChange={mockOnContentDirtyChange} />
      </TestWrapper>
    );

    await waitFor(() => {
      const editor = screen.getByTestId("monaco-editor") as HTMLTextAreaElement;
      expect(editor.dataset.language).toBe("typescript");
    });

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "read_text_file") return Promise.resolve("body { color: red; }");
      return Promise.resolve(undefined);
    });

    rerender(
      <TestWrapper>
        <FileEditor filePath="/test/style.css" onContentDirtyChange={mockOnContentDirtyChange} />
      </TestWrapper>
    );

    await waitFor(() => {
      const editor = screen.getByTestId("monaco-editor") as HTMLTextAreaElement;
      expect(editor.dataset.language).toBe("css");
    });
  });

  it("passes theme down to editor", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "read_text_file") return Promise.resolve("content");
      return Promise.resolve(undefined);
    });

    const { FileEditor } = await import("../components/FileEditor");
    render(
      <TestWrapper>
        <FileEditor filePath="/test/file.ts" onContentDirtyChange={mockOnContentDirtyChange} theme="dark" />
      </TestWrapper>
    );

    await waitFor(() => {
      const editor = screen.getByTestId("monaco-editor") as HTMLTextAreaElement;
      expect(editor.dataset.theme).toBe("vs-dark");
    });
  });

  it("shows error state on load failure", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "read_text_file") return Promise.reject(new Error("File not found"));
      return Promise.resolve(undefined);
    });

    const { FileEditor } = await import("../components/FileEditor");
    render(
      <TestWrapper>
        <FileEditor filePath="/test/missing.txt" onContentDirtyChange={mockOnContentDirtyChange} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText((c) => c.includes("加载文件失败"))).toBeInTheDocument();
    });
  });

  it("calls onContentDirtyChange when content changes", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "read_text_file") return Promise.resolve("original");
      return Promise.resolve(undefined);
    });

    const { FileEditor } = await import("../components/FileEditor");
    render(
      <TestWrapper>
        <FileEditor filePath="/test/file.txt" onContentDirtyChange={mockOnContentDirtyChange} />
      </TestWrapper>
    );

    await waitFor(() => {
      const editor = screen.getByTestId("monaco-editor") as HTMLTextAreaElement;
      expect(editor.value).toBe("original");
    });

    const editor = screen.getByTestId("monaco-editor") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "modified" } });

    expect(mockOnContentDirtyChange).toHaveBeenCalledWith(true);
  });
});
