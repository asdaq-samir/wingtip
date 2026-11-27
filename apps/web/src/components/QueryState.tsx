import type { ReactNode } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "cn";
import { Skeleton } from "./ui/skeleton";
import { ListRow } from "./GroupedList";
import { FINDING_TONE } from "../lib/findings";
import { TEXT } from "../lib/text";
import { NO_CONNECTION, noConnection } from "../lib/problems";
import { FieldError } from "./ui/field";
import { skeletonRows } from "./skeletonRows";
import { CardFacts } from "./CardFacts";

/** What a query says of itself (TanStack Query's own flags). */
interface Asked {
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  error?: unknown;
  /** The last try's failure while TanStack's retries go on. */
  failureReason?: unknown;
  /** "paused": waiting on a connection, which a skeleton would wait on
   *  for good. */
  fetchStatus?: "fetching" | "paused" | "idle";
  refetch: () => unknown;
}

/**
 * A list's word while what it shows is asked for -- "Fetching the
 * squawks…" -- and, where it could not be had, that it could not, with
 * Try again, in place, as CLAUDE.md asks errors to be shown: one line for
 * every list, where the checklist, the squawks, the checkride's record and
 * Nearest stayed on "Fetching…" for good after a failure, the logbook said
 * it had no flights, and the saved flights showed nothing at all (the
 * commonality audit's N-12). A row of a list (`row`), else a line of its
 * own; nothing once the answer is in.
 */
export default function QueryState({
  query,
  fetching,
  failed,
  row = false,
  rows,
  lines = 1,
}: {
  query: Asked;
  /** While it is asked for: "Fetching the squawks…". */
  fetching: string;
  /** Where it could not be had: "The squawks could not be fetched." */
  failed: string;
  row?: boolean;
  /** As many rows as are coming, where the count is known (a list of the
   *  planner's twelve fields): each a row's height from the first frame,
   *  so nothing under them moves as they come (the flicker audit's FL-9). */
  rows?: number;
  /** The lines under each row's name, as the rows that come have them. */
  lines?: number;
}) {
  // No connection: said so, not a skeleton for ever (a query paused for
  // one drew nothing at all) nor "could not be fetched" as if the server
  // were at fault; asked again by TanStack's retries once the phone is
  // back (lib/queryRetry), and Try again for the pilot meanwhile.
  const offline = noConnection(query);
  if ((query.isError && !query.isFetching) || offline) {
    const words = (
      <>
        {offline ? `${NO_CONNECTION}.` : failed}{" "}
        <BaseButton
          onClick={() => void query.refetch()}
          data-testid="query-retry"
          className="relative text-tint outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Try again
        </BaseButton>
      </>
    );
    return row ? (
      <ListRow title={<FieldError className={cn(FINDING_TONE.stop, TEXT.detail)}>{words}</FieldError>} />
    ) : (
      <FieldError className={cn("px-1", FINDING_TONE.stop, TEXT.note)}>{words}</FieldError>
    );
  }
  // While it comes: the shape of what is coming, its words for a screen
  // reader, where a grey line of "Fetching…" read as unfinished (the style
  // audit, 2026-10-26).
  if (query.isLoading || query.isError) {
    if (row && rows) return <SkeletonRows rows={rows} lines={lines} fetching={fetching} />;
    const bars = <SkeletonBars fetching={fetching} />;
    return row ? <ListRow title={bars} /> : <div className="px-1">{bars}</div>;
  }
  return null;
}

/** Two lines still coming, a line and a shorter one under it, their
 *  words for a screen reader. */
export function SkeletonBars({ fetching }: { fetching: ReactNode }) {
  return (
    <span role="status" className="flex w-full flex-col gap-2 py-1">
      <span className="sr-only">{fetching}</span>
      <Skeleton aria-hidden="true" className="h-4 w-3/5" />
      <Skeleton aria-hidden="true" className="h-3 w-2/5" />
    </span>
  );
}

/** A line of words to come at the line's own height: the stock Skeleton
 *  inline in a box set in the row's type, so it stands exactly as tall as
 *  the line of words that will take its place. */
export function SkeletonLine({ className }: { className?: string }) {
  return <Skeleton aria-hidden="true" className={cn("inline-block h-[0.8em] align-middle", className)} />;
}

/** skeletonRows (./skeletonRows) as an element. */
export function SkeletonRows(props: { rows: number; lines?: number; fetching: string }) {
  return <>{skeletonRows(props)}</>;
}

/** Each placeholder fact's name and value, ch wide, as the airport card's
 *  five run (Weather VFR, Airspace D, Elev. 808 ft, Pattern 1,800 ft,
 *  Dist. 12 nm): uneven, as words are. */
const FACT_WIDTHS: readonly (readonly [string, string])[] = [
  ["w-[6ch]", "w-[4ch]"],
  ["w-[7ch]", "w-[2ch]"],
  ["w-[4ch]", "w-[6ch]"],
  ["w-[6ch]", "w-[8ch]"],
  ["w-[4ch]", "w-[5ch]"],
];

/** A card's Info still coming: its facts strip in the real CardFacts
 *  (`fit`, wrapping as the facts do at a larger text), `facts` of them,
 *  each a name at the note's size over a value at the row's, sized in ch
 *  so they grow with the pilot's text, and its pictures' first tile
 *  (CardPictures' 4:3 at 70 % of the card, 60 % from sm), so the card
 *  opens in its own shape and fills in place, where it stood empty under
 *  a grey "Fetching…" and then jumped (the feel audit, 2026-11-27). */
export function SkeletonCardInfo({
  facts,
  fetching,
  note,
}: {
  facts: number;
  fetching: string;
  /** The fact with a note under it, a caption line kept for it: the
   *  airport card's Airspace ("Part-time"), whose note pushed the pictures
   *  down some 16 px when the facts came in at a part-time towered field
   *  (round 7's N16). */
  note?: number;
}) {
  return (
    <div role="status" data-testid="card-info-coming">
      <span className="sr-only">{fetching}</span>
      <div aria-hidden="true">
        <CardFacts testId="card-facts-coming" fit>
          {Array.from({ length: facts }, (_, i) => {
            const [name, value] = FACT_WIDTHS[i % FACT_WIDTHS.length]!;
            return (
              <div key={i} className="flex shrink-0 flex-col gap-0.5">
                <dt className={TEXT.note}>
                  <SkeletonLine className={name} />
                </dt>
                <dd className={TEXT.row}>
                  <SkeletonLine className={value} />
                </dd>
                {i === note && (
                  <dd className={TEXT.caption}>
                    <SkeletonLine className="w-[7ch]" />
                  </dd>
                )}
              </div>
            );
          })}
        </CardFacts>
      </div>
      <div className="@container pt-4" aria-hidden="true">
        <Skeleton className="aspect-4/3 w-[70%] rounded-(--radius-card) sm:w-[60%]" />
      </div>
    </div>
  );
}
