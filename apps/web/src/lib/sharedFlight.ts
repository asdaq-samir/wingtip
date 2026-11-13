import { addressParams } from "./address";
import type { FlightRules } from "./preferences";
import { LINK_KEYS, SCREEN_LINK } from "./navigation/generated/screens";

/**
 * A flight shared by link (design/screens.json's `shared` screen,
 * docs/navigation.md): written by Share, read when such a link opens the
 * app. Two kinds, one address, `/app/plan?open=shared&...`:
 *
 * - a plain link, the plan in the address itself -- its route, cruise
 *   altitude, departure time, airplane type and rules, and the N-number
 *   only where the pilot chose to send it -- which stores nothing anywhere;
 * - a saved flight's share, its token (`share=`), read from the gateway
 *   (GET /api/shared-flights/{token}) until its pilot stops sharing it.
 *
 * Opened, either is a preview first (features/shared-flight): the
 * receiver's own plan is kept until they choose Use This Plan.
 */
export interface SharedPlan {
  dep: string;
  dest: string;
  stops: string[];
  /** The cruise altitude, feet MSL. */
  altitudeFt: number | null;
  /** The departure time, an ISO instant; null for about now. */
  depart: string | null;
  /** The airplane's type ("C172"): shown, never assumed -- the receiver
   *  flies their own. */
  type: string | null;
  rules: FlightRules | null;
  /** The N-number, only where its pilot chose to send it. */
  tail: string | null;
}

export type SharedLink = { kind: "plan"; plan: SharedPlan } | { kind: "saved"; token: string };

/** The screen's word in `open=` (design/screens.json). */
const SHARED = "shared";

const IDENT = /^[A-Z0-9]{2,8}$/;
const TOKEN = /^[A-Za-z0-9_-]{16,32}$/;

const identOrNull = (raw: string | null | undefined) => {
  const text = raw?.trim().toUpperCase() ?? "";
  return IDENT.test(text) ? text : null;
};

/** The link that sends a plan: every key the plan has, none it lacks. */
export function sharedPlanLink(plan: SharedPlan, origin: string): string {
  const params = new URLSearchParams({ [SCREEN_LINK.key]: SHARED, dep: plan.dep, dest: plan.dest });
  if (plan.stops.length) params.set("stops", plan.stops.join(","));
  if (plan.altitudeFt != null) params.set("altitude_ft", String(Math.round(plan.altitudeFt)));
  if (plan.depart) params.set("depart", plan.depart);
  if (plan.type) params.set("type", plan.type.toUpperCase());
  if (plan.rules) params.set("rules", plan.rules);
  if (plan.tail) params.set("tail", plan.tail.toUpperCase());
  return `${origin}${SCREEN_LINK.path}?${params}`;
}

/** The shared flight an address names, or null where it is not one (a
 *  plain link with no route, or a token of the wrong shape, is none). */
export function sharedLinkOf(params: URLSearchParams): SharedLink | null {
  if (params.get(SCREEN_LINK.key) !== SHARED) return null;
  const token = params.get("share");
  if (token !== null) return TOKEN.test(token) ? { kind: "saved", token } : null;
  const dep = identOrNull(params.get("dep"));
  const dest = identOrNull(params.get("dest"));
  if (!dep || !dest) return null;
  const altitude = Number(params.get("altitude_ft"));
  const depart = params.get("depart");
  const rules = params.get("rules")?.toLowerCase();
  return {
    kind: "plan",
    plan: {
      dep,
      dest,
      // Idents alone, read without the engine (lib/identSchema's stopOf is
      // its), as the link is read before the engine has loaded.
      stops: (params.get("stops") ?? "")
        .split(",")
        .map(identOrNull)
        .filter((s): s is string => !!s),
      altitudeFt: Number.isInteger(altitude) && altitude > 0 && altitude < 60_000 ? altitude : null,
      depart: depart && Number.isFinite(Date.parse(depart)) ? new Date(depart).toISOString() : null,
      type: identOrNull(params.get("type")),
      rules: rules === "vfr" || rules === "ifr" ? rules : null,
      tail: identOrNull(params.get("tail")),
    },
  };
}

/** The address with a shared link's keys taken off: what is left of the
 *  receiver's own, which the link must not change before they choose. */
export function withoutSharedLink(params: URLSearchParams): URLSearchParams {
  const kept = new URLSearchParams(params);
  for (const key of [SCREEN_LINK.key, ...LINK_KEYS]) kept.delete(key);
  return kept;
}

/** The address that makes a plain link's plan this one's: its route and
 *  altitude, and its departure time while that is still ahead; nothing
 *  of the old plan's kept, as a new route keeps none. (A saved flight's
 *  is lib/flightLink planHrefOf's, with its own altitudes and picks.) */
export function paramsForSharedPlan(plan: SharedPlan, now = Date.now()): URLSearchParams {
  return addressParams({
    dep: plan.dep,
    dest: plan.dest,
    stops: plan.stops.length ? plan.stops.join(",") : null,
    altitude_ft: plan.altitudeFt,
    depart: plan.depart && Date.parse(plan.depart) > now ? plan.depart : null,
  });
}

const N_NUMBER = /^N[0-9][0-9A-Z]{0,4}$/;

/** The type and N-number of the airplane picked, as a shared plan sends
 *  them, from its label ("N123AB · C172", or a stock profile's
 *  "C172 · Cessna 172"); none for no airplane picked. */
export function airplaneOfChoice(choice: { label: string; tail?: string; none?: boolean }): { type: string | null; tail: string | null } {
  if (choice.none) return { type: null, tail: null };
  const [first = "", second = ""] = choice.label.split(" · ").map((part) => part.trim().toUpperCase());
  const tail = choice.tail?.toUpperCase() ?? (N_NUMBER.test(first) ? first : null);
  const type = identOrNull(tail && first === tail ? second : first);
  return { type, tail };
}
