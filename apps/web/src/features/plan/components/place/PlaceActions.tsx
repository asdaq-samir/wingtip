import { cn } from "cn";
import { CardAction as Action } from "../../../../components/CardAction";
import { FavoriteTile } from "../../../../components/FavoriteTile";
import { useIsDesktop } from "../../../../hooks/use-desktop";
import type { AirportPlace } from "../../../../lib/api/types";
import { ACTION } from "../../../../lib/cardActions";
import { useLiveRefresh } from "../../../../lib/liveRefresh";
import { usePreferences } from "../../../../lib/preferences";
import { sameField } from "../../../../lib/procedures";
import { useShown } from "../../../../lib/shown";
import { keyHint } from "../../../../lib/shortcutKeys";
import { useCardKeys } from "../../hooks/useCardKeys";

/**
 * An airport card's actions, under its title (PlaceCard): four and no
 * more, one row of equal tiles (the owner, 2026-11-11: "fly here, add
 * stop, call and address ... no need for other buttons", Favorite in
 * Address's place since). Fly Here filled,
 * the Direct-To's symbol on it; Add as Stop, the field the route's next
 * stop, where it can be one (else the row holds three); Call, the field's
 * own phone from the FAA's airport file, greyed where it lists none; and
 * Favorite (PlaceFavorite), the head holding its Share and its close
 * alone; the address in Maps is the town link under the name and the Info
 * tab's row. Refresh is in its Weather tab. On a desktop Fly Here and
 * Add as Stop by a letter each, F and S, shown on them, while the card is
 * in sight (lib/shown: not under a card over it).
 */
export default function PlaceActions({
  place,
  flying,
  onFlyHere,
  onAddStop,
  addStopOff,
  ident,
}: {
  place: AirportPlace | null;
  /** The field's ident before its answer is in: its star already right. */
  ident: string;
  /** Fly Here tapped, the route on its way. */
  flying: boolean;
  onFlyHere: (place: AirportPlace) => void;
  /** None where the field is in the route already. */
  onAddStop?: (place: AirportPlace) => void;
  /** Why Add Stop is greyed; none where it can be added. */
  addStopOff?: string;
}) {
  const desktop = useIsDesktop();
  const shown = useShown();
  const keyed = desktop && shown && !!place;
  useCardKeys(keyed, { F: () => place && onFlyHere(place), S: onAddStop && !addStopOff ? () => place && onAddStop(place) : undefined });
  // The card keeps itself fresh as the window or the card comes back into
  // sight, whichever tab is open; its Refresh, in the Weather tab, asks now.
  useLiveRefresh("airport");
  return (
    <div className={cn("grid gap-2 pt-3", onAddStop ? "grid-cols-4" : "grid-cols-3")} data-testid="place-actions">
      <Action
        icon={<ACTION.flyHere.icon />}
        label={ACTION.flyHere.label}
        filled
        busy={flying}
        disabled={!place}
        testId="fly-here"
        keys={keyed ? keyHint("F") : undefined}
        onClick={() => place && onFlyHere(place)}
      />
      {onAddStop && (
        <Action
          icon={<ACTION.addStop.icon />}
          label={ACTION.addStop.label}
          disabled={!place || !!addStopOff}
          spoken={addStopOff ? `${ACTION.addStop.label}: ${addStopOff}` : undefined}
          onClick={() => place && onAddStop(place)}
          testId="place-add-stop"
          keys={keyed ? keyHint("S") : undefined}
        />
      )}
      <Action
        icon={<ACTION.call.icon />}
        label={ACTION.call.label}
        disabled={!place?.phone}
        href={place?.phone ? `tel:${place.phone}` : undefined}
        spoken={place?.phone ? `Call ${place.phone}` : "Call: no phone listed"}
        testId="place-call"
      />
      <PlaceFavorite ident={place?.ident ?? ident} place={place} />
    </div>
  );
}

/** Favorite, the row's last tile, where Address was (the owner, 2026-11-11:
 *  "Because address is already at the bottom, maybe replace address button
 *  with favorite"; the address stays in the town link and the Info tab):
 *  the field in the Favorites or out (FavoriteTile) -- a Favorite's star
 *  already as the card waits on its answer. */
function PlaceFavorite({ ident, place }: { ident: string; place: AirportPlace | null }) {
  const kept = usePreferences((s) => s.favoriteAirports.some((a) => sameField(a.ident, ident)));
  const toggle = usePreferences((s) => s.toggleFavoriteAirport);
  const add = () =>
    place && toggle({ ident: place.ident, name: place.name, municipality: place.municipality, lat: place.lat, lon: place.lon });
  return <FavoriteTile on={kept} disabled={!place} onToggle={add} testId="place-favorite" />;
}
