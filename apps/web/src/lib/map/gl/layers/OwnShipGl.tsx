import type { Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { SHEET_SECONDS } from "../../../mapChrome";
import { underway } from "../../position/glide";
import { ownShipHtml } from "../../marks/icons";
import { drawOwnShip, ownShipMarker } from "./ownShipMarker";
import { useOwnShip } from "../../position/ownShip";
import { useGlMap } from "../glLayer";
import { glZoom } from "../glStyle";
import { picked } from "../pilotCamera";

/** The location arrow's close-in, in the app's levels. */
const LOCAL_ZOOM = 9;

/**
 * Own ship as a MapLibre marker: an element the map places in the same
 * frame it draws the chart, so it stays on its point through a pinch, at
 * the GPS's heading on the map (rotationAlignment). Followed only while
 * the pilot's follow is on -- Apple Maps' tracking mode, which the
 * location arrow sets and a drag ends -- the arrow's tap flying to it
 * (recentred), a pick (lib/map/gl/pilotCamera); a drag before the first
 * fix comes lets that flight go too. Grey at its last place when own ship
 * is turned off (the owner, 2026-10-06).
 */
export function OwnShipGl() {
  const { map } = useGlMap();
  const enabled = useOwnShip((s) => s.enabled);
  const fix = useOwnShip((s) => s.fix);
  const simulated = useOwnShip((s) => s.simulated);
  const follow = useOwnShip((s) => s.follow);
  const recentred = useOwnShip((s) => s.recentred);
  const recentreZoom = useOwnShip((s) => s.recentreZoom);
  const marker = useRef<Marker | null>(null);
  // The mark's HTML as last written (drawOwnShip).
  const drawn = useRef("");
  const flown = useRef(recentred);
  // While the arrow's flight in to own ship is under way.
  const landing = useRef(false);
  useEffect(() => {
    marker.current = ownShipMarker();
    const stop = (e: { originalEvent?: Event }) => {
      if (!e.originalEvent) return;
      const ownShip = useOwnShip.getState();
      // Only a drag while following ends it: `follow` is the pilot's kept
      // setting, and a pan at the desk with own ship off left it off for the
      // air (map.spec's "Keep the map on me").
      if (ownShip.follow && ownShip.enabled) ownShip.setFollow(false);
      // A flight to the position still waiting on its fix is let go.
      flown.current = ownShip.recentred;
    };
    map.on("dragstart", stop);
    return () => {
      map.off("dragstart", stop);
      marker.current?.remove();
      marker.current = null;
    };
  }, [map]);
  useEffect(() => {
    const m = marker.current;
    if (!m) return;
    if (!fix) {
      m.remove();
      return;
    }
    // The app's own mark (icons.ts ownShipHtml, with the
    // `data-own-ship` the specs find), turned by the marker to the heading.
    const heading = enabled ? fix.headingDeg : null;
    drawOwnShip(m, drawn, ownShipHtml(heading == null ? null : 0, !enabled, enabled && (simulated || underway(fix))));
    m.setLngLat([fix.lon, fix.lat])
      .setRotation(heading ?? 0)
      .addTo(map);
  }, [map, fix, enabled, simulated]);
  useEffect(() => {
    if (!fix || !enabled) return;
    if (flown.current !== recentred) {
      flown.current = recentred;
      picked();
      const zoom = recentreZoom !== null ? glZoom(recentreZoom) : Math.max(map.getZoom(), glZoom(LOCAL_ZOOM));
      landing.current = true;
      map.flyTo({ center: [fix.lon, fix.lat], zoom, duration: SHEET_SECONDS * 2000 });
      // Ended however it ends: come in, stopped by a drag, or at once
      // under Reduce Motion (then already over here).
      if (!map.isMoving()) landing.current = false;
      else
        map.once("moveend", () => {
          landing.current = false;
        });
      return;
    }
    // Not over the flight in: the next fix's ease, a quarter second on in
    // a dry run, stopped it part way, the map left two levels short of
    // the run's zoom (dry-run.spec, 2026-11-13).
    if (follow && !landing.current) map.easeTo({ center: [fix.lon, fix.lat], duration: 500 });
  }, [map, fix, enabled, follow, recentred, recentreZoom]);
  return null;
}
