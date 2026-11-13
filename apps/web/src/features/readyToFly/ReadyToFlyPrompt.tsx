import { Suspense, lazy, useEffect, useRef, useState } from "react";
import SheetDialog from "../../components/SheetDialog";
import { routeKeyOf, useBriefPlan } from "../../lib/briefPlan";
import { underway } from "../../lib/map/position/glide";
import { useOwnShip } from "../../lib/map/position/ownShip";
import { useReadyToFly } from "./useReadyToFly";

/** The prompt's actions, the Brief's own rows (ReadyToFly), on the Brief's
 *  chunk: drawn only once a start finds something to fix, so they are not
 *  in the first load every pilot waits for (scripts/first-load.mjs). */
const ReadyAction = lazy(() => import("./ReadyToFly").then((m) => ({ default: m.ReadyAction })));

/** The routes already asked about, this visit: once per route, so a dry
 *  run played again or own ship turned off and on is not asked twice. */
const asked = new Set<string>();

/**
 * Ready to fly, shown by itself once as the pilot starts: a dry run
 * begun, or own ship (You on the Map) turned on while the airplane is
 * still on the ground -- the pilot's own start of flying mode, which
 * then comes on at flying speed. Not at flying speed itself: a question on
 * the takeoff roll or the climb would be a distraction. Only with
 * something to fix, and the pilot may fly anyway (warn, never limit): its
 * actions fix in place, as the Brief's row does.
 */
export function ReadyToFlyPrompt({ dryPlaying }: { /** A dry run playing (the plan's pastFlight). */ dryPlaying: boolean }) {
  const ready = useReadyToFly();
  const route = useBriefPlan((p) => (p.routed ? routeKeyOf(p) : null));
  // The pilot's own start only: the map turning own ship on as it opens
  // (locateOnOpen) is no start, or every open on the ground would ask.
  const ownShip = useOwnShip((s) => s.enabled && !s.byPage);
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
  // The app's one way of asking (SheetDialog): from the bottom on a phone,
  // with its ✕, by the one card rule (the owner, 2026-11-10), where a
  // centred alert stood over the map; Fly Anyway the answer under it.
  return (
    <SheetDialog
      alert
      open={open}
      onOpenChange={setOpen}
      title={answer.line}
      action={{ label: "Fly Anyway", onClick: () => setOpen(false), testId: "ready-fly-anyway" }}
      testId="ready-prompt"
    >
      <div className="flex flex-col gap-2 text-left">
        <Suspense fallback={null}>
          {answer.actions.map((item) => (
            <ReadyAction key={item.key} item={item} ready={ready} onDone={() => setOpen(false)} />
          ))}
        </Suspense>
      </div>
    </SheetDialog>
  );
}
