import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// Complement to RequireAuth: the /login route itself has to react to
// session becoming truthy (both right after a successful sign-in, and on
// a direct hit with an already-persisted session) -- otherwise nothing
// ever navigates away from /login once auth succeeds.
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (session) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
