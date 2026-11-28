import { Search } from "lucide-react";
import { cn } from "cn";
import { SHEET_BAR } from "../../../components/panelField";
import { CommandClear, CommandField } from "../../../components/ui/command";
import { Kbd } from "../../../components/ui/kbd";
import { useIsDesktop } from "../../../hooks/use-desktop";
import { searchKeys } from "../../../lib/oneSearch";
import { TEXT } from "../../../lib/text";
import { useVoice, VoiceButton } from "../../voice";
import type { OneSearchModel } from "./useOneSearch";

/**
 * The one search's field itself (OneSearchField): the magnifier, the
 * Autocomplete's input, its clear and the microphone. In the sheet's first
 * row; while a picker asks (Add Stop, Change Stop, the departure) under
 * the ask's title instead, at the top of its suggestions (OneSearchResults),
 * as Apple Maps' Add Stop sheet has it (the owner's screenshot,
 * 2026-11-20). Its voice is the one search's ("search"), shared wherever
 * the field is drawn.
 */
export default function SearchBox({
  model,
  inputRef,
  using,
}: {
  model: OneSearchModel;
  inputRef: React.RefObject<HTMLInputElement | null>;
  using: boolean;
}) {
  const desktop = useIsDesktop();
  const voice = useVoice("search", (said) => {
    model.setTyped(said);
    inputRef.current?.focus();
  });
  // FPL's head's height (SHEET_BAR: 49 at the default size), a white card
  // on the sheet's grey, its own 44-point hit area.
  return (
    <label
      className={cn(
        // A container, so its mic can step aside when it is narrow (below).
        "@container/search relative flex items-center gap-2 pr-0.5 pl-3.5 text-muted-foreground",
        SHEET_BAR,
        // Focused, a fine ring in the tint round it, as Apple's field has.
        "focus-within:ring-1 focus-within:ring-tint",
        TEXT.row,
      )}
    >
      <Search className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <CommandField
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        // The short words in sight, which fit beside the mic and Cancel at
        // the larger text sizes; the whole sentence said (F-S2).
        placeholder={voice.listening ? voice.prompt : model.placeholder}
        aria-label={model.label}
        // Open only while its results are in the sheet (PlanSidebar's
        // search page): the Autocomplete is always open, inline, and
        // said "expanded" with no list to point at (axe's
        // aria-required-attr, aria-controls missing).
        {...(model.typed || model.direct ? {} : { "aria-expanded": false })}
        data-testid="search-airports"
        onFocus={model.focus}
        // The APG combobox's keys (docs/design/web.md §1) are Base UI's
        // as they are, the first row highlighted for Enter (the root's
        // autoHighlight), and the clear the search field's own; Escape
        // lets the field go.
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            model.cancel();
          }
          // A picker's Enter before the rows answer what is typed: what
          // is typed, not the first row of an older answer -- an ident the
          // lookup does not know (a private strip) still goes through, as
          // each picker's own field did (airport-search.spec). Base UI's
          // Enter would take the lit row of the older answer, and it has
          // no prop for rows that are not the answer yet, so its handler
          // is kept from running (its documented way, preventBaseUIHandler).
          const rows = model.airports.length + model.waypoints.length;
          if (e.key === "Enter" && model.pick && model.typed && (!model.answered || rows === 0)) {
            e.preventDefault();
            e.preventBaseUIHandler();
            model.pickIdent(model.typed);
          } else if (e.key === "Enter" && model.pick && model.typed && !e.currentTarget.getAttribute("aria-activedescendant")) {
            // Rows that answered after the typing (the planner's lookup on
            // a slow link) come in with none lit, Base UI 1.9's fix for
            // asynchronous results (#5818) notwithstanding: no
            // aria-activedescendant and no data-highlighted row
            // (airport-search.spec), so its Enter did nothing. Enter takes
            // the first, as it would have been lit.
            const first = model.airports[0]?.ident ?? model.waypoints[0]?.ident;
            if (first) {
              e.preventDefault();
              e.preventBaseUIHandler();
              model.pickIdent(first);
            }
          }
        }}
        // The browser's own clear put away for the field's (CommandClear),
        // the one every field has.
        className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {/* Base UI's own clear: shown while something is typed, the
          words cleared through the root's onValueChange, the focus kept.
          Its 44-point area (12 round its 20) stays clear of the mic's (its
          own 44) rather than overlapping it: 16 apart, where the row's gap of
          8 let a tap just right of the ✕ start the mic */}
      <CommandClear aria-label="Clear the search" data-testid="search-clear" className="mr-2" />
      {!model.typed && desktop && !using && <Kbd aria-hidden="true">{searchKeys()}</Kbd>}
      {/* The microphone, the field's trailing button: on-device speech
          only (lib/speechLocal), so none where the browser has no
          recognizer. In the tint, pressed while it listens. */}
      {voice.offered && (
        <VoiceButton
          field="search"
          label="Search by voice"
          onPress={() => {
            // The search opened as the mic is tapped, so the words show
            // in the field and why nothing was heard under it.
            if (!voice.listening) model.focus();
            voice.press();
          }}
          testId="one-search-mic"
          // Off the field where it is under 180 px wide, so the words keep
          // their room: at a large text size the row's round buttons grow
          // with the text, and at twice the size the field was 0 wide and
          // took no typing (card-scroll.spec's text size test, 2026-11-20).
          // A round icon button is 44, as Apple Maps' are, inside the
          // field's 49 (it was 36).
          className="size-11 @max-[180px]/search:hidden"
        />
      )}
    </label>
  );
}
