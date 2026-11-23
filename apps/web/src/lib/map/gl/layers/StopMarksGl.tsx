import { useQueries } from "@tanstack/react-query";
import type { ExpressionSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { useMemo } from "react";
import { pointName } from "../../../identSchema";
import { airportQuery } from "../../../queryClient";
import { STOP_KINDS, type StopKind } from "../../../stopKinds";
import { colourOf } from "../../marks/flightCategory";
import { fieldMarkPicture } from "../../marks/markPictures";
import { BREAK_PIN, FUEL_PIN, PIN_PLACE, stackedPin, type StopPin } from "../../marks/stopPins";
import { ROUTE_MARKS_LOWEST } from "../../marks/routeMarks";
import { labelledLayer, pictureLayer, type Layout } from "../markLayers";
import { useGlSymbols, type GlSymbol } from "../useGlSymbols";

const PIN = ["==", ["get", "kind"], "pin"] as ExpressionSpecification;
const FIELD = ["==", ["get", "kind"], "field"] as ExpressionSpecification;

/** A stop's field: its mark always drawn, under its pin (which takes the
 *  room, so the marks placed after it -- a Class B's field, the chart's
 *  fields and their idents -- give way to the pin), its ident giving way.
 *  The mark takes its room too, so no chart ident is drawn half under it
 *  where the pin has given way to another. */
const FIELD_UNDER_PIN: Layout = {
  "icon-allow-overlap": true,
  "icon-ignore-placement": false,
  "text-allow-overlap": false,
  "text-optional": true,
};

/** Pins placed in the route's order (`order`, the first stop's 0), so
 *  where two would overlap the one flown to first keeps its place. */
const PIN_ORDER = ["coalesce", ["get", "order"], 0] as ExpressionSpecification;

/** A stop's field's mark and ident under its pins, its pins' tip on the
 *  field's middle (Tesla's trip map, the owner's screenshot, 2026-10-21).
 *  The mark always drawn; the ident given way where the route's own names
 *  or another mark's are (the owner's iPhone screenshot, 2026-11-23:
 *  KPGA's over KLAS's at the country's zoom). A pin gives way too, to a
 *  pin already placed: six suggested fuel stops along a 1,300 nm leg
 *  stood piled on each other at the country's zoom (the owner's iPhone,
 *  2026-11-23), so the later ones wait for the map to be zoomed in, their
 *  fields' marks still drawn and a tap on one still its card. */
function stopLayers(id: string): SymbolLayerSpecification[] {
  return [
    { ...labelledLayer(`${id}-fields`, id, { collide: true, sort: 0 }, FIELD_UNDER_PIN), filter: FIELD },
    { ...pictureLayer(`${id}-pins`, id, { collide: true, sort: PIN_ORDER }, PIN_PLACE), filter: PIN },
  ];
}
const FUEL_STOPS = "fuel-stops";
const FUEL_STOP_LAYERS = stopLayers(FUEL_STOPS);
const STOP_FIELDS = "stop-fields";
const STOP_FIELD_LAYERS = stopLayers(STOP_FIELDS);

/** The planner's suggested fuel stops and breaks (FuelStopPins): each
 *  field's own mark under its pin, a tap its card. */
export function FuelStopsGl({ stops, onSelect }: { stops: StopPin[]; onSelect: (ident: string) => void }) {
  const places = useQueries({ queries: stops.map((s) => airportQuery(s.ident)) });
  const marks = useMemo<GlSymbol[]>(
    () =>
      stops.flatMap((s, i) => {
        const place = places[i]?.data;
        const use = place?.military === "military" ? ("military" as const) : null;
        const both: GlSymbol[] = [
          {
            key: `${s.ident}-field`,
            lat: s.lat,
            lon: s.lon,
            text: pointName(s.ident),
            picture: fieldMarkPicture(place?.airspace_class ?? null, colourOf(place?.metar?.flight_category), use),
            // Its ident in the chart's ink for it (labelledLayer): blue
            // where NASR lists a tower, as the tiles' field's.
            props: { kind: "field", towered: place?.towered === true },
            onTap: () => onSelect(s.ident),
          },
          {
            key: `${s.ident}-pin`,
            lat: s.lat,
            lon: s.lon,
            picture: s.reason === "break" ? BREAK_PIN : FUEL_PIN,
            props: { kind: "pin", order: i, title: `Suggested ${s.reason === "break" ? "stop" : "fuel stop"} ${s.ident}` },
            onTap: () => onSelect(s.ident),
          },
        ];
        return both;
      }),
    [stops, places, onSelect],
  );
  // Under the route's own marks, which are placed first: the route's ends
  // keep their names and the pin is drawn under them, not over.
  useGlSymbols(FUEL_STOPS, FUEL_STOP_LAYERS, marks, { under: ROUTE_MARKS_LOWEST });
  return null;
}

/** The map's Stops while their sheet is open (StopFieldMark): each field's
 *  mark under its stacked pins, a tap its row. */
export function StopFieldsGl({
  fields,
  onSelect,
}: {
  fields: { ident: string; lat: number; lon: number; kinds: StopKind[] }[];
  onSelect: (ident: string) => void;
}) {
  const marks = useMemo<GlSymbol[]>(
    () =>
      fields.flatMap((f, i): GlSymbol[] => [
        {
          key: `${f.ident}-field`,
          lat: f.lat,
          lon: f.lon,
          text: pointName(f.ident),
          picture: fieldMarkPicture(null, colourOf(undefined)),
          props: { kind: "field" },
          onTap: () => onSelect(f.ident),
        },
        {
          key: `${f.ident}-pins`,
          lat: f.lat,
          lon: f.lon,
          picture: stackedPin(f.kinds),
          props: { kind: "pin", order: i, title: `${f.ident}: ${f.kinds.map((k) => STOP_KINDS[k].name).join(", ")}` },
          onTap: () => onSelect(f.ident),
        },
      ]),
    [fields, onSelect],
  );
  useGlSymbols(STOP_FIELDS, STOP_FIELD_LAYERS, marks);
  return null;
}
