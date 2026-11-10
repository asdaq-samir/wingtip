import { cn } from "cn";
import { CardAction as Action } from "../../../../components/CardAction";
import { useIsDesktop } from "../../../../hooks/use-desktop";
import type { AirportPlace } from "../../../../lib/api/types";
import { ACTION } from "../../../../lib/cardActions";
import { useShown } from "../../../../lib/shown";
import { useKeyHint } from "../../../../lib/shortcutKeys";
import { useCardKeys } from "../../hooks/useCardKeys";
import { mapsLink } from "./mapsLink";

/**
 * An airport card's actions, under its title (PlaceCard). The plan's three
 * first, at the one-search design's top (2026-11-09): Fly Here filled, the
 * Direct-To's symbol on it; Depart From, the field the route's start; Add
 * as Stop, the field the route's next stop -- each sets the plan and shows
 * it -- and Weather, the field's Weather tab: one row of four, as Apple
 * Maps' place card on the web has Directions, Call, Website and Tickets
 * (the owner's screenshot, 2026-11-10). Under them Call, the field's own
 * phone from the FAA's airport file, greyed where it lists none, and the
 * address in Maps. On a desktop the
 * plan's three by a letter each, F, D and S, shown on them, while the
 * card is in sight (lib/shown: not under a card over it).
 */
export default function PlaceActions({
  place,
  flying,
  onFlyHere,
  onDepartFrom,
  onAddStop,
  onWeather,
}: {
  place: AirportPlace | null;
  /** Fly Here tapped, the route on its way. */
  flying: boolean;
  onFlyHere: (place: AirportPlace) => void;
  onDepartFrom: (place: AirportPlace) => void;
  /** None where the field is in the route already. */
  onAddStop?: (place: AirportPlace) => void;
  /** The card's Weather tab, opened. */
  onWeather: () => void;
}) {
  const desktop = useIsDesktop();
  const shown = useShown();
  const keyed = desktop && shown && !!place;
  // Each letter as the pilot presses it (lib/shortcutKeys), none when off.
  const hint = useKeyHint();
  useCardKeys(keyed, {
    F: () => place && onFlyHere(place),
    D: () => place && onDepartFrom(place),
    S: onAddStop ? () => place && onAddStop(place) : undefined,
  });
  return (
    <div className="flex flex-col gap-2 pt-3" data-testid="place-actions">
      <div className={cn("grid gap-2", onAddStop ? "grid-cols-4" : "grid-cols-3")}>
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
        <Action
          icon={<ACTION.departFrom.icon />}
          label={ACTION.departFrom.label}
          disabled={!place}
          onClick={() => place && onDepartFrom(place)}
          testId="place-depart-from"
          keys={keyed ? hint("D") : undefined}
        />
        {onAddStop && (
          <Action
            icon={<ACTION.addStop.icon />}
            label={ACTION.addStop.label}
            disabled={!place}
            onClick={() => place && onAddStop(place)}
            testId="place-add-stop"
            keys={keyed ? hint("S") : undefined}
          />
        )}
        <Action
          icon={<ACTION.weather.icon />}
          label={ACTION.weather.label}
          disabled={!place}
          onClick={onWeather}
          testId="place-weather-action"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
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
    </div>
  );
}
