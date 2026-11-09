import { cn } from "cn";
import { Button } from "../../../../components/ui/button";
import { requestAirplanePick } from "../../../../lib/pickAirplane";
import { useAirplaneChosen } from "../../../../lib/preferences";
import { TEXT } from "../../../../lib/text";

/**
 * Where an airplane's figure would be and there is none: with no airplane
 * picked, "Pick an airplane"; with one whose profile lacks it, a prompt to
 * add it. Both open the existing airplane picker (lib/pickAirplane). No
 * stock airplane's figure stands in (the owner, 2026-11-09).
 */
export function NotInProfile({ what, testId }: { what: string; testId?: string }) {
  const chosen = useAirplaneChosen();
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-muted-foreground", TEXT.prose)} data-testid={testId}>
      <span>{chosen ? `${what}: not in this airplane's profile.` : `${what} needs an airplane.`}</span>
      <Button
        variant="ghost"
        size="sm"
        className="relative h-auto p-0 text-tint after:absolute after:-inset-3"
        onClick={requestAirplanePick}
        data-testid="pick-airplane"
      >
        {chosen ? "Add it to the airplane" : "Pick an airplane"}
      </Button>
    </div>
  );
}
