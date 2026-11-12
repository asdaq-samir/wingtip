import { useEffect, useMemo, useRef, useState } from "react";
import { useWavesurfer } from "@wavesurfer/react";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import { AudioLines, Trash2 } from "lucide-react";
import { FileTrigger } from "react-aria-components";
import { Pressable } from "react-aria/Pressable";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { CHART } from "../../../lib/tokens";
import { TEXT } from "../../../lib/text";
import { audioAt, clockAt, MOST_AUDIBLE_SPEED, playerPlan, syncFromZulu } from "../../../lib/replay/audioSync";
import { usePastFlight } from "../../../lib/replay/clock";
import { useCaptions } from "../captions/captionStore";
import { replayTimes } from "../replayTime";
import { dropAudio, pickAudio, setAudioSync, useReplayAudio } from "./audioStore";

/**
 * The radio beside a replay: the creator's own recording (never fetched:
 * LiveATC's terms want their own permission), its waveform (wavesurfer.js,
 * BSD-3, through @wavesurfer/react), the captions as regions on it, and
 * its sync to the replay's clock, set at one point -- "this moment in the
 * recording is 14:32:05Z", typed or taken from where the replay is. Once
 * synced it follows the replay through a scrub and a change of speed,
 * muted above twice as flown; a tap on the waveform puts the replay there.
 */
export function RadioTrack() {
  const { url, sync, problem, file } = useReplayAudio();
  const captions = useCaptions((s) => s.captions);
  const box = useRef<HTMLDivElement>(null);
  const regions = useMemo(() => RegionsPlugin.create(), []);
  const plugins = useMemo(() => [regions], [regions]);
  const { wavesurfer, currentTime } = useWavesurfer({
    container: box,
    url: url ?? undefined,
    height: 64,
    waveColor: CHART.airspaceBlue,
    progressColor: CHART.mapBlue,
    cursorColor: CHART.selected,
    normalize: true,
    dragToSeek: true,
    plugins,
  });
  const [zulu, setZulu] = useState("");
  const [zuluProblem, setZuluProblem] = useState<string | null>(null);

  // The replay's clock drives the player once synced (lib/replay/audioSync).
  useEffect(() => {
    if (!wavesurfer || !sync) return;
    const media = wavesurfer.getMediaElement();
    if (!media) return;
    media.preservesPitch = true;
    const follow = () => {
      const { at, playing, speed } = usePastFlight.getState();
      if (at === null) return;
      const plan = playerPlan(sync, { t: at, playing, speed }, { atS: media.currentTime, lengthS: wavesurfer.getDuration() });
      if (plan.seekTo !== null) media.currentTime = plan.seekTo;
      media.playbackRate = plan.rate;
      if (plan.play && media.paused) void media.play().catch(() => {});
      else if (!plan.play && !media.paused) media.pause();
    };
    follow();
    return usePastFlight.subscribe(follow);
  }, [wavesurfer, sync]);

  // A tap or a drag on the waveform puts the replay at that moment.
  useEffect(() => {
    if (!wavesurfer || !sync) return;
    return wavesurfer.on("interaction", (s: number) => usePastFlight.setState({ at: clockAt(sync, s) }));
  }, [wavesurfer, sync]);

  // The captions as regions over the waveform, where the recording has them.
  useEffect(() => {
    regions.clearRegions();
    if (!sync) return;
    for (const c of captions)
      regions.addRegion({
        id: c.id,
        start: audioAt(sync, c.from),
        end: audioAt(sync, c.to),
        color: `${CHART.selected}33`,
        drag: false,
        resize: false,
      });
  }, [regions, captions, sync, wavesurfer]);

  const at = usePastFlight((s) => s.at);
  return (
    <div className="flex flex-col gap-3" data-testid="studio-radio">
      <div className="flex gap-2">
        {/* React Aria's FileTrigger: the hidden file input, opened by the button. */}
        <FileTrigger
          acceptedFileTypes={["audio/*", ".mp3", ".m4a", ".wav", ".ogg"]}
          data-testid="studio-radio-file"
          onSelect={(files) => {
            const picked = files?.[0];
            if (picked) void pickAudio(picked);
          }}
        >
          <Pressable>
            <Button variant="outline" className="flex-1" data-testid="studio-radio-pick">
              <AudioLines aria-hidden />
              {file ? "Another recording" : "Add a recording"}
            </Button>
          </Pressable>
        </FileTrigger>
        {file && (
          <Button variant="outline" size="icon" aria-label="Remove the recording" onClick={dropAudio}>
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
      <p className={cn("text-muted-foreground", TEXT.note)}>
        Your own recording only. LiveATC's archive needs LiveATC's permission, so the Studio never fetches it. The recording stays on this
        device.
      </p>
      {problem && <FieldError>{problem}</FieldError>}
      <div ref={box} className={cn(!url && "hidden")} data-testid="studio-radio-wave" />
      {url && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const made = syncFromZulu(zulu, currentTime, at ?? usePastFlight.getState().points[0]?.t ?? Date.now() / 1000);
            setZuluProblem(made ? null : "Type the time as 14:32:05Z.");
            if (made) setAudioSync(made);
          }}
        >
          <Field>
            <FieldLabel htmlFor="studio-radio-zulu">The recording at {currentTime.toFixed(1)} s is</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="studio-radio-zulu"
                value={zulu}
                onChange={(e) => setZulu(e.target.value)}
                placeholder="14:32:05Z"
                inputMode="numeric"
              />
              <Button type="submit" variant="outline">
                Sync
              </Button>
            </div>
            <FieldDescription>
              {sync
                ? `Synced: its start is ${replayTimes(clockAt(sync, 0)).zulu}. Muted above ${MOST_AUDIBLE_SPEED}×.`
                : "Play or tap the waveform to a call you know the time of, then type that time."}
            </FieldDescription>
            {zuluProblem && <FieldError>{zuluProblem}</FieldError>}
          </Field>
          <Button
            variant="outline"
            disabled={at === null}
            onClick={() => at !== null && setAudioSync({ audioS: currentTime, clockT: at })}
            data-testid="studio-radio-sync-now"
          >
            Sync to the replay's moment
          </Button>
        </form>
      )}
    </div>
  );
}
