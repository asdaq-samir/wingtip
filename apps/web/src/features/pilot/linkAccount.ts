import { csrfHeaders, failIfNotOk } from "../../lib/api/client";

/**
 * Whose account an emailed sign-in link signs in to, masked
 * ("a•••@icloud.com"), asked before it is used (MagicLinkAccountController):
 * a pilot sent a link to someone else's account sees it is not theirs.
 * Nothing is spent. Null for a link that can no longer sign in (used,
 * expired or unknown, alike); throws for anything else, the dialog then
 * saying nothing of the account rather than a wrong one.
 */
export async function linkAccount(token: string): Promise<string | null> {
  const res = await fetch("/api/auth/magic-link/account", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...csrfHeaders("POST") },
    body: new URLSearchParams({ token }),
  });
  if (res.status === 404) return null;
  await failIfNotOk(res);
  const answer = (await res.json()) as { email?: unknown };
  return typeof answer.email === "string" ? answer.email : null;
}
