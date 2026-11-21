import { useEffect, useMemo, useState } from "react";
import { cn } from "cn";
import { Button } from "./ui/button";
import { api } from "../lib/api/client";
import { useAtcRadio, useRadioActions } from "../lib/atcRadio";
import { clearedRoute, heardAny, placesAsked, type Found } from "../lib/clearance";
import { callOf } from "../lib/heardCall";
import { metarWords } from "./metarWords";
import { commandsOf } from "./pilotCommand";
import { altitudeWords } from "../lib/readback";
import { say } from "../lib/speech";
import { TEXT } from "../lib/text";
import { openEmergency } from "../lib/emergencyStore";
import { readBackNow } from "../lib/radioListeningLoad";
import { eachCapitalised } from "../lib/capitals";
import { copyText } from "../lib/share";

/** A place's words as a chip says them: spelled idents as they are. */
const named = (words: string) => (/[a-z]/.test(words) ? eachCapitalised(words) : words);

const CHIP = "rounded-full text-tint";

/**
 * What the app can do of something heard, a tap each -- Direct To the
 * place said (found near the route, flown from where the airplane is),
 * Enter Route for a clearance (its places found and the route it gives
 * entered, its SID and STAR picked, its altitude flown), Fly the
 * altitude, the frequency copied, the code shown; and of the pilot's own
 * words (components/pilotCommand): the nearest airports, an approach's page,
 * the weather at a field said aloud, a timer, and a clearance read back
 * and checked (lib/readback). Nothing is done until a chip is tapped;
 * `done` puts what was heard away after one.
 */
export function CallActions({
  text,
  done,
  own = false,
}: {
  text: string;
  done: () => void;
  /** The pilot's own words from the map's microphone (RadioPill), not a
   *  call heard on the radio: an emergency said aloud opens at once. */
  own?: boolean;
}) {
  const { directTo, fly, enter, route, nearest, showProcedure, planTo } = useRadioActions();
  const near = useAtcRadio((s) => s.near);
  const mode = useAtcRadio((s) => s.mode);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** What a chip brought, kept in the pill: a field's report. */
  const [note, setNote] = useState<string | null>(null);
  const heard = callOf(text, null);
  const { clearance } = heard;
  const commands = useMemo(() => commandsOf(text), [text]);
  const altitude = commands.find((c) => c.kind === "altitude");
  const procedure = commands.find((c) => c.kind === "procedure");
  const weather = commands.find((c) => c.kind === "weather");
  const timer = commands.find((c) => c.kind === "timer");
  const destination = commands.find((c) => c.kind === "destination");
  const routed = !!(clearance.limit || clearance.route.length || clearance.asFiled);
  // The pilot's own "mayday", "engine failure", "emergency": the emergency
  // assistant at once, no chip to find first; heard on the radio, a chip.
  const emergency = commands.some((c) => c.kind === "emergency");
  useEffect(() => {
    if (own && emergency) openEmergency("voice");
  }, [own, emergency]);
  const run = async (what: string, act: () => Promise<string | null>) => {
    setBusy(what);
    setProblem(null);
    const why = await act();
    setBusy(null);
    if (why) setProblem(why);
    else done();
  };
  // The field a command names, found by its words near the route; none
  // named, the destination.
  const fieldOf = async (field: string | null): Promise<{ ident: string } | { why: string }> => {
    if (!field) return route.dest ? { ident: route.dest } : { why: "No destination: plan a route or name the field." };
    try {
      const found = await api.clearancePlaces({ limit: field, route: [], near, dep: route.dep || null, dest: route.dest || null });
      const ident = found.limit?.kind === "airport" ? found.limit.ident : null;
      return ident ? { ident } : { why: `“${field}” was not found near the route.` };
    } catch {
      return { why: "The field could not be looked up; check the connection." };
    }
  };
  const tellWeather = async (field: string | null) => {
    setBusy("weather");
    setProblem(null);
    const at = await fieldOf(field);
    if ("why" in at) {
      setBusy(null);
      setProblem(at.why);
      return;
    }
    try {
      const airport = await api.airport(at.ident);
      const metar = airport.metar;
      if (!metar?.raw) setNote(`No report at ${at.ident}.`);
      else {
        setNote(`${at.ident}: ${metar.raw}`);
        say(metarWords(airport.name || at.ident, metar));
      }
    } catch {
      setProblem(`${at.ident}'s weather could not be had; check the connection.`);
    }
    setBusy(null);
  };
  const setTimer = (from: number | null) => useAtcRadio.setState((s) => ({ pill: s.pill && { ...s.pill, timerFrom: from } }));
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-1 pr-2">
        {heard.direct && directTo && (
          <Button
            size="sm"
            variant="secondary"
            className={CHIP}
            disabled={!!busy}
            onClick={() => void run("direct", () => directTo(heard.direct!))}
          >
            Direct To {named(heard.direct)}
          </Button>
        )}
        {emergency && (
          <Button
            size="sm"
            variant="secondary"
            className={cn(CHIP, "text-destructive")}
            onClick={() => {
              openEmergency("voice");
              done();
            }}
          >
            Emergency
          </Button>
        )}
        {commands.some((c) => c.kind === "nearest") && nearest && (
          <Button
            size="sm"
            variant="secondary"
            className={CHIP}
            disabled={!!busy}
            data-testid="radio-nearest"
            onClick={() => {
              nearest();
              done();
            }}
          >
            Nearest Airports
          </Button>
        )}
        {/* "Plan a trip to Las Vegas": a route there, the chip saying so
            where it would replace the route there is (the owner's
            screenshot, 2026-11-03, the pill offering nothing for it). */}
        {destination && planTo && (
          <Button
            size="sm"
            variant="secondary"
            className={CHIP}
            disabled={!!busy}
            onClick={() => void run("plan", () => planTo(destination.place))}
          >
            {route.dest ? "Replace the route: plan to " : "Plan to "}
            {named(destination.place)}
          </Button>
        )}
        {altitude && clearance.maintainFt === null && fly && (
          <Button
            size="sm"
            variant="secondary"
            className={CHIP}
            disabled={!!busy}
            data-testid="radio-fly"
            onClick={() => {
              fly(altitude.ft);
              done();
            }}
          >
            Fly {altitudeWords(altitude.ft)}
          </Button>
        )}
        {procedure && showProcedure && (
          <Button
            size="sm"
            variant="secondary"
            className={CHIP}
            disabled={!!busy}
            onClick={() =>
              void run("procedure", async () => {
                const at = await fieldOf(procedure.field);
                return "why" in at ? at.why : showProcedure(at.ident, procedure.approach, procedure.runway);
              })
            }
          >
            {procedure.approach}
            {procedure.runway ? ` ${procedure.runway}` : ""}
            {procedure.field ? ` at ${named(procedure.field)}` : ""}
          </Button>
        )}
        {weather && (
          <Button size="sm" variant="secondary" className={CHIP} disabled={!!busy} onClick={() => void tellWeather(weather.field)}>
            Weather{weather.field ? ` at ${named(weather.field)}` : ""}
          </Button>
        )}
        {timer && (
          <Button
            size="sm"
            variant="secondary"
            className={CHIP}
            data-testid="radio-timer"
            onClick={() => setTimer(timer.start ? Date.now() : null)}
          >
            {timer.start ? "Start Timer" : "Stop Timer"}
          </Button>
        )}
        {heardAny(clearance) && mode === "once" && (
          <Button
            size="sm"
            variant="secondary"
            className={CHIP}
            disabled={!!busy}
            data-testid="radio-readback"
            onClick={() => readBackNow(text)}
          >
            Read Back
          </Button>
        )}
        {routed && enter && (
          <Button
            size="sm"
            variant="secondary"
            className={CHIP}
            disabled={!!busy}
            onClick={() =>
              void run("route", async () => {
                const asked = placesAsked(clearance);
                try {
                  const wants = asked.limit || asked.route.length || asked.departure || asked.arrival;
                  const found = wants
                    ? ((await api.clearancePlaces({ ...asked, near, dep: route.dep || null, dest: route.dest || null })) as Found)
                    : {};
                  const unfound = [found.limit, ...(found.route ?? []).flat()].filter((p) => p && !p.ident).map((p) => `“${p!.said}”`);
                  if (unfound.length) return `${unfound.join(", ")} not found: open the log to check it.`;
                  const entered = clearedRoute(text, found, route);
                  enter(entered.route, entered.typed, clearance.vfr ? null : (clearance.expectFt ?? clearance.maintainFt));
                  return null;
                } catch {
                  return "The places in it could not be looked up; check the connection.";
                }
              })
            }
          >
            Enter Route
          </Button>
        )}
        {clearance.maintainFt !== null && !clearance.vfr && fly && (
          <Button
            size="sm"
            variant="secondary"
            className={CHIP}
            disabled={!!busy}
            data-testid="radio-fly"
            onClick={() => {
              fly(clearance.maintainFt!);
              done();
            }}
          >
            Fly {altitudeWords(clearance.maintainFt)}
          </Button>
        )}
        {clearance.frequency && (
          <Button
            size="sm"
            variant="secondary"
            className={CHIP}
            onClick={() => void copyText(clearance.frequency!).catch(() => {})}
          >
            Copy {clearance.frequency}
          </Button>
        )}
        {clearance.squawk && <span className={cn("font-semibold", TEXT.detail)}>Squawk {clearance.squawk}</span>}
      </div>
      {note && <p className={cn("pt-1 pr-2 font-mono", TEXT.note)}>{note}</p>}
      {problem && (
        <p className={cn("pt-1 pr-2 text-destructive-ink", TEXT.note)} role="status">
          {problem}
        </p>
      )}
    </>
  );
}
