import { useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast, useReportError } from "./components/Toast";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
          <OfflineBanner />
          <NetworkFailureDemo />
          <ApiErrorDemo />
          <ValidationDemo />
          <ErrorLogViewer />
        </main>
      </div>
    </ErrorBoundary>
  );
}

function Header() {
  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-3xl mx-auto px-4 py-5">
        <h1 className="text-xl font-bold text-slate-800">Error Handling Strategy Demo</h1>
        <p className="text-sm text-slate-500 mt-1">
          Graceful degradation, user-friendly messages, offline support, and error logging.
        </p>
      </div>
    </header>
  );
}

function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="bg-warning-50 border border-warning-600 text-warning-700 rounded-lg px-4 py-3 text-sm font-medium animate-fade-in">
      You are offline. Changes will be queued and synced when your connection returns.
    </div>
  );
}

// --- Network failure demo ---

function NetworkFailureDemo() {
  const reportError = useReportError();
  const [loading, setLoading] = useState(false);

  const triggerNetworkError = async () => {
    setLoading(true);
    try {
      // Point to an unreachable host to simulate a network failure
      const res = await fetch("https://nonexistent.invalid.example/api/data", {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
    } catch (err) {
      await reportError(err, triggerNetworkError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DemoCard
      title="Network Failure"
      description="Simulates a request to an unreachable host. The error is classified, logged to Supabase (or queued offline), and surfaced as a retryable toast."
    >
      <button
        onClick={triggerNetworkError}
        disabled={loading}
        className="px-4 py-2 bg-error-600 text-white rounded-lg font-semibold text-sm hover:bg-error-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Requesting…" : "Trigger network error"}
      </button>
    </DemoCard>
  );
}

// --- API error demo ---

function ApiErrorDemo() {
  const reportError = useReportError();
  const [loading, setLoading] = useState(false);

  const triggerApiError = async () => {
    setLoading(true);
    try {
      // Query a table that doesn't exist to produce a PostgREST 404
      const { error } = await supabase.from("this_table_does_not_exist").select("*").limit(1);
      if (error) throw error;
    } catch (err) {
      await reportError(err, triggerApiError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DemoCard
      title="API Error"
      description="Queries a non-existent Supabase table, producing a structured API error. The status code is extracted and the message is tailored accordingly."
    >
      <button
        onClick={triggerApiError}
        disabled={loading}
        className="px-4 py-2 bg-slate-700 text-white rounded-lg font-semibold text-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
      >
        {loading ? "Querying…" : "Trigger API error"}
      </button>
    </DemoCard>
  );
}

// --- Validation demo ---

function ValidationDemo() {
  const notify = useToast();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (value: string): string | null => {
    if (!value.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Please enter a valid email address.";
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate(email);
    if (err) {
      setErrors({ email: err });
      notify("warning", err);
      return;
    }
    setErrors({});
    notify("success", "Form submitted successfully!");
    setEmail("");
  };

  return (
    <DemoCard
      title="Validation Failure"
      description="Client-side validation with inline field errors and a warning toast. No network round-trip is needed for invalid input."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            type="text"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors({});
            }}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
              errors.email
                ? "border-error-600 focus:ring-error-600"
                : "border-slate-300 focus:ring-slate-400"
            }`}
            placeholder="you@example.com"
          />
          {errors.email && <p className="text-error-600 text-xs mt-1">{errors.email}</p>}
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-success-600 text-white rounded-lg font-semibold text-sm hover:bg-success-700 transition-colors"
        >
          Submit
        </button>
      </form>
    </DemoCard>
  );
}

// --- Error log viewer ---

function ErrorLogViewer() {
  const reportError = useReportError();
  const [logs, setLogs] = useState<ErrorLogRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("error_logs")
        .select("id, kind, message, status, retryable, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      setLogs(data ?? []);
    } catch (err) {
      await reportError(err, fetchLogs);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DemoCard
      title="Error Log Viewer"
      description="Fetches the most recent entries from the error_logs Supabase table, demonstrating end-to-end error logging visibility."
    >
      <button
        onClick={fetchLogs}
        disabled={loading}
        className="px-4 py-2 bg-slate-800 text-white rounded-lg font-semibold text-sm hover:bg-slate-700 disabled:opacity-50 transition-colors mb-4"
      >
        {loading ? "Loading…" : "Fetch recent logs"}
      </button>
      {logs && logs.length > 0 && (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="bg-white border border-slate-200 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${kindBadge(log.kind)}`}>
                  {log.kind}
                </span>
                {log.status && <span className="text-xs text-slate-400">HTTP {log.status}</span>}
                {log.retryable && <span className="text-xs text-warning-700">retryable</span>}
              </div>
              <p className="text-slate-700">{log.message}</p>
              <p className="text-xs text-slate-400 mt-1">
                {new Date(log.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
      {logs && logs.length === 0 && <p className="text-sm text-slate-500">No logs yet.</p>}
    </DemoCard>
  );
}

interface ErrorLogRow {
  id: string;
  kind: string;
  message: string;
  status: number | null;
  retryable: boolean;
  created_at: string;
}

function kindBadge(kind: string): string {
  switch (kind) {
    case "network": return "bg-error-50 text-error-700";
    case "api": return "bg-warning-50 text-warning-700";
    case "validation": return "bg-warning-50 text-warning-700";
    case "runtime": return "bg-error-50 text-error-700";
    default: return "bg-slate-100 text-slate-700";
  }
}

function DemoCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-800 mb-1">{title}</h2>
      <p className="text-sm text-slate-500 mb-4">{description}</p>
      {children}
    </section>
  );
}
