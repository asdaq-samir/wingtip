import { useQueries } from "@tanstack/react-query";
import type { ExpressionSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { useMemo } from "react";
import { pointName } from "../../../identSchema";
import { airportQuery } from "../../../queryClient";
import { STOP_KINDS, type StopKind } from "../../../stopKinds";
import { colourOf } from "../../marks/flightCategory";
import { fieldMarkPicture } from "../../marks/markPictures";
import { BREAK_PIN, FUEL_PIN, PIN_PLACE, stackedPin, type StopPin } from "../../marks/stopPins";
import { labelledLayer, pictureLayer } from "../markLayers";
import { useGlSymbols, type GlSymbol } from "../useGlSymbols";

const PIN = ["==", ["get", "kind"], "pin"] as ExpressionSpecification;
const FIELD = ["==", ["get", "kind"], "field"] as ExpressionSpecification;

/** A stop's field's mark and ident under its pins, its pins' tip on the
 *  field's middle (Tesla's trip map, the owner's screenshot, 2026-10-21). */
function stopLayers(id: string): SymbolLayerSpecification[] {
  return [
    { ...labelledLayer(`${id}-fields`, id), filter: FIELD },
    { ...pictureLayer(`${id}-pins`, id, {}, PIN_PLACE), filter: PIN },
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
            props: { kind: "field" },
            onTap: () => onSelect(s.ident),
          },
          {
            key: `${s.ident}-pin`,
            lat: s.lat,
            lon: s.lon,
            picture: s.reason === "break" ? BREAK_PIN : FUEL_PIN,
            props: { kind: "pin", title: `Suggested ${s.reason === "break" ? "stop" : "fuel stop"} ${s.ident}` },
            onTap: () => onSelect(s.ident),
          },
        ];
        return both;
      }),
    [stops, places, onSelect],
  );
  useGlSymbols(FUEL_STOPS, FUEL_STOP_LAYERS, marks);
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
      fields.flatMap((f): GlSymbol[] => [
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
          props: { kind: "pin", title: `${f.ident}: ${f.kinds.map((k) => STOP_KINDS[k].name).join(", ")}` },
          onTap: () => onSelect(f.ident),
        },
      ]),
    [fields, onSelect],
  );
  useGlSymbols(STOP_FIELDS, STOP_FIELD_LAYERS, marks);
  return null;
}
