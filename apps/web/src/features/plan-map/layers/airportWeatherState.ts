import type { Map as MlMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AirportPin } from "../../../lib/api/types";
import { setAirportWeather } from "../../../lib/map/gl/glOverlays";
import { colourOf } from "../../../lib/map/marks/flightCategory";

type Bounds = { south: number; west: number; north: number; east: number };
/** An answer of the planner's reporting fields and the box it answered,
 *  or null where it is not in yet (or is the box before's, held). */
export type WeatherAnswer = { fields: AirportPin[]; box: Bounds; full: boolean } | null;
type Kept = { colour: string; lat: number; lon: number };

const inside = (k: Kept, b: Bounds) => k.lat >= b.south && k.lat <= b.north && k.lon >= b.west && k.lon <= b.east;

/**
 * Folds the answers into the fields' weather the map has, by ident, and
 * says whether it changed: a field's colour set where an answer gives one
 * new or different, and dropped where an answer for a box round it no
 * longer has it (its METAR gone missing: no old colour kept as though it
 * were new); a field outside every box answered keeps the colour it had.
 * Not dropped by an answer cut at the planner's limit (`full`), which
 * leaves some reporting fields out.
 */
export function foldWeather(kept: Map<string, Kept>, answers: WeatherAnswer[]): boolean {
  let changed = false;
  for (const answer of answers) {
    if (!answer) continue;
    const given = new Set<string>();
    for (const a of answer.fields) {
      if (!a.flight_category) continue;
      given.add(a.ident);
      const colour = colourOf(a.flight_category);
      if (kept.get(a.ident)?.colour !== colour) {
        kept.set(a.ident, { colour, lat: a.lat, lon: a.lon });
        changed = true;
      }
    }
    if (answer.full) continue;
    const others = new Set(answers.filter((o) => o && o !== answer).flatMap((o) => o!.fields.map((a) => a.ident)));
    for (const [ident, k] of kept)
      if (!given.has(ident) && !others.has(ident) && inside(k, answer.box)) {
        kept.delete(ident);
        changed = true;
      }
  }
  return changed;
}

/**
 * Each field's weather disc on the tile airports' mark (glOverlays'
 * setAirportWeather, a global state their icon-image reads), changed only
 * where a field's colour does, and sent at the map's rest. The state is
 * read by a layout property, so each change lays every airports tile out
 * again in the worker: it was set from each new box's answer alone, so
 * every box crossed (one can land mid-pan, useGlView's box changes while
 * the map moves) and every ten-minute refresh relaid them, dropping the
 * last box's idents with it. Returns the
 * colours by ident, for the specs' probe.
 */
export function useAirportWeatherState(map: MlMap, answers: WeatherAnswer[], off: boolean) {
  const kept = useRef(new Map<string, Kept>());
  const dirty = useRef(true);
  const sentOff = useRef<boolean | null>(null);
  const [a, b] = answers;
  useEffect(() => {
    if (foldWeather(kept.current, [a ?? null, b ?? null])) dirty.current = true;
    if (!dirty.current && sentOff.current === off) return;
    const send = () => {
      dirty.current = false;
      sentOff.current = off;
      // Off: no colour for any field, so each disc is the no-report grey.
      setAirportWeather(map, off ? new Map() : new Map([...kept.current].map(([ident, k]) => [ident, k.colour])));
    };
    if (!map.isMoving()) return send();
    map.once("moveend", send);
    return () => {
      map.off("moveend", send);
    };
  }, [map, a, b, off]);
  return kept;
}

/** The reporting fields along the route and in view, one list, the same
 *  array while their idents and weather are the same: a new answer saying
 *  what the last did (a ten-minute refresh, a box whose fields were in the
 *  last) asks the engine for no wind marks and sends the station model's
 *  source no new data (AirportWeatherGl's weatherMarksOfAll, up to 2,000
 *  METARs to JSON and back on the main thread). */
export function useSameFields(alongRoute: AirportPin[] | undefined, inView: AirportPin[] | undefined): AirportPin[] {
  const now = useMemo(() => {
    const fields = [...(alongRoute ?? []), ...(inView ?? [])];
    return { key: JSON.stringify(fields.map((f) => [f.ident, f.lat, f.lon, f.weather ?? null])), fields };
  }, [alongRoute, inView]);
  const [kept, setKept] = useState(now);
  if (kept.key !== now.key) setKept(now);
  return kept.key === now.key ? kept.fields : now.fields;
}
