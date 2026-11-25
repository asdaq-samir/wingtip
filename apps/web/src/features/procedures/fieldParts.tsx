import type { ReactNode } from "react";
import type { Runway } from "../../lib/api/types";
import { sameField } from "../../lib/procedures";
import {
  groundMinAt,
  runwayNumber,
  type Landing,
  type NavLogRow,
  type ProcedureAirport,
  type ProcedureKind,
  type RunwayEnd,
} from "../plan";
import { DepartPicker } from "../navlog/lazy";
import ProcedureMenu from "./ProcedureMenu";
import { ProcedureDropdown } from "./ProcedureDropdown";
import type { TriggerLook } from "./ProcedureTrigger";
import { PatternChips } from "./PatternChips";
import { RunwayPill } from "./RunwayPill";
import { endChoice, runwayEnds } from "./runwayChoice";
import { WindLine } from "./FieldHead";
import { patternNote } from "./procedureWords";
import { endFit } from "./runwayFit";
import { DAY_MIN, type ProceduresRouteModel } from "./useProceduresRoute";

type Kind = ProcedureKind;

/** A field's landing or takeoff: its kinds of procedure, its runway chips
 *  (with what follows them, `trailing`), when a stop is left again, and the
 *  runway line's key and pick (PatternChips folds a line with a runway
 *  picked to that runway's chip). */
export type FieldPart = {
  role: "Arrive" | "Depart";
  kinds: Kind[];
  /** Its runway's chips, with what follows them; or, on FPL's Landing and
   *  Takeoff (`pill`), its runway's slim pill and its menu (RunwayPill). */
  chips: (trailing: ReactNode, pill?: boolean, roomy?: boolean) => ReactNode;
  leaves: ReactNode;
  line: { key: string; chosen: string | null };
  /** A runway end of the field by its number ("23") as a choice
   *  (endChoice): how it fits a landing today, for a straight-in
   *  approach's own runway, said where it is not offered. */
  choiceOf?: (id: string) => ReturnType<typeof endChoice> | null;
};

/** A kind's pull-down at a field (ProcedureMenu): the one in the route said
 *  on it, "+ Approach" where none is picked (`add`). The same menu for the
 *  list read in flight (FieldStep) and FPL's timeline (TimelineRoute),
 *  a row's words its `face`. */
export function kindMenu(vm: ProceduresRouteModel, a: ProcedureAirport, kind: Kind, look: TriggerLook, face?: ReactNode) {
  const { airports, lists, inRoute, windOf, pickOf, chosenAt, ask, pick, onAt, setLesson } = vm;
  const i = airports.findIndex((f) => sameField(f.ident, a.ident));
  const wind = windOf(a.ident);
  const placed = inRoute.find((p) => sameField(p.ident, a.ident) && p.kind === kind);
  const props: Parameters<typeof ProcedureMenu>[0] = {
    ident: a.ident,
    kind,
    list: lists[i]?.data,
    query: lists[i],
    look,
    face,
    picked: pickOf(a.ident, kind),
    label: placed?.label ?? null,
    fixes: placed?.fixes?.map((f) => f.ident),
    runway: chosenAt(a.ident),
    windward: wind && !wind.calm ? wind.ident : null,
    onOpen: () => ask(a.ident),
    onPick: (next) => pick(a.ident, kind, next),
    onAll: () => onAt({ ident: a.ident, kind }),
    onLearn: kind === "approach" ? () => setLesson(pickOf(a.ident, kind)) : undefined,
    onDeactivate: kind === "approach" && placed && !placed.loaded ? () => vm.onApproach(a.ident, placed.id, { loaded: true }) : undefined,
  };
  // FPL's Landing and Takeoff pills pick from the stock dropdown, as their
  // runway's does (ProcedureDropdown); the list read in flight keeps the
  // sheet of pages.
  return look === "slim" || look === "wide" ? <ProcedureDropdown key={kind} {...props} /> : <ProcedureMenu key={kind} {...props} />;
}

/** Whether the procedure of a kind at a field is picked into the route. */
export const kindPicked = (vm: ProceduresRouteModel, a: ProcedureAirport, kind: Kind) =>
  vm.inRoute.some((p) => sameField(p.ident, a.ident) && p.kind === kind);

/** A field's wind as its rows write it, "270 9 kt" or "Calm": without the
 *  "T" after its direction, at the owner's ask ("No need to put T next to
 *  wind"); a METAR's and a TAF's winds are true (FAA Order JO 7900.5), as
 *  VoiceOver still says them (WindLine's `spoken`). */
export function windWords(reported: ReturnType<ProceduresRouteModel["reportedOf"]>): string | null {
  return reported === "calm" ? "Calm" : reported ? `${reported.dir.replace(/T$/, "")} ${reported.speed} kt` : null;
}

/**
 * What is flown at a field, in order: a departure's takeoff, a
 * destination's landing, a stop's landing and then its takeoff (the
 * owner's "If a stop is an airport then it should have arrival first with
 * a runway and a separate departure with a runway"), each with its runway
 * chips into the wind and its kinds of procedure -- only the kinds the
 * field has (hasKind) or the route holds.
 */
export function fieldParts(vm: ProceduresRouteModel, a: ProcedureAirport, row: NavLogRow | undefined): FieldPart[] {
  const { airports, cards, fit, ground, startMs, windOf, chosenAt, takeoffAt, hasKind, landingOf, landedAt } = vm;
  const { onPick, onTakeoff, onGround } = vm;
  const wind = windOf(a.ident);
  const reported = vm.reportedOf(a.ident);
  const wordsOfWind = windWords(reported);
  const has = (kind: Kind) => hasKind(a.ident, kind) || kindPicked(vm, a, kind);
  // Each runway end's fit today (runwayFit): its crosswind against the
  // airplane's demonstrated, and its length against the distance needed,
  // marked on its chip, at the owner's ask.
  const card = cards[airports.findIndex((f) => sameField(f.ident, a.ident))]?.data;
  // The wind the runway is picked into, the forecast's where there is one
  // (useFieldWinds' fitWindOf), not the METAR's alone.
  const fitWind = vm.fitWindOf(a.ident);
  const fitOf = (kind: "takeoff" | "landing") => (runway: Runway, end: RunwayEnd) =>
    fit
      ? endFit({
          aircraft: fit.aircraft,
          runway,
          end,
          kind,
          wind: fitWind,
          elevationFt: a.elevationFt ?? null,
          altimeterInHg: card?.metar?.altimeter_in_hg,
          tempC: card?.metar?.temp_c,
          weightLb: kind === "takeoff" ? fit.takeoffLb : fit.landingLb,
        })
      : null;
  const chips =
    (
      kind: "takeoff" | "landing",
      chosen: string | null,
      landing: Landing | null,
      note: string | null,
      pick: (end: string) => void,
      label?: string,
    ) =>
    (trailing: ReactNode, pill?: boolean, roomy?: boolean) =>
      pill ? (
        <RunwayPill
          airport={a}
          wind={wind}
          chosen={chosen}
          landing={landing}
          fitOf={fitOf(kind)}
          label={label ?? `${a.ident} runway`}
          note={note}
          onPick={pick}
          windHead={wordsOfWind && <WindLine direct={false} wind={wordsOfWind} reported={reported} />}
          roomy={roomy}
        />
      ) : (
        <PatternChips
          airport={a}
          wind={wind}
          chosen={chosen}
          landing={landing}
          label={label}
          onPick={pick}
          fitOf={fitOf(kind)}
          note={note}
          trailing={trailing}
        />
      );
  const landingChips = chips(
    "landing",
    chosenAt(a.ident),
    landingOf(a.ident),
    patternNote(a, chosenAt(a.ident), landingOf(a.ident)),
    (end) => onPick(a.ident, end),
  );
  const takeoffChips = chips(
    "takeoff",
    takeoffAt(a.ident),
    null,
    takeoffAt(a.ident) ? `Runway ${takeoffAt(a.ident)}` : null,
    (end) => onTakeoff(a.ident, end),
    `${a.ident} takeoff runway`,
  );
  // Each runway line's key as PatternChips keeps it open: the field and
  // the chips' own name, none for a landing's or a departure's own.
  const landingLine = { key: `${a.ident}:`, chosen: chosenAt(a.ident) };
  const takeoffLine = { key: `${a.ident}:${a.ident} takeoff runway`, chosen: takeoffAt(a.ident) };
  const arrive: FieldPart = {
    role: "Arrive",
    kinds: (["arrival", "approach"] as Kind[]).filter(has),
    chips: landingChips,
    leaves: null,
    line: landingLine,
    choiceOf: (id) => {
      const at = runwayEnds(a).find((e) => runwayNumber(e.end.ident) === id);
      return at ? endChoice(at.runway, at.end, wind && !wind.calm ? wind.ident : null, fitOf("landing")) : null;
    },
  };
  if (a.role === "Departure") {
    // A round trip's departure is left from its own runway (`takeoff`),
    // the field's pattern the landing's, as a stop's are.
    const roundTrip = airports.some((b) => b !== a && b.role === "Destination" && sameField(b.ident, a.ident));
    const departChips = roundTrip
      ? takeoffChips
      : chips("takeoff", chosenAt(a.ident), null, patternNote(a, chosenAt(a.ident), null), (end) => onPick(a.ident, end));
    return [
      {
        role: "Depart",
        kinds: (["departure"] as Kind[]).filter(has),
        chips: departChips,
        leaves: null,
        line: roundTrip ? takeoffLine : landingLine,
      },
    ];
  }
  if (a.role === "Destination") return [arrive];
  // When a stop leaves again, picked as the flight's own departure is, at
  // the owner's ask ("just make the departure time selectable like now is
  // for the first departure"): kept as its minutes on the ground (the
  // address's `ground`), the flights after it timed from it; none picked,
  // the planner's turnaround after it lands (groundMinAt). Never before it
  // lands. To the whole minute, as its picker shows it (the stops spec,
  // 2026-11-03).
  const onGroundMin = row?.kind === "stop" ? row.groundMin : groundMinAt(ground, a.ident);
  const flownTo = row?.minutesFlown ?? landedAt(a.ident);
  const landsMs = flownTo == null ? null : Math.floor((startMs + flownTo * 60_000) / 60_000) * 60_000;
  const leaves =
    landsMs === null ? null : (
      <DepartPicker
        value={new Date(landsMs + onGroundMin * 60_000).toISOString()}
        look="time"
        label={`Departure from ${a.ident}`}
        testId={`depart-date-${a.ident}`}
        leavesNow={false}
        // From landing to a day after, as the planner takes a stop's time
        // on the ground (PlanQuery.own_ground).
        earliest={landsMs}
        latest={landsMs + DAY_MIN * 60_000}
        onChange={(iso) => {
          if (iso) onGround(a.ident, Math.min(DAY_MIN, Math.max(0, Math.round((Date.parse(iso) - landsMs) / 60_000))));
        }}
      />
    );
  return [arrive, { role: "Depart", kinds: (["departure"] as Kind[]).filter(has), chips: takeoffChips, leaves, line: takeoffLine }];
}
