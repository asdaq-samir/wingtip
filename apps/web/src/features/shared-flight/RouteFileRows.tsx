import { ListGroup, ListRow } from "../../components/GroupedList";
import { SkeletonLine } from "../../components/QueryState";
import { TEXT } from "../../lib/text";
import type { RouteFilePlan } from "./useRouteFilePlan";

/**
 * A route file's points before it is used, in the order it flies them:
 * each by its ident, the pilot's own points by the name off the nearest
 * fix they go in as, and a point left out -- a closed field, one no fix
 * is near -- said so on its row. Why the route cannot be used, where it
 * cannot, said over them, in place (lib/problems' rule: where it happens).
 */
export function RouteFileRows({ file }: { file: RouteFilePlan }) {
  return (
    <>
      {file.problem && (
        <p className={TEXT.prose} data-testid="route-file-problem">
          {file.problem}
        </p>
      )}
      {file.rows.length > 0 && (
        <ListGroup title={file.title}>
          {file.rows.map((row, i) => (
            <ListRow
              key={`${i}-${row.title}`}
              title={<span className="font-mono">{row.title}</span>}
              description={row.note ?? (row.ident === null && file.naming ? <SkeletonLine className="w-32" /> : undefined)}
              value={row.ident && row.ident !== row.title ? <span className="font-mono">{row.ident}</span> : undefined}
              data-testid="route-file-point"
            />
          ))}
        </ListGroup>
      )}
    </>
  );
}
