import { useEffect, useEffectEvent } from "react";
import { Search } from "lucide-react";
import { cn } from "cn";
import { PANEL_FIELD } from "../../../../components/panelField";
import { CommandField } from "../../../../components/ui/command";
import { Kbd } from "../../../../components/ui/kbd";
import { isSearchKey } from "../../../../hooks/use-shortcuts";
import { useIsDesktop } from "../../../../hooks/use-desktop";
import { askSearch, searchKeys } from "../../../../lib/oneSearch";
import { TEXT } from "../../../../lib/text";
import { AccountButton } from "../../../pilot";
import { useVoice, VoiceButton } from "../../../voice";
import type { OneSearchModel } from "../../hooks/useOneSearch";

/**
 * The sheet's first row (the owner's one-search design, 2026-11-09), where
 * the FPL, Airport, Airplane and Setup tabs were: ONE search field, "Search
 * airports, airplanes, or ask", on Base UI's Autocomplete (the list is
 * OneSearchResults, in the sheet's body, inside the same Autocomplete
 * root: the arrows and Enter go from the field to its rows); the
 * microphone beside it, Ask by voice (features/voice): on-device speech,
 * the words appearing in the field as they are said, as a phone's
 * dictation types them; and the account button (AccountButton), which took
 * Setup's place -- Cancel in its place while the field is in use, as iOS's
 * search fields have it. ⌘K or Ctrl K focuses it from anywhere, its keys
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
  const using = model.focused || !!model.typed || model.direct || voice.listening;
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
      {/* 41 tall, as Maps' field is, a white card on the sheet's grey; its
          44-point hit area its own, strips above and below it (CLAUDE.md:
          nothing grows to it). */}
      <label
        className={cn(
          "relative flex h-[2.5625rem] min-w-0 flex-1 items-center gap-2 rounded-full px-3.5 text-muted-foreground",
          PANEL_FIELD,
          "before:absolute before:inset-x-0 before:-top-0.5 before:h-0.5 before:content-[''] after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:content-['']",
          TEXT.row,
        )}
      >
        <Search className="size-5 shrink-0 text-foreground" strokeWidth={1.75} aria-hidden="true" />
        <CommandField
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={voice.listening ? voice.prompt : model.placeholder}
          aria-label={model.placeholder}
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
          }}
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
        {!model.typed && desktop && !using && <Kbd aria-hidden="true">{searchKeys()}</Kbd>}
      </label>
      {/* The microphone, a button of its own beside the field: on-device
          speech only (lib/speechLocal), so none where the browser has no
          recognizer. 44 round, in the tint, pressed while it listens. */}
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
          className="size-11"
        />
      )}
      {using ? (
        <button
          type="button"
          onClick={model.cancel}
          data-testid="one-search-cancel"
          className={cn("relative h-11 shrink-0 px-1 text-tint outline-none focus-visible:ring-2 focus-visible:ring-ring", TEXT.row)}
        >
          Cancel
        </button>
      ) : (
        <AccountButton />
      )}
    </div>
  );
}
