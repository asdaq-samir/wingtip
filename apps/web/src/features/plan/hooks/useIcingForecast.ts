import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api/client";
import type { Briefing, IcingForecast, Leg } from "../../../lib/api/types";

interface IcingWhere {
  /** Under IFR alone: VFR stays clear of cloud (14 CFR 91.155), where
   *  structural icing forms. */
  ifr: boolean;
  /** The briefing, whose fixes are the nav log's once it sent them
   *  (`legs_from` "navlog"): one more than the legs. */
  briefing: Briefing | null;
  legs: Leg[];
  /** The departure picked, an ISO instant; "" for now. */
  depart: string;
}

/** Under IFR, the AWC's forecast icing on each leg at the altitude it is
 *  flown (/api/icing/route, wingtip.icing_forecast; the engine's
 *  icing_forecast_route decides what it says): asked once the briefing
 *  has the nav log's legs, each leg read for the hour of its middle. */
export function useIcingForecast({ ifr, briefing, legs, depart }: IcingWhere) {
  const fixes = briefing?.legs_from === "navlog" ? briefing.leg_fixes : [];
  const ready = ifr && legs.length > 0 && fixes.length === legs.length + 1 && legs.every((l) => l.ete_min != null);
  const q = {
    fixes: fixes.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(";"),
    altFt: legs.map((l) => Math.round(l.altitude_ft)).join(","),
    legMin: legs.map((l) => (l.ete_min ?? 0).toFixed(1)).join(","),
    groundMin: legs.map((l) => (l.ground_min ?? 0).toFixed(0)).join(","),
    depart,
  };
  return useQuery<IcingForecast>({
    queryKey: ["icingRoute", q.fixes, q.altFt, q.legMin, q.groundMin, depart],
    queryFn: () => api.icingRoute(q),
    enabled: ready,
    staleTime: 10 * 60_000,
    // The legs' icing before kept while the same legs are read again for
    // another altitude or time: its rows went to "Fetching" and back (the
    // flicker audit's E).
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === q.fixes ? previous : undefined),
    // Said in its own rows, where it was asked for.
    meta: { silent: true },
  });
}

/** A severity as a row says it: "Light", "None"; "No forecast" for a leg
 *  the AWC had none for. */
export function severityWord(severity: IcingForecast["legs"][number]["severity"]): string {
  return severity ? severity[0]!.toUpperCase() + severity.slice(1) : "No forecast";
}
