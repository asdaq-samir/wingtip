import { useId, useState } from "react";
import { cn } from "cn";
import { InputGroup, InputGroupInput } from "../../components/ui/input-group";
import { Button } from "../../components/ui/button";
import type { Leg, NavLogAltitude } from "../../lib/api/types";
import type { FlightRules } from "../../lib/preferences";
import { TEXT } from "../../lib/text";
import { flightLevel } from "../../lib/format";
import { callEngine } from "../../lib/engine/engine";
import { useEngineReady } from "../../lib/engine/useEngineReady";
import { cruiseOf } from "./altitude/plans";
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
  // What is typed, while it is, and kept with the engine's reason where it
  // could not be planned: the figure flown otherwise.
  const [typed, setTyped] = useState<string | null>(null);
  // The engine's reason for the last figure typed, said under the pill
  // until the next is typed: why it was not planned (`refused`), or the
  // warning it was planned with (the owner's warn, never limit).
  const [note, setNote] = useState<{ text: string; refused: boolean } | null>(null);
  const ids = useId();
  // Being typed in: its Done shown (at the pill's start, below).
  const [editing, setEditing] = useState(false);
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
  // Three figures are a flight level's, written after "FL-"; four or more
  // are feet, written as typed, so "7500" never reads "FL-7500" and the
  // field holds what it shows. At most six kept: the sixth is there to be
  // seen and said to be one too many (the engine's), the field never
  // wider than its box.
  const value = shown === "" ? "" : shown.length > 3 ? shown : `FL-${shown}`;
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
      {/* Done while it is typed in: the number pad iOS gives a numeric
          field has no Return, so the altitude went in only when the field
          was left (the FPL audit's A6). At the pill's start, over the
          airplane's pill beside it in the same bar, which waits while the
          keyboard is up: at its end it floated past the centred bar over
          the search's toggle. The field itself not widened for it. */}
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
            // The stock small Button, a card's capsule: the card's fill and
            // its soft edge. Centred by its top, not a translate, which the
            // stock press's own one-point nudge would replace.
            className={cn(
              "absolute top-[calc(50%-0.875rem)] right-1 z-20 h-7 rounded-full border-0 bg-card px-3 font-semibold shadow-(--depth-float)",
              "after:absolute after:-inset-2 after:content-['']",
              TEXT.row,
            )}
          >
            Done
          </Button>
        </span>
      )}
      <InputGroupInput
        // As wide as "FL-000", whatever is in it.
        className={cn(
          PILL_FIELD,
          "w-[calc(7ch+0.75rem)] tabular-nums",
          problem || note?.refused ? "text-destructive-ink" : "text-foreground",
        )}
        // "FL-" in the field's own text, not a label beside it: iOS keeps a
        // few points inside an input's edge, which set the figures apart
        // from it ("FL- 125" on the owner's phone, 2026-10-27).
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
        // whose value is replaced: the caret fell between "FL" and "-",
        // and a new altitude took three deletes before three figures (the
        // FPL audit's A6, 2026-11-08). After the tap's own caret, a frame
        // on, which would put it back.
        onFocus={(e) => {
          const input = e.currentTarget;
          setEditing(true);
          const tapped = input.value;
          const from = tapped.startsWith("FL-") ? 3 : 0;
          // Not once a figure is typed: a key inside that frame had its
          // figure taken whole and typed over by the next ("075" went in as
          // FL-75, plans.spec, 2026-11-13).
          const pick = () => {
            if (document.activeElement === input && input.value === tapped) input.setSelectionRange(from, input.value.length);
          };
          pick();
          requestAnimationFrame(pick);
        }}
        onBlur={() => {
          setEditing(false);
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
