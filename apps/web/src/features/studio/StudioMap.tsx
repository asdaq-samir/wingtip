import { lazy, Suspense } from "react";
import GlMapShell from "../../components/map/GlMapShell";
import { AirspaceGl } from "../../components/map/layers/AirspaceGl";
import { LandWaterGl, OverlayGl } from "../../lib/map/gl/layers/BaseGl";
import { ChartGl } from "../../lib/map/gl/layers/ChartGl";
import { RadarFrameGl } from "../weather-loop";
import { loadReplayLayers, loadTerrainGl } from "../plan";
import { ExportMapGl, type ReplayTrack } from "../replay";

// The one 3D view (features/plan/map/terrain), Plan's and Dev's, and the
// replayed track's layers: each its own chunk, as on the planner's map.
const TerrainGl = lazy(loadTerrainGl);
const ReplayTrackGl = lazy(loadReplayLayers);

/**
 * The Studio's map: the planner's own (GlMapShell), the chart and the
 * airspace on it, the track drawn and the replay's airplane flown along
 * it (ReplayTrackGl), and the 3D ground stood up under it with the
 * replay's camera on it (TerrainGl, features/replay/camera) -- the same 3D
 * view as Plan's; the radar mosaic at the replay's moment (`radar`, the
 * loop's own layer); and the map handed to a video's export (ExportMapGl).
 * `googleOff`: the model's word that Google's overlay is left off while a
 * video is rendered (useStudio).
 */
export function StudioMap({ track, radar, googleOff }: { track: ReplayTrack | null; radar: string | null; googleOff: boolean }) {
  return (
    <GlMapShell course={null} focus={null} focusZoom={12} place={null}>
      <LandWaterGl />
      <ChartGl course={null} publicOnly />
      {!googleOff && <OverlayGl />}
      {radar && <RadarFrameGl key={radar} url={radar} />}
      <AirspaceGl />
      <ExportMapGl />
      <Suspense fallback={null}>
        <TerrainGl mode="3d" pilot={false} aloft={null} />
        {track && <ReplayTrackGl id={track.id} points={track.points} />}
      </Suspense>
    </GlMapShell>
  );
}
