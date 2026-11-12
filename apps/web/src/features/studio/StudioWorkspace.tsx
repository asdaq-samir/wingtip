import { useEffect, useState } from "react";
import type { WorkspaceProps } from "../shell";
import { loadPilotPanel } from "../pilot";
import { StudioBar } from "./StudioBar";
import { StudioMap } from "./StudioMap";
import { StudioOverlay } from "./StudioOverlay";
import { StudioPanel } from "./StudioPanel";
import { StudioTools } from "./StudioTools";
import { useStudio } from "./useStudio";
import { useStudioHistory } from "./useStudioHistory";

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
 * Beside the replay: the weather, the NTSB's events and the NOTAMs as
 * they were (useStudioHistory, StudioHistory), and the video's parts --
 * keyframes, the radio, captions, the export (features/replay, StudioTools).
 */
export default function StudioWorkspace({ panel, setPanel, children }: WorkspaceProps) {
  const studio = useStudio();
  const history = useStudioHistory(studio.track, studio.registration, studio.utcDay);
  const [pilot, setPilot] = useState<PilotChunk | null>(null);
  useEffect(() => {
    void loadPilotPanel().then(setPilot);
  }, []);
  return children({
    map: (
      <div className="relative h-full w-full">
        <StudioMap track={studio.track} radar={history.radar?.tiles ?? null} />
        {studio.track && <StudioOverlay track={studio.track} ground={studio.ground} />}
      </div>
    ),
    sidebar: (
      <StudioPanel
        studio={studio}
        tools={
          studio.track && (
            <StudioTools
              track={studio.track}
              ground={studio.ground}
              history={history}
              callsign={studio.registration}
              renderDraft={studio.renderDraft}
            />
          )
        }
      />
    ),
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
