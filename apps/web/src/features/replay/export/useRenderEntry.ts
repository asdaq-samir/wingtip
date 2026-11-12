import { useEffect } from "react";
import { STUDIO_SPEEDS } from "../useReplay";
import type { ReplayTrack } from "../track";
import { RENDER_PRESETS, type ExportChoice } from "./exportOptions";
import { useExporting } from "./exportStore";

/** The longest a draft's film is let run at the slowest speed that fits
 *  it, s: a few minutes a viewer watches through, the film's own choice. */
const DRAFT_FILM_MOST_S = 180;

/** The slowest of the Studio's speeds at which `seconds` of flight fits in
 *  DRAFT_FILM_MOST_S; the fastest where none does. */
export function draftSpeed(seconds: number): number {
  return STUDIO_SPEEDS.find((x) => seconds / x <= DRAFT_FILM_MOST_S) ?? STUDIO_SPEEDS.at(-1)!;
}

declare global {
  interface Window {
    /** scripts/dev/studio-render.mjs films a crash draft through the page
     *  (docs/STUDIO-PIPELINE.md): set only at `?draft=<id>&render=1`, for
     *  that draft, once its track and the map are ready. */
    __studioExport?: (ask: { draftId: string; preset: string }) => Promise<{ filename: string }>;
  }
}

type Start = (job: {
  track: ReplayTrack;
  choice: ExportChoice;
  range: { start: number; end: number };
  credits: string[];
  speed?: number;
}) => Promise<{ made: { name: string; url: string } | null; problem: string | null }>;

/**
 * The render's entry into the export (window.__studioExport), for the
 * crash pipeline's film of a draft, the developer's only: the Studio sets
 * `render` to the open draft's id only at `?render=1` (useStudio), and
 * the Studio is the developer's page (DevGuard). It makes the preset's
 * video of the whole track, its gaps included, with the export the panel
 * uses (useVideoExport: MapLibre's clock frozen frame by frame, mediabunny
 * encoding), at the slowest speed that keeps it to DRAFT_FILM_MOST_S; then
 * hands the file to the browser as a download and resolves its name, which
 * the script saves once the browser has it. It rejects with the reason
 * where the draft is not the one open, the preset is not known, an export
 * runs already, or the video could not be made.
 */
export function useRenderEntry(render: { draftId: string } | null, track: ReplayTrack, start: Start, credits: string[]) {
  const map = useExporting((s) => s.map);
  useEffect(() => {
    if (!render || !map) return;
    window.__studioExport = async ({ draftId, preset }) => {
      if (draftId !== render.draftId) throw new Error(`The Studio has draft ${render.draftId} open, not ${draftId}.`);
      const choice = RENDER_PRESETS[preset];
      if (!choice) throw new Error(`No preset "${preset}": ${Object.keys(RENDER_PRESETS).join(", ")}.`);
      if (useExporting.getState().running) throw new Error("An export is running already.");
      if (!map.isStyleLoaded()) await map.once("idle");
      const first = track.points[0]?.t ?? 0;
      const last = track.points.at(-1)?.t ?? first;
      if (last <= first) throw new Error("The draft's track has no span to film.");
      const { made, problem } = await start({
        track,
        choice,
        range: { start: first, end: last },
        credits,
        speed: draftSpeed(last - first),
      });
      if (!made) throw new Error(problem ?? "The video couldn't be made.");
      const link = document.createElement("a");
      link.href = made.url;
      link.download = made.name;
      document.body.append(link);
      link.click();
      link.remove();
      return { filename: made.name };
    };
    return () => {
      delete window.__studioExport;
    };
  }, [render, map, track, start, credits]);
}
