import { useState } from "react";
import { Download, Film } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { Button, buttonVariants } from "../../../components/ui/button";
import { FieldError } from "../../../components/ui/field";
import { Progress } from "../../../components/ui/progress";
import { Slider } from "../../../components/ui/slider";
import { Switch } from "../../../components/ui/switch";
import Segmented from "../../../components/Segmented";
import { TEXT } from "../../../lib/text";
import { usePastFlight } from "../../../lib/replay/clock";
import { frameCount } from "../../../lib/replay/frameLoop";
import { useReplayAudio } from "../audio/audioStore";
import { replayTimes } from "../replayTime";
import type { ReplayTrack } from "../track";
import { speedName } from "../useReplay";
import type { OverlayScene } from "./drawOverlay";
import { DEFAULT_CHOICE, outputSize, type ExportChoice } from "./exportOptions";
import { useExporting } from "./exportStore";
import { useRenderEntry } from "./useRenderEntry";
import { useVideoExport } from "./useVideoExport";

/** A segmented control of a few choices (decision 0017: menus or
 *  segmented controls, not sliders, for a discrete setting): the app's one
 *  Segmented across the column, its numbers carried as words. This panel
 *  had its own copy on the same ToggleGroup, a look of its own (CODE-39). */
function Choice<T extends string | number>({
  label,
  value,
  choices,
  onPick,
}: {
  label: string;
  value: T;
  choices: { value: T; label: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <Segmented
      label={label}
      value={String(value)}
      options={choices.map((c) => ({ value: String(c.value), label: c.label }))}
      onChange={(v) => {
        const picked = choices.find((c) => String(c.value) === v);
        if (picked) onPick(picked.value);
      }}
      className="w-full [&>*]:flex-1"
    />
  );
}

/**
 * A replay's video, made here (useVideoExport): the picture's size and
 * shape, its frame rate, the range of the timeline (dragged, or its ends
 * set from the replay's moment) at the timeline's speed, one finished video or the layers apart for an editor, the
 * credits and the reconstruction's disclaimer burned in (on unless
 * switched off), and the progress with a Cancel while it renders. Says
 * what is left out: Google's imagery, which its terms keep out of any
 * export, and the radio at any speed but 1x. With `render` (a crash
 * draft's film, at ?render=1), the same export is open to the render
 * script by a preset's name (useRenderEntry).
 */
export function ExportPanel({
  track,
  scene,
  credits,
  render = null,
}: {
  track: ReplayTrack;
  scene: Omit<OverlayScene, "track" | "captions" | "credit" | "disclaimer">;
  credits: string[];
  render?: { draftId: string } | null;
}) {
  const [choice, setChoice] = useState<ExportChoice>(DEFAULT_CHOICE);
  const pick = (change: Partial<ExportChoice>) => setChoice((c) => ({ ...c, ...change }));
  const first = track.points[0]?.t ?? 0,
    last = track.points.at(-1)?.t ?? first;
  const [range, setRange] = useState<[number, number]>([first, last]);
  const [from, to] = [Math.max(first, range[0]), Math.min(last, range[1])];
  const speed = usePastFlight((s) => s.speed);
  // The replay's moment, for the range's ends set from where it is.
  const at = usePastFlight((s) => (s.at === null ? null : Math.round(s.at)));
  const hasAudio = useReplayAudio((s) => !!s.buffer && !!s.sync);
  const { running, done, problem, made } = useExporting();
  const video = useVideoExport();
  useRenderEntry(render, track, (job) => video.start({ ...job, scene }), credits);
  const size = outputSize(choice.resolution, choice.aspect);
  const frames = frameCount({ start: from, end: to, speed, fps: choice.fps });
  const seconds = Math.round(frames / choice.fps);
  return (
    <div className="flex flex-col gap-4" data-testid="studio-export">
      <Choice
        label="Size"
        value={choice.resolution}
        choices={[
          { value: "1080p", label: "1080p" },
          { value: "4k", label: "4K" },
        ]}
        onPick={(resolution) => pick({ resolution })}
      />
      <Choice
        label="Shape"
        value={choice.aspect}
        choices={[
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
          { value: "1:1", label: "1:1" },
        ]}
        onPick={(aspect) => pick({ aspect })}
      />
      <Choice
        label="Frame rate"
        value={choice.fps}
        choices={[
          { value: 30, label: "30 fps" },
          { value: 60, label: "60 fps" },
        ]}
        onPick={(fps) => pick({ fps })}
      />
      <Choice
        label="What to make"
        value={choice.kind}
        choices={[
          { value: "finished", label: "Finished video" },
          { value: "layers", label: "Layers for editing" },
        ]}
        onPick={(kind) => pick({ kind })}
      />
      {choice.kind === "layers" && (
        <Choice
          label="Overlays as"
          value={choice.overlayAs}
          choices={[
            { value: "webm", label: "WebM with alpha" },
            { value: "png", label: "PNG frames" },
          ]}
          onPick={(overlayAs) => pick({ overlayAs })}
        />
      )}
      <div className="flex flex-col gap-1.5">
        <Slider
          min={first}
          max={last}
          step={1}
          largeStep={60}
          value={[from, to]}
          onValueChange={(v) => Array.isArray(v) && v.length === 2 && setRange([v[0]!, v[1]!])}
          thumb={{ className: "relative after:absolute after:-inset-3.5 after:content-['']" }}
          aria-label="Range to export"
          data-testid="studio-export-range"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={at === null}
            onClick={() => at !== null && setRange([at, Math.max(at, to)])}
            data-testid="studio-export-from"
          >
            From here
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={at === null}
            onClick={() => at !== null && setRange([Math.min(from, at), at])}
            data-testid="studio-export-to"
          >
            To here
          </Button>
        </div>
        <span className={cn("tabular-nums text-muted-foreground", TEXT.note)}>
          {replayTimes(from).zulu} to {replayTimes(to).zulu} at {speedName(speed)} (the timeline's speed): {seconds} s, {size.width}×
          {size.height}
        </span>
      </div>
      <ListGroup>
        <ListRow
          title="Credits"
          value={<Switch checked={choice.credits} onCheckedChange={(credits) => pick({ credits })} aria-label="Credits" />}
        />
        <ListRow
          title="Not an official finding"
          value={
            <Switch
              checked={choice.disclaimer}
              onCheckedChange={(disclaimer) => pick({ disclaimer })}
              aria-label="Not an official finding"
            />
          }
        />
        <ListRow
          title="Captions burned in"
          value={<Switch checked={choice.captions} onCheckedChange={(captions) => pick({ captions })} aria-label="Captions burned in" />}
        />
      </ListGroup>
      <p className={cn("text-muted-foreground", TEXT.note)}>
        Google's imagery is never in a video: its terms forbid exporting it, so the map shows the USGS's imagery and the FAA chart.
        {hasAudio && speed !== 1 ? " The radio is left out at any speed but 1×." : ""}
      </p>
      {running ? (
        <div className="flex flex-col gap-2">
          <Progress value={done * 100} aria-label="Rendering the video" />
          <span className={cn("tabular-nums", TEXT.note)}>Rendering {Math.round(done * 100)}%</span>
          <Button variant="outline" onClick={video.cancel} data-testid="studio-export-cancel">
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          disabled={to <= from}
          onClick={() => void video.start({ track, choice, range: { start: from, end: to }, scene, credits })}
          data-testid="studio-export-start"
        >
          <Film aria-hidden />
          Make the video
        </Button>
      )}
      {problem && <FieldError data-testid="studio-export-problem">{problem}</FieldError>}
      {made && !running && (
        <a className={buttonVariants({ variant: "outline" })} href={made.url} download={made.name} data-testid="studio-export-save">
          <Download aria-hidden />
          Save {made.name} ({(made.bytes / 1e6).toFixed(1)} MB)
        </a>
      )}
    </div>
  );
}
