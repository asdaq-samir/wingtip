import { Search } from "lucide-react";
import { useRef, type RefObject } from "react";
import { cn } from "cn";
import { TEXT } from "../lib/text";
import { usePreferences, type RecentAirport } from "../lib/preferences";
import { ListGroup, ListRow } from "./GroupedList";
import { ClearList, RemovableRow } from "./RemovableRow";
import { KeptMark, ListPageHead } from "./Favorites";
import { placeLink } from "../lib/flightLink";
import ClearButton from "./ClearButton";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";
import { PANEL_FIELD } from "./panelField";

/**
 * The search bar, as Maps' is, at the top of a tab's sheet the whole
 * width (Settings a tab of the bar, not a button beside it). Focused, the
 * sheet comes all the way up (`onFocus`); what is typed cleared inside it
 * (ClearButton); Escape puts the search away. Enter picks the first
 * airport that answers, or the ident typed.
 */
export function SearchField({
  value,
  onChange,
  onFocus,
  onCancel,
  onSubmit,
  placeholder = "Search airports",
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
          a lighter pane of the glass, no line round it, its 44-point hit
          area its own. The magnifier drawn fine and grey, as SF Symbols'. */}
      <InputGroup
        className={cn(
          "h-[2.875rem] min-w-0 flex-1 gap-2 rounded-full border-0 px-3.5 text-muted-foreground shadow-none has-[[data-slot=input-group-control]:focus-visible]:ring-0",
          PANEL_FIELD,
          TEXT.row,
        )}
      >
        <InputGroupAddon className="p-0">
          <Icon className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={input}
          type="search"
          enterKeyHint="search"
          autoCorrect="off"
          spellCheck={false}
          autoCapitalize={capitals ? "characters" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          // Escape puts the search away, as the close beside it did.
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              input.current?.blur();
              onCancel();
            }
          }}
          placeholder={placeholder}
          aria-label={label ?? placeholder}
          data-testid={testId}
          className={cn(
            "h-full min-w-0 px-0 py-0 text-foreground placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden",
            TEXT.row,
          )}
        />
        {/* What is typed cleared inside the field, as iOS's search field
            clears it. */}
        {value && (
          <InputGroupAddon align="inline-end" className="p-0">
            <ClearButton
              label="Clear the search"
              testId="search-clear"
              onClear={() => {
                if (onClear) onClear();
                else onChange("");
                input.current?.focus();
              }}
            />
          </InputGroupAddon>
        )}
      </InputGroup>
    </form>
  );
}

/** The airports picked last, each taken off from its row's menu (its •••
 *  or a long press), at the pilot's ask, as Maps' Recents are. */
function RecentAirportRows({ recents, onPick }: { recents: RecentAirport[]; onPick: (airport: RecentAirport) => void }) {
  const remove = usePreferences((s) => s.removeRecentAirport);
  return (
    <ListGroup>
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

/** The airports' Recents in full, from their section's title: every one,
 *  and Clear for all of them, asked first. */
export function AirportRecentsPage({ onBack, onPick }: { onBack: () => void; onPick: (airport: RecentAirport) => void }) {
  const recents = usePreferences((s) => s.recentAirports);
  const clear = usePreferences((s) => s.clearRecentAirports);
  return (
    <>
      <ListPageHead
        title="Recents"
        backLabel="Back to the search"
        onBack={onBack}
        testId="airport-recents-page"
        action={
          recents.length > 0 && (
            <ClearList
              title="Clear the Recents?"
              description="The airports opened last are forgotten in this browser. Favorites stay."
              onClear={clear}
              testId="recents-clear"
            />
          )
        }
      />
      {recents.length > 0 ? (
        <RecentAirportRows recents={recents} onPick={onPick} />
      ) : (
        <p className={cn("px-1 text-muted-foreground", TEXT.note)}>None yet: the airports opened are kept here.</p>
      )}
    </>
  );
}
