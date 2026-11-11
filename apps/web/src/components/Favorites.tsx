import { ChevronRight, CircleMinus, House, ListFilter, Plus } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { airportMarkSvg } from "../lib/map/marks/airportMark";
import { colourOf } from "../lib/map/marks/flightCategory";
import type { AirspaceClass, RecentAirport } from "../lib/preferences";
import { useAirspace } from "../lib/useAirspace";
import { useRowRemove } from "./rowRemove";
import { useAway } from "../lib/useAway";
import { SECTION_TITLE, TEXT } from "../lib/text";
import { Button } from "./ui/button";
import PullDown from "./PullDown";
import SectionTitle from "./SectionTitle";
import IconButton from "./IconButton";
import { airportQuery } from "../lib/queryClient";
export { ListPageHead } from "./ListPageHead";

/** A row's small round mark, the tile's at a list row's size. */
export function Mark({ icon, className, style }: { icon: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={cn("grid size-8 place-items-center rounded-full [&_svg]:size-4", className)} style={style} aria-hidden="true">
      {icon}
    </span>
  );
}

/** A kept airport's mark in a list's row: its chart symbol, as Favorites'
 *  and Nearest's rows draw it. */
export function KeptMark({ airport }: { airport: RecentAirport }) {
  return <KeptChartMark airport={airport} size={26} />;
}

/** A field's chart symbol in a strip's tile: 44 in the tile's 56, as wide
 *  as Home's disc reads (FavoriteStrip's, at the owner's "Airport icons
 *  too big"), Nearest's as Favorites'. */
export function TileChartMark({ children }: { children: ReactNode }) {
  return <SmallMark icon={children} className="[&_svg]:size-11" />;
}

/** A list's Edit, Done while it is being edited (the Favorites' in full). */
export function EditToggle({ editing, onToggle, testId }: { editing: boolean; onToggle: () => void; testId?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("-mr-1 h-auto px-1 py-0.5 font-normal text-tint", TEXT.row, editing && "font-semibold")}
      onClick={onToggle}
      data-testid={testId}
    >
      {editing ? "Done" : "Edit"}
    </Button>
  );
}

/** The minus before a row being edited: in a kept list's row
 *  (RemovableRow) it does the row's Remove, the list's Undo giving it
 *  back; elsewhere -- a form's segments -- what `onClick` does. */
export function RemoveMinus({ label, onClick, testId }: { label: string; onClick?: () => void; testId?: string }) {
  const row = useRowRemove();
  return (
    <IconButton label={label} className="-ml-1.5 text-destructive" onClick={row ? row.remove : onClick} data-testid={testId}>
      <CircleMinus className="size-5 fill-destructive text-white dark:text-background" />
    </IconButton>
  );
}

/**
 * A tile for a pill's strip (PillStrip): a round mark, a name and a line
 * under it -- the Airport and Aircraft tabs' Favorites, Airport's nearest
 * fields -- at the full card's Favorites' size (PlaceTile), at the owner's
 * ask ("make the fav icons the same size as the full card").
 */
export function SmallTile({
  mark,
  title,
  detail,
  label,
  onClick,
  testId,
  wide = false,
}: {
  mark: ReactNode;
  title: string;
  detail?: string;
  label?: string; // said after its words (WCAG 2.5.3, Label in Name)
  onClick: () => void;
  testId?: string;
  /** Room for a route's two idents (SavedStrip), not one's. */
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        wide ? "w-24" : "w-[4.5rem]",
        "flex shrink-0 flex-col items-center gap-1.5 rounded-xl outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {mark}
      <span className={cn("w-full truncate text-center font-medium text-foreground", TEXT.detail)}>{title}</span>
      {/* 4.5:1 on the pill's glass, as the tab bar's words are. */}
      {detail && <span className={cn("-mt-1.5 w-full truncate text-center text-foreground/65 tabular-nums", TEXT.note)}>{detail}</span>}
      {label && <span className="sr-only">, {label}</span>}
    </button>
  );
}

/**
 * One of a pill's labelled rows, the redesign's pattern at the owner's ask
 * ("make the minimal layout this big, and then design all the tabs"): a
 * title over its strip of tiles -- Saved, Favorites, Recents, Nearest --
 * and anything that acts on the row at its right (`right`: what the strip
 * shows, Aircraft's Map switch).
 */
export function PillSection({
  title,
  onMore,
  beside,
  right,
  children,
  testId,
}: {
  title: string;
  /** The list in full, the title the way to it, in the tint with its
   *  chevron -- every section's alike, the tabs' Saved, Favorites and
   *  Recents as the cards' are -- at the owner's ask ("make saved,
   *  favorites and recents into links, when clicked shows what See All
   *  does"), where the tabs' had a See All at the row's right. */
  onMore?: () => void;
  /** Beside the title: what the strip is of, to change there (Aircraft's
   *  airport asked of). */
  beside?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  // Every section's title one style (lib/text SECTION_TITLE: 20 points,
  // medium, decision 0021), its words in the text's colour and the
  // chevron in the tint where it opens the list in full (owner decision
  // 2026-11-10 (decisions page): the search's page had bold 22-point
  // titles in the tint beside these); the plain title SectionTitle itself.
  return (
    // Eight under the title: its 44-point hit area its own (the iOS audit's P1).
    <section className="flex min-w-0 flex-col gap-2" data-testid={testId}>
      <div className="flex min-h-7 items-center gap-2">
        {onMore ? (
          <button
            type="button"
            onClick={onMore}
            data-testid={testId && `${testId}-more`}
            className={cn(
              "relative flex items-center gap-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:-inset-2",
              SECTION_TITLE,
            )}
          >
            {title}
            <ChevronRight className="size-5 text-tint" aria-hidden="true" />
          </button>
        ) : (
          <SectionTitle>{title}</SectionTitle>
        )}
        {beside}
        {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * A tab's one strip, the list it shows picked from the filter menu at its
 * heading's right, at the owner's asks ("for aircraft we can have the
 * selection and show map controls to the right"; "apply the filter to
 * other cards too so for example saved and recents in fpl can be filtered
 * or favorites and recents in airport/aircraft"): FPL's Saved and Recents,
 * Airport's Favorites, Recents and Nearest, Aircraft's Favorites, Recents
 * and its questions. The title names the list shown and is the way to it
 * in full, as every section's is.
 */
export function StripSection<V extends string>({
  lists,
  shows,
  onShow,
  menuTestId,
  menuClassName,
  menuTop,
  beside,
  right,
  children,
}: {
  /** What it can show, in the menu's order, the first the one at first. */
  lists: StripList<V>[];
  shows: V;
  onShow: (value: V) => void;
  menuTestId?: string;
  menuClassName?: string;
  /** At the menu's top, a line under it: Aircraft's Show on map, at the
   *  owner's ask ("Can the aircraft map toggle be part of the filter,
   *  maybe on top?", 2026-10-23). */
  menuTop?: ReactNode;
  beside?: ReactNode;
  /** After the menu, at the row's right. */
  right?: ReactNode;
  children: ReactNode;
}) {
  const list = lists.find((l) => l.value === shows) ?? lists[0]!;
  return (
    <PillSection
      title={list.label}
      onMore={list.onMore}
      beside={beside}
      testId={list.section}
      right={
        <>
          <PillMenu
            label={`Showing ${list.label}`}
            value={list.value}
            onChange={onShow}
            testId={menuTestId}
            className={menuClassName}
            top={menuTop}
            options={lists.map((l) => ({ value: l.value, label: l.item ?? l.label, testId: l.testId, apart: l.apart }))}
          />
          {right}
        </>
      }
    >
      {children}
    </PillSection>
  );
}

/** One of the lists a strip can show (StripSection): its name -- the
 *  heading's title and its item in the menu -- and the way to it in full. */
interface StripList<V extends string> {
  value: V;
  label: string;
  /** Its item in the menu, where that says more ("Inbound…"). */
  item?: string;
  /** A line after it in the menu. */
  apart?: boolean;
  /** The list in full, the title the way to it. */
  onMore?: () => void;
  /** The section's test id while it shows this list. */
  section?: string;
  /** Its item's in the menu. */
  testId?: string;
}

/** What a strip shows, a menu behind iOS's filter glyph at its heading's
 *  right, as Mail's filter is, a line after any item `apart` says so
 *  (StripSection). */
function PillMenu<V extends string>({
  label,
  value,
  options,
  onChange,
  testId,
  className,
  top,
}: {
  /** Its name, to a screen reader and a long press: what it shows now. */
  label: string;
  value: V;
  options: { value: V; label: string; testId?: string; apart?: boolean }[];
  onChange: (value: V) => void;
  testId?: string;
  className?: string;
  /** Before the choices, a line under it (StripSection's menuTop). */
  top?: ReactNode;
}) {
  return (
    <PullDown
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      top={top}
      contentClassName={cn("min-w-44", className)}
      trigger={
        // The app's one icon-only button, 36 with a 20 glyph (the iOS
        // audit's P18), the heading's height kept round it.
        <IconButton label={label} className="-my-2 text-tint" data-testid={testId}>
          <ListFilter className="size-5" />
        </IconButton>
      }
    />
  );
}

/** A word in place of a strip's tiles -- none yet, sign in, pick an
 *  airport -- where the tiles start, in their second line's grey: one
 *  look for every strip's, where each had its own (centred or not). */
export function StripNote({ children, status = false }: { children: ReactNode; status?: boolean }) {
  return (
    <p className={cn("py-1 text-foreground/65", TEXT.note)} role={status ? "status" : undefined}>
      {children}
    </p>
  );
}

const STRIP = "-mx-1 flex gap-3 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none]";
/** A pill's row of small tiles, sliding sideways where more than fit (`className`: strips laid into it). */
export function PillStrip({ children, testId, className }: { children: ReactNode; testId?: string; className?: string }) {
  return (
    <div className={cn(STRIP, className)} data-testid={testId}>
      {children}
    </div>
  );
}

/** A strip's tile's round mark, the Favorites tile's size (PlaceTile). */
export function SmallMark({ icon, className, style }: { icon: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={cn("grid size-14 place-items-center rounded-full [&_svg]:size-6", className)} style={style} aria-hidden="true">
      {icon}
    </span>
  );
}

/** An airport's own chart symbol, small, as the map draws it
 *  (lib/map/marks/airportMark): its airspace's ring and colour, its METAR's
 *  dot, a military or private field's letter -- one mark for the pills'
 *  airports, Favorites' as Nearest's, at the owner's ask ("Airports should
 *  have the same symbols as nearest"). */
export function ChartMark({
  space,
  category,
  use,
  size = 22,
}: {
  space: AirspaceClass | null;
  category: string | null | undefined;
  use: "military" | "private" | null;
  /** Its width in points: the pills' 22, a list row's 26 (Nearest's). */
  size?: number;
}) {
  return (
    <span aria-hidden="true" className="grid shrink-0 place-items-center" style={{ width: Math.max(28, size), height: Math.max(28, size) }}>
      <span
        className="block"
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: airportMarkSvg(space, colourOf(category), use, "block size-full overflow-visible") }}
      />
    </span>
  );
}

/** A kept airport's chart symbol (ChartMark), from the field as the
 *  planner has it -- the query useAirspace asks, so none more -- its
 *  weather and whose it is with its airspace. */
export function KeptChartMark({ airport, size }: { airport: RecentAirport; size?: number }) {
  const { data } = useQuery(airportQuery(airport.ident));
  const use = data?.military === "military" ? "military" : data?.private ? "private" : null;
  // With no report of its own, the weather modelled at it, else a station's
  // within ten miles, as its card's chip and FPL's symbols have it.
  const category =
    data?.metar?.flight_category ??
    data?.modelled_weather?.flight_category ??
    (data?.nearby_metar?.near ? data.nearby_metar.metar.flight_category : null);
  return <ChartMark space={data?.airspace_class ?? airport.airspace ?? null} category={category} use={use} size={size} />;
}

/** A kept airport -- a Favorite, a Recent -- as a pill's small tile: its
 *  chart symbol, its ident and `detail`, opening its card. */
export function SmallAirportTile({
  airport,
  detail,
  onClick,
  testId = "pill-favorite",
}: {
  airport: RecentAirport;
  detail: string;
  onClick: () => void;
  testId?: string;
}) {
  const space = useAirspace(airport);
  return (
    <SmallTile
      // The chart's mark on its own, no grey round it, at the owner's ask
      // ("make fav airport icons fill the grey space around it"), at 44 in
      // the tile's 56, as wide as Home's disc reads: at 56 its ticks ran
      // past the tile and it stood larger than Home and Add beside it (the
      // owner's "Airport icons too big").
      mark={<SmallMark icon={<KeptChartMark airport={airport} size={44} />} className="[&_svg]:size-11" />}
      title={airport.ident}
      detail={detail}
      label={`${airport.ident}, ${space.name}`}
      onClick={onClick}
      testId={testId}
    />
  );
}

/** The Airport tab's pill: Home and the Favorites, small, each opening
 *  its field's card, how far each is from own ship under it. */
export function FavoriteStrip({
  home,
  favorites,
  onOpen,
  onAddHome,
  onAddFavorite,
}: {
  home: RecentAirport | null;
  favorites: RecentAirport[];
  onOpen: (airport: RecentAirport) => void;
  /** Home's Add, where none is kept yet: listed all the same, as the
   *  search's Favorites list it (FavoriteTiles). */
  onAddHome: () => void;
  /** The Favorites' Add, at the strip's end, as the full card's. */
  onAddFavorite: () => void;
}) {
  const away = useAway();
  return (
    <PillStrip testId="pill-favorites">
      <SmallTile
        mark={<SmallMark icon={<House />} className="bg-teal-600 text-white" />}
        title="Home"
        detail={home ? away(home) : "Add"}
        label={home ? `Home, ${home.ident}` : "Add Home"}
        onClick={home ? () => onOpen(home) : onAddHome}
        testId="pill-home"
      />
      {favorites.map((a) => (
        <SmallAirportTile key={a.ident} airport={a} detail={away(a)} onClick={() => onOpen(a)} />
      ))}
      {/* One Add at a time, as Airplane's strip (AircraftFavoriteStrip). */}
      {(home || favorites.length > 0) && (
        <SmallTile
          mark={<SmallMark icon={<Plus />} className="bg-foreground/8 text-tint" />}
          title="Add"
          label="Add a Favorite"
          onClick={onAddFavorite}
          testId="pill-favorite-add"
        />
      )}
    </PillStrip>
  );
}
