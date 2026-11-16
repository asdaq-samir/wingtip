import { Button as BaseButton } from "@base-ui/react/button";
import { House } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";
import type { RecentAirport } from "../lib/preferences";
import { useAirspace } from "../lib/useAirspace";
import { useAway } from "../lib/useAway";
import { TEXT } from "../lib/text";
import { KeptChartMark } from "./Favorites";

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
        <PlaceTile
          icon={<House />}
          className="bg-(--badge-home) text-white"
          title="Home"
          detail={home ? away(home) : "Add"}
          tinted={!home}
          onClick={home ? () => onOpen(home) : onAddHome!}
          testId="favorite-home"
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
    <PlaceTile
      icon={<KeptChartMark airport={airport} size={32} />}
      title={airport.ident}
      detail={detail}
      onClick={onClick}
      label={`${airport.ident}, ${space.name}`}
      className="bg-foreground/8 [&_svg]:size-8"
    />
  );
}

/** A round tile and its words under it, as Maps' Favorites: the
 *  airports' here, and the airplanes' own (features/plan AircraftTiles). */
/** A strip's tile: its round mark over its name, a detail under it --
 *  Favorites' places. */
function PlaceTile({
  icon,
  className,
  style,
  title,
  label,
  detail,
  tinted,
  onClick,
  disabled,
  testId,
}: {
  icon: ReactNode;
  className?: string;
  style?: CSSProperties;
  title: string;
  /** What a screen reader hears, where the tile's look says more than its words. */
  label?: string;
  detail?: string;
  tinted?: boolean;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <BaseButton
      onClick={onClick}
      data-testid={testId}
      disabled={disabled}
      className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      <span className={cn("grid size-14 place-items-center rounded-full [&_svg]:size-6", className)} style={style} aria-hidden="true">
        {icon}
      </span>
      <span className={cn("w-full truncate text-center font-medium text-foreground", TEXT.detail)}>{title}</span>
      {detail && (
        <span className={cn("-mt-1.5 w-full truncate text-center", TEXT.note, tinted ? "text-tint" : "text-muted-foreground")}>
          {detail}
        </span>
      )}
      {/* Named by its words, the rest after them (WCAG 2.5.3, Label in Name). */}
      {label && <span className="sr-only">, {label}</span>}
    </BaseButton>
  );
}
