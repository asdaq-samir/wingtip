import { cn } from "cn";
import type { TimeLine } from "./notamTimes";

/**
 * A NOTAM's times (notamTimes' timeLines), labelled, one line each and
 * never wrapped, on its row and on its own card (the owner, 2026-11-23:
 * "one line each", at 390 pt and the owner's larger text): where how long
 * until it ("· in 551d") would not fit beside the time, it falls to a
 * second line the box's one-line height leaves unseen, so the time stays
 * whole and the line is shortened, never wrapped.
 */
export function NotamTimeLines({ lines, className }: { lines: TimeLine[]; className?: string }) {
  if (lines.length === 0) return null;
  return (
    <span className={cn("grid grid-cols-[auto_1fr] gap-x-2 tabular-nums", className)} data-testid="place-notam-when">
      {lines.map((t) => (
        <span key={t.label} className="contents">
          <span className="whitespace-nowrap text-muted-foreground">{t.label}</span>
          <span className="flex h-lh flex-wrap gap-x-1 overflow-hidden">
            <span className="whitespace-nowrap">{t.value}</span>
            {t.soon && <span className="whitespace-nowrap">· {t.soon}</span>}
          </span>
        </span>
      ))}
    </span>
  );
}
