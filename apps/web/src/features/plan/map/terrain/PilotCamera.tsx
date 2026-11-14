import type { ColorReliefLayerSpecification } from "maplibre-gl";
import { useEffect } from "react";
import { useOwnShip } from "../../../../lib/map/position/ownShip";
import { positionAt, usePastFlight } from "../pastFlight";
import { slotId, useGlMap } from "../../../../lib/map/gl/glLayer";
import { DEM, SV_TINT } from "./dem";
import { M_PER_FT } from "../../../../lib/geo";
import { svColours } from "./svColours";

/** The look down from the pilot's seat, degrees from straight down: the
 *  ground ahead and the horizon in one view. */
const PILOT_PITCH = 72;
/** How close in the camera may come: its height, not the chart, sets it. */
const PILOT_MAX_ZOOM = 18;
/** The least the camera stands over the ground, m: on the runway, a
 *  little over it, never under. */
const OVER_GROUND_M = 15;

/**
 * The dry run seen from the pilot's seat: the camera at the airplane's
 * planned altitude over where it is, looking down its track, moved as the
 * run goes; and the ground coloured from that altitude (svColours): amber
 * within the engine's band below the airplane, red at and above it. A
 * view of the plan, not terrain clearance -- the dry run's card says so
 * beside its key (DryRunControls).
 */
export default function PilotCamera() {
  const { map } = useGlMap();
  useEffect(() => {
    const tint: ColorReliefLayerSpecification = {
      id: SV_TINT,
      type: "color-relief",
      source: DEM,
      paint: { "color-relief-opacity": 0.55, "color-relief-color": svColours(0) },
    };
    if (!map.getLayer(SV_TINT)) map.addLayer(tint, slotId("imagery"));
    // The camera is the run's now: own ship's following let go, and the
    // map let in as close as the camera's height asks.
    const wasFollow = useOwnShip.getState().follow;
    useOwnShip.getState().setFollow(false);
    const maxZoom = map.getMaxZoom();
    map.setMaxZoom(PILOT_MAX_ZOOM);
    const el = map.getContainer();
    el.dataset.pilotView = "";
    let frame = 0,
      shownAt: number | null = null,
      tintFt: number | null = null;
    const step = () => {
      frame = requestAnimationFrame(step);
      const { at, points } = usePastFlight.getState();
      if (at === null || at === shownAt) return;
      const here = positionAt(points, at);
      if (!here) return;
      shownAt = at;
      const altFt = here.alt_ft ?? 0;
      const ground = map.queryTerrainElevation([here.lon, here.lat]) ?? 0;
      const altM = Math.max(altFt * M_PER_FT, ground + OVER_GROUND_M);
      map.jumpTo(
        map.calculateCameraOptionsFromCameraLngLatAltRotation([here.lon, here.lat], altM, here.track_deg ?? map.getBearing(), PILOT_PITCH),
      );
      // The colours again at each 50 ft of climb or descent, not each frame.
      const rounded = Math.round(altFt / 50) * 50;
      if (rounded !== tintFt && map.getLayer(SV_TINT)) {
        tintFt = rounded;
        map.setPaintProperty(SV_TINT, "color-relief-color", svColours(rounded));
        el.dataset.pilotAltFt = String(rounded);
      }
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      delete el.dataset.pilotView;
      delete el.dataset.pilotAltFt;
      if (!map.style) return;
      if (map.getLayer(SV_TINT)) map.removeLayer(SV_TINT);
      map.setMaxZoom(maxZoom);
      // Followed again as the dry run goes on, seen from above.
      if (useOwnShip.getState().simulated) useOwnShip.getState().setFollow(true);
      else useOwnShip.getState().setFollow(wasFollow);
    };
  }, [map]);
  return null;
}
