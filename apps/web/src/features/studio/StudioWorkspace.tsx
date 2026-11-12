import { useEffect, useState } from "react";
import type { WorkspaceProps } from "../shell";
import { loadPilotPanel } from "../pilot";
import { StudioBar } from "./StudioBar";
import { StudioMap } from "./StudioMap";
import { StudioOverlay } from "./StudioOverlay";
import { StudioPanel } from "./StudioPanel";
import { useStudio } from "./useStudio";

type PilotChunk = Awaited<ReturnType<typeof loadPilotPanel>>;

/**
 * The Studio (`/studio`), for replaying real flights -- a reconstruction
 * of an accident among them -- in the 3D view: the same page as Plan's and
 * Dev's (MapPage), the same map, 3D view and engine, and the replay parts
 * all three share (features/replay). It adds no copy of any of them: what
 * it needs that Plan has not had is made there, for Plan to use too. The
 * developer's for now (the owner's pick, 2026-11-12: "You only for now"),
 * offered and guarded as Dev is (use-dev-mode, DevGuard).
 *
 * Seams left for what comes next, each a place in features/replay or here:
 * - video export: a recorder over the map's canvas and the overlay, driven
 *   by the replay clock's own steps (usePastFlight) rather than the
 *   screen's frames, so a frame is never dropped;
 * - radio and captions: LiveATC's archive or the NTSB docket's transcript
 *   on the same clock, a track beside the timeline (ReplayTimeline's
 *   children);
 * - the weather and NOTAMs as they were: the weather store's frames for
 *   the track's hours (features/weather-flow's timeline, asked by time);
 * - NTSB links: the docket by registration and day (StudioPanel);
 * - keyframes: camera picks at moments, a list in the camera store
 *   (features/replay/camera) the camera reads by the clock.
 */
export default function StudioWorkspace({ panel, setPanel, children }: WorkspaceProps) {
  const studio = useStudio();
  const [pilot, setPilot] = useState<PilotChunk | null>(null);
  useEffect(() => {
    void loadPilotPanel().then(setPilot);
  }, []);
  return children({
    map: (
      <div className="relative h-full w-full">
        <StudioMap track={studio.track} />
        {studio.track && <StudioOverlay track={studio.track} ground={studio.ground} />}
      </div>
    ),
    sidebar: <StudioPanel studio={studio} />,
    head: null,
    bar: (
      <StudioBar
        title={studio.track?.label ?? "Studio"}
        onUp={() => {
          if (panel === "peek") setPanel("half");
        }}
      />
    ),
    console: pilot ? <pilot.PilotPanel /> : <div className="h-40" />,
  });
}
