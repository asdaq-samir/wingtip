import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { plannerAircraft } from "../../lib/api/airplaneQuery";
import { aircraftKey, shortName } from "../../lib/aircraftChoice";
import { checklistOf } from "../../lib/checklist";
import { checklistText, useChecklists } from "../../lib/checklists";
import {
  bestFields,
  bestFieldsOnDevice,
  checklistSection,
  emergencyGuidance,
  maydayCall,
  positionWords,
  variationAt,
  visibilities,
} from "./emergency";
import { useEmergencyLine } from "../../lib/map/marks/emergencyLine";
import { usePointActions } from "../../lib/map/cards/pointActions";
import { useOwnFix, useOwnShip } from "../../lib/map/position/ownShip";
import { magneticOf } from "../../lib/magnetic";
import { usePreferences } from "../../lib/preferences";
import { closeEmergency, useEmergencyOpen } from "../../lib/emergencyStore";
import { useAirportIndex } from "../../lib/airportIndex";
import { fieldsNear } from "../../lib/fieldsOnDevice";
import { noConnection } from "../../lib/problems";
import type { EmergencyFields } from "../../lib/api/types";

/** As many fields as the planner sends (app.routers.emergency's limit). */
export const FIELDS = 12;

/** How far own ship moves before the fields are asked for again: a
 *  hundredth of a degree, about half a mile, as a light single glides in
 *  twenty seconds. */
const STEP_DEG = 0.01;
const at = (deg: number) => Math.round(deg / STEP_DEG) * STEP_DEG;

/**
 * The emergency assistant's one view model (MVVM): the fields within a
 * glide ranked (features/emergency/emergency's bestFields, the engine's best_fields) from
 * the planner's /api/emergency/fields -- or, where it cannot be asked,
 * from the airport index the browser keeps (lib/fieldsOnDevice), said
 * so (`onDevice`) -- the field picked and its line on
 * the map (lib/map/marks/emergencyLine), the airplane's own emergency checklist
 * opened at the emergency asked (checklistSection), and the MAYDAY filled
 * from all of it (maydayCall). The views only draw what this gives.
 */
export function useEmergency() {
  const open = useEmergencyOpen((s) => s.open);
  const fix = useOwnFix();
  const showPosition = useOwnShip((s) => s.setEnabled);
  const aircraft = usePreferences((s) => s.aircraft);
  const stations = usePointActions((s) => s.stations);
  // The airplane as the planner takes it (a stock profile, or "own" on its
  // record's figures alone) and its own glide ratio over its type's: none
  // for no airplane, never another airplane's (the owner, 2026-11-09).
  const profile = plannerAircraft(aircraft) ?? null;
  const glideRatio = aircraft.glideRatio ?? null;
  const chosen = !aircraft.none;
  // Asked again as the airplane moves on and comes down, not at each fix.
  const lat = fix ? at(fix.lat) : 0;
  const lon = fix ? at(fix.lon) : 0;
  const altitude = fix?.altitudeFt != null ? Math.round(fix.altitudeFt / 500) * 500 : null;
  const asked = useQuery({
    queryKey: ["emergency", lat, lon, altitude, profile, glideRatio],
    queryFn: () => api.emergencyFields(lat, lon, altitude, profile, glideRatio),
    enabled: !!open && !!fix,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
    meta: { silent: true },
  });
  const data = asked.data;
  // The airplane's figures as the planner last sent them, for the glide
  // worked out on the device: the same airplane's only.
  const airplaneKey = JSON.stringify([profile, glideRatio]);
  const [lastAirplane, keepAirplane] = useState<{ key: string; airplane: EmergencyFields["airplane"] | null } | null>(null);
  if (data && (lastAirplane?.key !== airplaneKey || lastAirplane.airplane !== (data.airplane ?? null))) {
    keepAirplane({ key: airplaneKey, airplane: data.airplane ?? null });
  }
  const keptAirplane = lastAirplane?.key === airplaneKey ? lastAirplane.airplane : null;
  // The planner not to be had -- no connection, or it failed -- the fields
  // from the index the browser keeps, read as Emergency opens.
  const index = useAirportIndex(!!open, !!open);
  const unanswered = !data && (asked.isError || noConnection(asked));
  const onDevice = unanswered && !!index && !!fix;
  const ranked = useMemo(() => {
    if (!fix) return null;
    if (data) return bestFields(data, fix, variationAt(fix));
    if (onDevice && index) return bestFieldsOnDevice(fieldsNear(index, fix, FIELDS), keptAirplane, fix, variationAt(fix));
    return null;
  }, [data, fix, onDevice, index, keptAirplane]);

  const [pickedIdent, pick] = useState<string | null>(null);
  const picked = ranked?.fields.find((f) => f.ident === pickedIdent) ?? ranked?.fields[0] ?? null;
  const pickedData = data?.fields.find((f) => f.ident === picked?.ident) ?? null;
  // Each field's reported visibility, written for its row.
  const visibility = useMemo(() => visibilities(data), [data]);

  // The airplane's own emergency checklist, opened at the emergency asked;
  // with no airplane none, but the AIM's and the AFH's general guidance
  // (the engine's emergency_guidance; the owner, 2026-11-09).
  const text = useChecklists((s) => (chosen ? checklistText(s.value, aircraftKey(aircraft), "emergency") : ""));
  const guidance = useMemo(() => (chosen ? null : emergencyGuidance()), [chosen]);
  const sections = useMemo(() => checklistOf(text).sections, [text]);
  const [sectionPicked, pickSection] = useState<number | null>(null);
  const section = sectionPicked ?? checklistSection(sections.map((s) => s.title)) ?? (sections.length ? 0 : null);
  const nature = section !== null ? sections[section]!.title : "Engine failure";

  // What the pilot tells the screen: who is on board, the fuel left.
  const [souls, setSouls] = useState("");
  const [fuelMin, setFuelMin] = useState("");
  const number = (typed: string) => (typed.trim() && Number.isFinite(Number(typed)) ? Number(typed) : null);
  const mayday = useMemo(
    () =>
      maydayCall(
        {
          station: null,
          callsign: aircraft.tail ?? (aircraft.aircraftId != null ? shortName(aircraft.label) : null),
          airplane_type: data?.airplane?.type ?? null,
          nature,
          weather: null,
          intentions: picked ? `Landing at ${picked.name}, ${picked.ident}` : null,
          position: fix ? positionWords(fix, stations, data?.fields[0] ?? nearestOf(ranked)) : null,
          // The airplane's own heading now, as the GPS tracks it, magnetic.
          heading_mag_deg: fix?.headingDeg != null ? magneticOf(fix.headingDeg, variationAt(fix)) : null,
          altitude_ft: fix?.altitudeFt != null ? Math.round(fix.altitudeFt / 100) * 100 : null,
          fuel_min: number(fuelMin),
          souls: number(souls),
        },
        data,
      ),
    [aircraft, data, nature, picked, fix, stations, fuelMin, souls, ranked],
  );

  // The ring and the line to the field picked, on the map while open.
  useEffect(() => {
    if (!open || !fix) {
      useEmergencyLine.setState({ drawing: null });
      return;
    }
    useEmergencyLine.setState({
      drawing: {
        from: { lat: fix.lat, lon: fix.lon },
        to: picked && { lat: picked.lat, lon: picked.lon, ident: picked.ident },
        ring: ranked?.glide?.ring ?? null,
      },
    });
  }, [open, fix, picked, ranked]);
  useEffect(() => () => useEmergencyLine.setState({ drawing: null }), []);

  return {
    open,
    close: closeEmergency,
    fix,
    showPosition: () => showPosition(true),
    asked,
    ranked,
    onDevice: !data && onDevice,
    picked,
    pick,
    phone: pickedData?.phone ?? null,
    metar: pickedData?.metar?.raw ?? null,
    visibility,
    airplaneName: aircraft.none ? null : shortName(aircraft.label),
    guidance,
    sections,
    section,
    pickSection,
    mayday,
    souls,
    setSouls,
    fuelMin,
    setFuelMin,
  };
}

export type EmergencyModel = ReturnType<typeof useEmergency>;

/** The nearest field ranked, as positionWords takes it: its true course
 *  from own ship is the bearing to it. */
function nearestOf(ranked: ReturnType<typeof bestFields> | null) {
  const nearest = ranked?.fields.reduce<(typeof ranked.fields)[number] | null>(
    (best, f) => (!best || f.distance_nm < best.distance_nm ? f : best),
    null,
  );
  return nearest ? { name: nearest.name, distance_nm: nearest.distance_nm, bearing_deg: nearest.course_deg } : undefined;
}
