import type { Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { SHEET_SECONDS } from "../../../mapChrome";
import { underway } from "../../position/glide";
import { ownShipHtml } from "../../marks/icons";
import { usePreferences } from "../../../preferences";
import { drawOwnShip, ownShipMarker } from "./ownShipMarker";
import { useOwnShip } from "../../position/ownShip";
import { useGlMap } from "../glLayer";
import { glZoom } from "../glStyle";
import { cameraOf } from "../camera";

/** The location arrow's close-in, in the app's levels. */
const LOCAL_ZOOM = 9;

/**
 * Own ship as a MapLibre marker: an element the map places in the same
 * frame it draws the chart, so it stays on its point through a pinch, at
 * the GPS's heading on the map (rotationAlignment). Followed only while
 * the pilot's follow is on -- Apple Maps' tracking mode, which the
 * location arrow sets and a drag or a pick ends (the camera's owner,
 * lib/map/gl/camera) -- the arrow's tap bringing the map to it
 * (recentred), a pick; a drag before the first fix comes lets that go
 * too. Each fix is a step of the owner's follow, one linear ease lasting
 * till the next fix, so the dry run's four fixes a second move the map at
 * one steady pace rather than starting and stopping at each (the flicker
 * audit's FL-13). Grey at its last place when own ship is turned off (the
 * owner, 2026-10-06).
 */
export function OwnShipGl() {
  const { map } = useGlMap();
  // How it is drawn, the Map card's Own Ship (lib/map/position/ownShipLook).
  const look = usePreferences((s) => s.ownShipLook);
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
  useEffect(() => {
    marker.current = ownShipMarker();
    // A drag ends the follow (the camera's owner), and a flight to the
    // position still waiting on its fix is let go.
    const stop = (e: { originalEvent?: Event }) => {
      if (e.originalEvent) flown.current = useOwnShip.getState().recentred;
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
    drawOwnShip(m, drawn, ownShipHtml(heading == null ? null : 0, !enabled, look, enabled && (simulated || underway(fix))));
    m.setLngLat([fix.lon, fix.lat])
      .setRotation(heading ?? 0)
      .addTo(map);
  }, [map, fix, enabled, simulated, look]);
  useEffect(() => {
    if (!fix || !enabled) return;
    const camera = cameraOf(map);
    const intent = simulated ? "dry-run" : "own-ship";
    if (flown.current !== recentred) {
      flown.current = recentred;
      const zoom = recentreZoom !== null ? glZoom(recentreZoom) : Math.max(map.getZoom(), glZoom(LOCAL_ZOOM));
      camera.pick([fix.lon, fix.lat], { zoom, duration: SHEET_SECONDS * 2000, keeps: intent });
      return;
    }
    // Not over the arrow's move in: the owner lets the follow's steps go
    // by while a pick has the camera, as the next fix's ease, a quarter
    // second on in a dry run, stopped it part way, the map left two
    // levels short of the run's zoom (dry-run.spec, 2026-11-13).
    if (follow) camera.follow(intent, [fix.lon, fix.lat]);
  }, [map, fix, enabled, simulated, follow, recentred, recentreZoom]);
  return null;
}
