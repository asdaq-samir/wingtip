import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { N_NUMBER, profileOfRegistered, shortName } from "../../../../lib/aircraftChoice";
import { registeredQuery } from "../../../../lib/airplane/lookup";
import { InlineField } from "../../../../components/InlineField";
import { useEngineReady } from "../../../../lib/engine/useEngineReady";
import { airplanePickAnswered, useAirplanePick } from "../../../../lib/pickAirplane";
import DepartPicker from "./DepartPicker";
import AirplaneSuggestions from "./AirplaneSuggestions";
import { useAirplaneSuggestions } from "./useAirplaneSuggestions";
import { CommandField, CommandRoot } from "../../../../components/ui/command";
import { Popover, PopoverContent } from "../../../../components/ui/popover";

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
  const queryClient = useQueryClient();
  const registered = (tail: string) => queryClient.fetchQuery(registeredQuery(tail));
  // An N-number typed: one of the pilot's own picked, any other added at
  // once, at the owner's ask ("Just show a button to add N number from
  // here. You can do the lookup in the background"): on no profile until
  // the FAA's registry answers, then on its type's where it has one
  // (profileOfRegistered) -- never another airplane's figures meanwhile
  // (the owner's "Why is it showing C172?"; 2026-11-09, "Nothing assumes
  // a Cessna 172").
  const take = (tail: string) => {
    if (!engineReady || !N_NUMBER.test(tail) || tail === tailNow) return;
    const mine = aircraftOptions.find((o) => shortName(o.label) === tail);
    if (mine) {
      onAircraftChange(mine.value);
      return;
    }
    onTailPick?.(tail, "");
    void registered(tail)
      .then((record) => {
        const profile = record ? profileOfRegistered(record) : null;
        if (profile) onTailPick?.(tail, profile);
      })
      .catch(() => {
        /* its N-number alone stands, on no profile */
      });
  };
  // Set as a suggestion is taken, so the blur after it puts in nothing more.
  const picked = useRef(false);
  const commit = () => {
    const tail = (typed ?? "").trim().toUpperCase();
    setTyped(null);
    if (picked.current) {
      picked.current = false;
      return;
    }
    take(tail);
  };
  // The suggestions as it is typed (the owner's S1, 2026-11-14), from the one search's own source.
  const suggest = useAirplaneSuggestions({ typed, engineReady, aircraftOptions, onAircraftChange, onTailPick, take });
  const pick = (run: () => void) => {
    picked.current = true;
    run();
    setTyped(null);
    field.current?.blur();
  };
  // "Pick an airplane" asked from a screen that needs one (lib/pickAirplane):
  // this field takes the focus once drawn, the frame after FPL is picked.
  const field = useRef<HTMLInputElement | null>(null);
  // The suggestions are placed under the field (Base UI's Positioner takes it as `anchor`).
  const [anchor, setAnchor] = useState<HTMLInputElement | null>(null);
  const setField = useCallback((el: HTMLInputElement | null) => {
    field.current = el;
    setAnchor(el);
  }, []);
  // A suggestion lit by the arrows (the list's own highlight).
  const lit = useRef(false);
  const pickAsked = useAirplanePick((s) => s.pending);
  useEffect(() => {
    if (!pickAsked) return;
    const frame = requestAnimationFrame(() => {
      field.current?.focus();
      airplanePickAnswered();
    });
    return () => cancelAnimationFrame(frame);
  }, [pickAsked]);
  return (
    <>
      {/* A field as the altitude's is, at the owner's ask ("N-number should
          look similar to altitude"), the same field (InlineField): typed
          in, its card's button at its end once there is one. */}
      {/* With none picked, "N-" and then five underscores in grey, blanks, one for each
          place a US registration has after the N (14 CFR 47.15(b): at most
          five), as the empty altitude shows "FL-___" (the owner, 2026-11-04:
          "n should have five underscores after it"): the field is as wide
          as five characters picked or not, at the owner's ask ("N number
          should be fixed width for 5 letters/numbers", 2026-11-04), where
          "Pick airplane" had set it wider. */}
      <CommandRoot
        value={`N-${shown.replace(/^N-?/, "")}`}
        onValueChange={(next) => {
          picked.current = false;
          const rest = next
            .toUpperCase()
            .replace(/^N-?/, "")
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 5);
          setTyped(rest ? `N${rest}` : "");
        }}
        onItemHighlighted={(item) => {
          lit.current = item !== undefined;
        }}
      >
        <Popover open={suggest.open} onOpenChange={(next) => !next && suggest.dismiss()}>
          <InlineField
            label="Airplane"
            testId="aircraft-select"
            widest="N-888MM"
            placeholder=""
            endRoom="w-0"
            shrink
            hint={{ start: "N-", words: "_____" }}
            field={CommandField}
            input={{
              // The N fixed before it, the rest typed, at the owner's ask
              // (2026-10-27: "N- can stay static while the rest of the number
              // can be entered", "add a - after N"): a US registration always
              // starts with it. In the field's own text, not a label beside it:
              // iOS keeps a few points inside an input's edge, which set the
              // number apart from it ("N- 654FL" on the owner's phone). Its
              // words are the list's root's (CommandRoot), which writes them.
              autoCapitalize: "characters",
              autoCorrect: "off",
              spellCheck: false,
              value: `N-${shown.replace(/^N-?/, "")}`,
              "aria-label": shown ? "Airplane, N-number" : "Airplane, N-number: none picked; pick one for times and fuel",
              onKeyDown: (e) => {
                const base = e as typeof e & { preventBaseUIHandler?: () => void };
                // Enter on a suggestion lit by the arrows is the list's (it picks it); else
                // what is typed, committed as before.
                if (e.key === "Enter" && !(suggest.open && lit.current)) {
                  e.preventDefault();
                  base.preventBaseUIHandler?.();
                  commit();
                  (e.target as HTMLInputElement).blur();
                }
                // Escape closes the list first, then lets go of what is typed.
                if (e.key === "Escape") {
                  base.preventBaseUIHandler?.();
                  if (suggest.open) suggest.dismiss();
                  else setTyped(null);
                }
              },
              onBlur: commit,
              ref: setField,
              "data-testid": "aircraft-input",
            }}
            inputClassName="text-foreground"
          />
          <PopoverContent
            anchor={anchor}
            align="start"
            sideOffset={6}
            className="w-72 max-w-[calc(100vw-16px)] gap-0 p-1"
            // The typing stays in the field: a press on a row would take the focus first, and the
            // field's blur commit what was half typed.
            initialFocus={false}
            finalFocus={false}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            data-testid="aircraft-suggestions"
          >
            <AirplaneSuggestions groups={suggest.groups} onPick={pick} />
          </PopoverContent>
        </Popover>
      </CommandRoot>
      {altitude}
      {onDepartChange && <DepartPicker value={depart} onChange={onDepartChange} />}
    </>
  );
}
