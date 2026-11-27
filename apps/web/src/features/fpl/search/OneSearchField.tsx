import { useEffect, useEffectEvent } from "react";
import { CardHeadRow } from "../../../components/CardHead";
import CloseButton from "../../../components/CloseButton";
import PageToggle from "../../../components/PageToggle";
import { useSearchKey } from "../../../hooks/use-shortcuts";
import { askSearch, useSearchPick, type SearchPick } from "../../../lib/oneSearch";
import { useVoice } from "../../voice";
import SearchBox from "./SearchBox";
import { AccountButton } from "../../pilot";
import { useOneSearchModel } from "./oneSearchModel";
import { WORDING } from "../../../lib/wording/generated/wording";

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
 * (SHEET_BAR), so a turn changes only what is in the bar. No title row
 * over the field, for the map's room (the owner, 2026-11-10); the app's
 * name is the page's heading, for a screen reader alone. ⌘K or Ctrl K focuses it from anywhere, its keys
 * shown in it on a desktop: the command palette it replaced.
 */
/** What a picker's ask is called over its field: its own title (Change
 *  Stop), else Add Stop for a stop, else what it asks for (Departure). */
const askTitle = (pick: SearchPick) => pick.title ?? (pick.stop ? WORDING.addStop : pick.label);

export default function OneSearchField({ inputRef }: { inputRef: React.RefObject<HTMLInputElement | null> }) {
  // Its view model (OneSearchRoot round the panel).
  const model = useOneSearchModel();
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
  useSearchKey(() => {
    if (document.activeElement === inputRef.current) model.cancel();
    else askSearch();
  });
  // A picker's ask (Add Stop, Change Stop, the departure): its title and a
  // ✕ in this row, the field under them at the top of its suggestions
  // (OneSearchResults), as Apple Maps' Add Stop sheet (the owner's
  // screenshot, 2026-11-20: "Title for add stop"). The ✕ is the ask's
  // Cancel, back where it was asked from.
  if (model.pick && !model.pick.waiting)
    return (
      <div className="w-full" role="search">
        <h1 className="sr-only">Wingtip Maps</h1>
        {/* Every card's and page's one head row (CardHeadRow), as Settings'
            pages and a list in full have theirs. */}
        <CardHeadRow
          name={askTitle(model.pick)}
          nameTestId="search-pick-title"
          end={<CloseButton label="Cancel" onClick={model.cancel} data-testid="one-search-cancel" />}
        />
      </div>
    );
  return (
    <div className="flex w-full items-center gap-2" role="search">
      <h1 className="sr-only">Wingtip Maps</h1>
      {!using && <PageToggle />}
      <SearchBox model={model} inputRef={inputRef} using={using} />
      {/* In use, a round ✕ at the row's end where the avatar was, as Apple
          Maps' search has on iOS 26, not the word Cancel (the owner,
          2026-11-20: "Instead just show the close/clear button when typing"). */}
      {using && <CloseButton label="Cancel" onClick={model.cancel} data-testid="one-search-cancel" />}
      {!using && <AccountButton />}
    </div>
  );
}
