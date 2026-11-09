import { cn } from "cn";
import { Skeleton } from "./ui/skeleton";

/** Each line's width, longest first and the last short, as a paragraph's
 *  lines fall. */
const WIDTHS = ["w-full", "w-11/12", "w-4/5", "w-3/5"];

/**
 * The shape of words that are coming -- an answer, an entry, a page read
 * from a photo -- in the stock Skeleton's lines, where a spinner said
 * only that something was happening (the owner, 2026-11-09: "skeleton
 * loading in place of spinners"). Out of the accessibility tree: the
 * status line beside it says what is happening.
 */
export default function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-2", className)} data-slot="skeleton-lines">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? WIDTHS[3] : WIDTHS[i % 3])} />
      ))}
    </div>
  );
}
