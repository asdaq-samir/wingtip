import { useEffect, type RefObject } from "react";
import { Search } from "lucide-react";
import { cn } from "cn";
import { TEXT } from "../lib/text";
import { Command, CommandField } from "./ui/command";
import AirportResults, { AirportRow, PickerGroup } from "./AirportResults";
import { FavoriteTiles } from "./FavoriteTiles";
import { usePreferences, type RecentAirport } from "../lib/preferences";
import { useAirportSearch } from "../lib/useAirportSearch";
import { useIsMobile } from "../hooks/use-mobile";
import CloseButton from "./CloseButton";

/**
 * What AirportPicker opens: the field, Favorites and Recents until
 * something is typed, and the lookup's rows -- shadcn's `Command`, so its
 * keyboard handling (Up/Down/Enter/Escape, the highlighted row,
 * `aria-activedescendant`) is Base UI's Autocomplete's. A chunk of its own
 * (AirportPicker's `Search`), as it is no part of what the first screen
 * draws.
 */
export default function AirportSearch({
  query,
  setQuery,
  open,
  fixes,
  ariaLabel,
  input,
  onPick,
  onClose,
}: {
  query: string;
  setQuery: (query: string) => void;
  open: boolean;
  fixes: boolean;
  ariaLabel: string;
  input: RefObject<HTMLInputElement | null>;
  /** An ident taken: a row's, or what was typed. */
  onPick: (ident: string) => void;
  onClose: () => void;
}) {
  const onPhone = useIsMobile();
  // Enter takes the highlighted row only once the rows answer what is in
  // the box: it used to take it whenever there were rows, so "KD", a
  // pause, then "LH" and a quick Enter set the field to the first "KD..."
  // airport rather than KDLH.
  const { typed, rows, answered } = useAirportSearch(query, open, fixes);
  // The field focused as it opens, as the search bar is on its tap; here
  // too for the first open, when this came a moment after the card did
  // (its chunk) and the card's own focus (AirportPicker's) found no field.
  useEffect(() => input.current?.focus(), [input]);

  // Before anything is typed, what the search bar offers too: Home and
  // the favorites as tiles, and the airports picked last.
  const home = usePreferences((p) => p.homeAirport);
  const favorites = usePreferences((p) => p.favoriteAirports);
  const recents = usePreferences((p) => p.recentAirports);
  const choose = (airport: RecentAirport) => {
    usePreferences.getState().addRecentAirport(airport);
    onPick(airport.ident);
  };

  return (
    // The server already filters (an ident, a word of a name or a town),
    // so the list's own filter is off (Command's): it would drop a row
    // whose name matched but whose ident did not. The first row lit, as a
    // search's is, for Enter to take.
    <Command
      autoHighlight="always"
      value={query}
      onValueChange={setQuery}
      className="gap-4 overflow-visible bg-transparent"
      // Room under the last row for the keyboard, so it scrolls above it:
      // on a phone this is in a card (ResponsivePopover's SheetCard), inside
      // the card's Drawer viewport, whose VirtualKeyboardProvider sets the
      // keyboard's height as --drawer-keyboard-inset (0 with none).
      style={onPhone ? { paddingBottom: "var(--drawer-keyboard-inset, 0px)" } : undefined}
    >
      {/* The field, and a close beside it, as Maps' search sheet has:
          on a phone the sheet stands over nearly the whole screen.
          A field, not a control grown to its hit area: 44 tall as
          the search field of Maps' sheet is, its whole box the place
          to type. */}
      <div className="flex shrink-0 items-center gap-2">
        <div
          className={cn("flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-foreground/8 px-4 text-muted-foreground", TEXT.row)}
        >
          <Search className="size-5 shrink-0" aria-hidden="true" />
          <CommandField
            ref={input}
            // Short enough for a phone's field, as Maps' "Search Maps"
            // is: "Search airports and waypoints" was cut at "wayp".
            // Its label says the whole of it.
            placeholder={fixes ? "Search" : `Search for a ${ariaLabel.toLowerCase()}`}
            aria-label={fixes ? "Search airports and waypoints" : `Search for a ${ariaLabel.toLowerCase()}`}
            // The search field's own clear.
            type="search"
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              // What was typed goes through when the rows are not the
              // answer to it yet, and when the lookup has nothing for it
              // (a private strip, say).
              if (e.key === "Enter" && typed && !(answered && rows.length > 0)) {
                e.preventDefault();
                e.preventBaseUIHandler();
                onPick(typed);
              }
            }}
          />
        </div>
        <CloseButton onClick={onClose} data-testid="picker-close" />
      </div>
      {/* Its own height, not shrunk: with the keyboard up the sheet is
          short, and the tiles were squeezed to a sliver of their tops. */}
      {!typed && (home || favorites.length > 0) && (
        <div className="shrink-0">
          <FavoriteTiles home={home} favorites={favorites} onOpen={choose} />
        </div>
      )}
      {/* Dimmed while they answer something older than the box. */}
      <AirportResults
        rows={rows}
        answered={!typed || answered}
        onAirport={choose}
        onWaypoint={onPick}
        empty={typed && `No ${fixes ? "airport or waypoint" : "airport"} matches; Enter keeps what you typed.`}
      >
        {!typed && recents.length > 0 && (
          <PickerGroup heading="Recents">
            {recents.map((a) => (
              <AirportRow key={a.ident} airport={a} recent onSelect={() => choose(a)} />
            ))}
          </PickerGroup>
        )}
        {!typed && recents.length === 0 && !home && favorites.length === 0 && (
          <p className={cn("px-1 text-muted-foreground", TEXT.note)}>Search by an airport's ident, its name or its town.</p>
        )}
      </AirportResults>
    </Command>
  );
}
