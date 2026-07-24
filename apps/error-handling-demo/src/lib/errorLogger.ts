import { supabase } from "./supabase";

export type ErrorKind = "network" | "api" | "validation" | "runtime" | "unknown";

export interface ErrorLogEntry {
  kind: ErrorKind;
  message: string;
  technical?: string;
  url?: string;
  status?: number;
  retryable?: boolean;
}

const QUEUE_KEY = "error_log_queue";

function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function readQueue(): ErrorLogEntry[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as ErrorLogEntry[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: ErrorLogEntry[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // storage full or unavailable — drop silently; logging must never throw
  }
}

export async function logError(entry: ErrorLogEntry): Promise<void> {
  const payload = {
    kind: entry.kind,
    message: entry.message,
    technical: entry.technical ?? null,
    url: entry.url ?? (typeof window !== "undefined" ? window.location.href : null),
    status: entry.status ?? null,
    retryable: entry.retryable ?? false,
  };

  if (!isOnline()) {
    const queue = readQueue();
    queue.push(entry);
    writeQueue(queue);
    return;
  }

  try {
    const { error } = await supabase.from("error_logs").insert(payload);
    if (error) throw error;
  } catch {
    // Supabase unreachable or insert failed — queue locally for later retry
    const queue = readQueue();
    queue.push(entry);
    writeQueue(queue);
  }
}

export async function flushErrorQueue(): Promise<void> {
  if (!isOnline()) return;
  const queue = readQueue();
  if (queue.length === 0) return;

  const remaining: ErrorLogEntry[] = [];
  for (const entry of queue) {
    const payload = {
      kind: entry.kind,
      message: entry.message,
      technical: entry.technical ?? null,
      url: entry.url ?? (typeof window !== "undefined" ? window.location.href : null),
      status: entry.status ?? null,
      retryable: entry.retryable ?? false,
    };
    try {
      const { error } = await supabase.from("error_logs").insert(payload);
      if (error) throw error;
    } catch {
      remaining.push(entry);
    }
  }
  writeQueue(remaining);
}

export function classifyError(err: unknown): ErrorLogEntry {
  if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) {
    return {
      kind: "network",
      message: "Network connection failed. Please check your internet connection and try again.",
      technical: err.message,
      retryable: true,
    };
  }
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status: number }).status;
    if (status >= 500) {
      return {
        kind: "api",
        message: "The server encountered an error. Please try again in a moment.",
        technical: String(err),
        status,
        retryable: true,
      };
    }
    if (status === 404) {
      return {
        kind: "api",
        message: "The requested resource was not found.",
        technical: String(err),
        status,
        retryable: false,
      };
    }
    if (status === 401 || status === 403) {
      return {
        kind: "api",
        message: "You don't have permission to perform this action.",
        technical: String(err),
        status,
        retryable: false,
      };
    }
    return {
      kind: "api",
      message: "The request could not be completed.",
      technical: String(err),
      status,
      retryable: true,
    };
  }
  if (err instanceof Error && err.message.toLowerCase().includes("validation")) {
    return {
      kind: "validation",
      message: err.message,
      technical: err.stack,
      retryable: false,
    };
  }
  if (err instanceof Error) {
    return {
      kind: "runtime",
      message: "Something went wrong. Our team has been notified.",
      technical: err.stack ?? err.message,
      retryable: false,
    };
  }
  return {
    kind: "unknown",
    message: "An unexpected error occurred.",
    technical: String(err),
    retryable: false,
  };
}
