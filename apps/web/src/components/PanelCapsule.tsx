import { Search } from "lucide-react";
import { useRef, type ReactNode, type RefObject } from "react";
import { cn } from "cn";
import { TEXT } from "../lib/text";
import { usePreferences, type RecentAirport } from "../lib/preferences";
import { ListGroup, ListRow } from "./GroupedList";
import { ClearList, RemovableRow } from "./RemovableRow";
import { KeptMark, ListPageHead } from "./Favorites";
import { placeLink } from "../lib/flightLink";
import { InputGroup, InputGroupAddon } from "./ui/input-group";
import { SearchField as AriaSearchField, SearchFieldClear, SearchFieldInput } from "./ui/search-field";
import { PANEL_FIELD } from "./panelField";

/**
 * The search bar, as Maps' is, at the top of a tab's sheet the whole
 * width (Settings a tab of the bar, not a button beside it). Focused, the
 * sheet comes all the way up (`onFocus`); what is typed cleared inside it.
 * React Aria's SearchField (ui/search-field): its clear, and its Escape,
 * which clears what is typed and, once it is empty, puts the search away.
 * Enter picks the first airport that answers, or the ident typed.
 */
export function SearchField({
  value,
  onChange,
  onFocus,
  onCancel,
  onSubmit,
  placeholder = "Search airports and airplanes",
  inputRef,
  label,
  testId = "search-airports",
  icon = Search,
  capitals = false,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  /** What it asks for: an airport to open, or the one to keep as Home. */
  placeholder?: string;
  /** What a screen reader hears, where it says more than the placeholder. */
  label?: string;
  testId?: string;
  /** Its glyph: the magnifier, or a pin for where from (Nearest). */
  icon?: typeof Search;
  /** Typed in capitals, as callsigns and registrations are. */
  capitals?: boolean;
  /** Its clear, where clearing does more than empty it (Nearest's goes back
   *  to the position). */
  onClear?: () => void;
  /** For a tap elsewhere (Favorites' Add) to focus it within the tap, which
   *  is when iOS brings the keyboard up. */
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const own = useRef<HTMLInputElement>(null);
  const input = inputRef ?? own;
  const Icon = icon;
  return (
    <form
      role="search"
      className="flex w-full items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {/* 46 tall, as the one search it stands in for is (OneSearchField):
          on the sheet the grey of iOS's search field, on the glass capsule
          a lighter pane of the glass, no line round it but the focus's, its
          44-point hit area its own. The magnifier drawn fine and grey, as SF Symbols'. */}
      <AriaSearchField
        value={value}
        onChange={onChange}
        onClear={() => {
          if (onClear) onClear();
          else onChange("");
        }}
        // Escape with something typed is the field's own clear; with the
        // field empty it puts the search away, as the close beside it did.
        onKeyDown={(e) => {
          if (e.key === "Escape" && !value) {
            input.current?.blur();
            onCancel();
          }
        }}
        onFocus={onFocus}
        aria-label={label ?? placeholder}
        className="min-w-0 flex-1"
      >
        <InputGroup
          className={cn(
            "h-[2.875rem] min-w-0 gap-2 rounded-full border-0 px-3.5 text-muted-foreground shadow-none",
            // Focused, a fine ring in the tint round it, as Apple's field
            // has and the one search's does (OneSearchField), in place of
            // the stock group's heavier one: it had none at all.
            "has-[[data-slot=input-group-control]:focus-visible]:ring-1 has-[[data-slot=input-group-control]:focus-visible]:ring-tint",
            PANEL_FIELD,
            TEXT.row,
          )}
        >
          <InputGroupAddon className="p-0">
            <Icon className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          </InputGroupAddon>
          <SearchFieldInput
            ref={input}
            enterKeyHint="search"
            autoCorrect="off"
            spellCheck={false}
            autoCapitalize={capitals ? "characters" : undefined}
            placeholder={placeholder}
            data-testid={testId}
            className={cn("h-full px-0 py-0 text-foreground placeholder:text-muted-foreground", TEXT.row)}
          />
          {/* What is typed cleared inside the field, as iOS's search field
              clears it: the field's own, shown while something is typed. */}
          <InputGroupAddon align="inline-end" className="p-0 group-data-empty/search-field:hidden">
            <SearchFieldClear aria-label="Clear the search" data-testid="search-clear" />
          </InputGroupAddon>
        </InputGroup>
      </AriaSearchField>
    </form>
  );
}

/** The airports picked last, each taken off from its row's menu (its •••
 *  or a long press), at the pilot's ask, as Maps' Recents are. */
function RecentAirportRows({
  recents,
  onPick,
  title,
}: {
  recents: RecentAirport[];
  onPick: (airport: RecentAirport) => void;
  title?: string;
}) {
  const remove = usePreferences((s) => s.removeRecentAirport);
  return (
    <ListGroup title={title}>
      {recents.map((a) => (
        <RemovableRow
          key={a.ident}
          name={a.ident}
          label={`Remove ${a.ident} from Recents`}
          onDelete={() => remove(a.ident)}
          share={placeLink(a)}
        >
          <ListRow
            media={<KeptMark airport={a} />}
            title={
              <>
                <span className="font-mono font-semibold">{a.ident}</span> · {a.name}
              </>
            }
            description={a.municipality ?? undefined}
            onClick={() => onPick(a)}
            data-testid="airport-recent"
          />
        </RemovableRow>
      ))}
    </ListGroup>
  );
}

/** The Recents in full, from their section's title: the airports opened
 *  last, then the airplanes (`airplanes`, the plan feature's rows: the
 *  traffic's own Recents page went for the one search's, 2026-11-14), and
 *  Clear for all of them, asked first. */
export function RecentsPage({
  onBack,
  onPick,
  airplanes,
}: {
  onBack: () => void;
  onPick: (airport: RecentAirport) => void;
  airplanes: ReactNode;
}) {
  const recents = usePreferences((s) => s.recentAirports);
  const planes = usePreferences((s) => s.recentAircraft.length);
  const clear = () => {
    const prefs = usePreferences.getState();
    prefs.clearRecentAirports();
    prefs.clearRecentAircraft();
  };
  return (
    <>
      <ListPageHead
        title="Recents"
        backLabel="Back to the search"
        onBack={onBack}
        testId="airport-recents-page"
        action={
          (recents.length > 0 || planes > 0) && (
            <ClearList
              title="Clear the Recents?"
              description="The airports and airplanes opened last are forgotten in this browser. Favorites stay."
              onClear={clear}
              testId="recents-clear"
            />
          )
        }
      />
      {recents.length > 0 ? (
        <RecentAirportRows recents={recents} onPick={onPick} title={planes > 0 ? "Airports" : undefined} />
      ) : (
        planes === 0 && (
          <p className={cn("px-1 text-muted-foreground", TEXT.note)}>None yet: the airports and airplanes opened are kept here.</p>
        )
      )}
      {airplanes}
    </>
  );
}
