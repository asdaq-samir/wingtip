import { ApiError, gateway } from "../../lib/api/client";

/**
 * Whose account an emailed sign-in link signs in to, masked
 * ("a•••@icloud.com"), asked before it is used (MagicLinkAccountController):
 * a pilot sent a link to someone else's account sees it is not theirs.
 * Nothing is spent. Null for a link that can no longer sign in (used,
 * expired or unknown, alike); throws for anything else, the dialog then
 * saying nothing of the account rather than a wrong one. Through the
 * gateway's typed client, which sends the CSRF header and turns a failure
 * into an ApiError.
 */
export async function linkAccount(token: string): Promise<string | null> {
  try {
    const { data } = await gateway.POST("/api/auth/magic-link/account", {
      body: { token },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return typeof data?.email === "string" ? data.email : null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
