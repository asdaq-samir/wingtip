import type { ReactNode } from "react";
import { PlaneLanding, PlaneTakeoff } from "lucide-react";
import { cn } from "cn";
import { CardThread } from "./routeCard";
import { FIELD_CARD, FIELD_GAP } from "./routeListStyle";
import { Collapsible, CollapsibleContent } from "../../components/ui/collapsible";
import type { Runway } from "../../lib/api/types";
import { type RunwayEnd, etaAt, groundMinAt, type NavLogRow, type Landing, type ProcedureAirport, type ProcedureKind } from "../plan";
import { sameField } from "../../lib/procedures";
import { endFit } from "./runwayFit";
import { AirportMark, PointMark, DepartPicker } from "../navlog/lazy";
import { colourOf } from "../../lib/map/marks/flightCategory";
import FixBranch from "./FixBranch";
import ProcedureMenu from "./ProcedureMenu";
import { DAY_MIN, toggleField, type ProceduresRouteModel } from "./useProceduresRoute";
import { PatternChips } from "./PatternChips";
import { RunwayTray } from "./RunwayTray";
import { FieldHead } from "./FieldHead";
import { KIND_WORD, patternNote } from "./procedureWords";
import { pointEnd } from "./pointEnd";

type Kind = ProcedureKind;

/** A field's step: what is flown there, in the order it is flown. */
export function FieldStep({
  vm,
  a,
  row,
  last,
  leads,
}: {
  vm: ProceduresRouteModel;
  a: ProcedureAirport;
  row: NavLogRow | undefined;
  last: boolean;
  leads: boolean;
}) {
  const {
    airports,
    lists,
    cards,
    inRoute,
    procedures,
    crossings,
    depart,
    weather,
    fit,
    ground,
    startMs,
    tanks,
    openLines,
    windOf,
    pickOf,
    chosenAt,
    takeoffAt,
    ask,
    pick,
    onAt,
    setLesson,
    hasKind,
    onProcedures,
    onFix,
    isOpen,
    pointIndex,
    reportedOf,
    landingOf,
    landedAt,
    onPick,
    onTakeoff,
    onDepart,
    onGround,
  } = vm;
  // A kind's pull-down: the one in the route said on it (ProcedureMenu).
  const wind = windOf(a.ident);
  const i = airports.findIndex((f) => sameField(f.ident, a.ident));
  const kindMenu = (kind: Kind, look: "button" | "add") => (
    <ProcedureMenu
      key={kind}
      ident={a.ident}
      kind={kind}
      list={lists[i]?.data}
      query={lists[i]}
      look={look}
      picked={pickOf(a.ident, kind)}
      label={inRoute.find((p) => sameField(p.ident, a.ident) && p.kind === kind)?.label ?? null}
      fixes={inRoute.find((p) => sameField(p.ident, a.ident) && p.kind === kind)?.fixes?.map((f) => f.ident)}
      runway={chosenAt(a.ident)}
      windward={wind && !wind.calm ? wind.ident : null}
      onOpen={() => ask(a.ident)}
      onPick={(next) => pick(a.ident, kind, next)}
      onAll={() => onAt({ ident: a.ident, kind })}
      onLearn={kind === "approach" ? () => setLesson(pickOf(a.ident, kind)) : undefined}
    />
  );
  const has = (kind: Kind) => hasKind(a.ident, kind) || inRoute.some((p) => sameField(p.ident, a.ident) && p.kind === kind);
  const time = row ? etaAt(depart || new Date().toISOString(), row.minutesFlown) : null;
  // 22 in the 36 of its glass button, where the map's 26 filled it.
  // Before the plan, the field's own mark from its card (its airspace,
  // its weather), not a dot, at the owner's screenshot (a departure alone);
  // and before its card is in, the plain airport symbol the route's box
  // shows, where a blue dot stood in for it while the route was drawn (the
  // owner's screenshot, 2026-10-29: BDL to KGLH, "Drawing Route...").
  const placed = cards[i]?.data;
  const mark = row ? (
    <PointMark row={row} number={undefined} weather={weather} airportSize={22} />
  ) : (
    <AirportMark
      airspaceClass={placed?.airspace_class ?? null}
      colour={weather(a.ident) ?? colourOf(placed?.metar?.flight_category ?? null)}
      size={22}
    />
  );
  // A step of the field's, at the owner's pick (option C of the
  // procedures canvas): its name and time in its head, its runway chips
  // under with its info at their start ("Info can go on the left side of
  // the runways"), and after them its procedures -- each picked one the
  // head of a branch of its fixes, in the order they are flown
  // (FixBranch), its pull-down its name; each kind not picked a dashed
  // "+ Arrival" to pick one.
  const branch = (kind: Kind) => {
    const inPlace = inRoute.find((p) => sameField(p.ident, a.ident) && p.kind === kind);
    // By its id, not its kind: the field's list, which says each pick's
    // kind, is asked for only as a pull-down opens.
    const chosen = inPlace && procedures.find((p) => sameField(p.ident, a.ident) && p.id === inPlace.id);
    if (!inPlace || !chosen) return null;
    return (
      <FixBranch
        key={`branch-${kind}`}
        name={inPlace.label}
        kind={KIND_WORD[kind]}
        menu={kindMenu(kind, "button")}
        fixes={inPlace.fixes ?? []}
        direct={inPlace.direct ?? null}
        crossings={crossings}
        onDirect={(fix) =>
          onProcedures(
            procedures.map((p) => (p === chosen ? { ...p, direct: fix } : p)),
            null,
          )
        }
        onOpen={(fix) => onFix(a.ident, kind, fix)}
      />
    );
  };
  // One block an airport, at the owner's pick (2026-10-21, boards 4 and 5
  // of the canvas: "the airport id on top and then departure and arrival
  // that can collapse", "no need to use the word depart, fuel stop,
  // arrive"): its ident, a fuel stop's pump before it and the fuel in the
  // tanks after it, the arrow that opens it, its time over its elevation
  // and its menu; its wind under. Opened, a line each for its landing
  // and its takeoff -- the glyph, the runways, the procedures, a stop's
  // time to leave again -- named for a screen reader as its parts are.
  const key = `${a.role}:${a.ident}`;
  const opened = isOpen(key);
  // `line`, the runway line's key and the runway picked on it
  // (PatternChips folds a line with a runway picked to that runway's chip).
  type Part = {
    role: "Arrive" | "Depart";
    kinds: Kind[];
    chips: (trailing: ReactNode) => ReactNode;
    leaves: ReactNode;
    line: { key: string; chosen: string | null };
  };
  const partBody = (part: Part) => {
    const picked = part.kinds.filter((k) => inRoute.some((p) => sameField(p.ident, a.ident) && p.kind === k));
    const unpicked = part.kinds.filter((k) => !picked.includes(k));
    const Glyph = part.role === "Arrive" ? PlaneLanding : PlaneTakeoff;
    // The pull-downs for the procedures not yet picked beside the runway's
    // chip while its line is folded to it, at the owner's ask ("Can
    // arrival and approach pills be next to the runway when runway is
    // collapsed?", "Same with departure"); under it while the line is
    // open, its runways across the row.
    const foldable = part.line.chosen !== null && a.runways !== null;
    const lineOpen = openLines.includes(part.line.key);
    const adds = unpicked.map((k) => kindMenu(k, "add"));
    return (
      <div className="space-y-3 pt-3">
        <div className="flex items-center gap-2">
          <RunwayTray
            a={a}
            role={part.role}
            Glyph={Glyph}
            lineKey={part.line.key}
            foldable={foldable}
            lineOpen={lineOpen}
            chips={part.chips(adds.length > 0 ? adds : null)}
          />
          {part.leaves && <span className="shrink-0">{part.leaves}</span>}
        </div>
        {picked.map(branch)}
      </div>
    );
  };
  const block = (parts: Part[], headTime: ReactNode) => {
    const first = parts[0]!;
    const end = pointEnd(vm, a.ident, {
      time: headTime,
      waypoint: false,
      elevationFt: a.elevationFt ?? cards[i]?.data?.elevation_ft ?? null,
      to: a.role !== "Departure",
      stop: a.role === "Stop",
      holdable: a.role === "Destination",
      row,
      index: pointIndex(a.ident, a.role),
    });
    const reported = reportedOf(a.ident);
    // Without the "T" after its direction, at the owner's ask ("No need
    // to put T next to wind"): a METAR's and a TAF's winds are true (FAA
    // Order JO 7900.5), as VoiceOver still says them (`spoken`).
    const wind = reported === "calm" ? "Calm" : reported ? `${reported.dir.replace(/T$/, "")} ${reported.speed} kt` : null;
    const tank = row ? tanks.get(row.key) : a.role === "Departure" ? tanks.get("departure") : undefined;
    return (
      // The field a stock Collapsible, its lines the trigger: aria-expanded
      // and aria-controls Base UI's, and the landing's or the takeoff's body
      // its content. A stop's second part, in a section of its own, is
      // shown with it (a Collapsible has one content). Always a card, in
      // every layout, the Nav Log's picked row's fill, and opened it grows
      // with its runways and procedures inside it (the owner, 2026-11-17:
      // "show it all the time, tapping just makes it bigger").
      <Collapsible
        key={key}
        open={opened}
        onOpenChange={(next) => toggleField(key, a.ident, next)}
        render={
          <div
            className={cn("relative isolate", FIELD_CARD, !last && FIELD_GAP)}
            data-testid="route-field"
            data-ident={a.ident}
            data-open={opened || undefined}
          />
        }
      >
        <CardThread first={leads} last={last} />
        <section aria-label={`${a.ident} · ${first.role}`}>
          <FieldHead vm={vm} a={a} mark={mark} end={end} tank={tank} wind={wind} reported={reported} />
          {/* Its runways and procedures under the ident, inside the card. */}
          <CollapsibleContent className="pl-9.5">{partBody(first)}</CollapsibleContent>
        </section>
        {opened && parts[1] && (
          <section aria-label={`${a.ident} · ${parts[1].role}`} className="pl-9.5">
            {partBody(parts[1])}
          </section>
        )}
      </Collapsible>
    );
  };
  // Each runway end's fit today (features/procedures/runwayFit): its crosswind against the
  // airplane's demonstrated, and its length against the distance needed,
  // marked on its chip and said in the field's info, at the owner's ask.
  const card = cards[i]?.data;
  const reportedWind = card?.metar ?? card?.nearby_metar?.metar ?? null;
  const fitOf = (kind: "takeoff" | "landing") => (runway: Runway, end: RunwayEnd) =>
    fit
      ? endFit({
          aircraft: fit.aircraft,
          runway,
          end,
          kind,
          wind: reportedWind && {
            dirTrueDeg: reportedWind.wind_dir_true_deg,
            speedKt: reportedWind.wind_speed_kt,
            gustKt: reportedWind.wind_gust_kt,
          },
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
    (trailing: ReactNode) => (
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
  // A round trip's departure is left from its own runway (`takeoff`), the
  // field's pattern the landing's, as a stop's are.
  const roundTrip = a.role === "Departure" && airports.some((b) => b !== a && b.role === "Destination" && sameField(b.ident, a.ident));
  const departChips = roundTrip
    ? chips(
        "takeoff",
        takeoffAt(a.ident),
        null,
        takeoffAt(a.ident) ? `Runway ${takeoffAt(a.ident)}` : null,
        (end) => onTakeoff(a.ident, end),
        `${a.ident} takeoff runway`,
      )
    : chips("takeoff", chosenAt(a.ident), null, patternNote(a, chosenAt(a.ident), null), (end) => onPick(a.ident, end));
  const takeoffChips = chips(
    "takeoff",
    takeoffAt(a.ident),
    null,
    takeoffAt(a.ident) ? `Runway ${takeoffAt(a.ident)}` : null,
    (end) => onTakeoff(a.ident, end),
    `${a.ident} takeoff runway`,
  );
  // The departure's time on its own step, from the route's box at the
  // owner's ask ("The departure time can move from the route box to the
  // departure and arrival boxes"): picked there, Now for about now.
  const leaving = <DepartPicker value={depart} onChange={onDepart} look="time" />;
  // Each runway line's key as PatternChips keeps it open: the field and
  // the chips' own name, none for a landing's or a departure's own.
  const landingLine = { key: `${a.ident}:`, chosen: chosenAt(a.ident) };
  const takeoffLine = { key: `${a.ident}:${a.ident} takeoff runway`, chosen: takeoffAt(a.ident) };
  if (a.role === "Departure") {
    return block(
      [
        {
          role: "Depart",
          kinds: (["departure"] as Kind[]).filter(has),
          chips: departChips,
          leaves: null,
          line: roundTrip ? takeoffLine : landingLine,
        },
      ],
      leaving,
    );
  }
  if (a.role === "Destination")
    return block(
      [{ role: "Arrive", kinds: (["arrival", "approach"] as Kind[]).filter(has), chips: landingChips, leaves: null, line: landingLine }],
      time,
    );
  // A stop is landed at and left again, each with its own runway, at the
  // owner's ask ("If a stop is an airport then it should have arrival
  // first with a runway and a separate departure with a runway"): two
  // steps, the pattern drawn the landing's.
  // When it leaves again, picked on its Depart step as the flight's own
  // departure is, at the owner's ask ("we should not say 30 min on the
  // ground instead just make the departure time selectable like now is
  // for the first departure"): kept as its minutes on the ground (the
  // address's `ground`), the flights after it timed from it; none picked,
  // the planner's turnaround after it lands (the stop's row, groundMinAt).
  // Never before it lands.
  const onGroundMin = row?.kind === "stop" ? row.groundMin : groundMinAt(ground, a.ident);
  const flownTo = row?.minutesFlown ?? landedAt(a.ident);
  // To the whole minute, as its picker shows it: with the seconds kept, a
  // departure picked a quarter of an hour after the one shown was 44
  // minutes on the ground, not 45 (the stops spec, 2026-11-03).
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
  return block(
    [
      { role: "Arrive", kinds: (["arrival", "approach"] as Kind[]).filter(has), chips: landingChips, leaves: null, line: landingLine },
      { role: "Depart", kinds: (["departure"] as Kind[]).filter(has), chips: takeoffChips, leaves, line: takeoffLine },
    ],
    time,
  );
}
