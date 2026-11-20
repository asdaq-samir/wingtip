import { useEffect, useEffectEvent } from "react";
import { X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { cn } from "cn";
import IconButton from "../../../components/IconButton";
import PageToggle from "../../../components/PageToggle";
import { isSearchKey } from "../../../hooks/use-shortcuts";
import { askSearch, useSearchPick, type SearchPick } from "../../../lib/oneSearch";
import { TEXT } from "../../../lib/text";
import { useVoice } from "../../voice";
import SearchBox from "./SearchBox";
import { AccountButton } from "../../pilot";
import type { OneSearchModel } from "./useOneSearch";

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
 * page toggle at the row's start and the account button at its end while
 * the field is not in use, as Apple Maps' avatar is (the owner,
 * 2026-11-20: "move the fpl button on the left side of search and avatar
 * to the right side"; PageToggle, AccountButton): the field the same size as FPL's strip in its place
 * (SHEET_BAR), so a turn changes only what is in the bar. The title row
 * that was over the field went for the map's room (the owner,
 * 2026-11-10); the app's name stays the page's heading, for a screen
 * reader alone. ⌘K or Ctrl K focuses it from anywhere, its keys
 * shown in it on a desktop: the command palette it replaced.
 */
/** What a picker's ask is called over its field: its own title (Change
 *  Stop), else Add Stop for a stop, else what it asks for (Departure). */
const askTitle = (pick: SearchPick) => pick.title ?? (pick.stop ? "Add Stop" : pick.label);

export default function OneSearchField({ model, inputRef }: { model: OneSearchModel; inputRef: React.RefObject<HTMLInputElement | null> }) {
  // What is said typed in the field once a pause ends it, the field
  // focused to go on from there.
  const voice = useVoice("search", (said) => {
    model.setTyped(said);
    inputRef.current?.focus();
  });
  // A picker's ask is the field in use, but for one that waits for a tap
  // (the first flight's destination): at rest until the pilot uses it.
  const using = model.focused || !!model.typed || model.direct || (!!model.pick && !model.pick.waiting) || voice.listening;
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
  // A picker's ask (Add Stop, Change Stop, the departure): its title and a
  // ✕ in this row, the field under them at the top of its suggestions
  // (OneSearchResults), as Apple Maps' Add Stop sheet (the owner's
  // screenshot, 2026-11-20: "Title for add stop"). The ✕ is the ask's
  // Cancel, back where it was asked from.
  if (model.pick && !model.pick.waiting)
    return (
      <div className="flex w-full items-center gap-2" role="search">
        <h1 className="sr-only">Wingtip Maps</h1>
        <h2 className={cn("min-w-0 flex-1 truncate font-bold text-foreground", TEXT.hero)} data-testid="search-pick-title">
          {askTitle(model.pick)}
        </h2>
        <IconButton round label="Cancel" onClick={model.cancel} data-testid="one-search-cancel">
          <X className="size-5" aria-hidden="true" />
        </IconButton>
      </div>
    );
  return (
    <div className="flex w-full items-center gap-2" role="search">
      <h1 className="sr-only">Wingtip Maps</h1>
      {!using && <PageToggle page={0} />}
      <SearchBox model={model} inputRef={inputRef} using={using} />
      {using && (
        <Button
          variant="plain"
          size="inline"
          type="button"
          onClick={model.cancel}
          data-testid="one-search-cancel"
          // Its 44-point hit area the pseudo-element's (index.css), not its own height.
          className={cn("relative shrink-0 px-1 text-tint outline-none focus-visible:ring-2 focus-visible:ring-ring", TEXT.row)}
        >
          Cancel
        </Button>
      )}
      {!using && <AccountButton />}
    </div>
  );
}
