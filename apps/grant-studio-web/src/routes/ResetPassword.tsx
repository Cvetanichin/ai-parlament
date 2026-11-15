import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase, initialAuthLinkError } from "@/lib/supabase";
import { authErrorMessage, passwordValidationError } from "@/lib/passwordRecovery";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function ResetPassword() {
  const { session, initializing, setPasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(initialAuthLinkError);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validation = passwordValidationError(password, confirmation);
    if (validation) { setError(validation); return; }
    if (!session) { setError("Open a valid password reset link from your email first."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setConfirmation("");
      setPasswordRecovery(false);
      setSaved(true);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{saved ? "Password updated" : "Set a new password"}</CardTitle>
          <CardDescription>{saved ? "Your new password is saved. You are signed in." : "Open the reset link from your email, then choose your new password."}</CardDescription>
        </CardHeader>
        <CardContent>
          {initializing ? <p role="status">Checking your reset link…</p> : saved ? (
            <Link className="underline underline-offset-4" to="/grant-studio">Continue to Grant Studio</Link>
          ) : !session ? (
            <div className="space-y-4">
              <p role="alert" className="text-sm text-destructive">{error ?? "No valid reset session found. The link may have expired or already been used."}</p>
              <Link className="text-sm underline underline-offset-4" to="/login?mode=forgot-password">Request a new reset link</Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Saving…" : "Save new password"}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
