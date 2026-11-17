import { House } from "lucide-react";
import type { ReactNode } from "react";
import type { RecentAirport } from "../lib/preferences";
import { useAirspace } from "../lib/useAirspace";
import { useAway } from "../lib/useAway";
import { KeptChartMark, SmallMark, SmallTile } from "./Favorites";

// The search's round tiles, apart from the strips' small ones (Favorites):
// drawn only in a picker's search (AirportSearch), which waits for its
// first open, so none of it is in the first load (scripts/first-load.mjs).

/**
 * The row of round tiles itself -- Home, then the favorites -- shared by
 * the search bar's Favorites and the route form's pickers
 * (AirportPicker), which offer the same airports before anything is
 * typed. Without `onAddHome`, a Home not set yet is left out.
 */
export function FavoriteTiles({
  home,
  favorites,
  onOpen,
  onAddHome,
  trailing,
}: {
  home: RecentAirport | null;
  favorites: RecentAirport[];
  onOpen: (airport: RecentAirport) => void;
  onAddHome?: () => void;
  trailing?: ReactNode;
}) {
  // How far, from own ship's fix as it is: the tiles' own, drawn again at
  // each, where the page round them is not (useOwnShipNear).
  const away = useAway();
  return (
    // Out to the sheet's edges as it scrolls, its margin kept inside.
    <div className="-mx-4 flex gap-4 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none]" data-testid="favorites">
      {(home || onAddHome) && (
        <SmallTile
          mark={<SmallMark icon={<House />} className="bg-(--badge-home) text-white" />}
          title="Home"
          detail={home ? away(home) : "Add"}
          tone={home ? "muted" : "tint"}
          onClick={home ? () => onOpen(home) : onAddHome!}
        />
      )}
      {favorites.map((a) => (
        <AirspaceTile key={a.ident} airport={a} detail={away(a)} onClick={() => onOpen(a)} />
      ))}
      {trailing}
    </div>
  );
}

function AirspaceTile({ airport, detail, onClick }: { airport: RecentAirport; detail: string; onClick: () => void }) {
  const space = useAirspace(airport);
  // Its chart symbol on the tile, as Nearest's fields wear theirs, at the
  // owner's ask, where it was a plane on the airspace's colour.
  return (
    <SmallTile
      mark={<SmallMark icon={<KeptChartMark airport={airport} size={32} />} className="bg-foreground/8 [&_svg]:size-8" />}
      title={airport.ident}
      detail={detail}
      tone="muted"
      onClick={onClick}
      label={`${airport.ident}, ${space.name}`}
    />
  );
}
