import { DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "../../../components/ui/dropdown-menu";
import type { RouteEdit } from "../../../lib/preferences";

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
