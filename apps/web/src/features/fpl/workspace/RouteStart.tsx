import { flushSync } from "react-dom";
import { FileTrigger } from "react-aria-components";
import { Pressable } from "react-aria/Pressable";
import FileDrop from "../../../components/FileDrop";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import { FieldClearButton } from "../../../components/ui/field-clear";
import { usePlanUndo } from "../../../lib/planUndo";
import { TEXT } from "../../../lib/text";
import { EndRow, OpenRouteFileRow, TIMELINE_CARD, TypeRouteRow } from "../../procedures";
import { openRouteFile, ROUTE_FILE_ENDINGS, ROUTE_FILE_TYPES } from "../../shared-flight";
import type { PlanSlices } from "../vm/planSlices";

type StartSlices = PlanSlices<"route" | "routeList">;

/**
 * The timeline's last row before the route is whole (the owner,
 * 2026-11-18: the empty route drawn as the whole one is): Type or Paste a
 * Route, where Add a Stop is after, opening the route's field under the
 * card (RouteEditor), focused in the tap itself, so a phone's keyboard
 * comes up with it. At its end the field's own controls while it is
 * folded, where they were at its end: half a route's ✕, and a route
 * just cleared, its Undo (the plan's one Undo, as every edit's toast has). None while
 * the field is open, which is the row then.
 */
export function TypeRow({ vm }: { vm: StartSlices }) {
  const { hasPoints, routed } = vm.route;
  const { boxOpen, clearRoute, setRouteOpen } = vm.routeList;
  const routeUndo = usePlanUndo((u) => (u.undoName === "Route" ? u.undo : null));
  if (boxOpen) return null;
  const type = () => {
    flushSync(() => setRouteOpen(true));
    document.querySelector<HTMLElement>('[data-testid="route-type"]')?.focus();
  };
  const trailing =
    hasPoints && !routed ? (
      <FieldClearButton aria-label="Clear the route" onClick={clearRoute} data-testid="route-box-clear" />
    ) : !hasPoints && routeUndo ? (
      <Button
        variant="plain"
        size="inline"
        onClick={routeUndo}
        data-testid="route-undo"
        className={cn("relative px-1 text-tint hit-2", TEXT.row)}
      >
        Undo
      </Button>
    ) : undefined;
  return <TypeRouteRow onType={type} trailing={trailing} />;
}

/** Half a route's end still to pick, before or after the one it has: its
 *  row on the timeline, the line running on from the departure to it. */
export function MissingEnd({ vm, end }: { vm: StartSlices; end: "Departure" | "Destination" }) {
  const { pickEnd } = vm.routeList;
  return <EndRow end={end} onPick={() => pickEnd(end)} line={end === "Departure"} first={end === "Departure"} />;
}

/**
 * A route file opened from the empty route: React Aria's FileTrigger, the
 * device's own picker, its hidden input pressed by the row (the
 * timeline's row is its own button). The file is read and previewed
 * before it is used (features/shared-flight), as a shared flight is.
 */
function OpenFileRow() {
  // The row the FileTrigger's pressable child (Pressable), as Documents'
  // Add a PDF is: a FileTrigger with none warned "A PressResponder was
  // rendered without a pressable child" on every empty route.
  return (
    <FileTrigger
      acceptedFileTypes={[...ROUTE_FILE_TYPES, ...ROUTE_FILE_ENDINGS]}
      onSelect={(files) => files?.[0] && void openRouteFile(files[0])}
      data-testid="route-file-input"
    >
      <Pressable>
        <OpenRouteFileRow />
      </Pressable>
    </FileTrigger>
  );
}

/**
 * FPL's route with no point yet, as the timeline draws a whole one (the
 * owner, 2026-11-18: "the empty fpl page looks a bit different than filled
 * one"): its card, the departure's and the destination's rows to pick, on
 * the course's line, the route typed or pasted under them, and a route
 * file opened, picked or dropped on the card (an iPad's Files beside the
 * app, a desktop's Finder).
 */
export function EmptyRoute({ vm }: { vm: StartSlices }) {
  return (
    <FileDrop
      label="Drop a route file (.fpl or .gpx) to preview it"
      types={ROUTE_FILE_TYPES}
      extensions={ROUTE_FILE_ENDINGS}
      onFiles={(files) => void openRouteFile(files[0]!)}
    >
      <div className={TIMELINE_CARD} role="group" aria-label="The route" data-testid="route-empty">
        <MissingEnd vm={vm} end="Departure" />
        <MissingEnd vm={vm} end="Destination" />
        <TypeRow vm={vm} />
        <OpenFileRow />
      </div>
    </FileDrop>
  );
}
