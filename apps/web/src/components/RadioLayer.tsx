import { useEffect, useMemo } from "react";
import { Radio } from "lucide-react";
import { cn } from "cn";
import CloseButton from "./CloseButton";
import { bannerGlass } from "./bannerGlass";
import Waveform from "./Waveform";
import { Timer } from "./RadioTimer";
import { Button } from "./ui/button";
import { CallActions } from "./RadioCallActions";
import { load } from "../lib/radioListeningLoad";
import { useAtcListenOn } from "../lib/atc/listenSetting";
import { callToUs, chosenOutside, heardThrough, lostWords, useAtcRadio, type Transmission } from "../lib/atcRadio";
import { heardAny, readClearance } from "../lib/clearance";
import { readbackCheck } from "../lib/readback";
import { useAnnounce } from "../lib/announce";
import { TEXT } from "../lib/text";

/** A clearance's readback checked against it (lib/readback): what was
 *  missed or said differently as a warning line, never a stop. */
function ReadbackLine({ cleared, said }: { cleared: string; said: string }) {
  const { items, words } = useMemo(() => readbackCheck(cleared, said), [cleared, said]);
  return (
    <p className={cn("pt-1 pr-2", items.length ? "text-caution-ink" : "text-muted-foreground", TEXT.note)} role="status">
      {words}
    </p>
  );
}

const WORDS = "h-auto min-w-0 flex-1 justify-start px-0 py-1 text-left font-normal whitespace-normal text-foreground";
/**
 * Comms assist grown into a pill (pick A, 2026-11-02), its circle widened (MapControls): the radio's level,
 * "Listening to the radio…", then "Heard: " and the words -- never the mic's look (features/voice, the owner's
 * split of 2026-11-10); at a pause or a second tap, its chips (CallActions) and ✕, stock Buttons all. The Radio
 * card, a tap on the words away: a ghost Button, its words wrapping in the text's colour. */
export function RadioPill() {
  const pill = useAtcRadio((s) => s.pill)!;
  const input = useAtcRadio((s) => s.input);
  const away = () => useAtcRadio.setState({ pill: null });
  useEffect(() => {
    void load();
  }, []);
  const readback = pill.readbackOf ?? null;
  // The input chosen gone while listening: said in the line, as an error is.
  const lost = pill.listening && input?.lost ? lostWords(input) : null;
  // An outside input by its name (lib/audioInput), the owner having asked
  // whether the mic can hear the radio itself (2026-11-04): heard through
  // where the recognizer is known to take it, else only chosen (lib/
  // atcRadio's heardThrough); the phone's own microphone leaves the words
  // as they were.
  const name = heardThrough(input);
  const chosen = chosenOutside(input);
  const waiting = readback
    ? "Read it back…"
    : name
      ? `Listening to the radio through ${name}…`
      : chosen
        ? `Listening to the radio with ${chosen} chosen…`
        : "Listening to the radio…";
  return (
    <div className="min-w-0 py-1 px-1" data-testid="radio-pill">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          className={cn(WORDS, TEXT.detail)}
          aria-label="Open the radio's log"
          data-testid="radio-pill-text"
          onClick={() => useAtcRadio.setState({ cardOpen: true, cardText: pill.text || null })}
        >
          <span
            aria-live="polite"
            className={cn(!pill.text && "text-muted-foreground", (pill.error || lost) && !pill.text && "text-caution-ink")}
          >
            {pill.text ? `Heard: ${pill.text}` : pill.error || lost || waiting}
          </span>
        </Button>
        {!pill.listening && <CloseButton label="Put away" onClick={away} data-testid="radio-pill-close" />}
      </div>
      {/* A readback heard: how it matched, in place of the chips. */}
      {!pill.listening &&
        pill.text &&
        (readback ? <ReadbackLine cleared={readback} said={pill.text} /> : <CallActions text={pill.text} done={away} own />)}
      {pill.timerFrom != null && (
        <Timer from={pill.timerFrom} onStop={() => useAtcRadio.setState((s) => ({ pill: s.pill && { ...s.pill, timerFrom: null } }))} />
      )}
    </div>
  );
}

/**
 * A call to us heard while the radio is listened to on and on (the Radio
 * card's Listen): what it asked, with its chips; ✕ puts it away.
 */
function RadioCall({ call }: { call: Transmission }) {
  const done = () => useAtcRadio.setState({ seen: call.id });
  // With the radio listened to on and on, the pilot's readback is the
  // next transmission heard with a clearance's items in it, not to us:
  // checked against the call as it settles (lib/readback).
  const heard = useAtcRadio((s) => s.heard);
  const readback = useMemo(
    () =>
      heardAny(readClearance(call.text))
        ? (heard.find((t) => t.id > call.id && t.final && !t.forUs && heardAny(readClearance(t.text))) ?? null)
        : null,
    [heard, call],
  );
  // Said to a screen reader at once, once a call (lib/announce): a role="alert"
  // arriving whole is not read by every reader.
  useAnnounce(`ATC: ${call.text}`, "assertive");
  return (
    <div className={cn(bannerGlass(true), "py-2 pr-1 pl-3")} role="region" aria-label="Call from ATC" data-testid="radio-call">
      <div className="flex items-start gap-2">
        <Radio className="mt-1 size-5 shrink-0 text-tint" aria-hidden="true" />
        <p className={cn("min-w-0 flex-1 font-semibold", TEXT.detail)}>{call.text}</p>
        <CloseButton label="Put away" onClick={done} />
      </div>
      <CallActions text={call.text} done={done} />
      {readback && <ReadbackLine cleared={call.text} said={readback.text} />}
    </div>
  );
}

/**
 * What the radio is saying, as it is said, over the map while it is
 * listened to on and on: the last transmission settled and the one being
 * said, a call to us in the tint, as iOS's Live Captions sit over what is
 * under them. A tap opens the log.
 */
function RadioCaptions() {
  const { listening, error, heard, input } = useAtcRadio();
  const lines = heard.slice(-2);
  const name = heardThrough(input);
  const chosen = chosenOutside(input);
  const lost = input?.lost ? lostWords(input) : null;
  return (
    <button
      type="button"
      data-testid="radio-captions"
      aria-label={listening ? "What the radio is saying: open the log" : "Radio: open the log"}
      onClick={() =>
        useAtcRadio.setState((s) => ({ cardOpen: true, cardText: [...s.heard].reverse().find((t) => t.final)?.text ?? s.cardText }))
      }
      className={cn(
        bannerGlass(true),
        "flex items-start gap-2 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {/* While an input is metered its level, in the glyph's place and
          size; the bars narrowed to fit the glyph's 20 points. */}
      {listening && input && !input.lost ? (
        <Waveform live className="mt-0.5 size-5 shrink-0 justify-center [&>span]:w-0.5" />
      ) : (
        <Radio
          className={cn("mt-0.5 size-5 shrink-0", listening ? "animate-pulse text-tint" : "text-muted-foreground")}
          aria-hidden="true"
        />
      )}
      <span className={cn("flex min-w-0 flex-1 flex-col", TEXT.detail)} aria-live="polite">
        {error && <span className="text-caution-ink">{error}</span>}
        {!error && lost && <span className="text-caution-ink">{lost}</span>}
        {!error && !lost && !lines.length && (
          <span className="text-muted-foreground">
            {name
              ? `Listening to the radio through ${name}…`
              : chosen
                ? `Listening to the radio with ${chosen} chosen…`
                : "Listening to the radio…"}
          </span>
        )}
        {lines.map((t) => (
          <span
            key={t.id}
            className={cn("line-clamp-2", t.forUs ? "font-semibold text-tint" : "text-foreground", !t.final && "opacity-80")}
          >
            {t.text}
          </span>
        ))}
      </span>
    </button>
  );
}

/** The radio's lines over the map (MapBanners): Comms assist's pill, a
 *  call to us, and the captions while listened to on and on. In a chunk
 *  of its own, loaded once the radio is first listened to. */
export default function RadioLayer() {
  const call = useAtcRadio(callToUs);
  // With the ATC copilot on, a call to us is its card (features/atc).
  const atc = useAtcListenOn() !== "off";
  const captions = useAtcRadio((s) => s.mode === "radio" || (!!s.error && s.mode !== "once" && s.pill === null));
  // Comms assist's pill is the radio button's own circle grown (RadioPill, in
  // MapControls), not a line here.
  return (
    <>
      {call && !atc && <RadioCall key={call.id} call={call} />}
      {captions && <RadioCaptions />}
    </>
  );
}
