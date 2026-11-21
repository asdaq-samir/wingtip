import { Button } from "../../components/ui/button";
import { wantPlace } from "../../lib/navigation/wanted";
import { rowPoint, type NavLogRow } from "../plan";

/** A row's name in the Waypoint column. On a desktop's screen a field's
 *  name opens its card, as the phone's log (NavLogList) and the map do
 *  (tap what you see, docs/navigation.md); the rest of the row selects
 *  it. On paper it is the name alone. */
export function WaypointName({ row, link }: { row: NavLogRow; link: boolean }) {
  const name = rowPoint(row).name;
  const field = "airport" in row && row.airport.kind !== "fix" ? row.airport.ident : null;
  if (!link || !field) return <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>;
  return (
    <Button
      variant="link"
      size="inline"
      data-testid="navlog-field-open"
      aria-label={`${name}: open the airport`}
      onClick={(event) => {
        event.stopPropagation();
        wantPlace(field);
      }}
      className="relative min-w-0 justify-start text-left [overflow-wrap:anywhere] whitespace-normal hit-y-[11px]"
    >
      {name}
    </Button>
  );
}
