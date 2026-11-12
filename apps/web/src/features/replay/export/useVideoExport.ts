import { useEffect, useRef } from "react";
import { imageryForExport, useCloseImageryDrawn } from "../../../lib/map/gl/closeZoom";
import { USGS_CREDIT } from "../../../lib/map/sources/imagery";
import { ExportCancelled } from "../../../lib/replay/frameLoop";
import { usePastFlight } from "../../../lib/replay/clock";
import { useReplayAudio } from "../audio/audioStore";
import { useCaptions } from "../captions/captionStore";
import type { ReplayTrack } from "../track";
import type { OverlayScene } from "./drawOverlay";
import { outputSize, type ExportChoice } from "./exportOptions";
import { useExporting } from "./exportStore";
import { ExportRefused, exportReplay } from "./exportVideo";

/** The sources a video credits, in the order they are drawn: the chart,
 *  the ground, the imagery where it is drawn, the weather where shown,
 *  and the track's own source. */
function creditLine(track: ReplayTrack, extra: string[]): string {
  const imagery = useCloseImageryDrawn.getState().drawn === "usgs" ? [USGS_CREDIT] : [];
  const track_ = track.credit ? [`ADS-B: ${track.credit}`] : [];
  return ["FAA charts", "USGS terrain", ...imagery, ...extra, ...track_].join(" · ");
}

/**
 * A replay's video export, the panel's view model: start one with the
 * choices and the range (the timeline's speed), follow it in the store
 * (useExporting), cancel it, and the file made kept for saving. Google's
 * imagery may not go into a video (the Map Tiles API's terms forbid
 * exporting its content), so each frame asks first (closeZoom's
 * imageryForExport) and the export stops if it comes under the map; the
 * Studio's map draws only the USGS's (ChartGl publicOnly) and leaves out
 * Google's overlay while one runs. `start` answers the file made (its
 * name and object URL) or the problem said, for the render entry
 * (useRenderEntry) as for the panel.
 */
export function useVideoExport() {
  const stop = useRef<AbortController | null>(null);
  useEffect(() => () => stop.current?.abort(), []);
  return {
    start: async (job: {
      track: ReplayTrack;
      choice: ExportChoice;
      range: { start: number; end: number };
      scene: Omit<OverlayScene, "track" | "captions" | "credit" | "disclaimer">;
      credits: string[];
      /** The replay's speed for this video; the timeline's where not given. */
      speed?: number;
    }): Promise<{ made: { name: string; url: string } | null; problem: string | null }> => {
      const { map, made } = useExporting.getState();
      if (!map) return { made: null, problem: "The map isn't ready yet." };
      if (made) URL.revokeObjectURL(made.url);
      stop.current = new AbortController();
      useExporting.setState({ running: true, done: 0, problem: null, made: null });
      const { buffer, sync } = useReplayAudio.getState();
      const captions = useCaptions.getState().captions;
      const credit = creditLine(job.track, job.credits);
      try {
        const file = await exportReplay(
          {
            map,
            range: { ...job.range, speed: job.speed ?? usePastFlight.getState().speed, fps: job.choice.fps },
            size: outputSize(job.choice.resolution, job.choice.aspect),
            choice: job.choice,
            scene: {
              ...job.scene,
              track: job.track,
              captions,
              credit: job.choice.credits ? credit : null,
              disclaimer: job.choice.disclaimer,
            },
            captions,
            audio: buffer && sync ? { buffer, sync } : null,
            allowed: imageryForExport,
            name: job.track.label.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "replay",
          },
          stop.current.signal,
          (done) => useExporting.setState({ done }),
        );
        const kept = { name: file.name, url: URL.createObjectURL(file.blob), bytes: file.blob.size };
        useExporting.setState({ made: kept });
        return { made: kept, problem: null };
      } catch (err) {
        const problem =
          err instanceof ExportCancelled ? null : err instanceof ExportRefused ? err.message : `The video couldn't be made: ${String(err)}`;
        useExporting.setState({ problem });
        return { made: null, problem: problem ?? "The export was cancelled." };
      } finally {
        useExporting.setState({ running: false });
      }
    },
    cancel: () => stop.current?.abort(),
  };
}
