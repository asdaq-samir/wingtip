import type { ExpressionSpecification, MapGeoJSONFeature, SymbolLayerSpecification } from "maplibre-gl";
import { useEffect, useMemo, useEffectEvent, type ReactNode } from "react";
import type { Leg, ProcedureDrawing } from "../../../api/types";
import { useGeo, type LatLon } from "../../../geo";
import { useAirplaneChosen } from "../../../preferences";
import type { TrafficPattern } from "../../../trafficPattern";
import { altFt } from "../../../format";
import { COURSE_MAGENTA } from "../../marks/chartColors";
import { FIX_PILL, FIX_PILL_SHIFT } from "../../marks/markPictures";
import { PATTERN_ARROW, PATTERN_LABEL, PATTERN_WORDS_FROM_ZOOM, TEAL } from "../../marks/patternMarks";
import { PROCEDURE_INK, PROCEDURE_WORDS_FROM_ZOOM, STALE_INK, fixMarks } from "../../marks/procedureMarks";
import { ROUTE_MARKS_LOWEST } from "../../marks/routeMarks";
import { useGlData, useGlLayer, useGlMap } from "../glLayer";
import { chipLayer, pictureLayer } from "../markLayers";
import { useGlLines, type GlRun } from "../useGlLines";
import { useGlProbe } from "../useGlProbe";
import { useGlSymbols, type GlSymbol } from "../useGlSymbols";
import { useGlView } from "../useGlView";
import { TAP, selectionRing } from "./common";
import { useMapRing } from "../../mapPick";
import { CHART } from "../../../tokens";

/** The level the map is at, the app's, as the camera comes to rest: what
 *  the words on the procedures and the patterns come in at. */
const useGlLevel = () => useGlView(noBox, "rest").level;
const noBox = () => null;

const KIND = (kind: string) => ["==", ["get", "kind"], kind] as ExpressionSpecification;

/** A pattern's arrows turned along their legs on the chart, its names on
 *  their teal chips. */
const PATTERN_LAYERS: SymbolLayerSpecification[] = [
  {
    ...pictureLayer("pattern-arrows", "pattern-marks", {}, { "icon-rotate": ["get", "rotate"], "icon-rotation-alignment": "map" }),
    filter: KIND("arrow"),
  },
  { ...chipLayer("pattern-labels", "pattern-marks", {}, {}, { "text-color": CHART.casing }), filter: KIND("label") },
];

/** A procedure's fixes: the tag beside each diamond, its left edge seven
 *  points right of the fix (the tag's picture has four of shadow round it). */
const PROCEDURE_LAYERS: SymbolLayerSpecification[] = [
  {
    ...pictureLayer(
      "procedure-fix-tags",
      "procedure-fixes",
      {},
      { "icon-image": ["get", "tag"], "icon-anchor": "left", "icon-offset": [3, 0] },
    ),
    filter: ["!=", ["get", "tag"], ""],
  },
  pictureLayer("procedure-fix-diamonds", "procedure-fixes"),
];

/** A top of climb's or descent's pill: on its point where that is clear,
 *  else a little above, below, then to either side of it (ems of its 11
 *  points; the pill's middle 5 points right of its words'), else left out. */
const LEG_POINT_LAYERS: SymbolLayerSpecification[] = [
  chipLayer(
    "leg-points",
    "leg-points",
    { collide: true, sort: 0 },
    {
      "text-variable-anchor-offset": [
        "center",
        [FIX_PILL_SHIFT, 0],
        "bottom",
        [FIX_PILL_SHIFT, -0.9],
        "top",
        [FIX_PILL_SHIFT, 0.9],
        "right",
        [-1.3, 0],
        "left",
        [2.2, 0],
      ],
    },
  ),
];

const pair = (p: LatLon): [number, number] => [p.lat, p.lon];
const along = (a: LatLon, b: LatLon, f: number): LatLon => ({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });

/** The traffic patterns picked: each circuit teal on a white
 *  casing, its entry dashed, arrows and words from zoom 11. */
export function PatternsGl({ patterns }: { patterns: TrafficPattern[] }) {
  const level = useGlLevel();
  const circuits = useMemo<GlRun[]>(
    () =>
      patterns.map((p) => ({
        points: [p.legs[0]!.from, ...p.legs.map((l) => l.to)].map(pair),
        colour: TEAL,
        width: 3.5,
        name: `${p.kind === "departure" ? "departure" : "pattern"}-at-${p.ident}`,
      })),
    [patterns],
  );
  const entries = useMemo<GlRun[]>(
    () => patterns.map((p) => ({ points: [pair(p.entry.from), pair(p.entry.to)], colour: TEAL, width: 3 })),
    [patterns],
  );
  useGlLines("patterns", "route", circuits, { colour: CHART.casing, width: 7, opacity: 0.9 });
  useGlLines("pattern-entries", "route", entries, { colour: CHART.casing, width: 7, opacity: 0.9 }, [7 / 3, 2]);
  const geo = useGeo();
  const marks = useMemo<GlSymbol[]>(
    () =>
      level < PATTERN_WORDS_FROM_ZOOM || !geo
        ? []
        : patterns.flatMap((p) => {
            const downwind = p.legs.find((l) => l.name === "Downwind");
            const downwindAt = downwind && along(downwind.from, downwind.to, 0.5);
            const downwindWords = `${p.traffic === "right" ? "Right" : "Left"} downwind ${p.runway}${p.altitudeFt != null ? ` · ${altFt(p.altitudeFt)} ft` : ""}`;
            const entryAt = p.kind === "departure" ? p.entry.to : p.entry.from;
            const entryWords = p.kind === "departure" ? `${p.entry.name} · ${p.runway}` : p.entry.name;
            const at = (point: LatLon, key: string) => ({ key: `${p.ident}-${p.runway}-${key}`, lat: point.lat, lon: point.lon });
            return [
              ...p.legs.map((l) => ({
                ...at(along(l.from, l.to, 0.3), l.name),
                picture: PATTERN_ARROW,
                props: { kind: "arrow", rotate: Math.round(geo.bearingDeg(l.from, l.to)) },
              })),
              ...(downwindAt
                ? [{ ...at(downwindAt, "downwind"), picture: PATTERN_LABEL, text: downwindWords, props: { kind: "label" } }]
                : []),
              { ...at(entryAt, "entry"), picture: PATTERN_LABEL, text: entryWords, props: { kind: "label" } },
            ];
          }),
    [patterns, level, geo],
  );
  useGlSymbols("pattern-marks", PATTERN_LAYERS, marks);
  return null;
}

/** A procedure's run named for the browser tests: its field, its id and
 *  transition, its kind and its place among that kind. */
const runName = (d: ProcedureDrawing, kind: "line" | "hold" | "missed" | "missed-hold", i: number) =>
  `${d.airport}:${d.id}:${d.transition ?? ""}:${kind}:${i}`;

/** A procedure's run as its probe says it: `kind` the old paths' class
 *  (line, missed or hold; a missed approach's hold is a hold) and `name`. */
const PROCEDURE_RUN = (f: MapGeoJSONFeature) => {
  const name = String(f.properties.name ?? "");
  const kind = name.split(":")[3] ?? "";
  return { kind: kind.endsWith("hold") ? "hold" : kind, name };
};

/** The instrument procedures picked: their lines in the
 *  approach's ink on a white casing, the missed dashed, holds, and each
 *  fix a diamond with its altitudes and speed from zoom 9; a tap a fix's
 *  card. */
export function ProceduresGl({
  drawings,
  crossings,
  directs,
  onFix,
}: {
  drawings: ProcedureDrawing[];
  crossings: Record<string, number>;
  directs: string;
  onFix?: (field: string, kind: ProcedureDrawing["kind"], fix: string) => void;
}) {
  const level = useGlLevel();
  const words = level >= PROCEDURE_WORDS_FROM_ZOOM;
  const inkOf = (d: ProcedureDrawing) => (d.stale ? STALE_INK : PROCEDURE_INK);
  const lines = useMemo<GlRun[]>(
    () =>
      drawings.flatMap((d) => [
        ...d.lines
          .filter((l) => l.role !== "missed")
          .map((l, i) => ({ points: l.points as [number, number][], colour: inkOf(d), width: 3.5, name: runName(d, "line", i) })),
        ...d.holds
          .filter((h) => !h.missed)
          .map((h, i) => ({ points: h.points as [number, number][], colour: inkOf(d), width: 2.5, name: runName(d, "hold", i) })),
      ]),
    [drawings],
  );
  const missed = useMemo<GlRun[]>(
    () =>
      drawings.flatMap((d) => [
        ...d.lines
          .filter((l) => l.role === "missed")
          .map((l, i) => ({ points: l.points as [number, number][], colour: inkOf(d), width: 3, name: runName(d, "missed", i) })),
        ...d.holds
          .filter((h) => h.missed)
          .map((h, i) => ({ points: h.points as [number, number][], colour: inkOf(d), width: 2.5, name: runName(d, "missed-hold", i) })),
      ]),
    [drawings],
  );
  useGlLines("procedures", "route", lines, { colour: CHART.casing, width: 7, opacity: 0.9 });
  useGlLines("procedures-missed", "route", missed, { colour: CHART.casing, width: 6, opacity: 0.9 }, [8 / 3, 7 / 3]);
  // What the browser tests read where Leaflet's paths were
  // (path.instrument-procedure, -missed, -hold), as the selected ring's
  // probe is: each line drawn, its kind and its name (data-instrument-
  // procedure, useGlProbe); a line cut across the map's tiles can be two
  // rows of one name, so a test counts the names.
  useGlProbe("instrument-procedure", ["procedures", "procedures-missed"], PROCEDURE_RUN);
  const marks = useMemo<GlSymbol[]>(
    () =>
      drawings.flatMap((d) =>
        d.fixes.map((fix) => {
          const tappable = !!onFix && !fix.missed && !/^RW\d/.test(fix.ident);
          const { diamond, tag } = fixMarks(
            fix,
            words,
            !!d.stale,
            fix.missed ? null : (crossings[fix.ident] ?? null),
            directs.split(",").includes(`${d.airport}:${d.id}:${fix.ident}`),
          );
          return {
            key: `${d.airport}-${d.id}-${d.transition ?? ""}-${fix.ident}`,
            lat: fix.lat,
            lon: fix.lon,
            picture: diamond,
            also: tag ? [tag] : [],
            props: { ident: fix.ident, tag: tag?.id ?? "" },
            onTap: tappable ? () => onFix!(d.airport, d.kind, fix.ident) : undefined,
          };
        }),
      ),
    [drawings, words, crossings, directs, onFix],
  );
  useGlSymbols("procedure-fixes", PROCEDURE_LAYERS, marks);
  return null;
}

/** Each hold the pilot put on the route (the legs' `hold`): its racetrack
 *  dashed in the course's magenta. */
export function HoldTracksGl({ legs }: { legs: Leg[] }) {
  const runs = useMemo<GlRun[]>(
    () => legs.flatMap((l) => (l.hold ? [{ points: l.hold.path as [number, number][], colour: COURSE_MAGENTA, width: 2.5 }] : [])),
    [legs],
  );
  useGlLines("hold-tracks", "route", runs, null, [6 / 2.5, 5 / 2.5]);
  return null;
}

/** Each leg's top of climb and of descent (RouteMap's LegPoints): a pill on
 *  the course, a tap its card (`cardOf`) and its ring, the map brought to
 *  it. Under the route's own marks,
 *  so it gives way to them: a little above, below or to either side of
 *  its point where one is on it, or left out (MapLibre's variable anchor
 *  and collision; routeMarks). */
export function LegPointsGl({
  legs: allLegs,
  onSelectPoint,
  cardOf,
}: {
  legs: Leg[];
  onSelectPoint: (lat: number, lon: number) => void;
  cardOf: (words: "TOC" | "TOD", at: { lat: number; lon: number }) => ReactNode;
}) {
  const { openCard } = useGlMap();
  // No airplane picked, no tops of climb and descent: they are its climb and descent (the owner, 2026-11-08: "don't assume").
  const airplane = useAirplaneChosen();
  const legs = airplane ? allLegs : NO_LEGS;
  const marks = useMemo<GlSymbol[]>(
    () =>
      legs.flatMap((leg, i) =>
        (
          [
            ["toc", "TOC", leg.toc],
            ["tod", "TOD", leg.tod],
          ] as const
        ).flatMap(([kind, words, at]) =>
          at
            ? [
                {
                  key: `${kind}-${i}`,
                  lat: at.lat,
                  lon: at.lon,
                  text: words,
                  picture: FIX_PILL,
                  onTap: () => {
                    // Its card first, every other pick put away, then its ring (lib/map/mapPick).
                    openCard(cardOf(words, at), ["point"]);
                    onSelectPoint(at.lat, at.lon);
                  },
                },
              ]
            : [],
        ),
      ),
    [legs, onSelectPoint, openCard, cardOf],
  );
  useGlSymbols("leg-points", LEG_POINT_LAYERS, marks, { under: ROUTE_MARKS_LOWEST, rank: TAP.rank.checkpoint });
  return null;
}

const RING_SOURCE = "picked-ring";
/** The one ring round a point picked (selectionRing), a held point's too:
 *  no blue dot in it, blue being own ship's alone (the owner, 2026-11-18). */
const RINGS = selectionRing("picked-ring", RING_SOURCE);

/** A point picked -- the Nav Log's point (`focus`: a checkpoint's, a
 *  route point's), the point a map card is open for (useMapRing: a VOR, a
 *  fix, a waypoint, a PIREP, a wind barb) -- and a point held on the chart
 *  -- a finger held, a right-click -- for its airspace card (HeldPoint),
 *  each in the one ring. */
export function PickedGl({
  focus,
  held,
  onHold,
}: {
  focus: { lat: number; lon: number } | null;
  held: { lat: number; lon: number } | null;
  onHold: (point: { lat: number; lon: number }) => void;
}) {
  const { map } = useGlMap();
  const carded = useMapRing((s) => s.at);
  useGlLayer("top", { [RING_SOURCE]: { type: "geojson", data: { type: "FeatureCollection", features: [] } } }, RINGS);
  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: [focus, carded, held]
        .filter((p): p is { lat: number; lon: number } => !!p)
        .map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })),
    }),
    [focus, carded, held],
  );
  // Each ring drawn, for the browser tests: a ring left on the map once its
  // card has gone is the bug they hold (the selection audit, 2026-11-18).
  useGlProbe("picked-ring", ["picked-ring"], () => ({ ring: true }));
  useGlData(RING_SOURCE, data);
  const hold = useEffectEvent(onHold);
  useEffect(() => {
    const menu = (e: { lngLat: { lat: number; lng: number } }) => hold({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    map.on("contextmenu", menu);
    return () => {
      map.off("contextmenu", menu);
    };
  }, [map]);
  return null;
}

const NO_LEGS: Leg[] = [];
