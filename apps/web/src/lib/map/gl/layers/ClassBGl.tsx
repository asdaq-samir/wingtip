import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { ChartInfo } from "../../../api/types";
import { usePreferences } from "../../../preferences";
import { classBQuery } from "../../../queryClient";
import { colourOf } from "../../marks/flightCategory";
import { fieldMarkPicture } from "../../marks/markPictures";
import { chartPair } from "../../sources/tiles";
import { useGlMap } from "../glLayer";
import { cameraOf } from "../camera";
import { CAMERA_MS } from "../cameraRules";
import { glZoom } from "../glStyle";
import { labelledLayer } from "../markLayers";
import { useGlSymbols, type GlSymbol } from "../useGlSymbols";
import { MAP_ZOOM } from "../../../tokens";
import { ROUTE_MARKS_LOWEST } from "../../marks/routeMarks";

const CLASS_B = "class-b-fields";
/** Full size and named from map.zoom.class-b-named; farther out, over the
 *  whole country, half size and unnamed, so the route's ends and stops are
 *  the only words there (the owner's iPhone screenshot, 2026-11-23: every
 *  Class B field a full ring and an ident round a coast-to-coast route). */
const NAMED = glZoom(MAP_ZOOM.classBNamed);
/** Each field's mark always drawn, at every zoom, over whatever is near
 *  it, even another Class B field a few px off at the country's zoom (JFK,
 *  LGA and EWR), as the owner asked on 2026-11-17 ("all the class B
 *  airports show even when zoomed out"); only its ident gives way, to the
 *  route's own marks, placed before it (drawn under ROUTE_MARKS_LOWEST),
 *  and to the other marks (MapLibre's collision; rules.md, "Where words
 *  collide"). The mark still takes its room, two px round it as the
 *  chart's fields stand (glOverlays' airports), so the chart's labels and
 *  own ship's room, placed after it, keep off it. */
const CLASS_B_LAYERS = [
  labelledLayer(
    CLASS_B,
    CLASS_B,
    { collide: true, sort: 0 },
    {
      "icon-size": ["interpolate", ["linear"], ["zoom"], NAMED - 1, 0.5, NAMED, 1],
      "icon-allow-overlap": true,
      "icon-padding": 2,
      "text-field": ["step", ["zoom"], "", NAMED, ["get", "text"]],
      "text-optional": true,
    },
  ),
];

/**
 * The Class B fields' weather, as marks over the chart, always and at
 * every zoom (small and unnamed over the whole country, CLASS_B_LAYERS), on the planner's map and the training map alike: a
 * tap the field's card where the map has one (`onSelectPlace`), and on
 * the training map, which has none, the map goes to the field at the zoom
 * its terminal chart starts at. The terminal sheet is always drawn over
 * the chart where there is one (ChartGl), so a hover has nothing to show.
 */
export function ClassBGl({
  chart,
  route,
  onSelectPlace,
}: {
  chart: ChartInfo;
  /** The route's own fields, which wear their own marks. */
  route: string[];
  onSelectPlace?: (ident: string) => void;
}) {
  const { map } = useGlMap();
  const base = usePreferences((s) => s.base);
  const { overlay } = chartPair(chart.chart_layers, base);
  const overlayFromZoom = overlay?.min_zoom ?? 10;
  // Always drawn, at every zoom (the owner, 2026-11-17: "Just keep it by
  // default in the app so all the class B airports show even when zoomed
  // out"), where it was the route's ••• menu's Class B Weather, off.
  const { data } = useQuery(classBQuery);
  const marks = useMemo<GlSymbol[]>(
    () =>
      data
        ? data
            .filter((a) => !route.includes(a.ident))
            .map((a) => {
              return {
                key: a.ident,
                lat: a.lat,
                lon: a.lon,
                text: a.ident,
                picture: fieldMarkPicture("B", colourOf(a.flight_category)),
                // Its ident blue as the chart's (labelledLayer): a Class
                // B's primary field, towered.
                props: {
                  title: `${a.ident} · ${a.name} · ${a.flight_category ?? "no report"}`,
                  weather: colourOf(a.flight_category),
                  towered: true,
                },
                onTap: () => {
                  if (onSelectPlace) onSelectPlace(a.ident);
                  else cameraOf(map).pick([a.lon, a.lat], { zoom: Math.max(map.getZoom(), glZoom(overlayFromZoom)), duration: CAMERA_MS });
                },
              };
            })
        : [],
    [data, route, overlayFromZoom, onSelectPlace, map],
  );
  useGlSymbols(CLASS_B, CLASS_B_LAYERS, marks, { under: ROUTE_MARKS_LOWEST });
  // Every field given, in sight or not, for the browser tests (the probe
  // has only those drawn in the view): their idents and weather colours.
  useEffect(() => {
    map.getContainer().dataset.classBFields = JSON.stringify(marks.map((m) => ({ ident: m.text, weather: m.props?.weather })));
  }, [map, marks]);
  return null;
}
