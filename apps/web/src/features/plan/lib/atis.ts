/**
 * An ATIS or AWOS/ASOS broadcast heard through the phone's microphone,
 * read into its figures by the engine (wingtip_engine::atis, the rule
 * read_atis; the native app's Atis), both held to the same fixture
 * (fixtures/atis.json). AIM 4-1-13 orders what an ATIS says: the letter,
 * the time, wind, visibility, sky, temperature and dew point, altimeter,
 * the approaches and runways in use, NOTAMs. The figures here are the
 * engine's; this file only listens and puts them into words.
 */
import { heardThrough, useAtcRadio } from "../../../lib/atcRadio";
import { holdForListening } from "../../../lib/audioInput";
import { callEngine, type EngineAnswer } from "../../../lib/engine/engine";
import { listen, saidSoFar } from "../../../lib/listen";
import { altFt, reportedDirection } from "../../../lib/format";

/** A broadcast's figures as the engine reads them (read_atis): a figure
 *  not heard is null. The shapes are the engine's contract's. */
export type AtisReading = EngineAnswer<"read_atis">;
type AtisWind = NonNullable<AtisReading["wind"]>;
type AtisLayer = AtisReading["sky"][number];

/** The broadcast read by the engine (the rule read_atis). */
export function readAtis(text: string): AtisReading {
  return callEngine("read_atis", { text });
}

/** A D-ATIS's remarks as the card lists them, an item each in the FAA's
 *  words in sentence case with its codes kept and the sentences saying
 *  the same of several runways folded into one (the engine's
 *  datis_remarks); the read's spoken remarks are not for the screen. */
export function datisRemarks(text: string): string[] {
  return callEngine("datis_remarks", { text });
}

/** Whether anything of a broadcast was heard at all. */
export function heardAny(r: AtisReading): boolean {
  return (
    r.information != null ||
    r.time_z != null ||
    r.wind != null ||
    r.visibility_sm != null ||
    r.sky.length > 0 ||
    r.altimeter_inhg != null ||
    r.approach != null ||
    r.runways.landing.length > 0 ||
    r.runways.departing.length > 0
  );
}

/** The wind as a pilot says it back: "210° at 12 kt, gusts 18". */
export function windWords(w: AtisWind): string {
  // Calm is a speed of 0 (AIM 7-1-28), the engine's wind_calm.
  if (callEngine("wind_calm", { speed_kt: w.kt })) return "Calm";
  const speed = w.kt != null ? `${w.kt} kt` : null;
  const gusts = w.gust_kt != null ? `gusts ${w.gust_kt}` : null;
  const head =
    w.from_deg != null
      ? `${reportedDirection(w.from_deg)}°${w.variable ? " variable" : ""}`
      : w.variable
        ? speed
          ? "Variable"
          : "Light and variable"
        : null;
  return [head && speed ? `${head} at ${speed}` : (head ?? speed), gusts].filter(Boolean).join(", ");
}

/** Statute miles as said: "10 sm", "2½ sm", "¾ sm". */
export function visibilityWords(sm: number): string {
  const whole = Math.floor(sm),
    frac = sm - whole;
  const part = { 0.25: "¼", 0.5: "½", 0.75: "¾" }[frac] ?? (frac ? String(frac).slice(1) : "");
  return `${whole || !part ? whole : ""}${part} sm`;
}

/** The ATIS's covers as a METAR codes them, for the engine's ceiling. */
const METAR_COVER: Record<string, string> = { clear: "CLR", few: "FEW", scattered: "SCT", broken: "BKN", overcast: "OVC", obscured: "VV" };

/**
 * The layers as said, the ceiling marked: the engine's ceiling
 * (ceiling_visibility, 14 CFR 1.1's definition: the lowest broken or
 * overcast layer, or an obscuration), which is what the field's flight
 * category hangs on.
 */
export function skyWords(sky: AtisLayer[]): string {
  if (!sky.length) return "—";
  const { ceiling_ft } = callEngine("ceiling_visibility", {
    layers: sky.map((l) => ({ cover: METAR_COVER[l.cover] ?? l.cover, base_ft: l.base_ft })),
  });
  const ceiling = ceiling_ft == null ? undefined : [...sky].reverse().find((l) => l.base_ft === ceiling_ft);
  return sky
    .map((l) => {
      const cover = l.cover[0]!.toUpperCase() + l.cover.slice(1);
      return `${cover}${l.base_ft != null ? ` ${altFt(l.base_ft)} ft` : ""}${l === ceiling ? " (ceiling)" : ""}`;
    })
    .join(" · ");
}

/** The runways as said: both ways, or landing and departing apart. */
function runwayWords(r: AtisReading["runways"]): string | null {
  const same = r.landing.length > 0 && r.landing.join() === r.departing.join();
  if (same) return r.landing.join(", ");
  const parts = [];
  if (r.landing.length) parts.push(`Landing ${r.landing.join(", ")}`);
  if (r.departing.length) parts.push(`Departing ${r.departing.join(", ")}`);
  return parts.length ? parts.join(" · ") : null;
}

/** The one line that matters at the hold-short line: the runway in use
 *  and the altimeter, with the letter. */
export function glanceWords(r: AtisReading): string {
  const runways = runwayWords(r.runways);
  return (
    [
      runways ? `Runway ${runways}` : r.approach ? r.approach : null,
      r.altimeter_inhg != null ? `${r.altimeter_inhg.toFixed(2)} inHg` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Nothing of a broadcast was heard"
  );
}

/** The table under the line, a row a figure, only the figures heard; a
 *  heard broadcast's remarks with them, a D-ATIS's left to
 *  datisRemarks (its own list, in the FAA's words). */
export function atisRows(r: AtisReading, { remarks = true } = {}): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (r.information) rows.push({ label: "Information", value: `${r.information}${r.time_z ? ` · ${r.time_z}` : ""}` });
  else if (r.time_z) rows.push({ label: "Observed", value: r.time_z });
  if (r.wind) rows.push({ label: "Wind", value: windWords(r.wind) });
  if (r.visibility_sm != null) rows.push({ label: "Visibility", value: visibilityWords(r.visibility_sm) });
  if (r.sky.length) rows.push({ label: "Sky", value: skyWords(r.sky) });
  if (r.temp_c != null)
    rows.push({ label: "Temperature", value: `${r.temp_c} °C${r.dewpoint_c != null ? `, dew point ${r.dewpoint_c} °C` : ""}` });
  if (r.altimeter_inhg != null) rows.push({ label: "Altimeter", value: `${r.altimeter_inhg.toFixed(2)} inHg` });
  if (r.approach) rows.push({ label: "Approach", value: r.approach });
  const runways = runwayWords(r.runways);
  if (runways) rows.push({ label: "Runways", value: runways });
  if (remarks) for (const remark of r.remarks) rows.push({ label: "Remarks", value: remark });
  return rows;
}

/** Once words have come, this long with no more ends the hearing, ms: an
 *  ATIS loops with a short pause between its readings. */
const PAUSE_MS = 3000;
/** With nothing heard at all, the hearing ends after this long, ms. */
const NOTHING_MS = 15000;
/** The hearing ends after this long whatever is said, ms: a broadcast
 *  is read in well under a minute. */
const LONGEST_MS = 75000;

/** What a hearing ended with: the words, the recognizer's refusal or
 *  failure in a pilot's words, why it did not run or stopped short where
 *  that is no failure (`notice`), and the outside input it was heard
 *  through, by its name. */
interface AtisHeard {
  text: string;
  error?: string;
  notice?: string;
  through?: string;
}

/**
 * Hears one broadcast through lib/listen: the words so far to `onHeard`
 * as they come, and the whole once it ends, by its pause, by nothing
 * said, by `stop` or by time. `error` is the recognizer's refusal in a
 * pilot's words.
 *
 * Through the same input as the radio's (lib/audioInput), so the ground
 * test hears the panel the radio will (the owner's "Bluetooth is fine",
 * 2026-11-04); and one recognizer at a time on the one microphone, as two
 * in a page cut each other off: not while the radio or the microphone
 * listens, saying where to stop it, and stopped when either starts
 * meanwhile (the store's atisStop, lib/atcListening).
 */
export function hearAtis(onHeard: (text: string) => void): { stop: () => void; done: Promise<AtisHeard> } {
  const radio = useAtcRadio.getState();
  if (radio.listening) {
    const notice =
      radio.mode === "radio"
        ? "Already listening to the radio; stop it in the Radio card first."
        : "Already listening; tap the microphone to stop it first.";
    return { stop: () => {}, done: Promise.resolve({ text: "", notice }) };
  }
  const said = new Map<number, string>();
  let stopper: (() => void) | null = null;
  let stopped = false;
  let interrupted = false;
  const stop = () => {
    stopped = true;
    stopper?.();
  };
  // The radio or the microphone started: this hearing gives way to it.
  const giveWay = () => {
    interrupted = true;
    stop();
  };
  useAtcRadio.setState({ atisStop: giveWay });
  let typed = "";
  const done = new Promise<AtisHeard>((resolve) => {
    let quiet = window.setTimeout(stop, NOTHING_MS);
    const longest = window.setTimeout(stop, LONGEST_MS);
    // In the tap, before the recognizer: the input held, or the one
    // remembered being opened.
    const input = holdForListening();
    void listen(
      [],
      undefined,
      (id, text) => {
        if (!text) return;
        // A finished phrase given again under a new number, or the last
        // words with more after them, are the last result over again
        // (lib/listen's saidSoFar, the same recognizer's).
        typed = saidSoFar(said, id, text);
        onHeard(typed);
        window.clearTimeout(quiet);
        quiet = window.setTimeout(stop, PAUSE_MS);
      },
      (error) => {
        window.clearTimeout(quiet);
        window.clearTimeout(longest);
        if (useAtcRadio.getState().atisStop === giveWay) useAtcRadio.setState({ atisStop: null });
        // Named while the input is still held.
        const through = heardThrough(useAtcRadio.getState().input);
        input.release();
        resolve({
          text: typed,
          error,
          ...(interrupted && !error ? { notice: "Stopped for the microphone; tap to listen again." } : {}),
          ...(through ? { through } : {}),
        });
      },
      input.track,
    ).then(({ stop: s, renew }) => {
      input.follow(renew);
      stopper = s;
      if (stopped) s();
    });
  });
  return { stop, done };
}
