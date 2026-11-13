import { useState } from "react";
import { cn } from "cn";
import { Button } from "./ui/button";
import SheetDialog from "./SheetDialog";
import type { Source } from "../lib/api/flightWatch";
import { TEXT } from "../lib/text";

/**
 * The reports a line rests on, a chip each after it -- "METAR KDLH
 * 1753Z" -- as the flight watch's changes have them (FlightWatch). A tap
 * opens the report as it was sent, in the
 * app's one way of asking over the page (SheetDialog: a sheet from the
 * bottom on a phone, with its ✕, by the one card rule, the owner
 * 2026-11-10), monospace and never reformatted: a METAR, a TAF or a NOTAM is
 * read in its own code (the iOS review's rule 9), and the pilot checks
 * the words against it. The chips are the map's microphone's (RadioLayer):
 * small, round, in the tint.
 */
export default function SourceChips({ sources, testId = "source-chip" }: { sources: Source[]; testId?: string }) {
  const [open, setOpen] = useState<Source | null>(null);
  // One chip a report: the same source under two sentences is one.
  const shown = sources.filter((s, i) => sources.findIndex((o) => o.id === s.id) === i);
  if (!shown.length) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-1" data-testid={`${testId}s`}>
        {shown.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant="secondary"
            className="rounded-full text-tint"
            data-testid={testId}
            data-source={s.id}
            onClick={() => setOpen(s)}
          >
            {s.label}
          </Button>
        ))}
      </div>
      <SheetDialog
        open={open !== null}
        onOpenChange={(o) => {
          if (!o) setOpen(null);
        }}
        title={open?.label}
        description="As sent."
        testId="source-dialog"
      >
        {/* Raw, in a monospace face, wrapped only at the box's edge. */}
        <pre className={cn("max-h-[60dvh] overflow-auto font-mono break-words whitespace-pre-wrap", TEXT.note)} data-testid="source-text">
          {open?.text}
        </pre>
      </SheetDialog>
    </>
  );
}
