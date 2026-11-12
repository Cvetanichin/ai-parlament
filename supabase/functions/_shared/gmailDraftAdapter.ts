/**
 * Gmail Drafts adapter.
 * IMPORTANT: Only Gmail drafts.create is implemented, never messages.send or drafts.send.
 * OAuth credentials belong in server-side secrets, never client payloads or prompts.
 */
export interface GmailDraftInput {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
}
export interface SavedGmailDraft {
  draftId: string;
  messageId: string | null;
  threadId: string | null;
}
const addressPattern = /^[A-Z0-9.!#$%&'*+/=?^`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i;
function assertHeader(value: string, field: string): void {
  if (!value || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error(`invalid ${field}`);
}
export function validateDraft(input: GmailDraftInput): void {
  if (!Array.isArray(input.to) || input.to.length < 1 || input.to.length > 20) throw new Error("recipient required");
  if (input.cc && (!Array.isArray(input.cc) || input.cc.length > 20)) throw new Error("invalid cc");
  for (const address of [...input.to,...(input.cc ?? [])]) {
    if (typeof address !== "string") throw new Error("invalid address");
    assertHeader(address,"address");
    if (!addressPattern.test(address) || address.length > 254) throw new Error("invalid address");
  }
  if (typeof input.subject !== "string" || input.subject.length > 250) throw new Error("invalid subject");
  assertHeader(input.subject,"subject");
  if (typeof input.body !== "string" || !input.body.trim() || input.body.length > 200000) throw new Error("invalid body");
}
function b64url(input: string): string {
  const data = new TextEncoder().encode(input);
  let binary = "";
  for (let i=0;i<data.length;i+=8192) binary += String.fromCharCode(...data.subarray(i,i+8192));
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export function draftRaw(input: GmailDraftInput): string {
  validateDraft(input);
  // MIME headers always use ASCII: RFC 2047 for Unicode subject.
  const subjectAscii = /^[\x20-\x7e]*$/.test(input.subject)
    ? input.subject
    : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(input.subject)))}?=`;
  const lines = [
    `To: ${input.to.join(", ")}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    `Subject: ${subjectAscii}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBase64(input.body),
  ];
  return b64url(lines.join("\r\n"));
}
function encodeBase64(text: string): string {
  const data = new TextEncoder().encode(text);
  let binary = "";
  for (let i=0;i<data.length;i+=8192) binary += String.fromCharCode(...data.subarray(i,i+8192));
  return btoa(binary);
}
export interface GmailOAuthSecrets {
  clientId: string; clientSecret: string; refreshToken: string; allowedEmail: string;
}
export async function gmailAccessToken(secrets: GmailOAuthSecrets, transport: typeof fetch = fetch): Promise<string> {
  if (!secrets.clientId || !secrets.clientSecret || !secrets.refreshToken || !secrets.allowedEmail) {
    throw new Error("gmail_not_configured");
  }
  const res = await transport("https://oauth2.googleapis.com/token", {
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({client_id:secrets.clientId, client_secret:secrets.clientSecret,
      refresh_token:secrets.refreshToken,grant_type:"refresh_token"}),
  });
  if (!res.ok) throw new Error("gmail_oauth_unavailable");
  const result = await res.json();
  if (!result.access_token) throw new Error("gmail_oauth_invalid_response");
  return String(result.access_token);
}
export async function saveGmailDraft(
  input: GmailDraftInput,
  accessToken: string,
  allowedEmail: string,
  transport: typeof fetch = fetch,
): Promise<SavedGmailDraft> {
  const raw = draftRaw(input);
  const profileResponse = await transport("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers:{Authorization:`Bearer ${accessToken}`},
  });
  if (!profileResponse.ok) throw new Error("gmail_profile_unavailable");
  const profile = await profileResponse.json();
  if (String(profile.emailAddress ?? "").toLowerCase() !== allowedEmail.toLowerCase()) {
    throw new Error("gmail_mailbox_mismatch");
  }
  // Gmail drafts.create only. Never implement send in this adapter.
  const response = await transport("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},
    body: JSON.stringify({message:{raw}}),
  });
  if (!response.ok) throw new Error(`gmail_draft_create_failed_${response.status}`);
  const result = await response.json();
  if (!result.id || !result.message?.id) throw new Error("gmail_draft_response_invalid");
  return {
    draftId:String(result.id),
    messageId:String(result.message.id),
    threadId:result.message.threadId ? String(result.message.threadId) : null,
  };
}
