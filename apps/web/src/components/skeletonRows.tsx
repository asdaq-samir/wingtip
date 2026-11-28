import type { ReactNode } from "react";
import { cn } from "cn";
import { Skeleton } from "./ui/skeleton";
import { ListRow } from "./GroupedList";
import { TEXT } from "../lib/text";

/** A line of words to come at the line's own height (QueryState's
 *  SkeletonLine, a call here so this file exports a function alone). */
const line = (className: string) => <Skeleton aria-hidden="true" className={cn("inline-block h-[0.8em] align-middle", className)} />;

/** `rows` list rows still coming, each its name and `lines` lines under it
 *  in the description's type, so each is the height of the row that
 *  replaces it; their words for a screen reader once. An array, so a
 *  ListGroup or a FirstFew draws its lines between them as between the
 *  rows to come. The lines are in the title's box: the description is a
 *  <p>, which a skeleton's <div> may not be in. */
export function skeletonRows({ rows, lines = 1, fetching }: { rows: number; lines?: number; fetching: string }): ReactNode[] {
  return Array.from({ length: rows }, (_, i) => (
    <ListRow
      key={`coming-${i}`}
      title={
        <span role={i === 0 ? "status" : undefined} className="flex flex-col gap-0.5">
          {i === 0 && <span className="sr-only">{fetching}</span>}
          <span className="block">{line("w-40")}</span>
          {Array.from({ length: lines }, (_, l) => (
            <span key={l} className={cn("block", TEXT.detail)}>
              {line(l === lines - 1 ? "w-28" : "w-52")}
            </span>
          ))}
        </span>
      }
    />
  ));
}
