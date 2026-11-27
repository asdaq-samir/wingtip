import { useMemo } from "react";
import { useMinuteClock } from "../../lib/useMinuteClock";
import { arrivalHour, hoursOf, sentenceOf, type Hour } from "./hourly";
import { zonedClock } from "./placeCardWords";
import { tafValidity, type TafValidity } from "./tafValidity";

/** What a field's hour-by-hour forecast is made from (PlaceCard's). */
export type HourlyFrom = {
  metar: Parameters<typeof hoursOf>[0]["metar"];
  taf: string | null;
  /** The planned flight, where this field is its destination: when it
   *  leaves (ISO; null for now) and how long until it lands, minutes. */
  arrival?: { depart: string | null; minutes: number };
};

/**
 * A field's weather hour by hour, as Apple's Weather has it (the owner's
 * pick, G1): Now from the report, each hour after it from the field's own
 * TAF, a sentence of what they say (features/place/hourly), the TAF's own
 * valid period (the engine's taf_validity: one kept from before the signal
 * was lost says it has run out, rather than reading as a field with no
 * forecast), and the hour the planned flight lands in. Read again each
 * minute by the Weather tab alone, as the hours move on: at the card's
 * root the minute drew the whole card again and asked the engine each
 * time (the round-2 speed audit), and the tab's clock stops while it is
 * out of sight (lib/shown).
 */
export function usePlaceHourly({ metar, taf: tafText, arrival }: HourlyFrom): {
  hourly: { hours: Hour[]; sentence: string | null; taf: TafValidity | null };
  arrival: { index: number; at: number } | null;
} {
  const now = useMinuteClock();
  const hourly = useMemo(() => {
    const hours = hoursOf({ metar, taf: tafText, now });
    const taf = tafValidity(tafText, now);
    return { hours, taf, sentence: sentenceOf(hours, zonedClock, taf?.state === "expired" ? "its TAF has expired" : undefined) };
  }, [metar, tafText, now]);
  const landsAt = arrival ? (arrival.depart ? Date.parse(arrival.depart) : now) + arrival.minutes * 60_000 : null;
  const landsIn = landsAt != null && !Number.isNaN(landsAt) ? arrivalHour(hourly.hours, landsAt) : null;
  return { hourly, arrival: landsIn != null && landsAt != null ? { index: landsIn, at: landsAt } : null };
}
