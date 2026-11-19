import { useContext } from "react";
import { ACTION } from "../../../lib/cardActions";
import { degreesMinutes } from "../../../lib/coords";
import { altFt, knots } from "../../../lib/format";
import { ICON } from "../../../lib/icons";
import { CardCloseContext } from "../../../lib/map/cards/cardClose";
import { MapCard } from "../../../lib/map/cards/MapCard";
import { useOwnFix } from "../../../lib/map/position/ownShip";
import { askSearch } from "../../../lib/oneSearch";
import { wantScreen } from "../../../lib/navigation/wanted";
import { CardAction } from "../../CardAction";

/**
 * Own ship's card, a tap on the airplane on the map (OwnShipGl), as Apple
 * Maps' My Location opens one (the owner, 2026-11-18): where it is and how
 * high and fast the GPS says, and two things a pilot does from there --
 * Nearest, the fields nearest it (the "nearest" screen, opened as a link
 * opens it: lib/navigation/wanted), and
 * Direct To, the one search asked for the field to fly to (`direct`, D's
 * own). Nothing is worked out here: the figures are the GPS's as it gives
 * them, written by lib/format.
 */
export function OwnShipCard() {
  const fix = useOwnFix();
  const close = useContext(CardCloseContext);
  const line = fix
    ? [
        degreesMinutes(fix),
        fix.altitudeFt != null && `${altFt(fix.altitudeFt)} ft GPS`,
        fix.speedKt != null && fix.speedKt >= 1 && knots(fix.speedKt),
      ]
        .filter(Boolean)
        .join(" · ")
    : "Position not known";
  return (
    <MapCard title="My Location" subtitle={line}>
      <div className="grid grid-cols-2 gap-2" data-testid="own-ship-actions">
        <CardAction
          icon={<ICON.nearest />}
          label="Nearest"
          filled
          onClick={() => {
            close();
            wantScreen("nearest");
          }}
          testId="own-ship-nearest"
        />
        <CardAction
          icon={<ACTION.directTo.icon />}
          label={ACTION.directTo.label}
          onClick={() => {
            close();
            askSearch("direct");
          }}
          testId="own-ship-direct-to"
        />
      </div>
    </MapCard>
  );
}
