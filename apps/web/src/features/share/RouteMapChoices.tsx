import { DropdownMenuCheckboxItem, DropdownMenuGroup, DropdownMenuLabel } from "../../components/ui/dropdown-menu";
import { usePreferences } from "../../lib/preferences";

/**
 * What the map draws for the route, in the route's ••• menu: the route's
 * VFR checkpoints with the landmarks they were chosen from, off unless
 * turned on (the owner's "Let's not enable waypoints for a pilot"). Its
 * home since the Map card's layers became four (the owner, 2026-11-14), a
 * checkbox item, iOS's way for an on-or-off in a menu. The Class B fields'
 * weather is always drawn (the owner, 2026-11-17), no item of its own.
 */
export default function RouteMapChoices() {
  const waypoints = usePreferences((s) => s.waypoints);
  const setWaypoints = usePreferences((s) => s.setWaypoints);
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>On the Map</DropdownMenuLabel>
      <DropdownMenuCheckboxItem checked={waypoints} onCheckedChange={setWaypoints} data-testid="waypoints-toggle">
        Checkpoints
      </DropdownMenuCheckboxItem>
    </DropdownMenuGroup>
  );
}
