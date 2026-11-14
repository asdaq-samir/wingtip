import { useState } from "react";
import { House, Plus } from "lucide-react";
import type { RecentAirport } from "../lib/preferences";
import { placeLink } from "../lib/flightLink";
import { RemovableRow } from "./RemovableRow";
import { toast } from "../lib/toast";
import { ListGroup, ListRow } from "./GroupedList";
import { EditToggle, KeptMark, ListPageHead, Mark, RemoveMinus } from "./Favorites";
import { MoveHandle, SortableRow, SortableRows } from "./SortableRows";

/**
 * Favorites in full, as Maps' own list: Home, which a tap changes
 * through the search bar, and the kept airports, which a tap opens --
 * and with Edit, a minus before each to let it go and a handle after
 * each to drag it up or down the list (or pick it up with Enter and move it
 * with the arrow keys).
 * Add a Favorite asks the search bar for one more.
 */
export default function FavoritesList({
  home,
  favorites,
  onBack,
  onOpen,
  onChangeHome,
  onRemoveHome,
  onRemove,
  onMove,
  onAdd,
}: {
  home: RecentAirport | null;
  favorites: RecentAirport[];
  onBack: () => void;
  onOpen: (airport: RecentAirport) => void;
  onChangeHome: () => void;
  onRemoveHome: () => void;
  /** The card's star: a field in the list taken off, one not in it kept
   *  at the list's end (preferences' toggleFavoriteAirport). */
  onRemove: (airport: RecentAirport) => void;
  onMove: (from: number, to: number) => void;
  onAdd: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // Taken off with a toast's Undo, which keeps it again at the list's end
  // and moves it back to where it was.
  const remove = (airport: RecentAirport, at: number) => {
    const end = favorites.length - 1;
    onRemove(airport);
    toast.undo(
      `Removed ${airport.ident}`,
      () => {
        onRemove(airport);
        onMove(end, at);
      },
      { testId: "favorites-undo" },
    );
  };
  return (
    <div className="space-y-6" data-testid="favorites-list">
      {/* Every list's head (ListPageHead), where this was a copy of it. */}
      <ListPageHead
        title="Favorites"
        backLabel="Back to the search"
        onBack={onBack}
        testId="favorites-page"
        action={<EditToggle editing={editing} onToggle={() => setEditing((e) => !e)} testId="favorites-edit" />}
      />
      <ListGroup title="Home">
        {!home ? (
          <ListRow media={<Plus className="size-5" />} title="Add Home" onClick={onChangeHome} data-testid="favorites-home" />
        ) : (
          // Taken off as every kept list's rows are: its menu, or Edit's
          // minus (RemovableRow).
          <RemovableRow name={home.ident} label={`Remove ${home.ident} as Home`} onDelete={onRemoveHome} share={placeLink(home)}>
            {editing ? (
              <ListRow
                media={<RemoveMinus label={`Remove ${home.ident} as Home…`} testId="favorites-home-remove" />}
                title={
                  <>
                    <span className="font-mono font-semibold">{home.ident}</span> · {home.name}
                  </>
                }
                description={home.municipality ?? undefined}
              />
            ) : (
              <ListRow
                media={<Mark icon={<House />} className="bg-(--badge-home) text-white" />}
                chevron
                title={
                  <>
                    <span className="font-mono font-semibold">{home.ident}</span> · {home.name}
                  </>
                }
                description={home.municipality ?? undefined}
                onClick={onChangeHome}
                data-testid="favorites-home"
              />
            )}
          </RemovableRow>
        )}
      </ListGroup>
      <ListGroup title="Airports">
        {favorites.length === 0 && <ListRow muted title="A star on an airport's card adds it here" />}
        {/* Edited, the rows are React Aria's GridList, dragged by their
            handles (SortableRows); at rest, each opens its card. */}
        {editing && favorites.length > 0 ? (
          <SortableRows label="Favorite airports" ids={favorites.map((a) => a.ident)} onMove={onMove}>
            {favorites.map((a, index) => (
              <SortableRow key={a.ident} id={a.ident} label={a.ident}>
                <RemovableRow
                  name={a.ident}
                  label={`Remove ${a.ident} from Favorites`}
                  onDelete={() => remove(a, index)}
                  share={placeLink(a)}
                >
                  <ListRow
                    media={<RemoveMinus label={`Remove ${a.ident} from Favorites…`} />}
                    title={
                      <>
                        <span className="font-mono font-semibold">{a.ident}</span> · {a.name}
                      </>
                    }
                    description={a.municipality ?? undefined}
                  >
                    <MoveHandle label={`Move ${a.ident}`} />
                  </ListRow>
                </RemovableRow>
              </SortableRow>
            ))}
          </SortableRows>
        ) : (
          favorites.map((a, index) => (
            <RemovableRow
              key={a.ident}
              name={a.ident}
              label={`Remove ${a.ident} from Favorites`}
              onDelete={() => remove(a, index)}
              share={placeLink(a)}
            >
              <ListRow
                media={<KeptMark airport={a} />}
                chevron
                title={
                  <>
                    <span className="font-mono font-semibold">{a.ident}</span> · {a.name}
                  </>
                }
                description={a.municipality ?? undefined}
                onClick={() => onOpen(a)}
              />
            </RemovableRow>
          ))
        )}
        <ListRow media={<Plus className="size-5" />} title="Add a Favorite" onClick={onAdd} data-testid="favorites-add" />
      </ListGroup>
    </div>
  );
}
