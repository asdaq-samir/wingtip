import type { ReactNode } from "react";
import { cn } from "cn";
import { OctagonAlert, TriangleAlert } from "lucide-react";
import { TEXT } from "../../../../lib/text";
import SectionTitle from "../../../../components/SectionTitle";
import { passLine, type TfrWhen } from "../../lib/passTimes";
import { FINDING_TONE } from "../../../../lib/findings";
import { TFR_WORDS } from "./briefingWords";

// The small pieces the briefing's parts share (FlightBriefingView).

/**
 * The narrative, print only, when the pilot had it written. On screen it
 * is the Brief tab's (BriefNarrative), whose button is no use on paper,
 * so a printed copy has its own text sitting directly in the page.
 * Writing one just to have it for a printout nobody asked for would be
 * a real, billed Claude call spent on nothing.
 */
export function BriefingNarrativePrintBlock({ text }: { text: string | null }) {
  if (!text) return null;
  // On paper only, at paper's own 14: no finger, no type scale.
  return (
    <div className="hidden break-inside-avoid-page border-b border-border px-4 py-3 print:block print:break-inside-avoid">
      <SectionTitle>Narrative</SectionTitle>
      <p className={cn("mt-2 text-muted-foreground", TEXT.detail)}>{text}</p>
    </div>
  );
}

/** When the flight gets to a TFR, and whether it is in force then: red
 *  where it is. */
export function PassNote({ when }: { when: { pass: Date; state: TfrWhen } | null }) {
  if (!when) return null;
  return (
    <span className={cn("block", when.state === "in-force" && cn("font-semibold", FINDING_TONE.stop))} data-testid="tfr-pass">
      {`You pass about ${passLine(when.pass)}, ${TFR_WORDS[when.state]}`}
    </span>
  );
}

/** A warning on a section's title, seen before its content: in red for
 *  what stops the flight as planned, amber for what to look at. */
export function Flag({ finding, testId, children }: { finding: "stop" | "caution"; testId: string; children: ReactNode }) {
  const Icon = finding === "stop" ? OctagonAlert : TriangleAlert;
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold", FINDING_TONE[finding], TEXT.note)} data-testid={testId}>
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

/** A section's line while what it shows is still coming, or failed. */
export function Pending({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground" role="status">
      {children}
    </p>
  );
}
