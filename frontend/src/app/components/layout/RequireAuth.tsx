import { Navigate, Outlet } from "react-router";
import { useAuth } from "@/app/lib/auth";

export function RequireAuth() {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
