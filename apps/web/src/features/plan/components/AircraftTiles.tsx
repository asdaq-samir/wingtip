import { Plus } from "lucide-react";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { PillStrip, SmallMark, SmallTile } from "../../../components/Favorites";
import { HomePlane, PLANE_TILE, PlaneMark } from "../../../components/PlaneMarks";
import { RemovableRow } from "../../../components/RemovableRow";
import { keptKind } from "../../../lib/aircraftKind";
import { planeLink } from "../../../lib/flightLink";
import { usePreferences, type KeptAircraft } from "../../../lib/preferences";

/**
 * The airplanes kept, on the one search's page and in its lists in full:
 * the Favorites' tiles, the Recents' tiles and the Recents' rows. They were
 * the traffic's page's too, with a search field of its own, which went for
 * the one search (the owner, 2026-11-14: "Do we have older dead code?").
 * A tap on one is the caller's: opened, or kept where the search was asked
 * for one (useSearchPanel's pickAirplane).
 */

/** The airplanes starred, as small tiles -- each its name and type -- in the
 *  search page's Favorites row after the airports. */
export function AircraftFavoriteStrip({
  onOpen,
  onAddMine,
  onAddFavorite,
  showAdd = true,
}: {
  onOpen: (kept: KeptAircraft) => void;
  /** My Airplane's Add: the search asked for it. */
  onAddMine: () => void;
  /** The Favorites' Add, at the strip's end: the search asked for one. */
  onAddFavorite: () => void;
  /** False where the strip's Add is drawn by the row it is in (the search's
   *  one Add for airports and airplanes). */
  showAdd?: boolean;
}) {
  const favorites = usePreferences((s) => s.favoriteAircraft);
  const mine = usePreferences((s) => s.myAircraft);
  return (
    <PillStrip testId="pill-aircraft-favorites">
      {/* My Airplane first, with Add until one is kept, as Home is. */}
      <SmallTile
        mark={<SmallMark icon={<HomePlane kind={mine ? keptKind(mine) : "high"} />} className={PLANE_TILE} />}
        title="Airplane"
        detail={mine?.name ?? "Add"}
        label={mine ? `Airplane, ${mine.name}` : "Add your Airplane"}
        onClick={mine ? () => onOpen(mine) : onAddMine}
        testId="pill-aircraft-mine"
      />
      {favorites.map((a) => (
        <KeptAircraftTile key={a.hex} aircraft={a} onClick={() => onOpen(a)} testId="pill-aircraft-favorite" />
      ))}
      {/* One Add at a time: with no airplane of the pilot's own, its tile's
          Add is the strip's, where a second Add tile beside it read as the
          same twice (the UI audit, 2026-11-09). */}
      {showAdd && (mine || favorites.length > 0) && (
        <SmallTile
          mark={<SmallMark icon={<Plus />} className="bg-foreground/8 text-tint" />}
          title="Add"
          label="Add a Favorite"
          onClick={onAddFavorite}
          testId="pill-aircraft-favorite-add"
        />
      )}
    </PillStrip>
  );
}

/** A kept airplane -- a Favorite, a Recent -- as a small tile: the
 *  airplane's mark, its name and its type. */
function KeptAircraftTile({ aircraft, onClick, testId }: { aircraft: KeptAircraft; onClick: () => void; testId: string }) {
  return (
    <SmallTile
      mark={<PlaneMark kind={keptKind(aircraft)} />}
      title={aircraft.name}
      detail={aircraft.type ?? undefined}
      label={`${aircraft.name}${aircraft.type ? `, ${aircraft.type}` : ""}`}
      onClick={onClick}
      testId={testId}
    />
  );
}

/** The airplanes opened last as tiles, newest first, as the Favorites' are,
 *  at the owner's ask ("Recents should also have symbols instead of a
 *  list"), under the airports' in the search page's Recents; none drawn
 *  while there are none, the airports' saying so. */
export function AircraftRecentTiles({ onPick }: { onPick: (kept: KeptAircraft) => void }) {
  const recents = usePreferences((s) => s.recentAircraft);
  if (!recents.length) return null;
  return (
    <PillStrip testId="pill-aircraft-recents">
      {recents.map((a) => (
        <KeptAircraftTile key={a.hex} aircraft={a} onClick={() => onPick(a)} testId="aircraft-recent" />
      ))}
    </PillStrip>
  );
}

/** The airplanes' rows in the Recents in full (RecentsPage's `airplanes`),
 *  after the airports': each taken off by a swipe to the left (or a long
 *  press); the page's Clear clears them with the airports. */
export function AircraftRecentRows({ onPick }: { onPick: (kept: KeptAircraft) => void }) {
  const recents = usePreferences((s) => s.recentAircraft);
  const removeRecent = usePreferences((s) => s.removeRecentAircraft);
  if (!recents.length) return null;
  return (
    <ListGroup title="Airplanes">
      {recents.map((a) => (
        <RemovableRow
          key={a.hex}
          name={a.name}
          label={`Remove ${a.name} from Recents`}
          onDelete={() => removeRecent(a.hex)}
          share={planeLink(a)}
        >
          <ListRow
            media={<PlaneMark small kind={keptKind(a)} />}
            data-testid="aircraft-recent"
            title={<span className="font-semibold">{a.name}</span>}
            description={a.type ?? undefined}
            chevron
            onClick={() => onPick(a)}
          />
        </RemovableRow>
      ))}
    </ListGroup>
  );
}
