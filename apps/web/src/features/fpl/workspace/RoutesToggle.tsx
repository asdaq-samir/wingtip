import { Signpost } from "lucide-react";
import { Toggle } from "../../../components/ui/toggle";
import { PANEL_FIELD_FILL } from "../../../components/panelField";
import { useRoutesShown } from "./routesShown";

/**
 * The suggested routes' button at the start of FPL's first row, before the
 * airplane's bar (the owner, 2026-11-17: first "a button on top right ...
 * Which shows route pills just above the stops", then "add the routes
 * button on the top left"): the stock
 * Toggle, pressed while the pills are out above the route (FplRoute), in
 * the same 36-point disc and field fill as the page's toggle (PageToggle),
 * filled in the tint while on as the glass toggle's own look, its 44-point
 * area a pseudo-element.
 */
export function RoutesToggle() {
  const shown = useRoutesShown((s) => s.shown);
  return (
    <Toggle
      pressed={shown}
      onPressedChange={(next) => useRoutesShown.setState({ shown: next })}
      aria-label="Suggested routes"
      data-testid="routes-toggle"
      className={`relative size-9 shrink-0 rounded-full p-0 text-tint after:absolute after:-inset-1 after:rounded-full after:content-[''] data-pressed:bg-tint data-pressed:text-white print:hidden ${PANEL_FIELD_FILL}`}
    >
      <Signpost className="size-5" strokeWidth={1.75} aria-hidden="true" />
    </Toggle>
  );
}
