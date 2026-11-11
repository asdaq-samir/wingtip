import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import type { SignInCapabilities, ClaudeFeatures, PaidFeature, Subscription } from "./api/types";
import { capabilitiesQuery, pilotQuery, queryClient } from "./queryClient";

/**
 * The subscription to the paid features, as the page shows it: the
 * written briefing, checkpoint descriptions, the mock oral and the
 * debrief. Planning and flying are free. The server keeps the one
 * entitlement and checks it on every paid call (SubscriptionService);
 * what the page knows of it is only for saying so where each paid
 * feature is (PaidPrompt), and for counting what is left of a month.
 */

/** The founding price, kept for life by those who join early (the
 *  business plan). The stores will say their own, in the pilot's money,
 *  once they sell it; these are the website's words until then. */
export const PRICE = { monthly: "$1 a month", yearly: "$10 a year" } as const;

/** The pilot's subscription. Fresh for a minute, as the pilot is: each
 *  paid feature's place reads it. Asked only signed in. */
export const subscriptionQuery = queryOptions({
  queryKey: ["subscription"],
  queryFn: () => api.subscription.get(),
  staleTime: 60_000,
  meta: { silent: true },
});

/** What the page may say of the paid features now. */
type Entitlement =
  | { kind: "loading" }
  /** Nobody can sign in here (one's own machine): all of it is open. */
  | { kind: "open" }
  | { kind: "signed-out" }
  /** The subscription could not be read: the server decides, and says
   *  so where it refuses. */
  | { kind: "unknown" }
  | { kind: "free"; subscription: Subscription }
  | { kind: "entitled"; subscription: Subscription }
  /** Not offered in this deployment, which sells no subscription and keeps
   *  this feature from this pilot (app.claude-features): no word of it. */
  | { kind: "hidden" };

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

/**
 * Where no subscription is sold (the proof of concept, at the owner's
 * ask: "no mention of it at all"): the debrief, which costs nothing a use,
 * is everyone's; what Claude writes is whoever the deployment says --
 * nobody by default (the owner, 2026-11-10, {@link claudeOn}), the
 * developers, or every pilot signed in -- the rest not told of it.
 */
export function unsoldEntitlement(
  feature: PaidFeature,
  claude: ClaudeFeatures | undefined,
  signedIn: boolean | undefined,
  developer: boolean,
): Entitlement {
  if (feature === "DEBRIEF") return { kind: "open" };
  if (claude === "OFF") return { kind: "hidden" };
  if (signedIn === undefined) return { kind: "loading" };
  if (claude === "DEVELOPERS") return developer ? { kind: "open" } : { kind: "hidden" };
  return signedIn ? { kind: "open" } : { kind: "signed-out" };
}

/**
 * Whether the features Claude writes are on here for this pilot, from the
 * deployment's app.claude-features alone: off by default, and off until
 * the capabilities are known, so nothing is asked of the assistant on a
 * guess. The owner, 2026-11-10: "To keep the cost low, we only add the
 * claude feature later when we decide about subscription model. For now
 * just the free siri and gemini." The gateway refuses each assistant route
 * while off, even on one's own machine; this keeps the page from asking.
 */
export function claudeOn(claude: ClaudeFeatures | undefined, developer: boolean): boolean {
  if (claude === "EVERYONE") return true;
  if (claude === "DEVELOPERS") return developer;
  return false;
}

/** {@link claudeOn} for the page's pilot: for a feature Claude writes that
 *  has no paid feature of its own name (Ask, the trip planner). */
export function useClaudeOn(): boolean {
  const capabilities = useQuery(capabilitiesQuery).data;
  const pilot = useQuery(pilotQuery);
  return claudeOn(capabilities?.claudeFeatures, capabilities?.access === "OPEN" || !!pilot.data?.developer);
}

/** {@link claudeOn} as the page knows it now, for a store outside React
 *  (lib/ask): the last guard before a question would go to the assistant. */
export function claudeOnNow(): boolean {
  const capabilities = queryClient.getQueryData(capabilitiesQuery.queryKey);
  const developer = capabilities?.access === "OPEN" || !!queryClient.getQueryData(pilotQuery.queryKey)?.developer;
  return claudeOn(capabilities?.claudeFeatures, developer);
}

/** The pilot's entitlement to a paid feature (a Claude-written one where
 *  none is named). The features Claude writes are hidden while
 *  app.claude-features is OFF, whoever is signed in and whatever is sold
 *  ({@link claudeOn}); the debrief, measured by the engine, is not one. */
export function useEntitlement(feature: PaidFeature = "NARRATIVE"): Entitlement {
  const capabilities = useQuery(capabilitiesQuery).data;
  const pilot = useQuery(pilotQuery);
  const signedIn = pilot.isPending ? undefined : !!pilot.data;
  const sold = capabilities?.subscriptions !== false;
  const subscription = useQuery({ ...subscriptionQuery, enabled: !!pilot.data && !!capabilities && sold });
  return deploymentEntitlement(feature, capabilities, signedIn, !!pilot.data?.developer, subscription.data, subscription.isError);
}

/** {@link useEntitlement}'s answer from what it has read: loading until
 *  the deployment's capabilities are known, then OFF before all else. */
export function deploymentEntitlement(
  feature: PaidFeature,
  capabilities: Pick<SignInCapabilities, "access" | "subscriptions" | "claudeFeatures"> | undefined,
  signedIn: boolean | undefined,
  developer: boolean,
  subscription: Subscription | undefined,
  failed: boolean,
): Entitlement {
  if (!capabilities) return { kind: "loading" };
  if (feature !== "DEBRIEF" && capabilities.claudeFeatures === "OFF") return { kind: "hidden" };
  if (capabilities.access === "OPEN") return { kind: "open" };
  if (capabilities.subscriptions === false) return unsoldEntitlement(feature, capabilities.claudeFeatures, signedIn, developer);
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

/** "57 of 60 left this month", for a Claude-written feature; null where
 *  it is not counted (a developer's, a machine of one's own). */
export function usesLeft(entitlement: Entitlement, feature: PaidFeature): string | null {
  if (entitlement.kind !== "entitled" || entitlement.subscription.state === "COMPED") return null;
  const use = entitlement.subscription.uses.find((u) => u.feature === feature);
  if (!use) return null;
  return `${Math.max(0, use.cap - use.used)} of ${use.cap} left this month`;
}

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
