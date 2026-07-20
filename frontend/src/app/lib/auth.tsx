import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

// Frontend spec §3: "Role-gated navigation... driven by
// organisation_members.role and is_platform_operator, read once at session
// start and cached client-side, re-validated server-side on every gated
// action." This context is that client-side cache — every Edge Function this
// calls still re-checks role/is_platform_operator itself (resolveCaller /
// resolvePlatformOperator / requireGateRole), so a stale or tampered client
// value here can only ever hide a nav item, never grant a real action.
interface AuthState {
  session: Session | null;
  userId: string | null;
  organisationId: string | null;
  role: string | null;
  isPlatformOperator: boolean;
  // resolveCaller() (every gated Edge Function's auth check) hard-requires a
  // real `projects.id` to resolve organisationId from — a known limitation
  // carried through this whole backend build (pre-award entities like
  // Proposals have no natural Project yet; every Edge Function's `projectId`
  // param exists solely to satisfy this, flagged in each function's own
  // header comment). This is the one real project belonging to the caller's
  // organisation, used as that anchor for every Edge Function call — NOT the
  // user's own id, which would resolve nothing.
  defaultProjectId: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  session: null,
  userId: null,
  organisationId: null,
  role: null,
  isPlatformOperator: false,
  defaultProjectId: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    userId: null,
    organisationId: null,
    role: null,
    isPlatformOperator: false,
    defaultProjectId: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadProfile(session: Session | null) {
      if (!session) {
        if (!cancelled) setState({ session: null, userId: null, organisationId: null, role: null, isPlatformOperator: false, defaultProjectId: null, loading: false });
        return;
      }

      const userId = session.user.id;
      const [{ data: membership }, { data: profile }] = await Promise.all([
        supabase.from("organisation_members").select("organisation_id, role").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("is_platform_operator").eq("id", userId).maybeSingle(),
      ]);

      const organisationId = membership?.organisation_id ?? null;
      const { data: project } = organisationId
        ? await supabase.from("projects").select("id").eq("organisation_id", organisationId).limit(1).maybeSingle()
        : { data: null };

      if (!cancelled) {
        setState({
          session,
          userId,
          organisationId,
          role: membership?.role ?? null,
          isPlatformOperator: profile?.is_platform_operator ?? false,
          defaultProjectId: project?.id ?? null,
          loading: false,
        });
      }
    }

    supabase.auth.getSession().then(({ data }) => loadProfile(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((prev) => ({ ...prev, loading: true }));
      loadProfile(session);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
