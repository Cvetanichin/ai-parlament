import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, supabaseConfig, initialAuthLinkError } from "@/lib/supabase";
import { authErrorMessage, parseEmailLink } from "@/lib/passwordRecovery";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type Mode = "sign-in" | "sign-up" | "forgot-password";

export function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setPasswordRecovery } = useAuth();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "forgot-password" ? "forgot-password" : "sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialAuthLinkError);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailLink, setEmailLink] = useState("");

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setMessage(null);
    setPassword("");
    setEmailLink("");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "sign-in") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
      } else if (mode === "sign-up") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: `${window.location.origin}/login` },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setMessage("Check your email to confirm your account, then sign in. If the link opens the wrong page, copy the original email link into the form below.");
          setMode("sign-in");
        }
      } else {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setMessage("If an account exists for that email, a reset link is on its way. Check your inbox and spam folder. If you have not created an account on this site, sign up first.");
      }
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const useEmailLink = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const link = parseEmailLink(emailLink, supabaseConfig.url, window.location.origin);
      if (link.type === "recovery") setPasswordRecovery(true);
      const result = "token_hash" in link
        ? await supabase.auth.verifyOtp(link)
        : await supabase.auth.setSession({ access_token: link.access_token, refresh_token: link.refresh_token });
      if (result.error) throw result.error;
      if (!result.data.session) throw new Error("This reset link could not establish a session. Request a fresh email.");
      setEmailLink("");
      navigate(link.type === "recovery" ? "/reset-password" : "/grant-studio", { replace: true });
    } catch (cause) {
      setPasswordRecovery(false);
      setError(authErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
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
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {mode !== "forgot-password" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Please wait…" : title}
            </Button>
          </form>

          <details className="mt-4 text-sm text-muted-foreground">
            <summary className="cursor-pointer">Email link opens the wrong page?</summary>
            <p className="mt-2">Paste the original email link, or the full localhost address from the failed page (including everything after #). It is verified only with this Grant Studio backend. Keep it private.</p>
            <form onSubmit={useEmailLink} className="mt-3 space-y-3">
              <Label htmlFor="email-link">Confirmation or reset link</Label>
              <Input id="email-link" type="password" autoComplete="off" required value={emailLink} onChange={(event) => setEmailLink(event.target.value)} />
              <Button type="submit" variant="outline" disabled={submitting}>Use email link</Button>
            </form>
          </details>

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
            {mode === "forgot-password" && (
              <button type="button" className="underline underline-offset-4" onClick={() => switchMode("sign-up")}>
                New to this Grant Studio site? Sign up
              </button>
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
