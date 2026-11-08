import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { guideFor } from "./guideFor";
import { TEXT } from "../lib/text";

/**
 * Under the Hearing line of Listen through (ListenThrough): what the live
 * input brings, from the audio gear catalogue (lib/audioGear) by its
 * label -- the owner's look and go (2026-11-03): one line at a glance,
 * the steps folded under a tap. The radio: "Hears the radio". A voice --
 * a headset's boom mic, a panel's phone mode -- "Hears your voice, not
 * the radio", and "How to hear the radio" opening its maker's steps.
 * Gear only a ground test can tell: "May hear the radio: test it on the
 * ground", and "How to test it". Nothing for what it can't name.
 */
export default function InputGuide({ label }: { label: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const guide = guideFor(label);
  if (!guide) return null;
  if (!guide.how) {
    return <p className={cn("font-semibold text-go-ink", TEXT.detail)} data-testid="input-guide" data-hears={guide.hears}>{guide.line}</p>;
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("flex flex-col gap-1", TEXT.detail)} data-testid="input-guide" data-hears={guide.hears}>
      <p className="font-semibold text-caution-ink">{guide.line}</p>
      {/* Its 44-point area a pseudo-element round the words. */}
      <CollapsibleTrigger
        data-testid="input-guide-how"
        className="relative flex items-center gap-1 self-start rounded-sm text-tint outline-none after:absolute after:-inset-x-2 after:-inset-y-[11px] after:content-[''] focus-visible:ring-2 focus-visible:ring-ring"
      >
        {guide.how}
        <ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent asChild>
        <ol className={cn("list-decimal pl-5 text-foreground/80", TEXT.note)} data-testid="input-guide-steps">
          {guide.steps.map(step => <li key={step}>{step}</li>)}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
