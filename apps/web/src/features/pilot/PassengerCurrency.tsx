import { cn } from "cn";
import { ListRow } from "../../components/GroupedList";
import type { Currency } from "../../lib/api/types";
import { said } from "../../lib/endorsements";
import { FINDING_TONE } from "../../lib/findings";
import { localDay } from "../../lib/format";
import { judgedWords } from "../../lib/airplaneKind";

/** "To 19 Dec 2026" in the tint's green, or "Not current" in red; with a
 *  `from` still to come (instrument currency from approaches flown this
 *  month, 61.57(c)(1)), "From 1 Nov 2026" in amber, as not current yet. */
export function Until({ date, from, what }: { date: string | null | undefined; from?: string | null; what: string }) {
  const today = localDay();
  const current = !!date && date >= today;
  const notYet = current && from && from > today ? from : null;
  return (
    <span
      className={cn("tabular-nums", notYet ? FINDING_TONE.caution : current ? FINDING_TONE.ok : FINDING_TONE.stop)}
      data-testid={`currency-${what}`}
    >
      {!date ? "Not current" : notYet ? `From ${said(notYet)}` : current ? `To ${said(date)}` : `Ended ${said(date)}`}
    </span>
  );
}

/** The engine's "Can't tell: …" without its first words, which the row's
 *  value says. */
const unknownWhy = (words: string) => words.replace(/^Can't tell:\s*/, "");

/** A passenger row's value: "Can't tell" in amber where only what the
 *  logbook doesn't say stands between the pilot and currency (the
 *  engine's words under it say what), else the date. */
function PassengerUntil({ date, unknown, what }: { date: string | null | undefined; unknown: string | null | undefined; what: string }) {
  if (unknown)
    return (
      <span className={FINDING_TONE.caution} data-testid={`currency-${what}`}>
        Can&apos;t tell
      </span>
    );
  return <Until date={date} what={what} />;
}

/**
 * Passenger currency's rows (14 CFR 61.57(a)(1), (b)(1)), as the engine
 * judges it for the airplane to be flown (the one picked in FPL, else the
 * newest flight's), never "Current" on what the logbook doesn't say: by
 * day, at night, and for a pilot judged in a tricycle who has flown a
 * tailwheel in the class, the tailwheel's own, to a full stop
 * (61.57(a)(1)(ii)). Each row says what it counts, or what isn't known.
 */
export function PassengerRows({ currency }: { currency: Currency | undefined }) {
  const judged = currency ? judgedWords(currency) : null;
  const day = currency?.dayPassengersUnknown;
  const night = currency?.nightPassengersUnknown;
  return (
    <>
      <ListRow
        title="Passengers by Day"
        description={
          <>
            <span className="block">{day ? unknownWhy(day) : "3 takeoffs and landings in 90 days"}</span>
            {judged && (
              <span className="block" data-testid="currency-judged">
                Judged for {judged}
              </span>
            )}
          </>
        }
      >
        <PassengerUntil date={currency?.dayPassengersUntil} unknown={day} what="day" />
      </ListRow>
      <ListRow title="Passengers at Night" description={night ? unknownWhy(night) : "3 to a full stop at night in 90 days"}>
        <PassengerUntil date={currency?.nightPassengersUntil} unknown={night} what="night" />
      </ListRow>
      {currency?.tailwheelPassengersUntil && (
        <ListRow title="Passengers in a Tailwheel" description="3 to a full stop in a tailwheel in 90 days">
          <Until date={currency.tailwheelPassengersUntil} what="tailwheel" />
        </ListRow>
      )}
    </>
  );
}
