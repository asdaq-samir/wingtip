import { Suspense } from "react";
import { fromChunk } from "../../lib/fromChunk";
import type { WorkspaceProps } from "../shell";
import { loadPilotPanel } from "../pilot";
import { StudioBar } from "./StudioBar";
import { StudioMap } from "./StudioMap";
import { StudioOverlay } from "./StudioOverlay";
import { StudioPanel } from "./StudioPanel";
import { StudioTools } from "./StudioTools";
import { useStudio } from "./useStudio";

// The pilot console on its own chunk, drawn straight from it once fetched
// (fromChunk), as the planner's is.
const { Part: PilotPanel } = fromChunk(loadPilotPanel, (m) => m.PilotPanel);

/**
 * The Studio (`/studio`), for replaying real flights -- a reconstruction
 * of an accident among them -- in the 3D view: the same page as Plan's and
 * Dev's (MapPage), the same map, 3D view and engine, and the replay parts
 * all three share (features/replay). It adds no copy of any of them: what
 * it needs that Plan has not had is made there, for Plan to use too. The
 * developer's for now (the owner's pick, 2026-11-12: "You only for now"),
 * offered and guarded as Dev is (use-dev-mode, DevGuard).
 *
 * Beside the replay: the weather, the NTSB's events and the NOTAMs as
 * they were (useStudioHistory, StudioHistory), and the video's parts --
 * keyframes, the radio, captions, the export (features/replay, StudioTools).
 * Its views read one model, useStudio's.
 */
export default function StudioWorkspace({ panel, setPanel, children }: WorkspaceProps) {
  const studio = useStudio();
  return children({
    map: (
      <div className="relative h-full w-full">
        <StudioMap track={studio.track} radar={studio.radar} googleOff={studio.googleOff} />
        {studio.track && studio.profile && <StudioOverlay track={studio.track} profile={studio.profile} />}
      </div>
    ),
    sidebar: <StudioPanel studio={studio} tools={studio.track && <StudioTools studio={studio} track={studio.track} />} />,
    head: null,
    bar: (
      <StudioBar
        title={studio.track?.label ?? "Studio"}
        onUp={() => {
          if (panel === "peek") setPanel("half");
        }}
      />
    ),
    console: (
      <Suspense fallback={<div className="h-40" />}>
        <PilotPanel />
      </Suspense>
    ),
  });
}
