import { memo, useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, Play, RotateCw } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../GroupedList";
import type { PastFlightSummary } from "../../lib/api/types";
import { TEXT } from "../../lib/text";
import { dayOf, lasted, legOf, placeOf, when, whenSaid } from "./pastFlightFormat";
import { pastFlightsQuery } from "../../lib/airplane/pastFlightsQuery";
import PastFlightsDay from "./PastFlightsDay";
import StatusBadge from "../StatusBadge";
import { useShown } from "../../lib/shown";
import { WORDING } from "../../lib/wording/generated/wording";

/**
 * An airplane's past flights on its card, at the pilot's ask ("can we
 * show past flights of an aircraft", with FlightAware's list as the
 * example): its last ten found, newest first, each from and to the fields
 * its track starts and ends at -- at the owner's ask ("make it last 10
 * flights you were able to find"), where it was the last seven days'. Ten
 * more before them on asking, and from a day picked ("give an option to
 * fetch more by date"), as far back as adsb.lol's archive goes, about six
 * weeks. A tap opens the flight's own card over this one (PastFlightCard).
 */
export default function PastFlights({
  hex,
  onOpen,
  title,
  type = null,
  play = false,
}: {
  hex: string;
  /** Opens a flight's own card (PastFlightCard), over this one. */
  onOpen: (id: number) => void;
  /** Its list's title ("Earlier", under the airplane card's flight now);
   *  none, untitled but for a day picked. */
  title?: string;
  /** Its type, on each row as FlightAware's list has it. */
  type?: string | null;
  /** Each row ends in a ▶ where the chevron was: the airplane profile's Flights, each a replay
   *  (the owner's P1, 2026-11-14). */
  play?: boolean;
}) {
  // A day picked, else the last flights found.
  const [from, setFrom] = useState<string | null>(null);
  const { data, isError, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } = useInfiniteQuery({
    ...pastFlightsQuery(hex, from),
    // Not while its tab is out of sight (lib/shown).
    subscribed: useShown(),
    // Days adsb.lol did not give just now are asked for again, a minute
    // apart, five times at most, while only the first page is out.
    refetchInterval: (query) => {
      const pages = query.state.data?.pages ?? [];
      return pages.length === 1 && (pages[0]?.unread_days ?? 0) > 0 && query.state.dataUpdateCount <= 5 ? 60_000 : false;
    },
  });
  const pages = data?.pages ?? [];
  // A page without its list (an older planner's answer, a stand-in) is no
  // flights, not a fault that takes the card down.
  const flights = pages.flatMap((page) => page.flights ?? []);
  const unread = pages.reduce((n, page) => n + (page.unread_days ?? 0), 0);
  // None found yet, and older days left: on back by itself, a fortnight
  // at a time, until one is found or the archive ends -- "the last 10
  // flights you were able to find", where an airplane quiet for a
  // fortnight showed nothing but "Look further back" (the owner's phone,
  // N3429J).
  const looking = !!data && !flights.length && !!hasNextPage;
  useEffect(() => {
    if (looking && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [looking, isFetchingNextPage, isError, fetchNextPage]);
  return (
    <>
      <ListGroup
        // No footnote under it, at the owner's ask ("Avoid putting so many
        // footnotes for pilots experience"): the rows say it.
        title={from ? `On and before ${dayOf(new Date(`${from}T12:00:00Z`))}` : title}
      >
        {(!data || looking) && !isError && (
          <ListRow
            title={
              <span role="status" className="text-muted-foreground">
                {data ? "Fetching earlier flights…" : "Fetching its flights…"}
              </span>
            }
          />
        )}
        {isError && !data && (
          <ListRow title={<span className={cn("text-destructive", TEXT.detail)}>{WORDING.pastFlightsNotFetched}</span>} />
        )}
        {data && !flights.length && !hasNextPage && !unread && (
          // The owner's words, where it read "None heard in adsb.lol's archive".
          <ListRow
            title={
              <span className="text-muted-foreground" data-testid="past-flights-none">
                {from ? "None heard on or before that day" : "No flights heard in the last six weeks"}
              </span>
            }
          />
        )}
        {flights.map((flight) => (
          <PastFlightRow key={flight.id} flight={flight} type={type} play={play} onPick={() => onOpen(flight.id)} />
        ))}
        {/* A gap that is adsb.lol's, not the airplane's, said as one. */}
        {!!unread && (
          <ListRow
            title={
              <span className={cn("text-muted-foreground", TEXT.detail)}>
                {/* A week or more unread is adsb.lol's history closed to the
                  app (behind a browser check since 19 Oct 2026), not a
                  moment's refusal: said so, and that the flights listed
                  are those watched here (wingtip.traffic's recorded tracks). */}
                {unread >= 7
                  ? "adsb.lol's flight history can't be read now, so only flights followed in this app are listed."
                  : `${unread === 1 ? "One day" : `${unread} days`} could not be read from adsb.lol just now, so their flights are missing; asking again.`}
              </span>
            }
          />
        )}
        {/* Ten more, before the last listed, as far back as the archive goes. */}
        {hasNextPage && !looking && (
          <ListRow
            title={isFetchingNextPage ? "Fetching earlier flights…" : "Show Earlier Flights"}
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            data-testid="past-flights-more"
          />
        )}
      </ListGroup>
      <PastFlightsDay from={from} onPick={setFrom} />
      {isFetching && data && !isFetchingNextPage && (
        <span className="sr-only" role="status">
          Updating
        </span>
      )}
    </>
  );
}

/** One end of a flight, as FlightAware's list sets it: the field's ident
 *  large, its town under it, and when. */
interface FlightEnd {
  ident: string;
  place?: string | null;
  when?: string | null;
}

/**
 * A flight's two ends side by side, the way between them an arrow, or a
 * loop for one that came back to where it left (a local flight), at the
 * owner's ask, with FlightAware's list as the example: the airplane's
 * past flights on an airplane's card, and a past flight's own card.
 */
function FlightEnds({
  from,
  to,
  local = false,
  testIds,
}: {
  from: FlightEnd;
  to: FlightEnd;
  local?: boolean;
  testIds?: { from?: string; to?: string };
}) {
  const Way = local ? RotateCw : ArrowRight;
  const end = (side: FlightEnd, right: boolean) => (
    <span className={cn("flex min-w-0 flex-col", right && "items-end text-right")} data-testid={right ? testIds?.to : testIds?.from}>
      <span className={cn("max-w-full truncate font-bold text-foreground", TEXT.heading)}>{side.ident}</span>
      {side.place && <span className={cn("max-w-full truncate text-muted-foreground", TEXT.detail)}>{side.place}</span>}
      {side.when && <span className={cn("max-w-full truncate text-foreground", TEXT.detail)}>{side.when}</span>}
    </span>
  );
  return (
    <span className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
      {end(from, false)}
      <Way className="mt-1 size-5 text-foreground" aria-hidden />
      {end(to, true)}
    </span>
  );
}

/** "Landed · 52 min", "Local flight · 1 h 5 min", "Last heard · 40 min":
 *  how a flight that ended ended and how long it flew. */
function endedOf(flight: PastFlightSummary): string {
  const local = !!flight.origin && flight.origin.ident === flight.destination?.ident;
  return `${local ? "Local flight" : flight.landed ? "Landed" : "Last heard"} · ${lasted(flight.on - flight.off)}`;
}

const PastFlightRow = memo(function PastFlightRow({
  flight,
  type,
  play,
  onPick,
}: {
  flight: PastFlightSummary;
  type: string | null;
  play: boolean;
  onPick: () => void;
}) {
  const off = when(flight.off),
    on = when(flight.on);
  const local = !flight.in_air && !!flight.origin && flight.origin.ident === flight.destination?.ident;
  return (
    <ListRow
      // FlightAware's row, at the owner's ask: how it ended and its type,
      // then where from and to, each field's town and when.
      title={
        <span className="flex w-full flex-col gap-1.5 py-1">
          <span className={cn("flex items-center gap-2 font-semibold", TEXT.detail)}>
            {/* A flight still under way leads with the In the air badge
                (docs/design/rules.md 9); one that ended says how in words. */}
            {flight.in_air ? (
              <span>
                <StatusBadge variant="inAir" /> {lasted(flight.on - flight.off)}
              </span>
            ) : (
              <span className={flight.landed ? "text-go-ink" : "text-muted-foreground"}>{endedOf(flight)}</span>
            )}
            {type && <span className="ml-auto text-muted-foreground">{type}</span>}
          </span>
          <FlightEnds
            local={local}
            from={{ ident: flight.origin?.ident ?? "?", place: placeOf(flight.origin), when: whenSaid(off) }}
            to={{
              ident: flight.in_air ? "Now" : (flight.destination?.ident ?? "?"),
              place: flight.in_air ? null : placeOf(flight.destination),
              when: flight.in_air ? null : whenSaid(on),
            }}
          />
        </span>
      }
      wide
      chevron={!play}
      value={
        play ? (
          <span className="text-tint" data-testid="past-flight-play">
            <Play className="size-5 fill-current" aria-hidden />
          </span>
        ) : undefined
      }
      aria-label={play ? `Replay ${legOf(flight)}` : undefined}
      onClick={onPick}
      data-testid="past-flight"
    />
  );
});
