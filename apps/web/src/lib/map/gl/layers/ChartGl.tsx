import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { Course } from "../../../api/types";
import { chartQuery } from "../../../queryClient";
import { usePreferences } from "../../../preferences";
import { useSunlight } from "../../../sunlight";
import { useGlLayer, useGlMap, useGlPaint } from "../glLayer";
import { useDarkTheme } from "../useDarkTheme";
import { chartPaint, chartStyle, type ChartStyle } from "../glStyle";
import { CLOSE_MAX_ZOOM, chartFade } from "../closeZoom";
import { CloseImageryGl } from "./CloseImageryGl";
import { useCloseImagery } from "../useCloseImagery";

/**
 * The FAA chart (glStyle's chartStyle): the base
 * chart, the region's level under it and the terminal sheet over it
 * (the TAC over the sectional, the IFR area chart over an IFR chart),
 * always, at every zoom it exists at (the owner, 2026-11-14: "TAC switch
 * is not needed, just have it on by default"; a kept "off" from the
 * switch's time is no longer read), made again as the base or the cycle
 * changes; dimmed at
 * night and brightened in sunlight (glStyle's chartPaint). Close in,
 * past the base chart's own last zoom, the chart fades into the aerial
 * imagery under it (closeZoom, useCloseImagery: the USGS's, or Google's
 * at the pilot's pick, never for export, `publicOnly`), and the map goes
 * in to CLOSE_MAX_ZOOM; where there is none, to two levels past the chart.
 * With the chart None, nothing of it is drawn.
 */
export function ChartGl({ course, publicOnly = false }: { course: Course | null; publicOnly?: boolean }) {
  const { data: chartOnly } = useQuery({ ...chartQuery, enabled: !course });
  const chart = course ?? chartOnly ?? null;
  const base = usePreferences((s) => s.base);
  const chartNight = usePreferences((s) => s.chartNight);
  const sunlight = useSunlight();
  const dark = useDarkTheme();
  // On <html>, for index.css's night colours.
  useEffect(() => {
    document.documentElement.dataset.chartNight = chartNight;
  }, [chartNight]);
  // None picked: no chart, its terminal sheet or the imagery it fades
  // into; the overlay and the plain ground (BaseGl) are the map's base.
  const none = base === "none";
  const spec = useMemo(() => (chart && !none ? chartStyle(chart, base, true, window.location.origin) : null), [chart, none, base]);
  // The base and the terminal sheet each made again only as its own tiles
  // change.
  const parts = useMemo(
    () =>
      spec
        ? (["base", "terminal"] as const)
            .map((part) => {
              const ids = part === "base" ? ["chart-under", "chart"] : ["chart-terminal"];
              const sources = Object.fromEntries(Object.entries(spec.sources).filter(([id]) => ids.includes(id)));
              return { part, spec: { ...spec, sources, layers: spec.layers.filter((l) => ids.includes(l.id)) } };
            })
            .filter((p) => p.spec.layers.length)
        : [],
    [spec],
  );
  const night = dark && chartNight === "dimmed";
  const tileMax = spec?.sources.chart?.maxzoom ?? null;
  const imagery = useCloseImagery(tileMax, publicOnly);
  // Which charts are drawn and how, on the map's element, for the browser
  // tests: each part's kind (its tiles' path) and the paint's look.
  const { map } = useGlMap();
  // With no chart to set it, the map goes in as far as over the imagery:
  // the overlay and the vector layers have their detail that far.
  useEffect(() => {
    if (none) map.setMaxZoom(CLOSE_MAX_ZOOM);
  }, [map, none]);
  const kinds = parts
    .map((p) => /\/(?:chart-tile\/)?([a-z_]+)\/\{z\}/.exec(Object.values(p.spec.sources).at(-1)?.tiles?.[0] ?? "")?.[1] ?? "")
    .join(" ");
  const look = night ? "dimmed" : sunlight ? "bright" : "normal";
  useEffect(() => {
    const el = map.getContainer();
    el.dataset.chartKinds = kinds;
    el.dataset.chartLook = look;
  }, [map, kinds, look]);
  return (
    <>
      {parts.map(({ part, spec }) => (
        <ChartSources key={`${part}:${JSON.stringify(spec.sources)}`} spec={spec} night={night} sunlight={sunlight} fade={!!imagery} />
      ))}
      {imagery && tileMax != null && spec && (
        <CloseImageryGl
          key={`${imagery.url}:${tileMax}`}
          tiles={imagery}
          tileMaxZoom={tileMax}
          night={night}
          under={spec.sources["chart-under"] ? "chart-under" : "chart"}
        />
      )}
    </>
  );
}

/** One chart's sources and layers, made again (`key`) as its tiles change;
 *  its paint set as the night and the sunlight change, and, with the
 *  imagery under it (`fade`), faded out past its own last zoom. */
function ChartSources({ spec, night, sunlight, fade }: { spec: ChartStyle; night: boolean; sunlight: boolean; fade: boolean }) {
  const { map } = useGlMap();
  useGlLayer("chart", spec.sources, spec.layers);
  // The base and the region's level under it fade by the base's last
  // zoom, the terminal sheet by its own.
  const own = (spec.sources.chart ?? spec.sources["chart-terminal"])?.maxzoom;
  const opacity = fade && own != null ? chartFade(own) : 1;
  useGlPaint(
    spec.layers.map((l) => l.id),
    { ...chartPaint(night, sunlight), "raster-opacity": opacity } as Record<string, unknown>,
  );
  useEffect(() => {
    map.setMaxZoom(fade ? CLOSE_MAX_ZOOM : spec.maxZoom);
  }, [map, spec, fade]);
  useEffect(() => {
    // The frame the chart's first tile is drawn in, for the speed
    // measurements (a canvas is no Largest Contentful Paint candidate, as
    // an image is): `chart-drawn`, once a page.
    const drawn = (e: { sourceId?: string; tile?: unknown }) => {
      if (e.sourceId !== "chart" || !e.tile) return;
      map.off("sourcedata", drawn);
      if (!performance.getEntriesByName("chart-drawn").length) map.once("render", () => performance.mark("chart-drawn"));
    };
    map.on("sourcedata", drawn);
    // The level of the chart's tiles drawn now, on the map's element, for
    // the browser tests: the zoom rounded, as raster tiles are chosen, no
    // further than the chart's own last level.
    const chart = spec.sources.chart;
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
  }, [map, spec]);
  return null;
}
