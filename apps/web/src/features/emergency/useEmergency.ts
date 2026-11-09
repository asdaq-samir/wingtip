import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { aircraftKey, shortName } from "../../lib/aircraftChoice";
import { checklistOf } from "../../lib/checklist";
import { checklistText, useChecklists } from "../../lib/checklists";
import { bestFields, checklistSection, maydayCall, positionWords, variationAt } from "./emergency";
import { useEmergencyLine } from "../../lib/map/marks/emergencyLine";
import { usePointActions } from "../../lib/map/cards/pointActions";
import { useOwnFix, useOwnShip } from "../../lib/map/position/ownShip";
import { magneticOf } from "../../lib/magnetic";
import { usePreferences } from "../../lib/preferences";
import { closeEmergency, useEmergencyOpen } from "../../lib/emergencyStore";

/** How far own ship moves before the fields are asked for again: a
 *  hundredth of a degree, about half a mile, as a light single glides in
 *  twenty seconds. */
const STEP_DEG = 0.01;
const at = (deg: number) => Math.round(deg / STEP_DEG) * STEP_DEG;

/**
 * The emergency assistant's one view model (MVVM): the fields within a
 * glide ranked (features/emergency/emergency's bestFields, the engine's best_fields) from
 * the planner's /api/emergency/fields, the field picked and its line on
 * the map (lib/map/marks/emergencyLine), the airplane's own emergency checklist
 * opened at the emergency asked (checklistSection), and the MAYDAY filled
 * from all of it (maydayCall). The views only draw what this gives.
 */
export function useEmergency() {
  const open = useEmergencyOpen(s => s.open);
  const fix = useOwnFix();
  const showPosition = useOwnShip(s => s.setEnabled);
  const aircraft = usePreferences(s => s.aircraft);
  const stations = usePointActions(s => s.stations);
  const profile = aircraft.none ? null : aircraft.profile;
  // Asked again as the airplane moves on and comes down, not at each fix.
  const lat = fix ? at(fix.lat) : 0;
  const lon = fix ? at(fix.lon) : 0;
  const altitude = fix?.altitudeFt != null ? Math.round(fix.altitudeFt / 500) * 500 : null;
  const asked = useQuery({
    queryKey: ["emergency", lat, lon, altitude, profile],
    queryFn: () => api.emergencyFields(lat, lon, altitude, profile),
    enabled: !!open && !!fix, staleTime: 60_000, placeholderData: previous => previous, meta: { silent: true },
  });
  const data = asked.data;
  const ranked = useMemo(() => (data && fix ? bestFields(data, fix, variationAt(fix)) : null), [data, fix]);

  const [pickedIdent, pick] = useState<string | null>(null);
  const picked = ranked?.fields.find(f => f.ident === pickedIdent) ?? ranked?.fields[0] ?? null;
  const pickedData = data?.fields.find(f => f.ident === picked?.ident) ?? null;

  // The airplane's own emergency checklist, opened at the emergency asked.
  const text = useChecklists(s => checklistText(s.value, aircraftKey(aircraft), "emergency"));
  const sections = useMemo(() => checklistOf(text).sections, [text]);
  const [sectionPicked, pickSection] = useState<number | null>(null);
  const section = sectionPicked ?? checklistSection(sections.map(s => s.title)) ?? (sections.length ? 0 : null);
  const nature = section !== null ? sections[section]!.title : "Engine failure";

  // What the pilot tells the screen: who is on board, the fuel left.
  const [souls, setSouls] = useState("");
  const [fuelMin, setFuelMin] = useState("");
  const number = (typed: string) => (typed.trim() && Number.isFinite(Number(typed)) ? Number(typed) : null);
  const mayday = useMemo(() => maydayCall({
    station: null,
    callsign: aircraft.tail ?? (aircraft.aircraftId != null ? shortName(aircraft.label) : null),
    airplane_type: data?.airplane?.type ?? null,
    nature,
    weather: null,
    intentions: picked ? `Landing at ${picked.name}, ${picked.ident}` : null,
    position: fix ? positionWords(fix, stations, data?.fields[0]) : null,
    // The airplane's own heading now, as the GPS tracks it, magnetic.
    heading_mag_deg: fix?.headingDeg != null ? magneticOf(fix.headingDeg, variationAt(fix)) : null,
    altitude_ft: fix?.altitudeFt != null ? Math.round(fix.altitudeFt / 100) * 100 : null,
    fuel_min: number(fuelMin),
    souls: number(souls),
  }, data), [aircraft, data, nature, picked, fix, stations, fuelMin, souls]);

  // The ring and the line to the field picked, on the map while open.
  useEffect(() => {
    if (!open || !fix) {
      useEmergencyLine.setState({ drawing: null });
      return;
    }
    useEmergencyLine.setState({
      drawing: { from: { lat: fix.lat, lon: fix.lon }, to: picked && { lat: picked.lat, lon: picked.lon, ident: picked.ident }, ring: ranked?.glide?.ring ?? null },
    });
  }, [open, fix, picked, ranked]);
  useEffect(() => () => useEmergencyLine.setState({ drawing: null }), []);

  return {
    open, close: closeEmergency, fix, showPosition: () => showPosition(true),
    asked, ranked, picked, pick, phone: pickedData?.phone ?? null, metar: pickedData?.metar?.raw ?? null,
    airplaneName: aircraft.none ? null : shortName(aircraft.label),
    sections, section, pickSection, mayday, souls, setSouls, fuelMin, setFuelMin,
  };
}

export type EmergencyModel = ReturnType<typeof useEmergency>;
