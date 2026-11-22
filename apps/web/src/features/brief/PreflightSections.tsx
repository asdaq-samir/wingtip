import { lazy, useId } from "react";
import { cn } from "cn";
import { Flag } from "./BriefingBits";
import AccordionSection from "../../components/AccordionSection";
import AfterPaint from "../../components/AfterPaint";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { NumberField as StockNumberField } from "../../components/ui/number-field";
import type { AircraftProfile, Briefing, Course, Loading } from "../../lib/api/types";
import { runwayChecks, type RunwayDistance } from "./runwayCheck";
import { useRunwayPicks, phasesOf, type Phase } from "../plan/lazy";
import { FINDING_TONE } from "../../lib/findings";
import FindingIcon from "../../components/FindingIcon";
import { windOnRunway, useLoad } from "../plan";
import { TEXT } from "../../lib/text";
import { altFt, feet, pounds } from "../../lib/format";
import { armText, fuelGrades, type FuelGrade } from "../../lib/weightBalance";
import PullDown, { type PullDownOption } from "../../components/PullDown";
import { AirplaneLink } from "../../components/airplane/AirplaneLink";
import { AskFigure } from "../../components/airplane/AskFigure";
import { useNotInProfileSummary } from "./notInProfileSummary";
import { NO_RUNWAYS } from "../../lib/emptyWords";
import { loadEnvelopeChart } from "../navlog";
import { WORDING } from "../../lib/wording/generated/wording";

/** The envelope's picture: Recharts, loaded with the section. */
const EnvelopeChart = lazy(() => loadEnvelopeChart());

/** A number typed into a row: the stock field, short, its unit after it. */
function NumberField({
  value,
  onChange,
  unit,
  label,
  testId,
}: {
  value: number;
  onChange: (n: number) => void;
  unit: string;
  label: string;
  testId?: string;
}) {
  const id = useId();
  return (
    // A label round the field and its unit, its 44 pt hit area a
    // pseudo-element behind them (isolate keeps it over the row): a tap
    // just above or below the 32 pt field still lands in it, and the
    // field does not grow.
    <label htmlFor={id} className="relative isolate flex items-center gap-1.5 hit-y-1.5 after:-z-10">
      <StockNumberField
        id={id}
        minValue={0}
        aria-label={label}
        data-testid={testId}
        className="h-8 w-24"
        inputClassName="text-right"
        value={Number.isFinite(value) ? value : null}
        onChange={(v) => onChange(v ?? 0)}
      />
      <span className={cn("w-6 text-muted-foreground", TEXT.detail)}>{unit}</span>
    </label>
  );
}

/** The fuel grade's menu: the POH's own weight a gallon first, then the
 *  engine's grades, each with its gallon's weight. */
function fuelGradeOptions(loading: Loading): PullDownOption<FuelGrade | "poh">[] {
  return [
    { value: "poh", label: loading.fuel_lb_per_gal == null ? "As in the POH" : `As in the POH · ${loading.fuel_lb_per_gal} lb/gal` },
    ...fuelGrades().map((g) => ({ value: g.grade, label: `${g.name} · ${g.lb_per_gal} lb/gal` })),
  ];
}

/**
 * Weight and balance, as its POH's loading graph does it: the airplane's
 * empty weight and arm, each station's load and the fuel, and the
 * weight and centre of gravity at takeoff and at landing -- the trip's
 * fuel burned -- against the most it may weigh and its envelope. For an
 * airplane whose profile has its POH's loading; none else, the figures it lacks asked for (AskFigure).
 */
export function WeightBalanceSection({
  aircraft,
  tripFuelGal,
}: {
  aircraft: AircraftProfile | null | undefined;
  tripFuelGal: number | null;
}) {
  const { loading, load, result, setLoad } = useLoad(aircraft, tripFuelGal);
  const missing = useNotInProfileSummary();
  const summary = !result
    ? missing
    : `${pounds(result.takeoff.weightLb)} at ${armText(result.takeoff)}${result.problems.length ? "" : " · within limits"}`;
  return (
    <AccordionSection
      title={WORDING.weightAndBalance}
      summary={summary}
      aside={
        result && result.problems.length > 0 ? (
          <Flag finding="stop" testId="wb-flag">
            Out of Limits
          </Flag>
        ) : undefined
      }
    >
      {!loading || !load || !result ? (
        <AskFigure figure="weight_balance" what="The weight and balance" tables={aircraft} testId="wb-not-in-profile" />
      ) : (
        <div className="space-y-4" data-testid="weight-balance">
          {/* From its own weight and balance record; the POH's sample airplane until set. */}
          <ListGroup title="The Airplane" action={<AirplaneLink focus="empty_weight_lb" testId="wb-airplane-profile" />}>
            <ListRow title={WORDING.emptyWeight}>
              <NumberField
                value={load.emptyWeightLb}
                unit="lb"
                label="Empty Weight"
                onChange={(n) => setLoad({ ...load, emptyWeightLb: n })}
                testId="wb-empty-weight"
              />
            </ListRow>
            <ListRow title="Empty Arm">
              <NumberField value={load.emptyArmIn} unit="in" label="Empty arm" onChange={(n) => setLoad({ ...load, emptyArmIn: n })} />
            </ListRow>
          </ListGroup>
          <ListGroup title="Loaded">
            {loading.stations.map((station, i) => (
              <ListRow
                key={station.name}
                title={station.name}
                description={station.max_lb != null ? `${pounds(station.max_lb)} at most` : undefined}
              >
                <NumberField
                  value={load.stationsLb[i] ?? 0}
                  unit="lb"
                  label={station.name}
                  testId={`wb-station-${i}`}
                  onChange={(n) =>
                    setLoad({ ...load, stationsLb: loading.stations.map((_, k) => (k === i ? n : (load.stationsLb[k] ?? 0))) })
                  }
                />
              </ListRow>
            ))}
            <ListRow title="Fuel" description={`${loading.fuel_max_gal} gal usable`}>
              <NumberField
                value={load.fuelGal}
                unit="gal"
                label="Fuel"
                onChange={(n) => setLoad({ ...load, fuelGal: n })}
                testId="wb-fuel"
              />
            </ListRow>
            {/* Its grade, a gallon's weight the engine's (fuel_grades); the
                POH's own figure until the pilot picks one. */}
            <ListRow title="Fuel grade">
              <PullDown
                label="Fuel grade"
                value={load.fuelGrade ?? "poh"}
                options={fuelGradeOptions(loading)}
                onChange={(g) => setLoad({ ...load, fuelGrade: g === "poh" ? null : g })}
                testId="wb-fuel-grade"
              />
            </ListRow>
          </ListGroup>
          {/* The loading's source (its POH); the start and taxi's fuel off at takeoff, the trip's at landing. */}
          <ListGroup title="Balance">
            <ListRow title="Takeoff" value={`${pounds(result.takeoff.weightLb)} · ${armText(result.takeoff)}`} />
            <ListRow title="Landing" value={`${pounds(result.landing.weightLb)} · ${armText(result.landing)}`} />
            {result.problems.length === 0 ? (
              <ListRow media={<FindingIcon finding="ok" />} title="Within the weight and the envelope" data-testid="wb-ok" />
            ) : (
              result.problems.map((problem) => (
                <ListRow
                  key={problem}
                  media={<FindingIcon finding="stop" />}
                  title={<span className={FINDING_TONE.stop}>{problem}</span>}
                />
              ))
            )}
          </ListGroup>
          <AfterPaint fallback={<div className="h-56" />}>
            <EnvelopeChart envelope={loading.envelope as [number, number][]} takeoff={result.takeoff} landing={result.landing} />
          </AfterPaint>
        </div>
      )}
    </AccordionSection>
  );
}

/** A distance against the runway it is flown on: the ground roll solid,
 *  the rest of the way over the 50 ft obstacle paler, on the runway's
 *  length -- red, and to the end, where it does not fit. */
function RunwayBar({ distance, lengthFt }: { distance: RunwayDistance; lengthFt: number }) {
  const share = (ft: number) => `${Math.min(100, (ft / lengthFt) * 100)}%`;
  return (
    <span className="mt-1.5 mb-0.5 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      <span
        className={cn("relative block h-full rounded-full", distance.over ? "bg-destructive/40" : "bg-primary/35")}
        style={{ width: share(distance.totalFt) }}
      >
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", distance.over ? "bg-destructive" : "bg-primary")}
          style={{ width: `${Math.min(100, (distance.groundRollFt / Math.max(distance.totalFt, 1)) * 100)}%` }}
        />
      </span>
    </span>
  );
}

/**
 * The runway check at each airport the flight takes off from or lands at
 * (features/brief/runwayCheck): the runway the wind favours, the POH's short-field
 * distances on it at the field's pressure altitude and temperature, the
 * weight from Weight & Balance and the reported wind -- drawn against the
 * runway's length -- then the density altitude the airplane performs at,
 * and the wind across the runway against the most the POH demonstrates.
 * On the Depart tab its takeoff (`phase`), on the Arrive tab its landing,
 * the stops' on En route's.
 */
export function TakeoffLandingSection({
  aircraft,
  briefing,
  course,
  landing: landingWeight,
  takeoff: takeoffWeight,
  phase,
}: {
  /** Only this part of the flight's fields (its tab's). */
  phase?: Phase;
  aircraft: AircraftProfile | null | undefined;
  briefing: Briefing | null;
  course: Course | null;
  takeoff: number | null;
  landing: number | null;
}) {
  const takeoffTable = aircraft?.takeoff ?? null;
  const landingTable = aircraft?.landing ?? null;
  // The runways picked in FPL, checked whatever the wind (runwayFlown).
  const picks = useRunwayPicks();
  const all = runwayChecks(aircraft, briefing, course, takeoffWeight, landingWeight, picks);
  const checks = phase ? all.filter((_, i) => phasesOf(i, all.length).includes(phase)) : all;
  const short = [...new Set(checks.filter((c) => c.distances.some((d) => d.over)).map((c) => c.field.ident))];
  const gusty = [...new Set(checks.filter((c) => c.crosswindOver).map((c) => c.field.ident))];
  const demonstrated = aircraft?.crosswind ?? null;
  const missing = useNotInProfileSummary();
  const summary = !takeoffTable
    ? missing
    : !briefing
      ? undefined
      : short.length
        ? `Over the runway at ${short.join(", ")}`
        : "Within each runway";
  return (
    <AccordionSection
      title={phase === "depart" ? "Takeoff" : phase === "arrive" ? "Landing" : phase === "enroute" ? "Stops" : "Takeoff & Landing"}
      summary={summary}
      aside={
        short.length ? (
          <Flag finding="stop" testId="tl-flag">
            Runway Too Short
          </Flag>
        ) : gusty.length ? (
          <Flag finding="caution" testId="crosswind-flag">
            Crosswind
          </Flag>
        ) : undefined
      }
    >
      {!takeoffTable || !landingTable ? (
        <AskFigure figure="takeoff_landing" what="The takeoff and landing distances" tables={aircraft} testId="tl-not-in-profile" />
      ) : !briefing ? (
        <p className="text-muted-foreground" role="status">
          Waiting on the runways and the weather at each field…
        </p>
      ) : (
        <div className="space-y-4" data-testid="takeoff-landing">
          <AirplaneLink testId="tl-airplane-profile" />
          {checks.map((c, i) => {
            const length = c.runway?.length_ft ?? null;
            return (
              <ListGroup
                // No heading on Depart's or Arrive's tab, its one field the
                // tab's own; a stop's named, on En route.
                key={`${c.field.ident}${i}`}
                title={phase === "depart" || phase === "arrive" ? undefined : `${c.field.ident} · ${c.role}`}
              >
                {/* The runway the distances are for, first, and the wind on
                    it -- said once, here, where it was a row of its own and
                    again under the field's runways and its pattern (the
                    owner's pick of the redesign, each fact once). */}
                <ListRow
                  media={c.crosswindOver ? <FindingIcon finding="caution" /> : undefined}
                  title={c.runway ? `Runway ${c.end ?? c.runway.ends}` : <span className="text-muted-foreground">{NO_RUNWAYS}</span>}
                  description={
                    !c.runway ? undefined : c.runway.wind ? (
                      <span className={cn(c.crosswindOver && FINDING_TONE.caution)} data-testid="runway-wind-check">
                        {c.picked && c.end !== c.runway.wind.end
                          ? `Picked in FPL: ${Math.abs(c.headwindKt)} kt ${c.headwindKt < 0 ? "tailwind" : "headwind"}, ${c.crosswindKt} kt across`
                          : `${c.picked && c.end !== c.runway.wind.end ? "Picked in FPL" : "Most into the wind"}: ${windOnRunway(c.runway.wind)}`}
                        {c.crosswindOver && demonstrated && `, over the ${demonstrated.demonstrated_kt} kt the POH demonstrates`}
                      </span>
                    ) : c.picked ? (
                      "Picked in FPL, no wind reported: the distances are for calm"
                    ) : (
                      "The longest, no wind reported: the wind indicator decides, and the distances are for calm"
                    )
                  }
                  value={c.runway ? `${length != null ? feet(length) : "length unknown"}${c.grass ? " · grass" : ""}` : undefined}
                  data-testid="performance-runway"
                />
                {c.distances.map((d) => {
                  // A stop's runway out may not be its runway in: each
                  // distance against its own runway, named where it differs.
                  const runwayFt = d.runway?.length_ft ?? null;
                  const elsewhere = d.end != null && d.end !== c.end ? ` on ${d.end}` : "";
                  return (
                    <ListRow
                      key={d.kind}
                      media={<FindingIcon finding={runwayFt == null ? "unknown" : d.over ? "stop" : "ok"} />}
                      title={`${d.kind === "takeoff" ? "Takeoff" : "Landing"} over 50 ft${elsewhere}`}
                      description={
                        <>
                          {runwayFt != null && <RunwayBar distance={d} lengthFt={runwayFt} />}
                          <span className={cn("block", d.over && FINDING_TONE.stop)}>
                            {[
                              `${altFt(d.groundRollFt)} ft roll`,
                              runwayFt != null &&
                                (d.over ? `${altFt(d.totalFt - runwayFt)} ft past the end` : `${altFt(runwayFt)} ft runway`),
                              ...d.caveats,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </>
                      }
                      value={feet(d.totalFt)}
                      data-testid={`runway-${d.kind}`}
                    />
                  );
                })}
                {c.unchecked != null || c.pressureAltFt == null || c.densityAltFt == null ? (
                  <ListRow
                    media={<FindingIcon finding="unknown" />}
                    title="Distances not worked out"
                    description={`${c.unchecked ?? "the field's elevation is not known"}`.replace(/^./, (ch) => ch.toUpperCase())}
                    data-testid="runway-unchecked"
                  />
                ) : (
                  <ListRow
                    title={WORDING.densityAltitude}
                    description={`Pressure altitude ${altFt(c.pressureAltFt)} ft${c.tempC != null ? ` · ${Math.round(c.tempC)} °C` : ""} ${c.reported ? "reported" : "(standard day; no report)"}`}
                    value={feet(Math.round(c.densityAltFt / 10) * 10)}
                    data-testid="density-altitude"
                  />
                )}
              </ListGroup>
            );
          })}
          {/* Distances over a 50 ft obstacle (the rows say so), from the
              POH's short-field tables and its demonstrated crosswind, in the
              wind and temperature reported now: takeoffTable.source,
              landingTable.source and demonstrated.source name the tables. */}
        </div>
      )}
    </AccordionSection>
  );
}
