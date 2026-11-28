import { Fragment, useContext, type ReactNode } from "react";
import { ACTION, CARD_ACTIONS } from "../../../lib/generated/cardActions";
import { CardCloseContext } from "../../../lib/map/cards/cardClose";
import { CardAction, CardActionRow } from "../../CardAction";
import { done as confirm } from "../../../lib/doneNote";
import { copyText } from "../../../lib/share";
import { usePointActions, type ChartPoint } from "../../../lib/map/cards/pointActions";

/**
 * A point card's actions, as an airport card's: Direct To, the plan's own
 * (usePlanSetters' directToChartPoint), from where the airplane is to the
 * point and on along the route, and Add to Route, the point a waypoint
 * where it bends the route least -- each live while there is a route to
 * do it to (usePointActions), and there but greyed while not, so the row
 * is the same full row on every point's card (the owner's iPhone,
 * 2026-11-14: one half-width tile on OBK's) -- and Copy, the VOR's
 * frequency for the radio, "Copied" by it once it is (lib/doneNote).
 */
export function PointActions({
  point,
  copy,
  addTestId = "point-add",
}: {
  point: ChartPoint;
  copy: { label: string; text: string } | null;
  /** Its Add to Route's test id where a spec had one before (a VFR waypoint's). */
  addTestId?: string;
}) {
  const close = useContext(CardCloseContext);
  const { addToRoute, directTo } = usePointActions();
  const done = (act: (p: ChartPoint) => void) => () => {
    close();
    act({ ident: point.ident, lat: point.lat, lon: point.lon });
  };
  // The navaid card's set in its order (design/card-actions.json): each tile's wiring here.
  const tiles: Record<(typeof CARD_ACTIONS.navaid)[number], ReactNode> = {
    directTo: (
      <CardAction
        icon={<ACTION.directTo.icon />}
        label={ACTION.directTo.label}
        filled
        disabled={!directTo}
        spoken={directTo ? undefined : `${ACTION.directTo.label}: needs a route and your position`}
        onClick={directTo ? done(directTo) : undefined}
        testId="point-direct-to"
      />
    ),
    addToRoute: (
      <CardAction
        icon={<ACTION.addToRoute.icon />}
        label={ACTION.addToRoute.label}
        disabled={!addToRoute}
        spoken={addToRoute ? undefined : `${ACTION.addToRoute.label}: needs a route`}
        onClick={addToRoute ? done(addToRoute) : undefined}
        testId={addTestId}
      />
    ),
    copy: copy && (
      <CardAction
        icon={<ACTION.copy.icon />}
        label={copy.label}
        spoken={`${ACTION.copy.label} ${copy.label}`}
        onClick={() => {
          // Called in the tap, as the clipboard asks; refused, nothing
          // said. "Copied" by the tile tapped, which has the focus.
          void copyText(copy.text).then(
            () => confirm("Copied"),
            () => {},
          );
        }}
        testId="point-copy"
      />
    ),
  };
  return (
    // As many columns as tiles, as the airport card's row fills its width.
    <CardActionRow columns={copy ? 3 : 2} testId="point-actions">
      {CARD_ACTIONS.navaid.map((name) => (
        <Fragment key={name}>{tiles[name]}</Fragment>
      ))}
    </CardActionRow>
  );
}
