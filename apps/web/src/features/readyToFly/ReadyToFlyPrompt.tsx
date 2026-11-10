import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogAction,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { routeKeyOf, useBriefPlan } from "../../lib/briefPlan";
import { underway } from "../../lib/map/position/glide";
import { useOwnShip } from "../../lib/map/position/ownShip";
import { ReadyAction } from "./ReadyToFly";
import { useReadyToFly } from "./useReadyToFly";

/** The routes already asked about, this visit: once per route, so a dry
 *  run played again or own ship turned off and on is not asked twice. */
const asked = new Set<string>();

/**
 * Ready to fly, shown by itself once as the pilot starts: a dry run
 * begun, or own ship (You on the Map) turned on while the airplane is
 * still on the ground -- the pilot's own start of flying mode, which
 * then comes on at flying speed. Not at flying speed itself: a dialog on
 * the takeoff roll or the climb would be a distraction. Only with
 * something to fix, and the pilot may fly anyway (warn, never limit): its
 * actions fix in place, as the Brief's row does.
 */
export function ReadyToFlyPrompt({ dryPlaying }: { /** A dry run playing (the plan's pastFlight). */ dryPlaying: boolean }) {
  const ready = useReadyToFly();
  const route = useBriefPlan((p) => (p.routed ? routeKeyOf(p) : null));
  const ownShip = useOwnShip((s) => s.enabled);
  const started = dryPlaying || ownShip;
  const was = useRef(started);
  const [open, setOpen] = useState(false);
  const caution = ready.answer?.finding === "caution";
  useEffect(() => {
    const begun = started && !was.current;
    was.current = started;
    // Own ship turned on in the air (a GPS fix already at flying speed)
    // is not a start on the ground: nothing then.
    const fix = useOwnShip.getState().fix;
    const onGround = dryPlaying || !(fix && underway(fix));
    if (begun && onGround && route && caution && !asked.has(route)) {
      asked.add(route);
      setOpen(true);
    }
  }, [started, dryPlaying, route, caution]);
  const answer = ready.answer;
  if (!answer) return null;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent data-testid="ready-prompt">
        <AlertDialogHeader>
          <AlertDialogTitle>{answer.line}</AlertDialogTitle>
          <AlertDialogDescription render={<div className="flex flex-col gap-2 text-left" />}>
            {answer.actions.map((item) => (
              <ReadyAction key={item.key} item={item} ready={ready} onDone={() => setOpen(false)} />
            ))}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction data-testid="ready-fly-anyway">Fly Anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
