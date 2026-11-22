import type { ReactNode } from "react";
import { cn } from "cn";
import { TEXT } from "../../lib/text";
import { TIMELINE_END, TIMELINE_GAP, TIMELINE_THREAD } from "./TimelineRows";

/** A row on the route's line: its mark (none for the procedure's head) in
 *  the marks' column, the route's magenta through it from top to bottom
 *  and on into the next row -- to the mark's middle on the route's last
 *  row (`stop`) -- and its words after the inset hairline. */
export function OnTheLine({ mark, stop, children }: { mark?: ReactNode; stop: boolean; children: ReactNode }) {
  return (
    <div className={cn("relative flex", TIMELINE_GAP)}>
      <span className="relative flex w-8 shrink-0 items-center justify-center self-stretch">
        <span aria-hidden="true" className={cn(TIMELINE_THREAD, "top-0", stop && "bottom-1/2")} />
        {mark && <span className="relative z-10 flex">{mark}</span>}
      </span>
      {/* 44 points under its hairline, as a point's line is (TimelineLine's
          row under its border): with the border inside the 44 a fix's
          button was 43 tall (the HIG review's P1, 2026-11-21). */}
      <div className={cn("box-content flex min-h-11 min-w-0 flex-1 items-center gap-2 border-t border-border", TIMELINE_END)}>
        {children}
      </div>
    </div>
  );
}

/** A procedure's head as its row says it: the kind and the field in the
 *  procedure's indigo, small capitals ("APPROACH · C81"), over its name,
 *  wrapping, never cut. */
export function ProcedureFace({ word, ident, name }: { word: string; ident: string; name: string }) {
  return (
    <>
      <span className={cn("block font-semibold tracking-wide text-procedure uppercase", TEXT.note)}>
        {word} · {ident}
      </span>
      {/* Wrapping, never cut: all of the name at any text size. */}
      <span className={cn("block font-semibold break-words", TEXT.row)} data-testid="procedure-name">
        {name}
      </span>
    </>
  );
}
