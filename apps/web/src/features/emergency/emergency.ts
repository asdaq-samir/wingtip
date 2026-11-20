/**
 * The emergency assistant's rules, the shared engine's (through
 * lib/engine), as the iPhone and Android ask them by the same names:
 *
 * - `bestFields`: the fields within a glide, ranked with their reasons
 *   (engine/crates/brief/src/fields), from the planner's
 *   /api/emergency/fields answer and own ship's fix;
 * - `maydayCall`: the distress call in AIM 6-3-2(a)(3)'s order, the code
 *   (AIM 6-2-2) and the frequencies to try (AIM 6-3-1(d))
 *   (engine/crates/radio/src/mayday.rs);
 * - `checklistSection`: which of the pilot's own emergency checklist's
 *   sections is the one asked, "Engine failure in flight" by default;
 * - `emergencyGuidance`: with no airplane picked, the AIM's and the
 *   Airplane Flying Handbook's general good practice, each sourced
 *   (engine/crates/radio/src/guidance.rs), in place of a checklist.
 *
 * Nothing here weighs a field or words a call: it shapes what the planner
 * sent into what the engine reads.
 */
import type { EmergencyFields } from "../../lib/api/types";
import { engineFields } from "../../lib/engineFields";
import type { DeviceField } from "../../lib/fieldsOnDevice";
import { compassPoint } from "../../lib/compass";
import { miles } from "../../lib/format";
import { callEngine, type EngineAnswer, type EngineInput } from "../../lib/engine/engine";
import type { LatLon } from "../../lib/geo";
import type { Fix } from "../../lib/map/position/ownShip";
import { fixRadialDistance, type Station } from "../../lib/navaid";

type BestFields = EngineAnswer<"best_fields">;
type Mayday = EngineAnswer<"mayday_call">;

/** The phase the checklist opens at (GAMA Specification No. 1, Section 3,
 *  the engine's EMERGENCY_PHASES). */
const ENGINE_FAILURE = "Engine failure in flight";

type PlannerField = EmergencyFields["fields"][number];

/** The fields ranked from own ship, in "glide" mode: the airplane's
 *  figures as the planner sent them (none: the glide is not guessed).
 *  `picked`, the field the pilot picked, is ranked with them even where
 *  the planner's newer answer, asked from further on, no longer lists it:
 *  its record from the answer that did, its course, reach and reasons
 *  worked out afresh from own ship like every other's. */
export function bestFields(
  data: EmergencyFields,
  fix: Pick<Fix, "lat" | "lon" | "altitudeFt" | "speedKt">,
  variationDeg: number | null,
  picked: PlannerField | null = null,
): BestFields {
  const listed = !picked || data.fields.some((f) => f.ident === picked.ident);
  const fields = engineFields(listed ? data : { ...data, fields: [...data.fields, picked] });
  return ranked(fields, data.airplane ?? null, data.wind ?? null, fix, variationDeg, picked?.ident ?? null);
}

/** The same from the fields the browser keeps (lib/fieldsOnDevice), when
 *  the planner cannot be asked: no runway, elevation or weather, and no
 *  wind aloft; the airplane's figures the planner last sent, if any. */
export function bestFieldsOnDevice(
  fields: readonly DeviceField[],
  airplane: EmergencyFields["airplane"] | null,
  fix: Pick<Fix, "lat" | "lon" | "altitudeFt" | "speedKt">,
  variationDeg: number | null,
): BestFields {
  return ranked(
    fields.map(({ town: _town, size: _size, ...f }) => f),
    airplane,
    null,
    fix,
    variationDeg,
    null,
  );
}

/** The engine's order, its best few; and the field the pilot picked kept
 *  at the foot where it is not among them, so the list never loses it as
 *  own ship flies on, nor the line and the MAYDAY go on to another field
 *  the pilot did not pick. A closed field the engine drops still goes
 *  (decision 0043). */
function ranked(
  fields: EngineInput<"best_fields">["fields"],
  airplane: EmergencyFields["airplane"] | null,
  wind: EmergencyFields["wind"] | null,
  fix: Pick<Fix, "lat" | "lon" | "altitudeFt" | "speedKt">,
  variationDeg: number | null,
  picked: string | null,
): BestFields {
  const best = rankedOf(fields, airplane, wind, fix, variationDeg, null);
  if (!picked || best.fields.some((f) => f.ident === picked)) return best;
  const own = rankedOf(fields, airplane, wind, fix, variationDeg, fields.length).fields.find((f) => f.ident === picked);
  return own ? { ...best, fields: [...best.fields, own] } : best;
}

function rankedOf(
  fields: EngineInput<"best_fields">["fields"],
  airplane: EmergencyFields["airplane"] | null,
  wind: EmergencyFields["wind"] | null,
  fix: Pick<Fix, "lat" | "lon" | "altitudeFt" | "speedKt">,
  variationDeg: number | null,
  limit: number | null,
): BestFields {
  const input: EngineInput<"best_fields"> = {
    mode: "glide",
    at: { lat: fix.lat, lon: fix.lon },
    altitude_ft: fix.altitudeFt,
    speed_kt: fix.speedKt,
    wind,
    variation_deg: variationDeg,
    airplane: airplane
      ? {
          // An own airplane's ratio with no best glide speed is passed too:
          // the engine works its still-air reach (with a wind aloft, none).
          glide: airplane.glide ?? null,
          landing: airplane.landing ?? null,
          crosswind: airplane.crosswind ?? null,
          cruise_tas_kt: airplane.cruise_tas_kt ?? null,
        }
      : null,
    fields,
    limit,
  };
  return callEngine("best_fields", input);
}

/** The call, filled from what the screen knows; a part not known is left
 *  for the pilot to say. `frequencies` are the fields' ATC ones, each with
 *  its field's distance. */
export function maydayCall(facts: Omit<EngineInput<"mayday_call">, "frequencies">, data: EmergencyFields | undefined): Mayday {
  const frequencies = (data?.fields ?? []).flatMap((f) =>
    f.frequencies.map((q) => ({ ident: f.ident, kind: q.kind, mhz: q.mhz, distance_nm: f.distance_nm })),
  );
  return callEngine("mayday_call", { ...facts, frequencies });
}

/** Where own ship is as a controller gives it: off the nearest VOR on the
 *  map ("BAE 238° 18 nm", AIM 5-1-6's fix/radial/distance, the engine's),
 *  else how far and which way from the nearest field ("3 nm SW of Grand
 *  Geneva Resort"); null with neither. */
export function positionWords(
  at: LatLon,
  stations: readonly Station[],
  nearest: { name: string; distance_nm: number; bearing_deg: number } | undefined,
): string | null {
  const frd = fixRadialDistance(at, stations);
  if (frd) return frd;
  if (!nearest) return null;
  // The airplane from the field: the reciprocal of the bearing to it.
  return `${Math.round(nearest.distance_nm)} nm ${compassPoint(nearest.bearing_deg + 180)} of ${nearest.name}`;
}

/** Each field's reported visibility, by ident, as the pilot reads it:
 *  "3 sm", or "10+ sm" where the report says more than that (the
 *  engine's visibility_plus; FAA JO 7900.5). A field whose report has no
 *  visibility, or that has no report, is left out: nothing is guessed. */
export function visibilities(data: EmergencyFields | undefined): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const f of data?.fields ?? []) {
    const sm = f.metar?.visibility_sm;
    if (sm != null) out.set(f.ident, miles(sm, f.metar?.visibility_plus ?? false));
  }
  return out;
}

/** Magnetic variation at a point today, east positive (the engine's WMM). */
export function variationAt(at: LatLon): number {
  return callEngine("magnetic_variation", { lat: at.lat, lon: at.lon, date: new Date().toISOString().slice(0, 10) });
}

/** The index of the section of `titles` that is `want`; null where none. */
export function checklistSection(titles: string[], want: string = ENGINE_FAILURE): number | null {
  return callEngine("checklist_section", { titles, want });
}

/** What to do with no airplane picked: general guidance only, each item
 *  with its source (AIM 6-1, 6-2, 6-3; FAA-H-8083-3C ch. 18). */
export function emergencyGuidance(): EngineAnswer<"emergency_guidance">["items"] {
  return callEngine("emergency_guidance", {}).items;
}
