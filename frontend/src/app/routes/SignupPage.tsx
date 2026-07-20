import { useState, type FormEvent } from "react";
import { Navigate, Link } from "react-router";
import { supabase } from "@/app/lib/supabaseClient";
import { invokeEdgeFunction } from "@/app/lib/edgeFunctions";
import { withTimeout } from "@/app/lib/withTimeout";
import { useAuth } from "@/app/lib/auth";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";

// Product Vision §2: "one Organisation for the whole consultancy at v1" —
// this is a join-the-single-org bootstrap (signup-provision-run), not a
// per-signup new-tenant flow. Useful for local dev / first-run; a real
// deployment would likely gate this behind an invite instead, but no
// invite flow is specified anywhere yet, so this isn't guessed at here.
export function SignupPage() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) return <Navigate to="/grant-studio" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    let data: Awaited<ReturnType<typeof supabase.auth.signUp>>["data"];
    try {
      const result = await withTimeout(supabase.auth.signUp({ email, password }), 15_000, "Sign up");
      if (result.error) {
        setError(result.error.message);
        setSubmitting(false);
        return;
      }
      data = result.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
      return;
    }
    if (!data.session) {
      // Email confirmation is required by this project's config — no
      // session yet, nothing more this page can do until that's confirmed.
      setError("Account created — check your email to confirm before signing in.");
      setSubmitting(false);
      return;
    }

    try {
      await invokeEdgeFunction("signup-provision-run", {});
    } catch (err) {
      setError(err instanceof Error ? `Account created, but organisation setup failed: ${err.message}` : String(err));
      setSubmitting(false);
      return;
    }

    // AuthProvider's onAuthStateChange listener picks up the new session and
    // re-resolves organisationId/defaultProjectId on its own — no manual
    // reload needed, the redirect above handles navigation once it lands.
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Joins the consultancy's single Organisation (Product Vision §2).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating account…" : "Create account"}
            </Button>
            <Link to="/login" className="text-center text-sm text-muted-foreground hover:underline">
              Already have an account? Sign in
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
