import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { Course } from "../../../api/types";
import { chartQuery } from "../../../queryClient";
import { usePreferences } from "../../../preferences";
import { useGlLayer, useGlMap, useGlPaint } from "../glLayer";
import { useChartLook } from "../useChartLook";
import { chartPaint, chartRole, chartSource, chartStyle, type ChartStyle } from "../glStyle";
import { chartBrightness } from "../../chartLook";
import { CLOSE_MAX_ZOOM, chartFade } from "../closeZoom";
import { CloseImageryGl } from "./CloseImageryGl";
import { LABEL_NIGHT, LABEL_SCALE, labelScale } from "./common";
import { MAP_DIM, mapDimOf } from "../mapDim";
import { useCloseImagery } from "../useCloseImagery";
import { useChartMissed } from "../useChartMissed";

/**
 * The FAA chart (glStyle's chartStyle): the base
 * chart, the region's level under it and the terminal sheet over it
 * (the TAC over the sectional, the IFR area chart over an IFR chart),
 * always, at every zoom it exists at (the owner, 2026-11-14: "TAC switch
 * is not needed, just have it on by default"; a kept "off" from the
 * switch's time is no longer read), made again as the base or the cycle
 * changes; dimmed by the Map card's Dimmer (the dark theme's half unless
 * moved), its contrast moved by its Contrast, and brightened in sunlight
 * (glStyle's chartPaint, useChartLook), set on the layers as a slider
 * moves, with no style made again. Close in,
 * past the base chart's own last zoom, the chart fades into the aerial
 * imagery under it (closeZoom, useCloseImagery: the USGS's, or Google's
 * at the pilot's pick), and the map goes
 * in to CLOSE_MAX_ZOOM; where there is none, to two levels past the chart.
 * With the chart None, nothing of it is drawn. The base picked before
 * stays on the map hidden (its layers' visibility none, each id its own,
 * glStyle's chartId), so its tiles are still in MapLibre's cache for a
 * switch back, and the new base is added beside it rather than after the
 * old one is taken down; a hidden source fetches nothing.
 */
export function ChartGl({ course }: { course: Course | null }) {
  const { data: chartOnly } = useQuery({ ...chartQuery, enabled: !course });
  const chart = course ?? chartOnly ?? null;
  const base = usePreferences((s) => s.base);
  const { night, sunlight, dim, contrast } = useChartLook();
  // None picked: no chart, its terminal sheet or the imagery it fades
  // into; the overlay and the plain ground (BaseGl) are the map's base.
  const none = base === "none";
  const spec = useMemo(() => (chart && !none ? chartStyle(chart, base, true, window.location.origin) : null), [chart, none, base]);
  // The base before this one (None aside), made from the chart now: a new
  // cycle makes it again, hidden, with nothing fetched until it is shown.
  const [bases, setBases] = useState<{ now: string; last: string | null }>({ now: base, last: null });
  if (bases.now !== base) setBases({ now: base, last: bases.now === "none" ? bases.last : bases.now });
  const lastBase = bases.now === base ? bases.last : null;
  const kept = useMemo(() => {
    const last = chart && lastBase ? chartStyle(chart, lastBase, true, window.location.origin) : null;
    // Never one whose ids are the shown chart's (a kind the cycle lacks
    // falls back to the sectional, chartPair).
    const ids = new Set(Object.keys(spec?.sources ?? {}));
    return last && !Object.keys(last.sources).some((id) => ids.has(id)) ? last : null;
  }, [chart, lastBase, spec]);
  // The base and the terminal sheet each made again only as its own tiles
  // change.
  const parts = useMemo(() => [...chartParts(spec, true), ...chartParts(kept, false)], [spec, kept]);
  const tileMax = (spec && chartSource(spec, "chart")?.maxzoom) ?? null;
  const imagery = useCloseImagery(tileMax);
  // Which charts are drawn and how, on the map's element, for the browser
  // tests: each part's kind (its tiles' path) and the paint's look.
  const { map } = useGlMap();
  // A tile neither kept nor to be had offline says so, not a blank square.
  useChartMissed(map);
  // With no chart to set it, the map goes in as far as over the imagery:
  // the overlay and the vector layers have their detail that far.
  useEffect(() => {
    if (none) map.setMaxZoom(CLOSE_MAX_ZOOM);
  }, [map, none]);
  // The labels' halos dimmed after dark with the page's theme (common's
  // HALO_COLOUR reads it), not glaring white over the night's chart.
  useEffect(() => {
    if (map.style) map.setGlobalStateProperty(LABEL_NIGHT, night);
  }, [map, night]);
  // The map's words grown with the pilot's text size, at most 1.2x, while
  // the Map card's Larger Map Labels is on (common's labelScale): read
  // from the page's root size, again as the window changes (iOS sets a
  // new text size on the page as it comes back).
  const larger = usePreferences((s) => s.largerMapLabels);
  useEffect(() => {
    const apply = () => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      if (map.style) map.setGlobalStateProperty(LABEL_SCALE, labelScale(larger, root));
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [map, larger]);
  const kinds = parts
    .filter((p) => p.shown)
    .map((p) => /\/(?:chart-tile\/)?([a-z_]+)\/\{z\}/.exec(Object.values(p.spec.sources).at(-1)?.tiles?.[0] ?? "")?.[1] ?? "")
    .join(" ");
  const brightness = chartBrightness(dim, sunlight, night);
  // What is drawn on the chart at its brightness at night (mapDim): one
  // global state every symbol's, line's and circle's opacity reads, set in
  // the same commit as the chart's own paint (ChartSources' useGlPaint), so
  // the two are drawn in one frame and ease together on the style's
  // transition (MapLibre eases a constant paint from the state before).
  // No opacity by feature reads it where this app can help it (useGlLines'
  // ink, the shelves' two layers): such a one has MapLibre lay its source
  // out again at every step of the Dimmer.
  const mapDim = mapDimOf(night, brightness);
  useEffect(() => {
    if (map.style) map.setGlobalStateProperty(MAP_DIM, mapDim);
  }, [map, mapDim]);
  const look = sunlight ? "bright" : brightness < 1 ? "dimmed" : "normal";
  useEffect(() => {
    const el = map.getContainer();
    el.dataset.chartKinds = kinds;
    el.dataset.chartLook = look;
  }, [map, kinds, look]);
  // And the brightness and contrast each chart layer is drawn at, read
  // from the map at rest, not from what was asked: the look said "dimmed"
  // while the chart close in was drawn undimmed (UI audit B10).
  useEffect(() => {
    // Each layer by its role ("chart 0.5"), the hidden last base left out.
    const drawn = (name: "raster-brightness-max" | "raster-contrast", none: number, others: string[] = []) =>
      map
        .getStyle()
        .layers.filter((l) => (chartRole(l.id) || others.includes(l.id)) && map.getLayoutProperty(l.id, "visibility") !== "none")
        .map((l) => `${chartRole(l.id) ?? l.id} ${map.getPaintProperty(l.id, name) ?? none}`)
        .join(",");
    const write = () => {
      const el = map.getContainer();
      el.dataset.chartBrightness = drawn("raster-brightness-max", 1, ["close-imagery", "land-water"]);
      el.dataset.chartContrast = drawn("raster-contrast", 0);
    };
    map.on("idle", write);
    return () => {
      map.off("idle", write);
    };
  }, [map]);
  const paint = chartPaint(night, sunlight, dim, contrast);
  return (
    <>
      {parts.map(({ part, spec, shown }) => (
        <ChartSources key={`${part}:${JSON.stringify(spec.sources)}`} spec={spec} paint={paint} fade={!!imagery} shown={shown} />
      ))}
      {imagery && tileMax != null && spec && (
        <CloseImageryGl
          key={`${imagery.url}:${tileMax}`}
          tiles={imagery}
          tileMaxZoom={tileMax}
          brightness={brightness}
          under={Object.keys(spec.sources)[0]!}
        />
      )}
    </>
  );
}

/** A chart style's base and its terminal sheet, each its own part, as
 *  ChartSources draws them; `shown` false for the last base kept. */
function chartParts(spec: ChartStyle | null, shown: boolean) {
  if (!spec) return [];
  return (["base", "terminal"] as const)
    .map((part) => {
      const ids = Object.keys(spec.sources).filter((id) => (chartRole(id) === "chart-terminal") === (part === "terminal"));
      const sources = Object.fromEntries(Object.entries(spec.sources).filter(([id]) => ids.includes(id)));
      return { part, shown, spec: { ...spec, sources, layers: spec.layers.filter((l) => ids.includes(l.id)) } };
    })
    .filter((p) => p.spec.layers.length);
}

/** One chart's sources and layers, made again (`key`) as its tiles change;
 *  its paint (chartPaint) set on its layers as the look changes, and, with
 *  the imagery under it (`fade`), faded out past its own last zoom. While
 *  not `shown` (the last base, kept), its layers are hidden, so MapLibre
 *  fetches none of its tiles but keeps those it has. */
function ChartSources({
  spec,
  paint,
  fade,
  shown,
}: {
  spec: ChartStyle;
  paint: ReturnType<typeof chartPaint>;
  fade: boolean;
  shown: boolean;
}) {
  const { map } = useGlMap();
  const ids = spec.layers.map((l) => l.id);
  const visibility = shown ? "visible" : "none";
  // Added hidden where it is the kept one, so it fetches nothing at all
  // (useGlLayer reads its specs once, as the part mounts).
  useGlLayer(
    "chart",
    spec.sources,
    spec.layers.map((l) => ({ ...l, layout: { visibility } })),
  );
  const names = ids.join();
  useEffect(() => {
    for (const id of names.split(",")) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
  }, [map, names, visibility]);
  // The base and the region's level under it fade by the base's last
  // zoom, the terminal sheet by its own.
  const own = (chartSource(spec, "chart") ?? chartSource(spec, "chart-terminal"))?.maxzoom;
  const opacity = fade && own != null ? chartFade(own) : 1;
  useGlPaint(ids, { ...paint, "raster-opacity": opacity } as Record<string, unknown>);
  useEffect(() => {
    if (shown) map.setMaxZoom(fade ? CLOSE_MAX_ZOOM : spec.maxZoom);
  }, [map, spec, fade, shown]);
  useEffect(() => {
    if (!shown) return;
    // The frame the chart's first tile is drawn in, for the speed
    // measurements (a canvas is no Largest Contentful Paint candidate, as
    // an image is): `chart-drawn`, once a page.
    const drawn = (e: { sourceId?: string; tile?: unknown }) => {
      if (chartRole(e.sourceId) !== "chart" || !e.tile) return;
      map.off("sourcedata", drawn);
      if (!performance.getEntriesByName("chart-drawn").length) map.once("render", () => performance.mark("chart-drawn"));
    };
    map.on("sourcedata", drawn);
    // The level of the chart's tiles drawn now, on the map's element, for
    // the browser tests: the zoom rounded, as raster tiles are chosen, no
    // further than the chart's own last level.
    const chart = chartSource(spec, "chart");
    const level = () => {
      if (chart) map.getContainer().dataset.chartZoom = String(Math.min(chart.maxzoom ?? 22, Math.round(map.getZoom() + 1)));
    };
    level();
    // On every zoom too: a camera that follows an airplane (the dry run)
    // eases on fix after fix and never comes to rest, so a level said
    // only at moveend was the last one before it started.
    map.on("moveend", level);
    map.on("zoom", level);
    return () => {
      map.off("sourcedata", drawn);
      map.off("moveend", level);
      map.off("zoom", level);
    };
  }, [map, spec, shown]);
  return null;
}
