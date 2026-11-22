import { addressParams } from "./address";
import type { EngineAnswer } from "./engine/engine";
import type { FlightRules } from "./preferences";
import { LINK_KEYS, SCREEN_LINK, type LinkKey } from "./navigation/generated/screens";

/**
 * A flight shared by link (design/screens.json's `shared` screen,
 * docs/navigation.md): written by Share, read when such a link opens the
 * app. Two kinds, one address, `/app/plan?open=shared&...`:
 *
 * - a plain link, the plan in the address itself -- its route, cruise
 *   altitude, departure time, airplane type and rules, the fuel set on
 *   FPL's gauges, and the N-number only where the pilot chose to send it
 *   -- which stores nothing anywhere;
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
  /** The fuel its pilot set on FPL's gauges as the airplane leaves a
   *  field, whole gallons by ident (the link's `tanks`, the planner's own
   *  "KJVL:0,KMSN:20"); none named, full. */
  tanks: Record<string, number>;
  /** The instrument procedures its pilot picked (the link's `procs`, the
   *  address's own "KDLH:I27:::L"), each with whether an approach is only
   *  loaded or flown on into its missed approach (lib/procedures). */
  procs?: string | null;
}

export type SharedLink =
  | { kind: "plan"; plan: SharedPlan }
  | { kind: "saved"; token: string }
  /** A route file opened (.fpl or .gpx; features/shared-flight's
   *  routeFile): the engine's reading of it, previewed as a link is. */
  | { kind: "file"; fileName: string; read: EngineAnswer<"route_file_read"> };

/** The screen's word in `open=` (design/screens.json). */
const SHARED = "shared";

const IDENT = /^[A-Z0-9]{2,8}$/;
/** A link's `procs` as the address writes it: fields, procedures,
 *  transitions, fixes and states in capitals and figures, "-", ":" and
 *  ",". Anything else is no picks; the engine reads each as it loads. */
const PROCS = /^[A-Z0-9:,-]{1,400}$/;
const TOKEN = /^[A-Za-z0-9_-]{16,32}$/;

const identOrNull = (raw: string | null | undefined) => {
  const text = raw?.trim().toUpperCase() ?? "";
  return IDENT.test(text) ? text : null;
};

/** The fuel's key, design/screens.json's own, as iOS and Android read it
 *  (their generated LinkKey.tanks). */
const TANKS: LinkKey = "tanks";
/** And its procedures' (design/screens.json's `procs`). */
const PROCS_KEY: LinkKey = "procs";

/** The link's `tanks` as the planner writes it, "KJVL:0,KMSN:20", by
 *  ident; "" for none. */
const tanksWords = (tanks: Record<string, number>) =>
  Object.keys(tanks)
    .sort()
    .map((ident) => `${ident}:${tanks[ident]}`)
    .join(",");

/** A link's `tanks` read warily, as Android's SharedPlan reads it: each
 *  part an ident and whole gallons, 0 to 9,999; a part that is not one is
 *  left out, never guessed. Without the engine (lib/identSchema's tanksOf
 *  is its), as the link is read before the engine has loaded. */
function tanksOfLink(raw: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (raw ?? "").split(",")) {
    const [who, gallons, extra] = part.split(":");
    const ident = identOrNull(who);
    if (ident && extra === undefined && /^\d{1,4}$/.test(gallons?.trim() ?? "")) out[ident] = Number(gallons);
  }
  return out;
}

/** The link that sends a plan: every key the plan has, none it lacks. */
export function sharedPlanLink(plan: SharedPlan, origin: string): string {
  const params = new URLSearchParams({ [SCREEN_LINK.key]: SHARED, dep: plan.dep, dest: plan.dest });
  if (plan.stops.length) params.set("stops", plan.stops.join(","));
  if (plan.altitudeFt != null) params.set("altitude_ft", String(Math.round(plan.altitudeFt)));
  if (plan.depart) params.set("depart", plan.depart);
  if (plan.type) params.set("type", plan.type.toUpperCase());
  if (plan.rules) params.set("rules", plan.rules);
  if (plan.tail) params.set("tail", plan.tail.toUpperCase());
  const tanks = tanksWords(plan.tanks);
  if (tanks) params.set(TANKS, tanks);
  if (plan.procs) params.set(PROCS_KEY, plan.procs);
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
      tanks: tanksOfLink(params.get(TANKS)),
      procs: PROCS.test(params.get(PROCS_KEY)?.toUpperCase() ?? "") ? params.get(PROCS_KEY)!.toUpperCase() : null,
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

/** The address that makes a plain link's plan this one's: its route,
 *  altitude and fuel set, and its departure time while that is still ahead; nothing
 *  of the old plan's kept, as a new route keeps none. (A saved flight's
 *  is lib/flightLink planHrefOf's, with its own altitudes and picks.) */
export function paramsForSharedPlan(plan: SharedPlan, now = Date.now()): URLSearchParams {
  return addressParams({
    dep: plan.dep,
    dest: plan.dest,
    stops: plan.stops.length ? plan.stops.join(",") : null,
    altitude_ft: plan.altitudeFt,
    depart: plan.depart && Date.parse(plan.depart) > now ? plan.depart : null,
    tanks: tanksWords(plan.tanks) || null,
    procs: plan.procs ?? null,
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
