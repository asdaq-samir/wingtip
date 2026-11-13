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
}: {
  query: Asked;
  /** While it is asked for: "Fetching the squawks…". */
  fetching: string;
  /** Where it could not be had: "The squawks could not be fetched." */
  failed: string;
  row?: boolean;
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
        <button
          type="button"
          onClick={() => void query.refetch()}
          data-testid="query-retry"
          className="relative text-tint outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Try again
        </button>
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
