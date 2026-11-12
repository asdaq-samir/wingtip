import { useQuery } from "@tanstack/react-query";
import type { RasterLayerSpecification } from "maplibre-gl";
import { useEffect, useState } from "react";
import { googleMapsQuery } from "../../../queryClient";
import { usePreferences, type OverlayStrength } from "../../../preferences";
import { googleReferrer, googleTiles, useGoogleSession } from "../../sources/googleSession";
import { USGS_URL } from "../../sources/imagery";
import { useShownOverlay } from "../../sources/useShownOverlay";
import { useGlLayer, useGlMap, useGlPaint, type Slot } from "../glLayer";
import { glZoom } from "../glStyle";
import { MapCredits } from "../MapCredits";
import { useGoogleAttribution } from "../googleCredit";
import { useMapCredit } from "../creditStore";

/** OverlayTiles': how strongly the imagery covers the chart. */
const OPACITY: Record<OverlayStrength, number> = { faint: 0.35, half: 0.6, full: 1 };

/** A raster layer of someone else's tiles, in a slot. */
function useTiles(id: string, slot: Slot, url: string, maxzoom: number, paint: RasterLayerSpecification["paint"] = {}, minzoom = 0) {
  const source = { [id]: { type: "raster" as const, tiles: [url], tileSize: 256, maxzoom } };
  useGlLayer(slot, source, [{ id, type: "raster", source: id, minzoom, paint: { "raster-fade-duration": 0, ...paint } }]);
}

/** Which imagery is over the chart and how strongly, on the map's element
 *  (data-imagery), for the browser tests. */
function useImageryShown(kind: string, opacity: number | null) {
  const { map } = useGlMap();
  useEffect(() => {
    if (opacity == null) return;
    const el = map.getContainer();
    el.dataset.imagery = `${kind} ${opacity}`;
    return () => {
      delete el.dataset.imagery;
    };
  }, [map, kind, opacity]);
}

/** At the latest, the land and water asked for this long after the map is
 *  made, should the chart's tiles not come (no signal, the planner down). */
const LAND_WATER_LATEST_MS = 4000;

/** Land and water under the charts where they end (LandWaterTiles): the
 *  USGS's hydrography to zoom 9, enlarged past it. Asked for only once the
 *  chart's first tile has drawn, or the map has first come to rest: on a
 *  phone's first load its tiles, from a slower server, shared the
 *  connection with the chart's, and the page's first paint waited for
 *  both (nightly Lighthouse, 2026-11-07: Largest Contentful Paint 12.5 s,
 *  a land-and-water tile). Drawn the same once it is in. */
export function LandWaterGl() {
  const chartFirst = useChartDrawnFirst();
  return chartFirst ? <LandWater /> : null;
}

function LandWater() {
  useTiles("land-water", "base", "https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer/tile/{z}/{y}/{x}", 9);
  return null;
}

/** Whether the chart's first tile has drawn, or the map has been idle
 *  once, or LAND_WATER_LATEST_MS have passed. */
function useChartDrawnFirst(): boolean {
  const { map } = useGlMap();
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (drawn) return;
    const done = () => setDrawn(true);
    const tile = (e: { sourceId?: string; tile?: unknown }) => {
      if (e.tile && (e.sourceId === "chart" || e.sourceId === "chart-under")) done();
    };
    map.on("sourcedata", tile);
    map.once("idle", done);
    const latest = window.setTimeout(done, LAND_WATER_LATEST_MS);
    return () => {
      map.off("sourcedata", tile);
      map.off("idle", done);
      window.clearTimeout(latest);
    };
  }, [map, drawn]);
  return drawn;
}

/** What is drawn over the chart at the pilot's ask (OverlayTiles): the
 *  USGS's imagery or Google's map or satellite, at the strength picked. */
export function OverlayGl() {
  const overlay = useShownOverlay();
  const strength = usePreferences((s) => s.overlayStrength);
  // What the sources say of themselves, for Status (MapCredits), with the
  // imagery whose words are most of it.
  const drawn =
    overlay === "none" ? null : overlay === "usgs" ? (
      <Usgs opacity={OPACITY[strength]} />
    ) : (
      <Google key={overlay} kind={overlay === "google-map" ? "map" : "satellite"} opacity={OPACITY[strength]} />
    );
  return (
    <>
      <MapCredits />
      {drawn}
    </>
  );
}

function Usgs({ opacity }: { opacity: number }) {
  useTiles("overlay-usgs", "imagery", USGS_URL, 16);
  useGlPaint(["overlay-usgs"], { "raster-opacity": opacity });
  useImageryShown("usgs", opacity);
  useMapCredit("imagery", "Imagery USGS The National Map");
  return null;
}

function Google({ kind, opacity }: { kind: "map" | "satellite"; opacity: number }) {
  const { map } = useGlMap();
  const { data: google } = useQuery(googleMapsQuery);
  const { data: session } = useGoogleSession(kind);
  // Its tiles with the site's origin as their Referer, which the key's
  // restriction is checked against (googleReferrer); every other request
  // the map makes is passed through as it was.
  useEffect(() => {
    map.setTransformRequest(googleReferrer);
  }, [map]);
  useGoogleAttribution(session?.session ?? null, google?.key ?? null);
  if (!google || !session) return null;
  return <OverlayTiles url={googleTiles(session.session, google.key)} max={kind === "map" ? 22 : 20} opacity={opacity} />;
}

function OverlayTiles({ url, max, opacity }: { url: string; max: number; opacity: number }) {
  useTiles("overlay-google", "imagery", url, max, {}, glZoom(3));
  useGlPaint(["overlay-google"], { "raster-opacity": opacity });
  useImageryShown("google", opacity);
  return null;
}
