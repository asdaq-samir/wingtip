import { useState } from "react";
import { Ellipsis, Pin } from "lucide-react";
import { cn } from "cn";
import IconButton from "../../components/IconButton";
import { NotamAsSent } from "../../components/NotamAsSent";
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
  const [open, setOpen] = useState(false);
  return (
    <li className="flex gap-2" data-testid={testId} data-notam={notam.id} data-pinned={pinned ? "" : undefined}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Two lines at most, in full once its name under it opens the NOTAM as sent. */}
        <p
          className={cn("tabular-nums", !open && "line-clamp-2", TEXT.prose, (notam.in_force === false || read) && "text-muted-foreground")}
        >
          {notam.why}
        </p>
        <NotamAsSent label={notam.label} raw={notam.raw} open={open} onOpenChange={setOpen} testId={testId} />
      </div>
      {pinned && <Pin className="mt-1 size-4 shrink-0 text-tint" aria-label="Pinned" />}
      <DropdownMenu>
        <DropdownMenuTrigger render={<IconButton round label={`More for ${notam.label}`} className="size-8" data-testid={`${testId}-menu`} />}>
          <Ellipsis className="size-5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => togglePin(notam.id)}>{pinned ? "Unpin" : "Pin to Top"}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggleRead(notam.id)}>{read ? "Mark as Unread" : "Mark as Read"}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
