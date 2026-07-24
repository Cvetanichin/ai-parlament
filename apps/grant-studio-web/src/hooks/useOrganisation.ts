import { useAuth } from "@/hooks/useAuth";

// Product Vision §2's single-Organisation-at-v1 framing: a user belongs to
// exactly one organisation in practice, so the first membership is "the"
// organisation for every data-scoped query. Revisit if/when multi-org
// membership per user becomes real (an organisation switcher would live
// here).
export function useOrganisation() {
  const { memberships, loading } = useAuth();
  const membership = memberships[0] ?? null;
  return { organisationId: membership?.organisationId ?? null, role: membership?.role ?? null, loading };
}
