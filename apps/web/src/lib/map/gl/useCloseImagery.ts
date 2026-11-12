import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { googleMapsQuery } from "../../queryClient";
import { googleReferrer, googleTiles, useGoogleSession } from "../sources/googleSession";
import { USGS_COVER_ZOOM, USGS_CREDIT, USGS_MAX_ZOOM, USGS_URL } from "../sources/imagery";
import { useShownOverlay } from "../sources/useShownOverlay";
import { useGlMap } from "./glLayer";
import { useGlView } from "./useGlView";
import { useGoogleAttribution } from "./googleCredit";
import { useMapCredit } from "./creditStore";
import { useCloseImageryDrawn, type CloseImagery } from "./closeZoom";

/** The imagery close in, as its tiles' address, their last level and whose. */
export interface CloseTiles {
  url: string;
  maxzoom: number;
  kind: CloseImagery;
}

/** Google's satellite tiles go to their {z} 20 over the United States. */
const GOOGLE_MAX_ZOOM = 20;

/**
 * The imagery close in, under the chart (closeZoom), or null: asked for
 * only once the map is a level short of the chart's own last zoom
 * (`tileMaxZoom`), so no tile is fetched further out. The USGS's
 * public-domain imagery (sources/imagery) by default, which costs nothing,
 * needs no key and may go into Studio's videos (the owner, 2026-11-12).
 * Google's satellite imagery only where the pilot picked Google's overlay
 * in the Map menu and the deployment has a key, and never where the map is
 * for export (`publicOnly`): its Map Tiles API, the satellite map type
 * without the roads layer (docs/GOOGLE-MAPS.md), credited "Google Maps"
 * with the copyright for the view while in use, as its policies ask
 * (googleCredit). Null too where the USGS has no imagery under the middle
 * of the view (Canada, the Bahamas, the sea) or it cannot be reached, as
 * offline: the chart stays, enlarged, as before.
 */
export function useCloseImagery(tileMaxZoom: number | null, publicOnly = false): CloseTiles | null {
  const { map } = useGlMap();
  const { level } = useGlView();
  const near = tileMaxZoom != null && level >= tileMaxZoom - 1;
  const overlay = useShownOverlay();
  const { data: google } = useQuery(googleMapsQuery);
  const wantsGoogle = !publicOnly && overlay.startsWith("google") && !!google;
  const { data: session } = useGoogleSession("imagery", near && wantsGoogle);
  const live = near && wantsGoogle && google && session ? session.session : null;
  useEffect(() => {
    if (live) map.setTransformRequest(googleReferrer);
  }, [map, live]);
  useGoogleAttribution(live, google?.key ?? null);
  const covered = useImageryCovers(near && !wantsGoogle);
  const tiles: CloseTiles | null =
    live && google
      ? { url: googleTiles(live, google.key), maxzoom: GOOGLE_MAX_ZOOM, kind: "google" }
      : near && !wantsGoogle && covered
        ? { url: USGS_URL, maxzoom: USGS_MAX_ZOOM, kind: "usgs" }
        : null;
  useMapCredit("close-imagery", tiles?.kind === "usgs" ? USGS_CREDIT : null);
  const kind = tiles?.kind ?? null;
  useEffect(() => {
    useCloseImageryDrawn.setState({ drawn: kind });
    return () => useCloseImageryDrawn.setState({ drawn: null });
  }, [kind]);
  return tiles;
}

/** The USGS tile at USGS_COVER_ZOOM under the middle of the view, z/y/x,
 *  as the map comes to rest. */
function useMiddleTile(on: boolean): string | null {
  const { map } = useGlMap();
  const [tile, setTile] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    const look = () => {
      const { lng, lat } = map.getCenter();
      const n = 2 ** USGS_COVER_ZOOM;
      const x = Math.floor(((lng + 180) / 360) * n);
      const y = Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
      setTile(`${USGS_COVER_ZOOM}/${y}/${x}`);
    };
    look();
    map.on("moveend", look);
    return () => {
      map.off("moveend", look);
    };
  }, [map, on]);
  return on ? tile : null;
}

/**
 * Whether the USGS has imagery under the middle of the view: its one tile
 * there, asked for as the map rests, is there (200) or not (404). MapLibre
 * draws a missing raster tile as nothing and says nothing of it, so the
 * chart would fade over bare land; asked once a tile, kept, and the
 * browser's cache answers MapLibre's own request for it. Taken as there
 * while the answer comes, and as not where it cannot be asked (offline).
 */
function useImageryCovers(on: boolean): boolean {
  const tile = useMiddleTile(on);
  const { data, isError } = useQuery({
    queryKey: ["usgsImageryCovers", tile],
    queryFn: async ({ signal }) => (await fetch(USGS_URL.replace("{z}/{y}/{x}", tile!), { signal })).ok,
    enabled: !!tile,
    staleTime: Infinity,
    retry: false,
    placeholderData: (was) => was,
    meta: { silent: true },
  });
  return !isError && data !== false;
}
