import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "../../../components/ui/dropdown-menu";
import { usePreferences, type RouteEdit } from "../../../lib/preferences";

const CHOICES: { value: RouteEdit; label: string }[] = [
  { value: "box", label: "Route Box" },
  { value: "folded", label: "Route Line" },
  { value: "plan", label: "Route Cards" },
];

/**
 * How FPL shows its route (lib/preferences RouteEdit), an inline pick in
 * the route's ••• menu, as iOS keeps a page's view options in its ••• menu
 * (Files' and Mail's "View As"): its heading, then the three with a
 * checkmark on the one in use. It was Setup's FPL tile; moved onto the
 * page it changes at the owner's ask (2026-11-13: "I want to move fpl
 * layout to the fpl page"). The test ids are the tile's, kept.
 */
export default function ShowRouteAs({ value, onChange }: { value: RouteEdit; onChange: (value: RouteEdit) => void }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Show Route As</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={value}
        onValueChange={(v: string) => {
          const picked = CHOICES.find((c) => c.value === v);
          if (picked) onChange(picked.value);
        }}
        data-testid="route-edit-select"
      >
        {CHOICES.map((c) => (
          <DropdownMenuRadioItem key={c.value} value={c.value} data-testid={`route-edit-${c.value}`}>
            {c.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

/**
 * What the map draws for the route, beside how FPL shows it: the route's
 * VFR checkpoints with the landmarks they were chosen from, and the Class
 * B fields' weather chips, each off unless turned on (the owner's "Let's
 * not enable waypoints for a pilot"; the chips clutter a route that
 * passes none). Their home since the Map card's layers became four (the
 * owner, 2026-11-14), as checkbox items, iOS's way for an on-or-off in a
 * menu. The test ids are the Map card's tiles', kept.
 */
export function RouteMapChoices() {
  const waypoints = usePreferences((s) => s.waypoints);
  const setWaypoints = usePreferences((s) => s.setWaypoints);
  const classB = usePreferences((s) => s.classB);
  const setClassB = usePreferences((s) => s.setClassB);
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>On the Map</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={waypoints} onCheckedChange={setWaypoints} data-testid="waypoints-toggle">
          Checkpoints
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={classB} onCheckedChange={setClassB} data-testid="class-b-toggle">
          Class B Weather
        </DropdownMenuCheckboxItem>
      </DropdownMenuGroup>
    </>
  );
}
