import { CircleCheck, CircleHelp, OctagonAlert, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { Spinner } from "./ui/spinner";
import { FINDING_TONE, type Finding } from "../lib/findings";

const ICONS = { ok: CircleCheck, caution: TriangleAlert, stop: OctagonAlert, unknown: CircleHelp };

/**
 * A check's finding as a mark (lib/findings): a tick in green, a triangle in
 * amber, an octagon in red -- a stop sign's shape, so the two warnings
 * differ by more than colour -- a question in grey, the stock spinner
 * while it is worked out. Each tab's rows start with one, as the briefing's
 * warnings always have.
 */
export default function FindingIcon({ finding, className }: { finding: Finding; className?: string }) {
  if (finding === "pending")
    return (
      <Spinner className={cn("size-5 shrink-0", FINDING_TONE[finding], className)} role={undefined} aria-label={undefined} aria-hidden />
    );
  const Icon = ICONS[finding];
  return <Icon className={cn("size-5 shrink-0", FINDING_TONE[finding], className)} aria-hidden />;
}
