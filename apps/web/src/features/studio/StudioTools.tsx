import { lazy, Suspense, type ReactNode } from "react";
import SectionTitle from "../../components/SectionTitle";
import { loadStudioParts, sampleAt, type ReplayTrack } from "../replay";
import { NotamsThen, NtsbEvents, WeatherThen } from "./StudioHistory";
import type { StudioHistory } from "./useStudioHistory";

// The replay's Studio parts, with wavesurfer.js, on their own chunk.
const KeyframesPanel = lazy(() => loadStudioParts().then((m) => ({ default: m.KeyframesPanel })));
const RadioTrack = lazy(() => loadStudioParts().then((m) => ({ default: m.RadioTrack })));
const CaptionsPanel = lazy(() => loadStudioParts().then((m) => ({ default: m.CaptionsPanel })));
const ExportPanel = lazy(() => loadStudioParts().then((m) => ({ default: m.ExportPanel })));

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

/**
 * The Studio's sheet under a loaded track: what was so at the replay's
 * moment (the weather, the NTSB's events, the NOTAMs and TFRs), then
 * what makes a video of it -- the camera's keyframes, the radio and its
 * captions, and the export -- the replay's own parts (features/replay),
 * which Plan and Dev can take up too.
 */
export function StudioTools({
  track,
  ground,
  history,
  callsign,
}: {
  track: ReplayTrack;
  ground: { along_nm: number; ground_ft: number }[];
  history: StudioHistory;
  callsign: string | null;
}) {
  // The METARs credited in a video where any are drawn, the radar where shown.
  const credits = [
    history.radar ? "Radar: NWS NEXRAD via Iowa Environmental Mesonet" : null,
    history.metars.length ? "METARs: Iowa Environmental Mesonet" : null,
  ].filter((c): c is string => !!c);
  const scene = { ground, metar: (t: number) => history.metarNear(t, sampleAt(track.points, t)) };
  return (
    <>
      <Section title="Weather then">
        <WeatherThen history={history} />
      </Section>
      <Section title="NTSB">
        <NtsbEvents history={history} />
      </Section>
      <Section title="NOTAMs and TFRs then">
        <NotamsThen history={history} />
      </Section>
      <Suspense fallback={null}>
        <Section title="Camera keyframes">
          <KeyframesPanel />
        </Section>
        <Section title="Radio">
          <RadioTrack />
        </Section>
        <Section title="Captions">
          <CaptionsPanel callsign={callsign} />
        </Section>
        <Section title="Video" testId="studio-video">
          <ExportPanel key={track.id} track={track} scene={scene} credits={credits} />
        </Section>
      </Suspense>
    </>
  );
}
