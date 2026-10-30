import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./IconButton";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, "id">) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastIdCounter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastMessage, "id">) => {
      const id = `toast-${Date.now()}-${++toastIdCounter}`;
      const newToast: ToastMessage = { id, ...toast };
      setToasts((prev) => [...prev, newToast]);

      const duration = toast.duration ?? 4000;
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
      return id;
    },
    [removeToast],
  );

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider
      value={{ toasts, addToast, removeToast, clearToasts }}
    >
      {children}
      <ToastViewport toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Graceful fallback if rendered outside ToastProvider
    return {
      toasts: [],
      addToast: () => "",
      removeToast: () => {},
      clearToasts: () => {},
      toast: {
        info: () => "",
        success: () => "",
        warning: () => "",
        error: () => "",
      },
    };
  }

  const { addToast } = context;

  return {
    ...context,
    toast: {
      info: (title: string, description?: string, duration?: number) =>
        addToast({ title, description, variant: "info", duration }),
      success: (title: string, description?: string, duration?: number) =>
        addToast({ title, description, variant: "success", duration }),
      warning: (title: string, description?: string, duration?: number) =>
        addToast({ title, description, variant: "warning", duration }),
      error: (title: string, description?: string, duration?: number) =>
        addToast({ title, description, variant: "error", duration }),
    },
  };
}

export const ToastViewport: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Benachrichtigungen"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
};

export const ToastItem: React.FC<{
  toast: ToastMessage;
  onDismiss: () => void;
}> = ({ toast, onDismiss }) => {
  const variant = toast.variant || "info";

  const icons = {
    info: <Info className="w-4 h-4 text-[var(--p-accent)] shrink-0" />,
    success: (
      <CheckCircle2 className="w-4 h-4 text-[var(--p-success)] shrink-0" />
    ),
    warning: (
      <AlertTriangle className="w-4 h-4 text-[var(--p-warning)] shrink-0" />
    ),
    error: <AlertCircle className="w-4 h-4 text-[var(--p-danger)] shrink-0" />,
  }[variant];

  const borderAccents = {
    info: "border-l-[3px] border-l-[var(--p-accent)]",
    success: "border-l-[3px] border-l-[var(--p-success)]",
    warning: "border-l-[3px] border-l-[var(--p-warning)]",
    error: "border-l-[3px] border-l-[var(--p-danger)]",
  }[variant];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex items-start gap-3 p-3.5 rounded-[var(--p-radius-md)]",
        "bg-[var(--p-surface-3)] text-[var(--p-text-1)] border border-[var(--p-border-strong)] shadow-[var(--p-shadow-lg)] backdrop-blur-md",
        "transition-all duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
        borderAccents,
      )}
    >
      <div className="mt-0.5">{icons}</div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-semibold text-[var(--p-text-1)] leading-tight">
          {toast.title}
        </span>
        {toast.description && (
          <span className="text-xs text-[var(--p-text-2)] mt-1 leading-relaxed">
            {toast.description}
          </span>
        )}
      </div>
      <IconButton
        size="xs"
        variant="ghost"
        aria-label="Benachrichtigung schließen"
        icon={<X className="w-3.5 h-3.5" />}
        onClick={onDismiss}
        className="text-[var(--p-text-3)] hover:text-[var(--p-text-1)] -mr-1 -mt-1"
      />
    </div>
  );
};
