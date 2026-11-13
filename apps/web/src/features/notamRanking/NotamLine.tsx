import { ChevronDown, Ellipsis, Pin } from "lucide-react";
import { cn } from "cn";
import RoundButton from "../../components/RoundButton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import type { RankedNotam } from "./engineRanking";
import { TEXT } from "../../lib/text";
import { useNotamMarks } from "./notamMarks";

/**
 * One NOTAM (web.md §6): its line on why it bears on the flight first, in
 * plain words; under it the NOTAM as sent, folded behind its name (Base
 * UI's Collapsible), monospace and never rewritten -- the pilot checks the
 * words against the FAA's own; and at its end its menu, Pin to the top
 * and Mark as Read, kept on this device (notamMarks). A read one is set
 * in the secondary grey and folds with the rest; a pinned one carries a
 * pin and stays first.
 */
export default function NotamLine({ notam, testId }: { notam: RankedNotam; testId: string }) {
  const pinned = useNotamMarks((s) => s.pinned.includes(notam.id));
  const read = useNotamMarks((s) => s.read.includes(notam.id));
  const togglePin = useNotamMarks((s) => s.togglePin);
  const toggleRead = useNotamMarks((s) => s.toggleRead);
  return (
    <li
      className="flex gap-2"
      data-testid={testId}
      data-notam={notam.id}
      data-pinned={pinned ? "" : undefined}
      data-read={read ? "" : undefined}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn("tabular-nums", TEXT.prose, (notam.in_force === false || read) && "text-muted-foreground")}>{notam.why}</p>
        <Collapsible>
          <CollapsibleTrigger
            className={cn(
              "group relative inline-flex items-center gap-1 self-start font-medium text-tint outline-none after:absolute after:-inset-y-3 after:inset-x-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
              TEXT.note,
            )}
            data-testid={`${testId}-source`}
          >
            {notam.label}
            <ChevronDown className="size-4 transition-transform group-data-panel-open:rotate-180" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {/* As sent: the FAA's own text, its line breaks kept. */}
            <pre
              className={cn("mt-1 rounded-md bg-muted/60 p-2 font-mono break-words whitespace-pre-wrap", TEXT.note)}
              data-testid={`${testId}-raw`}
            >
              {notam.raw}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </div>
      {pinned && <Pin className="mt-1 size-4 shrink-0 text-tint" aria-label="Pinned" />}
      <DropdownMenu>
        <DropdownMenuTrigger render={<RoundButton label={`More for ${notam.label}`} className="size-8" data-testid={`${testId}-menu`} />}>
          <Ellipsis className="size-5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => togglePin(notam.id)} data-testid="notam-pin">
            {pinned ? "Unpin" : "Pin to Top"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggleRead(notam.id)} data-testid="notam-read">
            {read ? "Mark as Unread" : "Mark as Read"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
