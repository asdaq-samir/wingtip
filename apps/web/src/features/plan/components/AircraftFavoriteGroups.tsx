import { Plus } from "lucide-react";
import { Mark, RemoveMinus } from "../../../components/Favorites";
import { HomePlane, PLANE_ROW, PlaneMark } from "../../../components/PlaneMarks";
import { MoveHandle, SortableRow, SortableRows } from "../../../components/SortableRows";
import { keptKind } from "../../../lib/aircraftKind";
import { planeLink } from "../../../lib/flightLink";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { RemovableRow } from "../../../components/RemovableRow";
import { usePreferences, type KeptAircraft } from "../../../lib/preferences";
import { toast } from "../../../lib/toast";

/**
 * The airplanes in the Favorites in full (FavoritesList's `airplanes`), after
 * the airports, as the one search's page has them in its one Favorites row:
 * the Airplane, the pilot's own, which a tap changes through the search, and
 * the airplanes kept, which a tap opens -- and with the list's Edit, a minus
 * before each to let it go and a handle after each to drag it up or down
 * (or pick it up with Enter and move it with the arrow keys). Add an
 * Airplane asks the search for one more. The traffic's own Favorites page,
 * with a head of its own, went with that page (the owner, 2026-11-14).
 */
export default function AircraftFavoriteGroups({
  editing,
  onOpen,
  onChangeMine,
  onAdd,
}: {
  /** The list's Edit (FavoritesList's). */
  editing: boolean;
  onOpen: (kept: KeptAircraft) => void;
  /** The search asked for the pilot's own airplane. */
  onChangeMine: () => void;
  /** The search asked for one more to keep. */
  onAdd: () => void;
}) {
  const favorites = usePreferences((s) => s.favoriteAircraft);
  const mine = usePreferences((s) => s.myAircraft);
  const setMine = usePreferences((s) => s.setMyAircraft);
  const toggle = usePreferences((s) => s.toggleFavoriteAircraft);
  const move = usePreferences((s) => s.moveFavoriteAircraft);
  // Taken off with a toast's Undo, as the airports' Favorites are: kept
  // again at the end, then moved back to where it was.
  const remove = (a: KeptAircraft) => {
    const at = favorites.findIndex((f) => f.hex === a.hex);
    const end = favorites.length - 1;
    toggle(a);
    toast.undo(
      `Removed ${a.name}`,
      () => {
        toggle(a);
        move(end, at);
      },
      { testId: "aircraft-favorites-undo" },
    );
  };
  const name = (a: KeptAircraft) => <span className="font-semibold">{a.name}</span>;
  return (
    <>
      <ListGroup title="Airplane">
        {!mine ? (
          <ListRow
            media={<Plus className="size-5" />}
            title="Add your Airplane"
            onClick={onChangeMine}
            data-testid="aircraft-favorites-mine"
          />
        ) : (
          // Taken off as every kept list's rows are (RemovableRow).
          <RemovableRow
            name={mine.name}
            label={`Remove ${mine.name} as your Airplane`}
            onDelete={() => setMine(null)}
            share={planeLink(mine)}
          >
            {editing ? (
              <ListRow
                media={<RemoveMinus label={`Remove ${mine.name} as your Airplane…`} testId="aircraft-favorites-mine-remove" />}
                title={name(mine)}
                description={mine.type ?? undefined}
              />
            ) : (
              <ListRow
                media={<Mark icon={<HomePlane kind={keptKind(mine)} />} className={PLANE_ROW} />}
                chevron
                title={name(mine)}
                description={mine.type ?? undefined}
                onClick={onChangeMine}
                data-testid="aircraft-favorites-mine"
              />
            )}
          </RemovableRow>
        )}
      </ListGroup>
      <ListGroup title="Airplanes">
        {favorites.length === 0 && <ListRow muted title="A star on an airplane's card adds it here" />}
        {/* Edited, the rows are React Aria's GridList, dragged by their
            handles (SortableRows); at rest, each opens its card. */}
        {editing && favorites.length > 0 ? (
          <SortableRows label="Favorite airplanes" ids={favorites.map((a) => a.hex)} onMove={move}>
            {favorites.map((a) => (
              <SortableRow key={a.hex} id={a.hex} label={a.name}>
                <RemovableRow name={a.name} label={`Remove ${a.name} from Favorites`} onDelete={() => remove(a)} share={planeLink(a)}>
                  <ListRow
                    media={<RemoveMinus label={`Remove ${a.name} from Favorites…`} />}
                    title={name(a)}
                    description={a.type ?? undefined}
                    data-testid="aircraft-favorites-row"
                  >
                    <MoveHandle label={`Move ${a.name}`} />
                  </ListRow>
                </RemovableRow>
              </SortableRow>
            ))}
          </SortableRows>
        ) : (
          favorites.map((a) => (
            <RemovableRow
              key={a.hex}
              name={a.name}
              label={`Remove ${a.name} from Favorites`}
              onDelete={() => remove(a)}
              share={planeLink(a)}
            >
              <ListRow
                media={<PlaneMark small kind={keptKind(a)} />}
                chevron
                title={name(a)}
                description={a.type ?? undefined}
                onClick={() => onOpen(a)}
                data-testid="aircraft-favorites-row"
              />
            </RemovableRow>
          ))
        )}
        <ListRow media={<Plus className="size-5" />} title="Add an Airplane" onClick={onAdd} data-testid="aircraft-favorites-add" />
      </ListGroup>
    </>
  );
}
