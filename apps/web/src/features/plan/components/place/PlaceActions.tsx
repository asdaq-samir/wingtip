import { Star } from "lucide-react";
import { cn } from "cn";
import { CardAction as Action } from "../../../../components/CardAction";
import RoundButton from "../../../../components/RoundButton";
import { useIsDesktop } from "../../../../hooks/use-desktop";
import type { AirportPlace } from "../../../../lib/api/types";
import { ACTION } from "../../../../lib/cardActions";
import { useLiveRefresh } from "../../../../lib/liveRefresh";
import { FAVORITE_STAR_ON } from "../../../../lib/mapChrome";
import { usePreferences } from "../../../../lib/preferences";
import { sameField } from "../../../../lib/procedures";
import { useShown } from "../../../../lib/shown";
import { useKeyHint } from "../../../../lib/shortcutKeys";
import { useCardKeys } from "../../hooks/useCardKeys";
import { mapsLink } from "./mapsLink";

/**
 * An airport card's actions, under its title (PlaceCard): four and no
 * more, one row of equal tiles (the owner, 2026-11-11: "fly here, add
 * stop, call and address ... no need for other buttons"). Fly Here filled,
 * the Direct-To's symbol on it; Add as Stop, the field the route's next
 * stop, where it can be one (else the row holds three); Call, the field's
 * own phone from the FAA's airport file, greyed where it lists none; and
 * the address in Maps. The star is in the card's head beside its Share
 * (PlaceFavorite), Refresh in its Weather tab. On a desktop Fly Here and
 * Add as Stop by a letter each, F and S, shown on them, while the card is
 * in sight (lib/shown: not under a card over it).
 */
export default function PlaceActions({
  place,
  flying,
  onFlyHere,
  onAddStop,
  addStopOff,
}: {
  place: AirportPlace | null;
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
  // Each letter as the pilot presses it (lib/shortcutKeys), none when off.
  const hint = useKeyHint();
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
        keys={keyed ? hint("F") : undefined}
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
          keys={keyed ? hint("S") : undefined}
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
      <Action
        icon={<ACTION.address.icon />}
        label={ACTION.address.label}
        disabled={!place}
        href={place ? mapsLink(place) : undefined}
        spoken={place?.address ? `Address in Maps: ${place.address}` : "Open in Maps"}
        testId="place-address-action"
      />
    </div>
  );
}

/** The star in the card's head beside its Share, as the airplane card's
 *  is (the owner, 2026-11-11): the field in the Favorites or out, pressed
 *  while it is there -- a Favorite's star already as the card waits on its
 *  answer. */
export function PlaceFavorite({ ident, place }: { ident: string; place: AirportPlace | null }) {
  const mine = place?.ident ?? ident;
  const kept = usePreferences((s) => s.favoriteAirports.some((a) => sameField(a.ident, mine)));
  const toggle = usePreferences((s) => s.toggleFavoriteAirport);
  return (
    <RoundButton
      label={kept ? "Remove from Favorites" : "Add to Favorites"}
      aria-pressed={kept}
      disabled={!place}
      onClick={() => {
        if (place) toggle({ ident: place.ident, name: place.name, municipality: place.municipality, lat: place.lat, lon: place.lon });
      }}
      data-testid="place-favorite"
    >
      <Star className={cn("size-5", kept && FAVORITE_STAR_ON)} strokeWidth={2} />
    </RoundButton>
  );
}
