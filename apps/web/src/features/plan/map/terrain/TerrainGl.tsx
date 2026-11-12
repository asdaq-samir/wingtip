import { useEffect, useState } from "react";
import { slotId, useGlMap } from "../../../../lib/map/gl/glLayer";
import AirspaceVolumesGl from "./AirspaceVolumesGl";
import AloftGl from "./AloftGl";
import ApproachGl from "./ApproachGl";
import type { ProcedureDrawing } from "../../../../lib/api/types";
import ClearanceGl from "./ClearanceGl";
import { MAP } from "../../../../lib/tokens";
import { DEM, EXAGGERATION, HILLSHADE, HILLSHADE_LAYER, SV_TINT, demSource } from "./dem";
import type { AloftPoint } from "./geometry";
import ObstaclesGl from "./ObstaclesGl";
import PilotCamera from "./PilotCamera";
import SkyGl from "./SkyGl";
import TrafficAloftGl from "./TrafficAloftGl";
import { ReplayCameraGl } from "../../../replay";
import type { TerrainMode } from "./useTerrainView";

/** How long the map takes to tilt into 3D and back (MapLibre makes it
 *  instant under Reduce Motion itself). */
const TILT_MS = 600;

/**
 * The ground under the chart (the Map menu's Terrain; useTerrainView): its
 * relief shaded over the chart, or stood up in 3D -- the map tilted with
 * two fingers up to 75 degrees, the FAA's obstacles stood up over the
 * ground (ObstaclesGl), and the route drawn at its planned altitudes with
 * a curtain down to its ground track (AloftGl), under a sky with the
 * distance hazed (SkyGl); the way in to the route's destination or the
 * field whose card is open (ApproachGl), the traffic at its heights
 * (TrafficAloftGl) -- and, in the dry run, the pilot's-eye view
 * (PilotCamera). The satellite imagery close in (lib/map/gl's
 * CloseImageryGl) is a raster layer of the chart's slot, so the 3D ground
 * drapes it as it does the chart, at the same zooms as in 2D. The 3D module's entry, loaded on its own
 * (GlRouteMap's lazy import): none of it is in the map's first script.
 */
export default function TerrainGl({
  mode,
  pilot,
  aloft,
  field = null,
  procedures = [],
}: {
  mode: Exclude<TerrainMode, "flat">;
  pilot: boolean;
  aloft: AloftPoint[] | null;
  /** The field whose way in is drawn: the open card's, else the route's
   *  destination. */
  field?: string | null;
  /** The procedures picked for the route, its approach among them. */
  procedures?: ProcedureDrawing[];
}) {
  const { map } = useGlMap();
  const [ready, setReady] = useState(false);
  // The terrain tiles and their relief, over the chart, under the areas.
  useEffect(() => {
    if (!map.getSource(DEM)) map.addSource(DEM, demSource(window.location.origin));
    if (!map.getLayer(HILLSHADE)) map.addLayer(HILLSHADE_LAYER, slotId("imagery"));
    // What stands on the tiles (the 3D ground, PilotCamera's colours) only
    // once they are there: the children's effects run before this one's.
    let live = true;
    queueMicrotask(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
      setReady(false);
      if (!map.style) return;
      // The 3D ground let go before the tiles it stands on.
      if (map.getTerrain()) map.setTerrain(null);
      for (const id of [SV_TINT, HILLSHADE]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(DEM)) map.removeSource(DEM);
    };
  }, [map]);
  // In 3D: the ground stood up, the map free to tilt and turn; flat and
  // north up again after.
  const raised = ready && mode === "3d";
  useEffect(() => {
    if (!raised) return;
    const el = map.getContainer();
    map.setTerrain({ source: DEM, exaggeration: EXAGGERATION });
    map.setMaxPitch(MAP.pitchMax);
    map.dragRotate.enable();
    map.touchPitch.enable();
    map.touchZoomRotate.enableRotation();
    el.dataset.terrain = "3d";
    if (map.getPitch() < 1) map.easeTo({ pitch: MAP.pitchOpen, duration: TILT_MS });
    return () => {
      delete el.dataset.terrain;
      if (!map.style) return;
      if (map.getTerrain()) map.setTerrain(null);
      map.dragRotate.disable();
      map.touchPitch.disable();
      map.touchZoomRotate.disableRotation();
      map.easeTo({ pitch: 0, bearing: 0, duration: TILT_MS });
      map.setMaxPitch(MAP.pitchFlatMax);
    };
  }, [map, raised]);
  if (!raised) return null;
  return (
    <>
      <SkyGl />
      <ObstaclesGl />
      <AirspaceVolumesGl />
      {aloft && aloft.length > 1 && <AloftGl points={aloft} />}
      {aloft && aloft.length > 1 && !pilot && <ClearanceGl points={aloft} />}
      {field && <ApproachGl key={field} ident={field} picked={procedures} />}
      <TrafficAloftGl />
      {pilot && <PilotCamera />}
      {/* A replay's camera (features/replay), the pilot's view taking it while on. */}
      {!pilot && <ReplayCameraGl />}
    </>
  );
}
