import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { OrganisationMembership, OrganisationRole } from "@/lib/types";

interface AuthState {
  session: Session | null;
  loading: boolean;
  memberships: OrganisationMembership[];
  isPlatformOperator: boolean;
  // Role-gating per docs/13-Frontend §3: read once at session start, cached
  // client-side. This is a UX convenience only -- every gated action's real
  // enforcement is the server-side RLS policy / edge function check (§7),
  // never this client-side value alone.
  hasRole: (organisationId: string, roles: OrganisationRole[]) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<OrganisationMembership[]>([]);
  const [isPlatformOperator, setIsPlatformOperator] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setMemberships([]);
      setIsPlatformOperator(false);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    Promise.all([
      supabase.from("organisation_members").select("organisation_id, role").eq("user_id", userId),
      supabase.from("profiles").select("is_platform_operator").eq("id", userId).single(),
    ]).then(([membershipRes, profileRes]) => {
      if (!active) return;
      if (membershipRes.error) {
        console.error("[auth] failed to load organisation_members:", membershipRes.error.message);
      }
      if (profileRes.error) {
        console.error("[auth] failed to load profile:", profileRes.error.message);
      }
      setMemberships(
        (membershipRes.data ?? []).map((row) => ({
          organisationId: row.organisation_id,
          role: row.role as OrganisationRole,
        })),
      );
      setIsPlatformOperator(Boolean(profileRes.data?.is_platform_operator));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const hasRole = (organisationId: string, roles: OrganisationRole[]) => {
    if (isPlatformOperator) return true;
    return memberships.some((m) => m.organisationId === organisationId && roles.includes(m.role));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, loading, memberships, isPlatformOperator, hasRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
