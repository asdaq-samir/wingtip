// The drill's words are also the planner's (app/figures, GET /api/diversion, for the native app): the two change together.
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Timer, X } from "lucide-react";
import { cn } from "cn";
import { ListChoices, ListGroup, ListRow } from "../../../../components/GroupedList";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "../../../../components/ResponsivePopover";
import { Button } from "../../../../components/ui/button";
import { NumberField } from "../../../../components/ui/number-field";
import type { Leg } from "../../../../lib/api/types";
import { useClock } from "../../../../lib/useMinuteClock";
import { callEngine } from "../../../../lib/engine/engine";
import { ALLOWANCES, divert, diversionFields, reasonable, type Diversion, type EstimateKey } from "../../../../lib/diversion";
import { TEXT } from "../../../../lib/text";
import { altFt } from "../../format";
import { bearing, gal, grouped, nm, stopwatch, windCorrection } from "../../../../lib/format";
import { FINDING_TONE } from "../../../../lib/findings";
import { written } from "./workings";
import { api } from "../../../../lib/api/client";
import { AskFigure } from "../../../../components/airplane/AskFigure";

/** Who may land at a field, the engine's card line, for a row. */
function whoMayLand(f: { private: boolean; military: "military" | "joint" | null }): string | null {
  return callEngine("airport_use_words", { private: f.private, military: f.military }).words;
}

/** The diversion worked out, step by step, once checked. */
function Answer({ ident, d }: { ident: string; d: Diversion }) {
  const steps: [string, string][] = [
    ["True course", `${bearing(d.tc)}, ${nm(d.distanceNm)}`],
    ["Wind correction", windCorrection(d.wca)],
    ["True heading", bearing(d.th)],
    ["Magnetic heading", bearing(d.mh)],
    ["Ground speed", `${Math.round(d.gs)} kt`],
    ["Time", `${Math.round(d.ete)} min`],
    ["Fuel", gal(d.fuel)],
  ];
  return (
    <ListGroup title={`To ${ident}, worked out`}>
      {steps.map(([name, value]) => (
        <ListRow key={name} title={name} value={value} />
      ))}
    </ListGroup>
  );
}

/**
 * The diversion drill (ACS PA.VI.C): over a point on the route, the
 * examiner says divert. The clock starts, the student picks a field
 * (six round the point, with their runways and weather, and who may use
 * them, and not how far or which way: that is off the chart), estimates the heading, ground speed,
 * time and fuel, and checks them against the exact solution in the
 * leg's own air (lib/diversion). The drill keeps its clock and answers
 * while its sheet is closed, for a look at the chart.
 */
export default function DiversionDrill({ leg, at }: { leg: Leg; at: { name: string; lat: number; lon: number } }) {
  const id = useId();
  const [started, setStarted] = useState<number | null>(null);

  const [stopped, setStopped] = useState<number | null>(null);
  const [field, setField] = useState<string | null>(null);
  // The estimates as typed (React Aria's NumberField, in the pilot's locale).
  const [typed, setTyped] = useState<Partial<Record<EstimateKey, number | null>>>({});
  // The fields round the point with their runways and weather, as the
  // emergency assistant asks for them (/api/emergency/fields).
  const nearest = useQuery({
    queryKey: ["diversionFields", at.lat, at.lon],
    queryFn: () => api.emergencyFields(at.lat, at.lon, leg.altitude_ft, null, null),
    enabled: started != null,
    staleTime: 10 * 60_000,
  });
  // Counting while the drill runs and FPL is in sight (useClock).
  const now = useClock(1000, started != null && stopped == null);

  // In the engine's order for a diversion (best_fields): a field under the
  // point is where the airplane is, not a diversion.
  const fields = (nearest.data ? diversionFields(nearest.data, at, leg) : []).filter((f) => f.distance_nm >= 2).slice(0, 6);
  const chosen = fields.find((f) => f.ident === field) ?? null;
  const exact = chosen ? divert(leg, chosen.course_deg, chosen.distance_nm) : null;
  const checked = stopped != null;
  const number = (key: EstimateKey) => typed[key] ?? null;
  const start = () => {
    const t = Date.now();
    setStarted(t);
    setStopped(null);
    setField(null);
    setTyped({});
  };

  return (
    <ResponsivePopover>
      <ResponsivePopoverTrigger asChild>
        <Button
          type="button"
          variant="link"
          size="sm"
          className={cn("h-auto p-0 text-tint", TEXT.detail)}
          onClick={(e) => e.stopPropagation()}
          data-testid="diversion-drill"
        >
          Divert from here
        </Button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        title={`Diversion over ${at.name}`}
        className="w-[26rem] max-w-[calc(100vw-2rem)] p-3"
        align="start"
        data-testid="diversion-content"
      >
        <div className="space-y-3">
          {leg.tas_kt == null ? (
            // No airplane: its heading, ground speed, time and fuel are all
            // worked at an airplane's speed and burn, and none is assumed.
            <AskFigure figure="legs" what="The diversion" testId="diversion-needs-airplane" />
          ) : started == null ? (
            <>
              <p className={TEXT.prose}>
                Over {at.name} at {altFt(leg.altitude_ft)} ft, the examiner says: divert. Pick a field, and work out the magnetic heading,
                ground speed, time and fuel to it from the chart and the leg’s wind.
              </p>
              <Button type="button" className="w-full" onClick={start} data-testid="diversion-start">
                <Timer aria-hidden /> Start the clock
              </Button>
            </>
          ) : (
            <form
              className="space-y-3"
              aria-label="Your diversion"
              onSubmit={(e) => {
                e.preventDefault();
                setStopped(Date.now());
              }}
            >
              <p className={cn("flex items-center justify-between font-medium tabular-nums", TEXT.prose)} data-testid="diversion-clock">
                <span>{checked ? "You took" : "On the clock"}</span>
                <span>{stopwatch(Math.floor(Math.max(0, (stopped ?? now) - started) / 1000))}</span>
              </p>
              <ListChoices value={field ?? ""} onChange={setField} label="Divert to">
                {/* The fields, with their longest runway, their weather and
                  who may use them (the engine's card line, "Private:
                  permission required"): how far and which way are the
                  chart's to read. */}
                <ListGroup title="Divert to">
                  {nearest.isPending ? (
                    <ListRow muted title="Finding the nearest fields…" />
                  ) : fields.length === 0 ? (
                    <ListRow muted title="No fields near here" />
                  ) : (
                    fields.map((f) => (
                      <ListRow
                        key={f.ident}
                        radio={f.ident}
                        disabled={checked}
                        title={`${f.ident} · ${f.name}`}
                        description={[
                          f.runway?.length_ft ? `${grouped(f.runway.length_ft)} ft runway` : "no runway length",
                          f.flight_category ?? "no weather report",
                          whoMayLand(f),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        data-testid="diversion-field"
                      />
                    ))
                  )}
                </ListGroup>
              </ListChoices>
              {/* The ACS asks for a reasonable estimate (PA.VI.C.S2) and
                  gives no figures: within 10° and 10 kt, 3 minutes and a
                  gallon is this drill's own (ALLOWANCES). */}
              <ListGroup title="Your estimates">
                {ALLOWANCES.map((a) => {
                  const value = number(a.key);
                  const marked = checked && !!exact && value !== null && Number.isFinite(value);
                  const right = marked && reasonable(a.key, value, exact![a.key]);
                  return (
                    <ListRow
                      key={a.key}
                      id={`${id}-${a.key}`}
                      title={a.label}
                      description={marked && !right ? `Not quite: ${written(a.key, exact![a.key])}` : undefined}
                      data-testid={`diversion-${a.key}`}
                    >
                      <span className="flex items-center gap-1.5">
                        {marked &&
                          (right ? (
                            <Check className={cn("size-4", FINDING_TONE.ok)} aria-label="Reasonable" />
                          ) : (
                            <X className={cn("size-4", FINDING_TONE.stop)} aria-label="Not reasonable" />
                          ))}
                        <NumberField
                          id={`${id}-${a.key}`}
                          className="h-8 w-20"
                          inputClassName="text-right"
                          value={typed[a.key] ?? null}
                          isDisabled={checked}
                          data-testid={`diversion-${a.key}-input`}
                          onChange={(v) => setTyped({ ...typed, [a.key]: v })}
                        />
                        <span className={cn("w-7 text-muted-foreground", TEXT.detail)}>{a.unit}</span>
                      </span>
                    </ListRow>
                  );
                })}
              </ListGroup>
              {checked &&
                chosen &&
                (exact ? (
                  <Answer ident={chosen.ident} d={exact} />
                ) : (
                  <p className={cn(FINDING_TONE.stop, TEXT.prose)}>The wind is too strong for a heading to {chosen.ident} to hold.</p>
                ))}
              {checked && chosen && fields[0] && fields[0].ident !== chosen.ident && (
                <p className={cn("text-muted-foreground", TEXT.note)} data-testid="diversion-nearest">
                  The best by runway, weather and time was {fields[0].ident}, {fields[0].distance_nm.toFixed(0)} nm: was {chosen.ident} the
                  better choice?
                </p>
              )}
              <div className="flex justify-end gap-2">
                {checked ? (
                  <Button type="button" size="sm" onClick={start} data-testid="diversion-again">
                    Again
                  </Button>
                ) : (
                  <Button type="submit" size="sm" disabled={!chosen} data-testid="diversion-check">
                    Check
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}
