import { TableCell, TableFooter, TableRow } from "../../../../components/ui/table";
import type { Totals } from "../../../../lib/api/types";
import { one } from "../../format";

/**
 * The nav log's totals at the table's foot on a desktop (docs/design/web.md
 * §4), under the columns they sum: the distance, the time and the fuel,
 * each the engine's own total for the route (the planner's totals, the
 * strip's figures), never added up here. A column the table does not show
 * (no airplane: no time or fuel) has none.
 */
export function NavLogTotals({ totals, columns }: { totals: Totals; columns: string[] }) {
  const of: Record<string, string> = {
    waypoint: "Total",
    dist: one(totals.distance_nm),
    ete: one(totals.ete_min),
    fuel: one(totals.fuel_gal),
  };
  return (
    <TableFooter className="bg-transparent font-semibold text-foreground" data-testid="navlog-totals">
      <TableRow className="hover:bg-transparent">
        {columns.map((id) => (
          <TableCell key={id} className={id === "waypoint" ? "text-left" : undefined}>
            {of[id] ?? ""}
          </TableCell>
        ))}
      </TableRow>
    </TableFooter>
  );
}
