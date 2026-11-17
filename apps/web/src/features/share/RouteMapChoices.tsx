import { DropdownMenuCheckboxItem, DropdownMenuGroup, DropdownMenuLabel } from "../../components/ui/dropdown-menu";
import { usePreferences } from "../../lib/preferences";

/**
 * What the map draws for the route, in the route's ••• menu: the route's
 * VFR checkpoints with the landmarks they were chosen from, and the Class
 * B fields' weather chips, each off unless turned on (the owner's "Let's
 * not enable waypoints for a pilot"; the chips clutter a route that
 * passes none). Their home since the Map card's layers became four (the
 * owner, 2026-11-14), as checkbox items, iOS's way for an on-or-off in a
 * menu. The test ids are the Map card's tiles', kept.
 */
export default function RouteMapChoices() {
  const waypoints = usePreferences((s) => s.waypoints);
  const setWaypoints = usePreferences((s) => s.setWaypoints);
  const classB = usePreferences((s) => s.classB);
  const setClassB = usePreferences((s) => s.setClassB);
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>On the Map</DropdownMenuLabel>
      <DropdownMenuCheckboxItem checked={waypoints} onCheckedChange={setWaypoints} data-testid="waypoints-toggle">
        Checkpoints
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem checked={classB} onCheckedChange={setClassB} data-testid="class-b-toggle">
        Class B Weather
      </DropdownMenuCheckboxItem>
    </DropdownMenuGroup>
  );
}
