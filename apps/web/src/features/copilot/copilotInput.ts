import type { AheadAlert, CopilotAround, Currency } from "../../lib/api/types";
import type { CopilotFlight } from "../../lib/copilot/flight";
import { callEngine, type EngineAnswer, type EngineInput } from "../../lib/engine/engine";
import type { Fix } from "../../lib/map/ownShip";
import type { Minimums } from "../../lib/minimums";

export type CopilotInput = EngineInput<"copilot_watch">;
export type CopilotAnswer = EngineAnswer<"copilot_watch">;
export type CopilotMessage = CopilotAnswer["messages"][number];

/** Where the airplane is along the planned line, by the engine's
 *  route_position: the miles to go and the leg it is on; null off any
 *  line. */
export function alongLine(fix: Pick<Fix, "lat" | "lon">, line: [number, number][]) {
  const at = callEngine("route_position", { at: { lat: fix.lat, lon: fix.lon }, line });
  return at ? { leftNm: at.left_nm, leg: at.leg } : null;
}

/** The rest of the route from the airplane, as /api/copilot/around takes
 *  it ("lat,lon;..."): from where it is, through the points after the leg
 *  it is on. Rounded to a few hundred metres, so the question is asked
 *  again only as the airplane goes somewhere new. */
export function restOfRoute(fix: Pick<Fix, "lat" | "lon">, line: [number, number][], leg: number): string {
  const round = (n: number) => Math.round(n * 200) / 200;
  return [[fix.lat, fix.lon] as [number, number], ...line.slice(leg + 1)].map(([la, lo]) => `${round(la)},${round(lo)}`).join(";");
}

/** Whether the pilot's night passenger currency (14 CFR 61.57(b)) holds on
 *  a day, from the logbook's "until" date; null where the logbook is not
 *  read (signed out), which the copilot then says nothing of. */
export function nightCurrent(currency: Currency | undefined, atS: number): boolean | null {
  if (!currency) return null;
  const until = currency.nightPassengersUntil;
  if (!until) return false;
  return until >= new Date(atS * 1000).toISOString().slice(0, 10);
}

/** The engine's question from what the app has: own ship (the GPS's or
 *  the dry run's, its time the run's), the flight as planned, the
 *  planner's answer round the airplane, the alerts ahead, the pilot's
 *  minimums and currency, when the flight started (for the fuel burnt)
 *  and the category each field was first seen in. Null until there is
 *  enough to ask. */
export function copilotInput({ fix, flight, around, ahead, minimums, nightCurrent, startedAtMs, firstSeen }: {
  fix: Fix | null;
  flight: CopilotFlight | null;
  around: CopilotAround | undefined;
  ahead: AheadAlert[];
  minimums: Minimums;
  nightCurrent: boolean | null;
  startedAtMs: number | null;
  firstSeen: Record<string, string | null>;
}): CopilotInput | null {
  if (!fix || !flight || !around) return null;
  const along = alongLine(fix, flight.line);
  const hours = startedAtMs != null ? Math.max(0, fix.at - startedAtMs) / 3_600_000 : 0;
  const fuelGal = flight.fuelGal != null && flight.burnGph != null ? Math.max(0, flight.fuelGal - flight.burnGph * hours) : null;
  return {
    now_s: fix.at / 1000,
    own: { lat: fix.lat, lon: fix.lon, track_deg: fix.headingDeg, gs_kt: fix.speedKt },
    rules: flight.rules,
    dest: flight.dest,
    alternate: flight.alternate,
    remaining_nm: along?.leftNm ?? null,
    planned_gs_kt: flight.plannedGsKt,
    tas_kt: flight.tasKt,
    fuel_gal: fuelGal,
    burn_gph: flight.burnGph,
    minimums: {
      ceiling_ft: minimums.ceilingFt, visibility_sm: minimums.visibilitySm,
      crosswind_kt: minimums.crosswindKt, wind_kt: minimums.windKt,
    },
    passengers: flight.passengers,
    night_current: nightCurrent,
    fields: around.fields.map(f => ({ ...f, planned_category: firstSeen[f.ident] ?? null })),
    areas: around.areas.map(a => ({ ...a, kind: a.kind as "tfr" | "sua" | "sigmet" })),
    itws: around.itws,
    ahead: ahead.map(a => ({ id: a.id, kind: a.kind, level: a.level, name: a.name })),
  };
}

/** The copilot's answer, or null where the engine refused the question
 *  (said in the console: a copilot that cannot answer says nothing
 *  rather than something wrong). */
export function watch(input: CopilotInput): CopilotAnswer | null {
  try {
    return callEngine("copilot_watch", input);
  } catch (err) {
    console.warn("copilot_watch:", err);
    return null;
  }
}

/** Each field's flight category the first time the copilot saw it, kept
 *  so a worse one later is said as a change ("just went IFR"). */
export function rememberCategories(seen: Record<string, string | null>, around: CopilotAround): Record<string, string | null> {
  const fresh = around.fields.filter(f => !(f.ident in seen));
  if (!fresh.length) return seen;
  const next = { ...seen };
  for (const f of fresh) {
    next[f.ident] = f.metar ? callEngine("best_fields", {
      own: { lat: f.lat, lon: f.lon }, fields: [{ ident: f.ident, lat: f.lat, lon: f.lon, metar: f.metar }],
    })[0]?.category ?? null : null;
  }
  return next;
}
