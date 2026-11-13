import { useId } from "react";
import { Captions, Plus, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import { FieldError } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Progress } from "../../../components/ui/progress";
import { GLASS } from "../../../lib/mapChrome";
import { TEXT } from "../../../lib/text";
import { captionAt } from "../../../lib/replay/captions";
import { usePastFlight } from "../../../lib/replay/clock";
import { useReplayAudio } from "../audio/audioStore";
import { replayTimes } from "../replayTime";
import { addCaption, editCaption, makeCaptions, removeCaption, stopCaptions, useCaptions } from "./captionStore";

/** Who speaks on the radio, offered as the speaker is typed. */
const STATIONS = ["Tower", "Ground", "Approach", "Departure", "Center", "Clearance", "CTAF", "ATIS"];

/**
 * The captions of a replay's radio: made on this device by Whisper from
 * the synced recording (nothing uploaded), then put right by hand -- each
 * line's words and who said them ("Tower", the airplane's N-number), the
 * line at the replay's moment marked. A line can be added at the moment.
 */
export function CaptionsPanel({ callsign }: { callsign: string | null }) {
  const { captions, making, problem } = useCaptions();
  const { buffer, sync } = useReplayAudio();
  const at = usePastFlight((s) => (s.at === null ? null : Math.floor(s.at)));
  const on = at === null ? null : captionAt(captions, at);
  const list = useId();
  return (
    <div className="flex flex-col gap-3" data-testid="studio-captions">
      <datalist id={list}>
        {[...STATIONS, ...(callsign ? [callsign] : [])].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {making ? (
        <div className="flex flex-col gap-1.5">
          <span className={TEXT.note}>{making.phase === "model" ? "Fetching the speech model (once)…" : "Hearing the words…"}</span>
          <Progress value={making.phase === "model" ? making.done * 100 : null} aria-label="Making captions" />
          <Button variant="outline" onClick={stopCaptions}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="outline" disabled={!buffer || !sync} onClick={() => void makeCaptions()} data-testid="studio-captions-make">
          <Captions aria-hidden />
          Make captions from the recording
        </Button>
      )}
      <p className={cn("text-muted-foreground", TEXT.note)}>
        {!buffer || !sync ? "Add and sync a recording first. " : ""}Heard on this device; the recording isn't uploaded.
      </p>
      {problem && <FieldError>{problem}</FieldError>}
      {captions.map((c) => (
        <div key={c.id} className={cn("flex flex-col gap-1.5 rounded-(--radius-card) p-2", on?.id === c.id && "bg-accent")}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn("relative tabular-nums text-primary after:absolute after:-inset-3 after:content-['']", TEXT.note)}
              onClick={() => usePastFlight.setState({ at: c.from })}
            >
              {replayTimes(c.from).zulu}
            </button>
            <Input
              aria-label="Speaker"
              list={list}
              value={c.speaker}
              placeholder="Speaker"
              onChange={(e) => editCaption(c.id, { speaker: e.target.value })}
              className="w-32"
            />
            <Button variant="ghost" size="icon" aria-label="Delete the line" onClick={() => removeCaption(c.id)}>
              <Trash2 aria-hidden />
            </Button>
          </div>
          <Input aria-label="Words" value={c.text} onChange={(e) => editCaption(c.id, { text: e.target.value })} />
        </div>
      ))}
      <Button variant="outline" disabled={at === null} onClick={() => at !== null && addCaption(at)}>
        <Plus aria-hidden />
        Add a line here
      </Button>
    </div>
  );
}

/** The caption on at the replay's moment, over the map as a video has it. */
export function CaptionLine({ className }: { className?: string }) {
  const captions = useCaptions((s) => s.captions);
  const at = usePastFlight((s) => (s.at === null ? null : Math.floor(s.at * 4) / 4));
  const on = at === null ? null : captionAt(captions, at);
  if (!on) return null;
  return (
    <p
      className={cn(GLASS, "rounded-(--radius-card) px-3 py-1 text-center font-semibold", TEXT.row, className)}
      data-testid="replay-caption"
    >
      {on.speaker ? `${on.speaker}: ` : ""}
      {on.text}
    </p>
  );
}
