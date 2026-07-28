import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { OrganisationMembership, OrganisationRole } from "@/lib/types";

interface AuthState {
  session: Session | null;
  loading: boolean;
  memberships: OrganisationMembership[];
  isPlatformOperator: boolean;
  // Set when membership loading or organisation bootstrap fails (e.g. a
  // transient network error). Loading finishes either way, so without this
  // the app would look permanently stuck on a brand-new user with no
  // indication of what went wrong or how to recover.
  membershipError: string | null;
  retryMembershipLoad: () => void;
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
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

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
    setMembershipError(null);

    Promise.all([
      supabase.from("organisation_members").select("organisation_id, role").eq("user_id", userId),
      supabase.from("profiles").select("is_platform_operator").eq("id", userId).single(),
    ]).then(async ([membershipRes, profileRes]) => {
      if (!active) return;
      if (membershipRes.error) {
        console.error("[auth] failed to load organisation_members:", membershipRes.error.message);
        setMembershipError(membershipRes.error.message);
      }
      if (profileRes.error) {
        console.error("[auth] failed to load profile:", profileRes.error.message);
      }

      let rows = membershipRes.data ?? [];

      // ADR-0014: a brand-new signup has zero organisation_members rows —
      // migration 01's backfill only ever covered pre-existing users, and
      // there's no other onboarding flow yet. Bootstrap their own
      // organisation once, here, rather than leaving them stuck with a
      // permanently empty app. This goes through a single atomic RPC
      // (migration 23) rather than two separate client-side inserts —
      // two tabs racing this same effect concurrently would otherwise each
      // create their own organisation for the same user, since nothing
      // stops a user from creating a *second* brand-new org for
      // themselves (only inserting into someone else's org is blocked).
      // The RPC serializes concurrent calls per-user via an advisory lock
      // and is idempotent: it returns the existing org id if one already
      // exists by the time it runs.
      if (rows.length === 0 && !membershipRes.error) {
        const { data: organisationId, error: bootstrapError } = await supabase.rpc("bootstrap_own_organisation");
        if (bootstrapError) {
          console.error("[auth] failed to bootstrap organisation:", bootstrapError.message);
          if (!active) return;
          setMembershipError(bootstrapError.message);
        } else if (organisationId) {
          rows = [{ organisation_id: organisationId, role: "owner" }];
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
  }, [session?.user?.id, retryToken]);

  const retryMembershipLoad = () => setRetryToken((t) => t + 1);

  const hasRole = (organisationId: string, roles: OrganisationRole[]) => {
    if (isPlatformOperator) return true;
    return memberships.some((m) => m.organisationId === organisationId && roles.includes(m.role));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, loading, memberships, isPlatformOperator, membershipError, retryMembershipLoad, hasRole, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
