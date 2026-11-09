import { Check } from "lucide-react";
import { cn } from "cn";
import { useDoneNotes } from "../lib/doneNote";
import { TEXT } from "../lib/text";

/**
 * Each confirmation beside the control that made it (lib/doneNote): a
 * small glass capsule with the tint's tick, just above the control, or
 * just below it where there is no room above -- Apple's "Copied" by a
 * button, where it was a banner across the top. A polite live region, so
 * a reader hears it; it takes no tap.
 */
export default function DoneNotes() {
  const notes = useDoneNotes();
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-0 z-[100]" data-testid="done-notes">
      {notes.map(n => {
        const above = n.at.top > 56;
        return (
          <div
            key={n.id}
            data-testid="done-note"
            className={cn(
              "liquid-glass absolute flex max-w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-2 rounded-full px-3 py-2 shadow-md",
              "animate-in fade-in duration-200 motion-reduce:animate-none",
              above ? "-translate-y-full" : "",
            )}
            style={{
              // Kept on the screen: a control at its edge has its note
              // moved in, not cut off.
              left: `clamp(6rem, ${n.at.x}px, 100vw - 6rem)`,
              top: above ? n.at.top - 8 : n.at.bottom + 8,
            }}
          >
            <Check className="size-4 shrink-0 text-tint" strokeWidth={2.5} aria-hidden="true" />
            <span className={cn("truncate font-semibold", TEXT.detail)}>{n.words}</span>
            {n.detail && <span className={cn("truncate text-muted-foreground", TEXT.note)}>{n.detail}</span>}
          </div>
        );
      })}
    </div>
  );
}
