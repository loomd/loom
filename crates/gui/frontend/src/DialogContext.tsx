import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { useI18n } from "./I18nContext";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title?: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

type DialogRequest =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (v: string | null) => void };

interface DialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function resolveRequest(req: DialogRequest, value: boolean | string | null) {
  if (req.kind === "confirm") {
    req.resolve(value === true);
  } else {
    req.resolve(typeof value === "string" ? value : null);
  }
}

const DANGER_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3 L22 20 H2 Z" />
    <line x1="12" y1="9" x2="12" y2="14" />
    <circle cx="12" cy="17.2" r="0.6" fill="currentColor" />
  </svg>
);

const PROMPT_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 10 L12 14 L16 10" />
    <line x1="12" y1="4" x2="12" y2="12" />
    <path d="M4 20 H20" />
  </svg>
);

export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => setRequest(null), []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setRequest({ kind: "confirm", options, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    setInputValue(options.defaultValue ?? "");
    return new Promise<string | null>((resolve) => {
      setRequest({ kind: "prompt", options, resolve });
    });
  }, []);

  useEffect(() => {
    if (request?.kind === "prompt") {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        resolveRequest(request, request.kind === "confirm" ? false : null);
        close();
      } else if (e.key === "Enter") {
        e.preventDefault();
        resolveRequest(request, request.kind === "prompt" ? inputValue : true);
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [request, inputValue, close]);

  const handleBackdropClick = () => {
    if (!request) return;
    resolveRequest(request, request.kind === "confirm" ? false : null);
    close();
  };

  const handleCancel = () => {
    if (!request) return;
    resolveRequest(request, request.kind === "confirm" ? false : null);
    close();
  };

  const handleConfirmClick = () => {
    if (!request) return;
    resolveRequest(request, request.kind === "prompt" ? inputValue : true);
    close();
  };

  const isDanger = request?.options.danger ?? false;
  const title = request?.options.title;
  const message = request?.options.message;

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {request && (
        <div
          className="dialog-backdrop"
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="dialog-shell"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-card">
              <div className={`dialog-icon ${isDanger ? "danger" : ""}`}>
                {request.kind === "confirm" ? DANGER_ICON : PROMPT_ICON}
              </div>
              {title && <div className="dialog-title">{title}</div>}
              {message && <div className="dialog-message">{message}</div>}
              {request.kind === "prompt" && (
                <input
                  ref={inputRef}
                  className="input dialog-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={request.options.placeholder}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              )}
              <div className="dialog-actions">
                <button className="btn btn-ghost" onClick={handleCancel}>
                  {request.options.cancelText ?? t("cat.modal.btn.cancel")}
                </button>
                <button
                  className={`btn ${isDanger ? "btn-danger" : "btn-primary"}`}
                  onClick={handleConfirmClick}
                >
                  {request.options.confirmText ?? t("dialog.btn.confirm")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
}
