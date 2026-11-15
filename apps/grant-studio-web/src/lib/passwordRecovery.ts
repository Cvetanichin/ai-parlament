export function passwordValidationError(password: string, confirmation: string): string | null {
  if (password.length < 8) return "Use at least 8 characters for your new password.";
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}

// Parse locally; never visit a pasted URL or send its token to another service.
type EmailLink =
  | { token_hash: string; type: "recovery" | "signup" | "email" }
  | { access_token: string; refresh_token: string; type: "recovery" };

export function parseEmailLink(value: string, projectUrl: string, appOrigin?: string): EmailLink {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Copy the full confirmation or reset link from your Grant Studio email.");
  }
  const projectOrigin = new URL(projectUrl).origin;
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (fragment.has("access_token") || fragment.has("refresh_token")) {
    const allowedOrigins = new Set(["http://localhost:3000", "http://localhost:5173", ...(appOrigin ? [new URL(appOrigin).origin] : [])]);
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    if (!allowedOrigins.has(url.origin) || !["/", "/login", "/reset-password"].includes(url.pathname) ||
        url.username || url.password || fragment.get("type") !== "recovery" || !accessToken || !refreshToken) {
      throw new Error("Use the full password-reset address from the failed localhost page, including everything after #.");
    }
    let issuer: string | undefined;
    try {
      const payload = accessToken.split(".")[1];
      issuer = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).iss;
    } catch { /* The SDK will verify signatures; malformed tokens fail here. */ }
    if (issuer !== `${projectOrigin}/auth/v1`) throw new Error("This reset address belongs to a different Grant Studio project or is invalid. Request a fresh reset email from this site.");
    return { access_token: accessToken, refresh_token: refreshToken, type: "recovery" as const };
  }
  const type = url.searchParams.get("type");
  const tokenHash = url.searchParams.get("token_hash") || url.searchParams.get("token");
  if (url.origin !== projectOrigin || url.pathname !== "/auth/v1/verify" ||
      !["recovery", "signup", "email"].includes(type ?? "") || !tokenHash || url.username || url.password) {
    throw new Error("Use the original confirmation or reset link from this Grant Studio project's email.");
  }
  return { token_hash: tokenHash, type: type as "recovery" | "signup" | "email" };
}

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "invalid_credentials") return "Email or password is incorrect. If you have not created an account on this Grant Studio site, sign up first.";
  if (code === "email_not_confirmed") return "Confirm your email before signing in. Check your inbox and spam folder.";
  if (code === "otp_expired") return "This email link has expired or has already been used. Request a new one.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "Too many requests. Wait a few minutes, then try again.";
  return error instanceof Error ? error.message : "Unable to connect. Check your connection and try again.";
}
