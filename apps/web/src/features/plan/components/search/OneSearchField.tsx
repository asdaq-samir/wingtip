import { useEffect, useEffectEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { cn } from "cn";
import ClearButton from "../../../../components/ClearButton";
import { PANEL_FIELD } from "../../../../components/panelField";
import { CommandClear, CommandField } from "../../../../components/ui/command";
import { Kbd } from "../../../../components/ui/kbd";
import { isSearchKey } from "../../../../hooks/use-shortcuts";
import { useIsDesktop } from "../../../../hooks/use-desktop";
import { askSearch, searchKeys, useSearchPick } from "../../../../lib/oneSearch";
import { TEXT } from "../../../../lib/text";
import { useVoice, VoiceButton } from "../../../voice";
import { AccountButton } from "../../../pilot";
import type { OneSearchModel } from "../../hooks/useOneSearch";

/**
 * The sheet's first row (the owner's one-search design, 2026-11-09), where
 * the FPL, Airport, Airplane and Setup tabs were: ONE search field, "Search
 * airports, airplanes, or ask", on Base UI's Autocomplete (the list is
 * OneSearchResults, in the sheet's body, inside the same Autocomplete
 * root: the arrows and Enter go from the field to its rows); the
 * microphone beside it, Ask by voice (features/voice): on-device speech,
 * the words appearing in the field as they are said, as a phone's
 * dictation types them, as the field's own trailing button; and Cancel
 * beside it while the field is in use -- a search sent let go with it too,
 * as Apple Maps' Cancel does -- as iOS's search fields have it. The
 * account button at the row's end while the field is not in use, as on
 * iOS and Android: the title row that held it over the field, with the
 * app's mark and name, went for the map's room (the owner, 2026-11-10);
 * the name stays the page's heading, for a screen reader alone. ⌘K or Ctrl K focuses it from anywhere, its keys
 * shown in it on a desktop: the command palette it replaced.
 */
export default function OneSearchField({ model, inputRef }: { model: OneSearchModel; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const desktop = useIsDesktop();
  // What is said typed in the field once a pause ends it, the field
  // focused to go on from there.
  const voice = useVoice("search", (said) => {
    model.setTyped(said);
    inputRef.current?.focus();
  });
  const using = model.focused || !!model.typed || model.direct || !!model.pick || voice.listening;
  // Drawn, so the pickers ask it for their airport (lib/oneSearch's fields).
  useEffect(() => {
    useSearchPick.setState((s) => ({ fields: s.fields + 1 }));
    return () => useSearchPick.setState((s) => ({ fields: s.fields - 1, pick: null }));
  }, []);
  // The words as they are said, in the field.
  const typeSaid = useEffectEvent((words: string) => model.setTyped(words));
  useEffect(() => {
    if (voice.listening && voice.words) typeSaid(voice.words);
  }, [voice.listening, voice.words]);
  // ⌘K anywhere, a field's too: the search, or out of it again.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isSearchKey(event)) return;
      event.preventDefault();
      if (document.activeElement === inputRef.current) model.cancel();
      else askSearch();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [model, inputRef]);
  return (
    <div className="flex w-full items-center gap-2" role="search">
      <h1 className="sr-only">Wingtip Maps</h1>
      {/* 46 tall, a white card on the sheet's grey, its own 44-point hit
          area (the sheet audit's F-P2, 2026-11-10: the title row over it
          the same height). */}
      <label
        className={cn(
          "relative flex h-[2.875rem] min-w-0 flex-1 items-center gap-2 rounded-full pr-0.5 pl-3.5 text-muted-foreground",
          PANEL_FIELD,
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
            // each picker's own field did (airport-search.spec).
            const rows = model.airports.length + model.waypoints.length;
            if (e.key === "Enter" && model.pick && model.typed && (!model.answered || rows === 0)) {
              e.preventDefault();
              (e as { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
              model.pickIdent(model.typed);
            } else if (e.key === "Enter" && model.pick && model.typed && !e.currentTarget.getAttribute("aria-activedescendant")) {
              // Rows that answered after the typing (the planner's lookup on
              // a slow link) come in with none highlighted: the root's
              // autoHighlight acts on a change of what is typed, not of the
              // rows. Enter takes the first, as it would have been.
              const first = model.airports[0]?.ident ?? model.waypoints[0]?.ident;
              if (first) {
                e.preventDefault();
                (e as { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
                model.pickIdent(first);
              }
            }
          }}
          // The browser's own clear put away for the app's (ClearButton),
          // the one every field has.
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        {/* Base UI's own clear: shown while something is typed, the
            words cleared through the root's onValueChange, the focus kept. */}
        <CommandClear render={<ClearButton label="Clear the search" testId="search-clear" />} />
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
            className="size-9"
          />
        )}
      </label>
      {using && (
        <Button
          variant="ghost"
          size="inline"
          type="button"
          onClick={model.cancel}
          data-testid="one-search-cancel"
          // Its 44-point hit area the pseudo-element's (index.css), not its own height.
          className={cn(
            "justify-start text-inherit hover:bg-transparent",
            "relative shrink-0 px-1 text-tint outline-none focus-visible:ring-2 focus-visible:ring-ring",
            TEXT.row,
          )}
        >
          Cancel
        </Button>
      )}
      {!using && <AccountButton />}
    </div>
  );
}
