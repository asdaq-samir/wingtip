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
import { duration, spokenDuration } from "../../../../lib/format";

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
 *
 * Laid out as Apple Maps' place card's (the owner, 2026-11-14, C1 on the
 * canvas V1d9RDbmY1aczc4LfXed7a): each tile its glyph over its word and
 * taller, 56 points, Fly Here saying the time to get there where it can
 * be worked out ("≈ 38m", flyHereTime) as Maps' Directions tile says
 * "9 min", and "Fly Here" where it cannot.
 */
export default function PlaceActions({
  place,
  flying,
  onFlyHere,
  onAddStop,
  addStopOff,
  ident,
  time,
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
  /** The minutes there at the airplane's cruise, no wind (useFlyHereMinutes); none where not known. */
  time?: { minutes: number; tasKt: number } | null;
}) {
  const desktop = useIsDesktop();
  const shown = useShown();
  // A field NASR lists as closed is never offered to land at (decision
  // 0043): neither flown to nor added as a stop, its label said instead.
  const closed = place?.closed ?? null;
  const keyed = desktop && shown && !!place;
  useCardKeys(keyed, {
    F: closed ? undefined : () => place && onFlyHere(place),
    S: onAddStop && !addStopOff && !closed ? () => place && onAddStop(place) : undefined,
  });
  // The card keeps itself fresh as the window or the card comes back into
  // sight, whichever tab is open; its Refresh, in the Weather tab, asks now.
  useLiveRefresh("airport");
  // The time where it is known, never for a field closed to landing.
  const timed = time && !closed ? time : null;
  return (
    // Every tile 56 tall (min-h-14) as Maps' are: the shared tile keeps its
    // own size elsewhere, where the half card has no room for it.
    <div className={cn("grid gap-2 pt-3 *:min-h-14", onAddStop ? "grid-cols-4" : "grid-cols-3")} data-testid="place-actions">
      <Action
        icon={<ACTION.flyHere.icon />}
        // "≈": the book's speed in still air, not the nav log's legs (as the figure strip marks its estimate).
        label={timed ? `≈ ${duration(timed.minutes)}` : ACTION.flyHere.label}
        filled
        busy={flying}
        disabled={!place || !!closed}
        spoken={
          closed
            ? `${ACTION.flyHere.label}: ${closed}`
            : timed
              ? `${ACTION.flyHere.label}, about ${spokenDuration(timed.minutes)} at ${Math.round(timed.tasKt)} knots, no wind`
              : undefined
        }
        testId="fly-here"
        keys={keyed ? keyHint("F") : undefined}
        onClick={() => place && onFlyHere(place)}
      />
      {onAddStop && (
        <Action
          icon={<ACTION.addStop.icon />}
          label={ACTION.addStop.label}
          disabled={!place || !!addStopOff || !!closed}
          spoken={addStopOff || closed ? `${ACTION.addStop.label}: ${addStopOff ?? closed}` : undefined}
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
