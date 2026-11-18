import { useRef, useState } from "react";
import { cn } from "cn";
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from "../../components/ui/combobox";
import { Button } from "../../components/ui/button";
import type { Leg, NavLogAltitude } from "../../lib/api/types";
import type { FlightRules } from "../../lib/preferences";
import { TEXT } from "../../lib/text";
import { flightLevel } from "../../lib/format";
import { callEngine } from "../../lib/engine/engine";
import { useEngineReady } from "../../lib/engine/useEngineReady";
import { advisorRows, cruiseOf } from "./altitude/plans";
import { PILL, PILL_FIELD } from "./pillLook";

/** What the empty field says: an example of what it takes, at the owner's
 *  ask ("I want it to say Alt: 080 as a text filler example"). */
// Dashes, not an example figure: grey "080" after FL- read as an
// altitude planned (the owner's screenshot, 2026-10-27, while the
// altitudes were still being planned).
/** With no altitude, "FL-" and its three blanks (flightLevel(null),
 *  "FL-___"), as the airplane's empty field shows "N-_____": the field's
 *  own placeholder, the engine's words, so only "FL-" until its .wasm is
 *  in (the row is drawn at once, the engine or not; firstDraw.test). */
const placeholder = (engineReady: boolean) => (engineReady ? flightLevel(null) : "FL-");
/** An altitude as said: feet under 18,000 ft, a flight level from there
 *  up, where altimeters are set to 29.92 (the engine's `altitude_said`;
 *  14 CFR 91.121(a)(2), AIM 4-2-9), its "ft" said in full as "feet", as
 *  VoiceOver reads this label aloud). */
const said = (ft: number) => callEngine("altitude_said", { ft }).replace(/ ft$/, " feet");

/**
 * The cruising altitude beside the airplane, as the owner picked it
 * (2026-10-20, the redesign's input 1): the figure itself, typed in feet,
 * and the profile's button after it, which opens the Profile card, where
 * the altitude is set on the route's side view (AltitudeProfile), at the
 * owner's ask ("we won't need a separate profile button next to navlog").
 * A figure typed is flown on Enter, or as the field is left. Marked as the
 * chip was: red with no legal altitude, IFR's flag, a tight altitude and a
 * pilot's own altitude's caution.
 */
export default function AltitudeGroup({
  nav,
  legs,
  commanded = null,
  asked = null,
  problem = false,
  tight = null,
  onFlyAltitude,
  disabled = false,
  rules = "vfr",
}: {
  nav: NavLogAltitude | null;
  legs: Leg[];
  /** The altitude the pilot asked for, feet, while its log is planned: the
   *  field shows it from the moment it is asked, not the one before it. */
  commanded?: number | null;
  /** The pilot's own altitude in the address, and whether it is flown at
   *  each leg's nearest legal one (a pick on the wheel) or as typed. */
  asked?: { ft: number; nearest: boolean } | null;
  /** No legal altitude on the route: the group red, its card saying why. */
  problem?: boolean;
  /** A leg where no 500 ft step fits (wingtip.altitude's tight altitude). */
  tight?: string | null;
  /** Flies the whole route at an altitude of the pilot's own, feet. */
  onFlyAltitude: (feet: number) => void;
  disabled?: boolean;
  /** The flight rules it is planned under: IFR's flag on the group. */
  rules?: FlightRules;
}) {
  const engineReady = useEngineReady();
  const cruise = cruiseOf(nav, legs);
  const cautions = nav?.cautions ?? [];
  // What is typed, while it is: the figure flown otherwise.
  const [typed, setTyped] = useState<string | null>(null);
  // Being typed in: its Done shown (below).
  const [editing, setEditing] = useState(false);
  // Written as a flight level at every altitude -- FL045 for 4,500 ft --
  // at the owner's pick (2026-10-20), told that the FAA's flight levels
  // start at 18,000 ft MSL, where altimeters go to 29.92 (14 CFR 1.1,
  // 91.121(a)): the figure is hundreds of feet MSL, and the planner's are
  // feet MSL still, as VoiceOver says them (`said`). Typed, three figures
  // at most, hundreds of feet as written, at the owner's ask ("when altitude
  // is entered it should only hold 3 digits").
  const flying = commanded ?? cruise;
  const shown = typed ?? (problem || flying === null ? "" : flightLevel(flying).slice(3));
  const fly = (figures: string | null = typed) => {
    if (figures === null) return;
    // Any of the ways a pilot writes it, at the owner's ask (2026-10-27):
    // "090", "FL090", "FL-090" in hundreds of feet, or "9000" in feet --
    // four figures or more are feet.
    const digits = figures.replace(/\D/g, "");
    const ft = digits.length >= 4 ? Math.round(Number(digits) / 100) * 100 : Number(digits) * 100;
    setTyped(null);
    // A VFR altitude is under Class A (14 CFR 71.33, 91.135); IFR's up to
    // FL410, the highest 91.179(b)(4) names; 500 ft the least (91.119(c)):
    // the engine's `altitude_allowed`.
    // Nothing to plan only where it is what was asked and every leg flies
    // it. A pick on the wheel asks for one altitude and flies each leg at
    // its nearest legal one, so a figure typed equal to the highest of those
    // is still the pilot's own: the whole route at it, kept as they change
    // it (CI's C81-KDLH: 3,000 ft picked, flown at 3,500, then 035 typed).
    const flownAlready =
      commanded !== null
        ? ft === commanded
        : asked
          ? ft === asked.ft && !asked.nearest
          : legs.length
            ? legs.every((leg) => leg.altitude_ft === ft)
            : ft === flying;
    if (callEngine("altitude_allowed", { ft, ifr: rules === "ifr" }) && !flownAlready) onFlyAltitude(ft);
  };
  const profiled = !disabled && (problem || (!!nav && (flying !== null || nav.flown === null)));
  // The button there as soon as a figure is, greyed till the plan it shows
  // is in, at the owner's ask ("make the profile button appear right after
  // entry but just make it disabled").
  const entered = shown !== "";
  const why = problem
    ? "no legal altitude"
    : flying !== null
      ? said(flying)
      : nav?.flown === null
        ? "no altitude: no winds"
        : "not yet planned";
  // The levels the app offers, the Altitude Advisor's (the engine's
  // altitude_advisor, highest first), worked out only while the list is
  // open; those that start with what is typed once something is, and those
  // a figure typed would not fly (the engine's altitude_allowed, below)
  // shown but not to be picked.
  const [listOpen, setListOpen] = useState(false);
  const digits = (typed ?? "").replace(/\D/g, "");
  const levels = listOpen
    ? advisorRows(nav, flying)
        .map((r) => r.altitude_ft)
        .filter((ft) => (digits.length >= 4 ? String(ft) : flightLevel(ft).slice(3)).startsWith(digits))
    : [];
  // Set as a level is picked, so the blur after it flies nothing more.
  const picked = useRef(false);
  // A level lit by the arrows (the list's own highlight).
  const lit = useRef(false);
  const field = useRef<HTMLInputElement | null>(null);
  // The figures' selection a tap asked for, put back as the tap ends (onClick).
  const tapEnd = useRef<(() => void) | null>(null);
  return (
    // The stock Combobox (ui/combobox, shadcn's on Base UI's) in the pill
    // the airplane's is (pillLook), at the owner's ask ("N-number should
    // look similar to altitude"): a figure typed as before, or a level
    // picked from its list, each flown as a figure typed is (`fly`). Its
    // value is the altitude flown, ticked in the list; what is typed is
    // the pilot's (inputValue), never put back to a label by the part.
    <Combobox<number>
      value={flying}
      onValueChange={(ft) => {
        if (ft === null) return;
        picked.current = true;
        setTyped(null);
        fly(String(ft));
        field.current?.blur();
      }}
      itemToStringLabel={(ft) => flightLevel(ft)}
      // "FL-" in the field's own text, not a label beside it: iOS keeps a
      // few points inside an input's edge, which set the figures apart from
      // it ("FL- 125" on the owner's phone, 2026-10-27).
      inputValue={shown ? `FL-${shown}` : ""}
      onInputValueChange={(next, details) => {
        if (details.reason !== "input-change") return;
        setTyped(next.toUpperCase().replace(/^FL-?/, "").replace(/\D/g, "").slice(0, 5));
      }}
      open={listOpen && levels.length > 0}
      onOpenChange={setListOpen}
      onItemHighlighted={(ft) => {
        lit.current = ft !== undefined;
      }}
    >
      <ComboboxInput
        className={cn(PILL, "shrink-0")}
        group={{ "aria-label": "Cruise altitude", "data-testid": "altitude-group" }}
        // As wide as "FL-000", whatever is in it.
        inputClassName={cn(PILL_FIELD, "w-[calc(7ch+0.75rem)] tabular-nums", problem ? "text-destructive-ink" : "text-foreground")}
        ref={field}
        placeholder={placeholder(engineReady)}
        enterKeyHint="done"
        inputMode="numeric"
        aria-label="Cruise altitude, a flight level or feet"
        onKeyDown={(e) => {
          tapEnd.current = null;
          // Enter on a level lit by the arrows is the list's (it picks it);
          // else the figure typed, flown as before.
          if (e.key === "Enter" && !(listOpen && lit.current)) {
            e.preventDefault();
            fly();
            e.currentTarget.blur();
          }
          // Escape with the list away lets go of what is typed; with it
          // open, the stock part closes it.
          if (e.key === "Escape" && !listOpen) setTyped(null);
        }}
        // Its figures taken whole as it is tapped, as iOS selects a field
        // whose value is replaced: the caret fell between "FL" and "-",
        // and a new altitude took three deletes before three figures (the
        // FPL audit's A6, 2026-11-08). After the tap's own caret, a frame
        // on, which would put it back.
        onFocus={(e) => {
          const input = e.currentTarget;
          setEditing(true);
          const tapped = input.value;
          // Not once a figure is typed: a key inside that frame had its
          // figure taken whole and typed over by the next ("075" went in as
          // FL-75, plans.spec, 2026-11-13).
          const pick = () => {
            if (document.activeElement === input && input.value === tapped) input.setSelectionRange(3, input.value.length);
          };
          pick();
          requestAnimationFrame(pick);
          // And once more as the tap ends: the stock list opens on the
          // press, which can hold the frame past the press's own caret,
          // put at the tap's point as it lifts ("FL-07503" in WebKit).
          tapEnd.current = pick;
        }}
        onClick={() => {
          const pick = tapEnd.current;
          tapEnd.current = null;
          // A frame on, after the caret WebKit puts once the click is done.
          if (pick) requestAnimationFrame(pick);
        }}
        onBlur={() => {
          setEditing(false);
          if (picked.current) picked.current = false;
          else fly();
          setTyped(null);
        }}
        data-testid="altitude-input"
      >
        {/* No button of its own at its end, at the owner's ask (2026-10-27:
            "No need for a separate profile button"), and no caution's dot
            there either: that is on the route's Profile button now
            (PlanWorkspace's altitudeMark). What the altitude is and why
            stays in its name for VoiceOver. */}
        {(profiled || entered) && (
          <span
            role="img"
            aria-label={`Cruising altitude${rules === "ifr" ? " under IFR" : ""}, ${why}${!problem && tight ? ", tight" : ""}${!problem && cautions.length ? ", your altitude has a caution" : ""}`}
            data-testid="altitude-why"
            className="relative flex size-0 shrink-0"
          />
        )}
        {/* Done while it is typed in: the number pad iOS gives a numeric
              field has no Return, so the altitude went in only when the
              field was left (the FPL audit's A6). Over the route's buttons
              beside it, which wait while the keyboard is up, the field
              itself not widened for it (its one width, InlineField). */}
        {editing && (
          <span className="relative flex size-0 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={(e) => e.preventDefault()}
              // Its blur flies what was typed (the field's onBlur).
              onClick={() => (document.activeElement as HTMLElement | null)?.blur()}
              data-testid="altitude-done"
              // The stock small Button, a card's capsule floating over the
              // route's buttons: the card's fill and its soft edge. Centred
              // by its top, not a translate, which the stock press's own
              // one-point nudge would replace.
              className={cn(
                "absolute top-[calc(50%-0.875rem)] left-2 z-20 h-7 rounded-full border-0 bg-card px-3 font-semibold shadow-(--depth-float)",
                "after:absolute after:-inset-2 after:content-['']",
                TEXT.row,
              )}
            >
              Done
            </Button>
          </span>
        )}
      </ComboboxInput>
      <ComboboxContent data-testid="altitude-levels">
        <ComboboxList>
          {levels.map((ft) => (
            <ComboboxItem
              key={ft}
              value={ft}
              disabled={!callEngine("altitude_allowed", { ft, ifr: rules === "ifr" })}
              className="tabular-nums"
              data-testid="altitude-level"
            >
              {flightLevel(ft)}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
