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
    ]).then(async ([membershipRes, profileRes]) => {
      if (!active) return;
      if (membershipRes.error) {
        console.error("[auth] failed to load organisation_members:", membershipRes.error.message);
      }
      if (profileRes.error) {
        console.error("[auth] failed to load profile:", profileRes.error.message);
      }

      let rows = membershipRes.data ?? [];

      // ADR-0014: a brand-new signup has zero organisation_members rows —
      // migration 01's backfill only ever covered pre-existing users, and
      // there's no other onboarding flow yet. Bootstrap their own
      // organisation once, here, rather than leaving them stuck with a
      // permanently empty app.
      if (rows.length === 0 && !membershipRes.error) {
        const email = session?.user?.email ?? userId;
        // Generate the id client-side rather than reading it back via
        // `.select()` — organisations_select requires an organisation_members
        // row to already exist for this org, which isn't true yet at the
        // moment of this insert. Postgres raises an RLS error on
        // INSERT ... RETURNING when the new row isn't visible under any
        // SELECT policy, rather than silently omitting it, so a read-back
        // here would always fail for a brand-new organisation.
        const organisationId = crypto.randomUUID();
        const { error: orgError } = await supabase
          .from("organisations")
          .insert({ id: organisationId, name: `${email}'s Organisation` });
        if (orgError) {
          console.error("[auth] failed to bootstrap organisation:", orgError.message);
        } else {
          const { error: memberError } = await supabase
            .from("organisation_members")
            .insert({ organisation_id: organisationId, user_id: userId, role: "owner" });
          if (memberError) {
            console.error("[auth] failed to bootstrap organisation_members:", memberError.message);
          } else {
            rows = [{ organisation_id: organisationId, role: "owner" }];
          }
        }
      }

      if (!active) return;
      setMemberships(
        rows.map((row) => ({
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
