import type { CircleLayerSpecification, GeoJSONSource, SymbolLayerSpecification } from "maplibre-gl";
import { useEffect, useMemo } from "react";
import { prefersReducedMotion } from "../../../motion";
import { CHART } from "../../../tokens";
import { MAP_BLUE } from "../../marks/chartColors";
import { useLessonMap } from "../../route/lessonMap";
import { EMPTY, useGlData, useGlLayer, useGlMap } from "../glLayer";
import { cameraOf } from "../camera";
import { pictureLayer } from "../markLayers";
import { useGlLines, type GlRun } from "../useGlLines";
import { svgPicture, useGlSymbols, type GlSymbol } from "../useGlSymbols";

const RING = "lesson-ring";
/** The step's fix ringed in blue over a wash of it. */
const RING_LAYER: CircleLayerSpecification = {
  id: RING,
  type: "circle",
  source: RING,
  paint: {
    "circle-radius": 15.5,
    "circle-color": MAP_BLUE,
    "circle-opacity": 0.12,
    "circle-stroke-color": MAP_BLUE,
    "circle-stroke-width": 3,
  },
};

const AIRPLANE = "lesson-airplane";
/** The lesson's airplane, the traffic's chevron in blue on a white
 *  casing, turned to its track on the chart. */
const AIRPLANE_PICTURE = svgPicture(
  "lesson-airplane",
  () =>
    `<svg width="16" height="16" viewBox="0 0 22 22"><path d="M11 2 L18 19 L11 14.5 L4 19 Z" fill="${MAP_BLUE}" stroke="${CHART.casing}" stroke-width="2.75" stroke-linejoin="round"/></svg>`,
);
const AIRPLANE_LAYERS: SymbolLayerSpecification[] = [
  pictureLayer(AIRPLANE, AIRPLANE, {}, { "icon-rotate": ["get", "track"], "icon-rotation-alignment": "map" }),
];

/** The approach lesson's step: its part of the procedure in a wide blue
 *  band, its fix ringed, its airplane flown along. */
export function LessonGl() {
  const { map } = useGlMap();
  const drawing = useLessonMap((s) => s.drawing);
  const focus = useLessonMap((s) => s.focus);
  const flight = useLessonMap((s) => s.flight);
  const fix = drawing && focus.fix ? (drawing.fixes.find((f) => f.ident === focus.fix) ?? null) : null;
  const runs = useMemo<GlRun[] | null>(
    () =>
      drawing && focus.segment
        ? drawing.lines
            .filter((l) => l.role === focus.segment)
            .map((l) => ({ points: l.points as [number, number][], colour: MAP_BLUE, width: 10, opacity: 0.35 }))
        : null,
    [drawing, focus.segment],
  );
  useGlLines("lesson", "route", runs, null);
  useGlLayer("top", { [RING]: { type: "geojson", data: EMPTY } }, [RING_LAYER]);
  const ring = useMemo<GeoJSON.Feature | null>(
    () =>
      fix ? { type: "Feature", properties: { ident: fix.ident }, geometry: { type: "Point", coordinates: [fix.lon, fix.lat] } } : null,
    [fix],
  );
  useGlData(RING, ring);
  useEffect(() => {
    if (fix) cameraOf(map).pick([fix.lon, fix.lat], { duration: 400 });
  }, [map, fix]);

  // The airplane where the flight ends, flown there from the last fix over
  // a second and a half, its point moved each frame (at once with reduced
  // motion).
  const start = useMemo<GlSymbol[]>(
    () =>
      flight && flight.path.length
        ? [
            {
              key: "airplane",
              lat: flight.path.at(-1)!.lat,
              lon: flight.path.at(-1)!.lon,
              picture: AIRPLANE_PICTURE,
              props: { track: flight.track ?? 0 },
            },
          ]
        : [],
    [flight],
  );
  useGlSymbols(AIRPLANE, AIRPLANE_LAYERS, start);
  useEffect(() => {
    if (!flight || flight.path.length === 0) return;
    const put = (lat: number, lon: number) =>
      map
        .getSource<GeoJSONSource>(AIRPLANE)
        ?.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { key: "airplane", icon: AIRPLANE_PICTURE.id, track: flight.track ?? 0 },
              geometry: { type: "Point", coordinates: [lon, lat] },
            },
          ],
        });
    if (prefersReducedMotion() || flight.path.length < 2) return;
    const began = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const f = Math.min(1, (now - began) / 1600);
      const i = Math.min(flight.path.length - 2, Math.floor(f * (flight.path.length - 1)));
      const k = f * (flight.path.length - 1) - i;
      const a = flight.path[i]!,
        b = flight.path[i + 1]!;
      // Not before its picture is in, which the hook waits for.
      if (map.hasImage(AIRPLANE_PICTURE.id)) put(a.lat + (b.lat - a.lat) * k, a.lon + (b.lon - a.lon) * k);
      if (f < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [map, flight]);
  return null;
}
