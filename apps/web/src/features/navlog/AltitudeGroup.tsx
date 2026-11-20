import { useId, useState } from "react";
import { cn } from "cn";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../components/ui/input-group";
import type { Leg, NavLogAltitude } from "../../lib/api/types";
import type { FlightRules } from "../../lib/preferences";
import { TEXT } from "../../lib/text";
import { flightLevel } from "../../lib/format";
import { callEngine } from "../../lib/engine/engine";
import { useEngineReady } from "../../lib/engine/useEngineReady";
import { cruiseOf } from "./altitude/plans";
import { PILL, PILL_FIELD, PILL_PREFIX, PREFIXED_FIELD } from "./pillLook";

/** What the empty field says: an example of what it takes, at the owner's
 *  ask ("I want it to say Alt: 080 as a text filler example"). */
// Dashes, not an example figure: grey "080" after FL- read as an
// altitude planned (the owner's screenshot, 2026-10-27, while the
// altitudes were still being planned).
/** With no altitude, three blanks after the pill's own "FL-" (the blanks
 *  of flightLevel(null), "FL-___"), as the airplane's empty field shows
 *  five after its "N-": the engine's words, so none until its .wasm is in
 *  (the row is drawn at once, the engine or not; firstDraw.test). */
const placeholder = (engineReady: boolean) => (engineReady ? flightLevel(null).replace(/^FL-/, "") : "");
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
  // What is typed, while it is, and kept with the engine's reason where it
  // could not be planned: the figure flown otherwise.
  const [typed, setTyped] = useState<string | null>(null);
  // The engine's reason for the last figure typed, said under the pill
  // until the next is typed: why it was not planned (`refused`), or the
  // warning it was planned with (the owner's warn, never limit).
  const [note, setNote] = useState<{ text: string; refused: boolean } | null>(null);
  const ids = useId();
  // Written as a flight level at every altitude -- FL045 for 4,500 ft --
  // at the owner's pick (2026-10-20), told that the FAA's flight levels
  // start at 18,000 ft MSL, where altimeters go to 29.92 (14 CFR 1.1,
  // 91.121(a)): the figure is hundreds of feet MSL, and the planner's are
  // feet MSL still, as VoiceOver says them (`said`). Typed, three figures
  // of hundreds of feet as written, at the owner's ask ("when altitude is
  // entered it should only hold 3 digits"), or feet in four or five.
  const flying = commanded ?? cruise;
  const shown = typed ?? (problem || flying === null ? "" : flightLevel(flying).slice(3));
  const fly = () => {
    if (typed === null) return;
    // Any of the ways a pilot writes it, at the owner's ask (2026-10-27),
    // read by the engine (`altitude_typed`: 14 CFR 1.1's three figures of
    // a flight level, or feet), which guesses nothing: "0450" or six
    // figures are no altitude, and say why.
    const read = engineReady ? callEngine("altitude_typed", { text: typed, ifr: rules === "ifr" }) : { ft: null, reason: null };
    if (read.ft === null) {
      // Not planned: what was typed stays, in red, with the engine's
      // reason under it -- never let go of without a word. Nothing typed
      // goes back to the figure flown.
      if (read.reason) setNote({ text: read.reason, refused: true });
      else setTyped(null);
      return;
    }
    const ft = read.ft;
    setTyped(null);
    // Warn, never limit (the owner): VFR in Class A (14 CFR 71.33(a),
    // 91.135(a)) or IFR above FL410 (91.179(b)) is planned as asked, the
    // engine's warning said under the pill and the planner's own cautions
    // on the Profile (own_altitude_caution).
    setNote(read.reason ? { text: read.reason, refused: false } : null);
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
    if (!flownAlready) onFlyAltitude(ft);
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
  // Three figures are a flight level's, after the pill's "FL-"; four or
  // more are feet, written as typed with no "FL-" before them, so "7500"
  // never reads "FL-7500". At most six kept: the sixth is there to be seen
  // and said to be one too many (the engine's), the field never wider than
  // its box.
  const value = shown;
  const feet = shown.length > 3;
  const whyId = `${ids}-why`;
  const noteId = `${ids}-note`;
  const described = [profiled || entered ? whyId : null, note ? noteId : null].filter(Boolean).join(" ") || undefined;
  return (
    // The stock InputGroup (ui/input-group) in the pill the airplane's is
    // (pillLook), at the owner's ask ("N-number should look similar to
    // altitude"): a figure typed, flown as before (`fly`). No list of
    // levels and no chevron, at the owner's word (2026-11-17: "No need for
    // drop down for FL"): the levels are the Profile's.
    <InputGroup className={cn(PILL, "w-auto shrink-0")} aria-label="Cruise altitude" data-testid="altitude-group">
      {/* "FL-" the pill's own black letters before the figures (the owner,
          2026-11-19: "N and FL should be static letter and black, not
          grey, so input can be entered after the dash"); none before feet
          typed in four or five figures, which are no flight level. No Done
          of our own: the keyboard's own ✓ leaves the field, whose blur
          flies what was typed (the owner, 2026-11-19: "What's Done for?"). */}
      {!feet && (
        <InputGroupAddon className={PILL_PREFIX} aria-hidden="true">
          FL-
        </InputGroupAddon>
      )}
      <InputGroupInput
        // Three figures after "FL-", whatever is in it (the owner,
        // 2026-11-20: "FL for 3 letters after the dashes"); five once feet
        // are typed, which have no "FL-" before them.
        className={cn(
          PILL_FIELD,
          !feet && PREFIXED_FIELD,
          feet ? "w-[calc(5ch+0.25rem)]" : "w-[calc(3ch+0.25rem)]",
          "tabular-nums",
          problem || note?.refused ? "text-destructive-ink" : "text-foreground",
        )}
        // The figures alone, "FL-" the pill's before them (PILL_PREFIX).
        value={value}
        onChange={(e) => {
          setNote(null);
          setTyped(e.currentTarget.value.toUpperCase().replace(/^FL-?/, "").replace(/\D/g, "").slice(0, 6));
        }}
        placeholder={placeholder(engineReady)}
        enterKeyHint="done"
        inputMode="numeric"
        aria-label="Cruise altitude, a flight level or feet"
        aria-describedby={described}
        aria-invalid={note?.refused || undefined}
        onKeyDown={(e) => {
          // Enter only leaves the field, whose blur flies it: flown here
          // too, it was flown twice, the blur's with what was typed still
          // in its closure.
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          // Escape lets go of what is typed.
          if (e.key === "Escape") {
            setTyped(null);
            setNote(null);
          }
        }}
        // Its figures taken whole as it is tapped, as iOS selects a field
        // whose value is replaced, so three figures typed replace them (the
        // FPL audit's A6, 2026-11-08). After the tap's own caret, a frame
        // on, which would put it back.
        onFocus={(e) => {
          const input = e.currentTarget;
          const tapped = input.value;
          // Not once a figure is typed: a key inside that frame had its
          // figure taken whole and typed over by the next ("075" went in as
          // FL-75, plans.spec, 2026-11-13).
          const pick = () => {
            if (document.activeElement === input && input.value === tapped) input.setSelectionRange(0, input.value.length);
          };
          pick();
          requestAnimationFrame(pick);
        }}
        onBlur={() => {
          fly();
        }}
        data-testid="altitude-input"
      />
      {/* No button of its own at its end, at the owner's ask (2026-10-27:
            "No need for a separate profile button"), and no caution's dot
            there either: that is on the route's Profile button now
            (PlanWorkspace's altitudeMark). What the altitude is and why is
            the field's description, read with it by VoiceOver
            (aria-describedby), and nothing on screen. */}
      {(profiled || entered) && (
        <span
          id={whyId}
          role="note"
          aria-label={`Cruising altitude${rules === "ifr" ? " under IFR" : ""}, ${why}${!problem && tight ? ", tight" : ""}${!problem && cautions.length ? ", your altitude has a caution" : ""}`}
          data-testid="altitude-why"
          className="sr-only"
        />
      )}
      {/* The engine's reason for the figure typed, where it was typed (lib/
          problems: an error is said in its place): under the pill, over
          what is below the bar, until the next figure is typed. */}
      {note && (
        <span className="relative flex size-0 shrink-0 self-end">
          <span
            id={noteId}
            role="status"
            data-testid="altitude-note"
            className={cn(
              "absolute top-2 right-0 z-20 w-max max-w-[16rem] rounded-xl bg-card px-3 py-1.5 font-normal shadow-(--depth-float)",
              note.refused ? "text-destructive-ink" : "text-foreground",
              TEXT.detail,
            )}
          >
            {note.text}
          </span>
        </span>
      )}
    </InputGroup>
  );
}
