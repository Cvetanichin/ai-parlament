import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type Mode = "sign-in" | "sign-up" | "forgot-password";

export function Login() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setMessage(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    if (mode === "sign-in") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setError(signInError.message);
    } else if (mode === "sign-up") {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
      } else if (data.session) {
        // If email confirmation is ever turned off, signUp returns an active
        // session immediately — nothing else to do here; RequireAuth's
        // redirect takes over once useAuth picks up the session.
      } else {
        setMessage("Check your email to confirm your account, then sign in.");
        setMode("sign-in");
      }
    } else {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
      if (resetError) {
        setError(resetError.message);
      } else {
        setMessage("If an account exists for that email, a password reset link is on its way.");
      }
    }

    setSubmitting(false);
  };

  const title = mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Reset password";
  const description =
    mode === "sign-in"
      ? "Sign in with your organisation account."
      : mode === "sign-up"
        ? "Sign up to create your own organisation."
        : "Enter your email and we'll send a reset link.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Grant Studio</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {mode !== "forgot-password" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Please wait…" : title}
            </Button>
          </form>

          <div className="mt-4 flex flex-col gap-1 text-center text-sm text-muted-foreground">
            {mode === "sign-in" && (
              <>
                <button type="button" className="underline underline-offset-4" onClick={() => switchMode("sign-up")}>
                  Don't have an account? Sign up
                </button>
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => switchMode("forgot-password")}
                >
                  Forgot password?
                </button>
              </>
            )}
            {mode !== "sign-in" && (
              <button type="button" className="underline underline-offset-4" onClick={() => switchMode("sign-in")}>
                Back to sign in
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
