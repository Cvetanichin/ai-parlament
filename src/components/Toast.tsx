import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { logError, flushErrorQueue, classifyError, type ErrorLogEntry } from "../lib/errorLogger";

export type ToastKind = "success" | "warning" | "error";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  retryable?: boolean;
  onRetry?: () => void;
}

interface ToastContextValue {
  toasts: Toast[];
  notify: (kind: ToastKind, message: string, opts?: { retryable?: boolean; onRetry?: () => void }) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback<ToastContextValue["notify"]>((kind, message, opts) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, kind, message, retryable: opts?.retryable, onRetry: opts?.onRetry }]);
    const ttl = kind === "error" ? 8000 : 4000;
    setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  // Flush queued error logs when coming back online
  useEffect(() => {
    const handleOnline = () => {
      flushErrorQueue().catch(() => {});
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, notify, dismiss }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

/** Report an error: logs to Supabase (with offline queue) and shows a user-facing toast. */
export function useReportError() {
  const { notify } = useToast();
  return useCallback(
    async (err: unknown, onRetry?: () => void) => {
      const entry: ErrorLogEntry = classifyError(err);
      await logError(entry);
      notify("error", entry.message, { retryable: entry.retryable, onRetry });
    },
    [notify],
  );
}

function ToastContainer() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const styles: Record<ToastKind, string> = {
    success: "bg-success-50 border-success-600 text-success-700",
    warning: "bg-warning-50 border-warning-600 text-warning-700",
    error: "bg-error-50 border-error-600 text-error-700",
  };
  const icons: Record<ToastKind, string> = { success: "✓", warning: "!", error: "✕" };

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border-l-4 px-4 py-3 shadow-md animate-slide-in ${styles[toast.kind]}`}
      role="alert"
    >
      <span className="font-bold text-lg leading-none mt-0.5">{icons[toast.kind]}</span>
      <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>
      {toast.retryable && toast.onRetry && (
        <button
          onClick={toast.onRetry}
          className="text-xs font-semibold underline hover:no-underline shrink-0"
        >
          Retry
        </button>
      )}
      <button onClick={onDismiss} className="text-sm opacity-60 hover:opacity-100 shrink-0" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
