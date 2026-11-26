import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "cn";
import { useQueryClient } from "@tanstack/react-query";
import { N_NUMBER, profileOfRegistered, shortName } from "../../lib/aircraftChoice";
import { registeredQuery } from "../../lib/airplane/lookup";
import { useEngineReady } from "../../lib/engine/useEngineReady";
import { airplanePickAnswered, useAirplanePick } from "../../lib/pickAirplane";
import DepartPicker from "./DepartPicker";
import AirplaneSuggestions, { type SuggestionRow } from "./AirplaneSuggestions";
import { useAirplaneSuggestions } from "./useAirplaneSuggestions";
import { Combobox, ComboboxContent, ComboboxInput } from "../../components/ui/combobox";
import { PILL, PILL_END, PILL_END_ADDON, PILL_FIELD, PILL_PREFIX, PREFIXED_FIELD } from "./pillLook";
import { InputGroupAddon, InputGroupButton } from "../../components/ui/input-group";
import { openAirplaneProfile } from "../../lib/airplane/profileStore";
import { ICON } from "../../lib/icons";
import { FPL_TIP, unseen, useTips } from "../../lib/firstRunTips";

/** The words the empty field says on the first flight (the owner's Q1,
 *  2026-11-21): the strip's time and fuel are a bare "—" with no airplane,
 *  and a new pilot is told here why, in place, until one is picked. */
export const FIRST_AIRPLANE_ASK = "Add your airplane for times and fuel";

/**
 * The two inputs the nav log is computed from, in the planning panel's
 * second row, in sight with the panel down: the airplane (one of the
 * pilot's own, by its N-number, or any other N-number typed and added,
 * looked up in the FAA's registry behind it; its TAS and burn are
 * what the legs' times and fuel come from) and when the flight leaves,
 * which gives every row an ETA, is what a saved flight is planned for,
 * and picks the winds forecast period -- shadcn's date picker with a time
 * box (DepartPicker), empty for about now. Changing either re-plans.
 */
export default function FlightInputs({
  aircraftValue,
  aircraftOptions,
  onAircraftChange,
  onTailPick,
  altitude,
  depart,
  onDepartChange,
}: {
  aircraftValue: string;
  aircraftOptions: { value: string; label: string }[];
  onAircraftChange: (value: string) => void;
  /** An N-number typed that is none of the pilot's own: flown on its type's
   *  stock profile once the FAA's registry says it. */
  onTailPick?: (tail: string, profile: string) => void;
  /** Beside the airplane: the altitude it flies (AltitudeGroup). */
  altitude?: ReactNode;
  /** An ISO instant, or "" for about now; with no handler, no picker here
   *  (the departure's step in FPL's list has it). */
  depart: string;
  onDepartChange?: (iso: string) => void;
}) {
  const current = shortName(aircraftOptions.find((o) => o.value === aircraftValue)?.label ?? "");
  // The N-number test is the engine's (N_NUMBER): the row is drawn at once,
  // the engine or not, so until its .wasm is there the box shows no tail
  // and takes none, and fills in once it is (useEngineReady).
  const engineReady = useEngineReady();
  const tailNow = engineReady && N_NUMBER.test(current) ? current : "";
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? tailNow;
  // Typed so far and no registration: every start of a good one is one
  // itself ("N1", "N1A"), so this is never a number half typed.
  const wrong = engineReady && !!typed && !N_NUMBER.test(typed);
  // The first flight (its FPL tip not yet put away) with no airplane at
  // all: the field's name asks in words; its five blanks stay, the pill
  // one width (the owner, 2026-11-22: "N input should be fixed size with 5
  // underscores after N-"), where the words widened it to 36 figures.
  const firstAsk = useTips((s) => unseen(s.seen, FPL_TIP)) && !current && typed === null;
  const queryClient = useQueryClient();
  const registered = (tail: string) => queryClient.fetchQuery(registeredQuery(tail));
  // An N-number typed: one of the pilot's own picked, any other added at
  // once, at the owner's ask ("Just show a button to add N number from
  // here. You can do the lookup in the background"): on no profile until
  // the FAA's registry answers, then on its type's where it has one
  // (profileOfRegistered) -- never another airplane's figures meanwhile
  // (the owner's "Why is it showing C172?"; 2026-11-09, "Nothing assumes
  // a Cessna 172").
  // The tail last asked for: a registry's answer for any other is late,
  // the pilot having picked again meanwhile, and is dropped -- it put back
  // the airplane picked before (the pill audit, 2026-11-18).
  const latest = useRef<string | null>(null);
  const take = (tail: string) => {
    if (!engineReady || !N_NUMBER.test(tail) || tail === tailNow) return;
    latest.current = tail;
    const mine = aircraftOptions.find((o) => shortName(o.label) === tail);
    if (mine) {
      onAircraftChange(mine.value);
      return;
    }
    onTailPick?.(tail, "");
    void registered(tail)
      .then((record) => {
        const profile = record ? profileOfRegistered(record) : null;
        if (profile && latest.current === tail) onTailPick?.(tail, profile);
      })
      .catch(() => {
        /* its N-number alone stands, on no profile */
      });
  };
  // What is typed, taken: on Enter (the keyboard's Done) only. Leaving
  // the field lets go of it instead -- taken there, "N4" half typed over
  // N12345 became the airplane (the pill audit, 2026-11-18) -- and a
  // suggestion picked is its own pick.
  const commit = () => {
    const tail = (typed ?? "").trim().toUpperCase();
    setTyped(null);
    take(tail);
  };
  // The suggestions as it is typed (the owner's S1, 2026-11-14), from the one search's own source.
  const suggest = useAirplaneSuggestions({ typed, engineReady, aircraftOptions, onAircraftChange, onTailPick, take });
  const field = useRef<HTMLInputElement | null>(null);
  const pick = (row: SuggestionRow) => {
    // A pick of the pilot's own or of a type is no tail asked of the
    // registry; a tail picked asks again (`take`).
    latest.current = null;
    row.pick();
    setTyped(null);
    field.current?.blur();
  };
  // A suggestion lit by the arrows (the list's own highlight).
  const lit = useRef(false);
  // "Pick an airplane" asked from a screen that needs one (lib/pickAirplane):
  // this field takes the focus within the tap that asked, where it is drawn
  // then -- the store calls its listeners inside the ask -- since iOS gives
  // a field focused outside a tap no keyboard (it was a frame later). Not
  // drawn then, it takes the focus as it is drawn; drawn but not yet in
  // sight (FPL still coming up), a frame on, as it did before. Asked from a
  // card over FPL (the Brief's Ready to Fly), the card goes as FPL comes up
  // and its drawer hands the focus back as it closes -- to the body, where
  // the pilot's "Pick the airplane" landed nowhere (ready-to-fly.spec on a
  // phone): taken again each frame until no card is left over the field,
  // for a second at most.
  useEffect(() => {
    const focus = () => {
      const input = field.current;
      if (!input?.isConnected) return;
      let frames = 0;
      let still = 0;
      const take = () => {
        field.current?.focus();
        const kept = document.activeElement === field.current;
        // No card open or closing, the focus kept two frames running: a
        // drawer that has just closed hands its focus back the frame after.
        const over = document.querySelector("[data-sheet-card]:is([data-open], [data-ending-style])");
        still = kept && !over ? still + 1 : 0;
        if (still >= 2 || ++frames > 60) {
          airplanePickAnswered();
          return;
        }
        requestAnimationFrame(take);
      };
      take();
    };
    if (useAirplanePick.getState().pending) focus();
    return useAirplanePick.subscribe((now) => {
      if (now.pending) focus();
    });
  }, []);
  // The N fixed before what is typed, at the owner's ask (2026-10-27: "add
  // a - after N"; 2026-11-19: "N and FL should be static letter and black,
  // not grey, so input can be entered after the dash"): a US registration
  // always starts with it. "N-" is the pill's own black letters before the
  // field (PILL_PREFIX), the field after it unpadded, so no gap sets the
  // number apart; empty, the field's placeholder is five blanks, one for
  // each place a US registration has after the N (14 CFR 47.15(b): at most
  // five; the owner, 2026-11-04).
  const rest = shown.replace(/^N-?/, "");
  return (
    <>
      {/* Base UI's stock Combobox (ui/combobox, shadcn's), where it was an
          Autocomplete round a field of our own and a Popover: what is typed
          is the pilot's (inputValue), each suggestion an action rather than
          a value kept, so nothing is ever selected and the field's words
          are never put back to a label. No chevron: until something is
          typed there is no list to open. */}
      <Combobox<SuggestionRow>
        value={null}
        onValueChange={(row) => row && pick(row)}
        itemToStringLabel={(row) => row.title}
        inputValue={rest}
        onInputValueChange={(next, details) => {
          // Only what the pilot types: the stock part's own resets (to the
          // label of a value, here none) would empty what is half typed.
          if (details.reason !== "input-change") return;
          // An N typed first ("N12", as a pilot writes it) is that N, not
          // a second one: it read "N-N12", which no list matched (the UI
          // audit's B4, 2026-11-17).
          const letters = next
            .toUpperCase()
            .replace(/^N-?/, "")
            .replace(/[^A-Z0-9]/g, "")
            .replace(/^N+/, "")
            .slice(0, 5);
          setTyped(letters ? `N${letters}` : "");
        }}
        open={suggest.open}
        onOpenChange={(next) => !next && suggest.dismiss()}
        onItemHighlighted={(item) => {
          lit.current = item !== undefined;
        }}
      >
        <ComboboxInput
          showTrigger={false}
          className={PILL}
          group={{ "aria-label": "Airplane", "data-testid": "aircraft-select" }}
          // Five places after "N-", whatever is in it, one width as it is
          // typed (the owner, 2026-11-20: "N number should be a fixed length
          // for 5 letters"; 2026-11-22: "fixed size with 5 underscores after
          // N-"; 14 CFR 47.15(b): at most five after the N): each place one
          // figure wide in the field's fixed-width face, the places not yet
          // typed in still a blank each (SLOTS), "N-12___".
          inputClassName={cn(
            PILL_FIELD,
            PREFIXED_FIELD,
            "w-[calc(5ch+0.5rem)] font-mono",
            rest && SLOTS,
            wrong ? "text-destructive" : "text-foreground",
          )}
          style={{ "--typed": rest.length } as CSSProperties}
          ref={field}
          placeholder="_____"
          enterKeyHint="done"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-label={
            shown
              ? "Airplane, N-number"
              : firstAsk
                ? `Airplane, N-number: ${FIRST_AIRPLANE_ASK}`
                : "Airplane, N-number: none picked; pick one for times and fuel"
          }
          title={firstAsk ? FIRST_AIRPLANE_ASK : undefined}
          // What is typed that no registration can be ("KOSH") said in red
          // as it is typed, by the engine's own test (N_NUMBER).
          aria-invalid={wrong || undefined}
          onKeyDown={(e) => {
            // Enter on a suggestion lit by the arrows is the list's (it
            // picks it); else what is typed, taken, and the field left,
            // whose blur takes nothing more.
            if (e.key === "Enter" && !(suggest.open && lit.current)) {
              e.preventDefault();
              commit();
              e.currentTarget.blur();
            }
            // Escape with the list away lets go of what is typed; with it
            // open, the stock part closes it.
            if (e.key === "Escape" && !suggest.open) setTyped(null);
          }}
          onBlur={() => setTyped(null)}
          data-testid="aircraft-input"
        >
          <InputGroupAddon className={PILL_PREFIX} aria-hidden="true">
            N-
          </InputGroupAddon>
          {/* Its ⓘ after the number (the owner, 2026-11-20: "can N number
              show an info button"): the airplane's card, the one any
              N-number opens (lib/airplane/profileStore); with none picked,
              the field, as a tap on the pill asks for one. */}
          <InputGroupAddon align="inline-end" className={PILL_END_ADDON}>
            <InputGroupButton
              size="icon-xs"
              className={PILL_END}
              aria-label="Airplane info"
              onClick={() => (tailNow ? openAirplaneProfile(tailNow) : field.current?.focus())}
              data-testid="aircraft-info"
            >
              {/* Filled, iOS's info.circle.fill (the owner, 2026-11-26): the
                  disc the look's tint, as every tappable glyph beside it is,
                  its "i" cut out in the sheet's colour, at least 4.2:1 on
                  the pill and 5:1 on the disc in every look (the HIG audit's
                  computed ratios, 2026-11-26). */}
              <ICON.info aria-hidden="true" className="[&_circle]:fill-tint [&_circle]:stroke-tint [&_path]:stroke-(--sheet)" />
            </InputGroupButton>
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxContent data-testid="aircraft-suggestions">
          <AirplaneSuggestions groups={suggest.groups} />
        </ComboboxContent>
      </Combobox>
      {altitude}
      {onDepartChange && <DepartPicker value={depart} onChange={onDepartChange} />}
    </>
  );
}

/** The N-number's places not yet typed in, a blank each where the
 *  placeholder's five were: a dash one place wide, under the line as an
 *  underscore is, from the place after the last typed (--typed) to the
 *  fifth, on the field's fixed-width face so each falls under its place. */
const SLOTS =
  "bg-[repeating-linear-gradient(to_right,currentColor_0_calc(1ch-2px),transparent_calc(1ch-2px)_1ch)] bg-no-repeat bg-size-[calc((5-var(--typed))*1ch)_1px] bg-position-[calc(var(--typed)*1ch)_calc(50%+0.6em)]";
