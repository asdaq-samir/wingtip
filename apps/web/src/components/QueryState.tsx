import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "cn";
import { Skeleton } from "./ui/skeleton";
import { ListRow } from "./GroupedList";
import { FINDING_TONE } from "../lib/findings";
import { TEXT } from "../lib/text";
import { NO_CONNECTION, noConnection } from "../lib/problems";
import { FieldError } from "./ui/field";

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
      <ListRow
        title={
          <span role="alert" className={cn(FINDING_TONE.stop, TEXT.detail)}>
            {words}
          </span>
        }
      />
    ) : (
      <FieldError className={cn("px-1", FINDING_TONE.stop, TEXT.note)}>{words}</FieldError>
    );
  }
  // While it comes: the shape of what is coming, its words for a screen
  // reader, where a grey line of "Fetching…" read as unfinished (the style
  // audit, 2026-10-26).
  if (query.isLoading || query.isError) {
    if (row && rows) return <SkeletonRows rows={rows} lines={lines} fetching={fetching} />;
    const bars = (
      <span role="status" className="flex w-full flex-col gap-2 py-1">
        <span className="sr-only">{fetching}</span>
        <Skeleton aria-hidden="true" className="h-4 w-3/5" />
        <Skeleton aria-hidden="true" className="h-3 w-2/5" />
      </span>
    );
    return row ? <ListRow title={bars} /> : <div className="px-1">{bars}</div>;
  }
  return null;
}

/** A line of words to come at the line's own height: the stock Skeleton
 *  inline in a box set in the row's type, so it stands exactly as tall as
 *  the line of words that will take its place. */
export function SkeletonLine({ className }: { className?: string }) {
  return <Skeleton aria-hidden="true" className={cn("inline-block h-[0.8em] align-middle", className)} />;
}

/** `rows` list rows still coming, each its name and `lines` lines under it
 *  in the row's own type, so each is the height of the row that replaces
 *  it; their words for a screen reader once. */
export function SkeletonRows({ rows, lines = 1, fetching }: { rows: number; lines?: number; fetching: string }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <ListRow
          key={i}
          data-testid="skeleton-row"
          title={
            <span role={i === 0 ? "status" : undefined}>
              {i === 0 && <span className="sr-only">{fetching}</span>}
              <SkeletonLine className="w-40" />
            </span>
          }
          description={
            lines > 0 && (
              <>
                {Array.from({ length: lines }, (_, l) => (
                  <span key={l} className="block">
                    <SkeletonLine className={l === lines - 1 ? "w-28" : "w-52"} />
                  </span>
                ))}
              </>
            )
          }
        />
      ))}
    </>
  );
}
