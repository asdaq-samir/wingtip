import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import type { SignInCapabilities, Subscription } from "./api/types";
import { capabilitiesQuery, pilotQuery } from "./queryClient";

/**
 * The subscription, as the page shows it: it adds the debrief. Planning
 * and flying are free. The server keeps the one entitlement and checks it
 * on every paid call (SubscriptionService); what the page knows of it is
 * only for saying so where the paid feature is (PaidPrompt).
 */

/** The founding price, kept for life by those who join early (the
 *  business plan). The stores will say their own, in the pilot's money,
 *  once they sell it; these are the website's words until then. */
export const PRICE = { monthly: "$1 a month", yearly: "$10 a year" } as const;

/** The pilot's subscription. Fresh for a minute, as the pilot is: the
 *  paid feature's place reads it. Asked only signed in. */
export const subscriptionQuery = queryOptions({
  queryKey: ["subscription"],
  queryFn: () => api.subscription.get(),
  staleTime: 60_000,
  meta: { silent: true },
});

/** What the page may say of the paid feature now. */
type Entitlement =
  | { kind: "loading" }
  /** Nobody can sign in here (one's own machine), or no subscription is
   *  sold here: all of it is open. */
  | { kind: "open" }
  | { kind: "signed-out" }
  /** The subscription could not be read: the server decides, and says
   *  so where it refuses. */
  | { kind: "unknown" }
  | { kind: "free"; subscription: Subscription }
  | { kind: "entitled"; subscription: Subscription };

/** The pilot's entitlement, from who is signed in and their subscription. */
export function entitlementOf(
  access: string | undefined,
  signedIn: boolean | undefined,
  subscription: Subscription | undefined,
  failed = false,
): Entitlement {
  if (access === "OPEN") return { kind: "open" };
  if (signedIn === undefined) return { kind: "loading" };
  if (!signedIn) return { kind: "signed-out" };
  if (failed) return { kind: "unknown" };
  if (!subscription) return { kind: "loading" };
  return subscription.entitled ? { kind: "entitled", subscription } : { kind: "free", subscription };
}

/** The pilot's entitlement to the paid feature, the debrief. */
export function useEntitlement(): Entitlement {
  const capabilities = useQuery(capabilitiesQuery).data;
  const pilot = useQuery(pilotQuery);
  const signedIn = pilot.isPending ? undefined : !!pilot.data;
  const sold = capabilities?.subscriptions !== false;
  const subscription = useQuery({ ...subscriptionQuery, enabled: !!pilot.data && !!capabilities && sold });
  return deploymentEntitlement(capabilities, signedIn, subscription.data, subscription.isError);
}

/** {@link useEntitlement}'s answer from what it has read: loading until
 *  the deployment's capabilities are known; open where nobody signs in or
 *  no subscription is sold (the proof of concept, at the owner's ask: "no
 *  mention of it at all"). */
export function deploymentEntitlement(
  capabilities: Pick<SignInCapabilities, "access" | "subscriptions"> | undefined,
  signedIn: boolean | undefined,
  subscription: Subscription | undefined,
  failed: boolean,
): Entitlement {
  if (!capabilities) return { kind: "loading" };
  if (capabilities.access === "OPEN" || capabilities.subscriptions === false) return { kind: "open" };
  return entitlementOf(capabilities.access, signedIn, subscription, failed);
}

/** Whether this deployment sells the subscription: where not, the
 *  console's Subscription row and page are not there. */
export function useSold(): boolean {
  return useQuery(capabilitiesQuery).data?.subscriptions === true;
}

/** Whether a paid feature may be asked for now: open, theirs, or not
 *  known here -- the server's own check then answers. */
export const mayUse = (entitlement: Entitlement) =>
  entitlement.kind === "open" || entitlement.kind === "entitled" || entitlement.kind === "unknown";

/** "Free until 10 November", "Paid until 11 October 2027" -- what the
 *  pilot has, in a few words, the day first as the app writes dates. */
export function standing(subscription: Subscription, now = new Date()): string {
  const day = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
      ...(date.getUTCFullYear() !== now.getUTCFullYear() ? { year: "numeric" } : {}),
    });
  };
  switch (subscription.state) {
    case "TRIAL":
      return subscription.until ? `Free until ${day(subscription.until)}` : "Free month";
    case "SUBSCRIBED":
      return subscription.until ? `Paid until ${day(subscription.until)}` : "Subscribed";
    case "COMPED":
      return "Included";
    default:
      return subscription.trialAvailable ? "Not started" : "Ended";
  }
}
