import { useEffect, useState } from "react";
import { Mic, Search } from "lucide-react";
import { cn } from "cn";
import { PANEL_FIELD } from "../../../../components/panelField";
import { CommandField } from "../../../../components/ui/command";
import { Kbd } from "../../../../components/ui/kbd";
import { isSearchKey } from "../../../../hooks/use-shortcuts";
import { useIsDesktop } from "../../../../hooks/use-desktop";
import { askSearch, searchKeys } from "../../../../lib/oneSearch";
import { useAtcRadio } from "../../../../lib/atcRadio";
import { useCanListen } from "../../../../lib/speechLocal";
import { TEXT } from "../../../../lib/text";
import { AccountButton } from "../../../pilot";
import type { OneSearchModel } from "../../hooks/useOneSearch";

/** The listening code (lib/atcListening), its own chunk, fetched once the
 *  field is drawn so the microphone's tap starts listening at once: Safari
 *  lets a page listen only straight from the tap (AskCard the same). */
let listening: typeof import("../../../../lib/atcListening") | null = null;
const load = () => import("../../../../lib/atcListening").then((m) => (listening = m));

/**
 * The sheet's first row (the owner's one-search design, 2026-11-09), where
 * the FPL, Airport, Airplane and Setup tabs were: ONE search field, "Search
 * airports, airplanes, or ask", on Base UI's Autocomplete (the list is
 * OneSearchResults, in the sheet's body, inside the same Autocomplete
 * root: the arrows and Enter go from the field to its rows); the
 * microphone beside it, on-device speech as the map's is, what is said
 * typed into the field; and the account button (AccountButton), which took
 * Setup's place -- Cancel in its place while the field is in use, as iOS's
 * search fields have it. ⌘K or Ctrl K focuses it from anywhere, its keys
 * shown in it on a desktop: the command palette it replaced.
 */
export default function OneSearchField({ model, inputRef }: { model: OneSearchModel; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const desktop = useIsDesktop();
  const voice = useCanListen();
  const [hearing, setHearing] = useState(false);
  const using = model.focused || !!model.typed || model.direct;
  useEffect(() => {
    if (voice) void load();
  }, [voice]);
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
  // What the microphone heard, once the pause ends it, typed in the field;
  // the map's pill put away, its chips being the radio's commands.
  useEffect(() => {
    if (!hearing) return;
    return useAtcRadio.subscribe((s) => {
      const pill = s.pill;
      if (!pill || pill.listening) return;
      setHearing(false);
      useAtcRadio.setState({ pill: null });
      if (pill.text) {
        model.setTyped(pill.text);
        inputRef.current?.focus();
      }
    });
  }, [hearing, model, inputRef]);
  const hear = () => {
    setHearing(true);
    if (listening) void listening.listenOnce([]);
    else void load().then((m) => m.listenOnce([]));
  };
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
          placeholder={model.placeholder}
          aria-label={model.placeholder}
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
          }}
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
        {!model.typed && desktop && !using && <Kbd aria-hidden="true">{searchKeys()}</Kbd>}
      </label>
      {/* The microphone, a button of its own beside the field: on-device
          speech only (lib/speechLocal), so none where the browser has no
          recognizer. 44 round, in the tint. */}
      {voice && (
        <button
          type="button"
          aria-label="Search by voice"
          onClick={hear}
          disabled={hearing}
          data-testid="one-search-mic"
          className="grid size-11 shrink-0 place-items-center rounded-full text-tint outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <Mic className={cn("size-5", hearing && "animate-pulse")} strokeWidth={2.2} aria-hidden="true" />
        </button>
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
