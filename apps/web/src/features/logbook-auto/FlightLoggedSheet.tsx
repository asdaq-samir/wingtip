import { Suspense, lazy, useId, useState, type ReactNode } from "react";
import { cn } from "cn";
import FieldHit from "../../components/FieldHit";
import { ListChoices, ListGroup, ListRow } from "../../components/GroupedList";
import SheetDialog from "../../components/SheetDialog";
import { Button } from "../../components/ui/button";
import { DateField } from "../../components/ui/date-field";
import { Input } from "../../components/ui/input";
import { NumberField } from "../../components/ui/number-field";
import SkeletonLines from "../../components/SkeletonLines";
import type { LogbookDraft } from "../../lib/api/types";
import { FINDING_TONE } from "../../lib/findings";
import { TEXT } from "../../lib/text";
import type { Edits } from "./draftEntry";
import type { AutoLogbook } from "./useAutoLogbook";
import { FieldError } from "../../components/ui/field";

// Its own chunk: the approaches' debrief is drawn only when asked for.
const ApproachDebriefs = lazy(() => import("../../components/ApproachDebrief"));

type Reasoned = LogbookDraft["reasons"][number];

/** The reasons the engine gave for one figure, folded under it. */
function why(reasons: Reasoned[], item: string): ReactNode {
  const said = reasons.filter((r) => r.item === item);
  if (said.length === 0) return undefined;
  return said.map((r) => `${r.says} (${r.source})`).join(" ");
}

/** A figure the pilot may change: the row's value is its field. */
function FigureRow({
  title,
  description,
  value,
  onChange,
  type = "number",
  testId,
}: {
  title: string;
  description?: ReactNode;
  value: string | number;
  onChange: (value: string) => void;
  type?: "number" | "text" | "date";
  testId: string;
}) {
  const id = useId();
  // A figure on React Aria's number field and a day on its date field,
  // where the native ones were; their values the strings they gave.
  const field =
    type === "number" ? (
      <FieldHit htmlFor={id}>
        <NumberField
          id={id}
          aria-label={title}
          value={value === "" ? null : Number(value)}
          minValue={0}
          data-testid={testId}
          className="h-8 w-20"
          inputClassName="text-right"
          onChange={(v) => onChange(v == null ? "" : String(v))}
        />
      </FieldHit>
    ) : type === "date" ? (
      <DateField aria-label={title} value={String(value)} data-testid={testId} className="h-8 w-36" onChange={onChange} />
    ) : (
      <FieldHit htmlFor={id}>
        <Input
          id={id}
          aria-label={title}
          value={value}
          data-testid={testId}
          className="h-8 w-36 text-right"
          onChange={(e) => onChange(e.target.value)}
        />
      </FieldHit>
    );
  return <ListRow title={title} description={description} value={field} />;
}

/** The draft, each figure changeable and its reason under it. */
function DraftRows({ log, draft }: { log: AutoLogbook; draft: LogbookDraft }) {
  const e = draft.entry;
  const r = draft.reasons;
  const at = <K extends keyof Edits>(key: K, fallback: NonNullable<Edits[K]>) => log.edits[key] ?? fallback;
  const num = (key: keyof Edits) => (v: string) => log.edit({ [key]: Number(v || 0) });
  const text = (key: keyof Edits) => (v: string) => log.edit({ [key]: v });
  const instrumentSaid = [why(r, "approaches"), why(r, "holding"), why(r, "tracking")].filter(Boolean).join(" ");
  return (
    <>
      <ListGroup title="Flight">
        <FigureRow
          title="Date"
          type="date"
          value={at("flownOn", e.flownOn)}
          onChange={text("flownOn")}
          description={why(r, "flownOn")}
          testId="autolog-date"
        />
        <FigureRow
          title="Airplane"
          type="text"
          value={at("aircraft", e.aircraft ?? "")}
          onChange={text("aircraft")}
          testId="autolog-aircraft"
        />
        <FigureRow
          title="Route"
          type="text"
          value={at("route", e.route)}
          onChange={text("route")}
          description={why(r, "distanceNm")}
          testId="autolog-route"
        />
      </ListGroup>
      <ListGroup title="Time">
        <FigureRow
          title="Total"
          value={at("totalHours", e.totalHours)}
          onChange={num("totalHours")}
          description={why(r, "totalHours")}
          testId="autolog-total"
        />
        <ListRow title="In the Air" value={`${e.airHours.toFixed(1)} h`} description={why(r, "airHours")} />
        <FigureRow
          title="Night"
          value={at("nightHours", e.nightHours)}
          onChange={num("nightHours")}
          description={why(r, "nightHours")}
          testId="autolog-night"
        />
        <FigureRow
          title="Cross-Country"
          value={at("crossCountryHours", e.crossCountryHours)}
          onChange={num("crossCountryHours")}
          description={why(r, "crossCountryHours")}
          testId="autolog-xc"
        />
      </ListGroup>
      <ListGroup title="Landings">
        <FigureRow
          title="Day"
          value={at("dayLandings", e.dayLandings)}
          onChange={num("dayLandings")}
          description={why(r, "landing")}
          testId="autolog-day-landings"
        />
        <FigureRow
          title="Night, Full Stop"
          value={at("nightLandings", e.nightLandings)}
          onChange={num("nightLandings")}
          testId="autolog-night-landings"
        />
      </ListGroup>
      {(draft.approaches.length > 0 || draft.holds.length > 0) && (
        <ListGroup title="Instrument">
          <ListRow
            title="Flown by Instruments"
            description={`${draft.instrument.approaches} approaches${draft.instrument.holding ? ", a hold" : ""}. ${instrumentSaid}`}
            checkbox={{ checked: log.byInstruments, onChange: log.setByInstruments }}
            data-testid="autolog-instruments"
          />
        </ListGroup>
      )}
      {log.flights.length > 0 && (
        <ListGroup title="Debrief Against">
          <ListChoices
            value={String(log.linked ?? "none")}
            onChange={(v) => log.link(v === "none" ? null : Number(v))}
            label="Debrief against"
          >
            <ListRow radio="none" title="No Saved Flight" />
            {log.flights.slice(0, 5).map((f) => (
              <ListRow key={f.id} radio={String(f.id)} title={[f.departureIdent, ...f.stops, f.destinationIdent].join(" ")} />
            ))}
          </ListChoices>
        </ListGroup>
      )}
    </>
  );
}

/**
 * "Flight Logged": the entry the engine drew from the track, for the pilot
 * to change and log (never saved unasked); then what was logged, with its
 * approaches' debrief.
 */
export default function FlightLoggedSheet({ log }: { log: AutoLogbook }) {
  const [debrief, setDebrief] = useState(false);
  const logged = log.logged;
  const onOpenChange = (open: boolean) => {
    if (open) return;
    setDebrief(false);
    if (logged) log.close();
    else log.later();
  };
  if (logged) {
    return (
      <SheetDialog
        open
        onOpenChange={onOpenChange}
        title="Flight Logged"
        testId="autolog-logged"
        description={`${logged.entry.route ?? ""} · ${logged.entry.totalHours.toFixed(1)} h, in your logbook; your currency is worked out again from it.`}
      >
        {logged.entry.flightId !== null && (
          <p className={TEXT.prose}>The track is with the saved flight too: its debrief is there in Saved.</p>
        )}
        {logged.fields.length > 0 && !debrief && (
          <Button variant="outline" onClick={() => setDebrief(true)} data-testid="autolog-debrief">
            Debrief the Approaches
          </Button>
        )}
        {debrief && (
          <Suspense fallback={<SkeletonLines />}>
            <ApproachDebriefs
              fields={logged.fields}
              points={logged.points.map((p) => ({ t: p.t, lat: p.lat, lon: p.lon, altFt: p.alt_ft }))}
            />
          </Suspense>
        )}
      </SheetDialog>
    );
  }
  const draft = log.draft;
  return (
    <SheetDialog
      open
      onOpenChange={onOpenChange}
      cancel
      title="Flight Logged"
      testId="autolog-draft"
      description="Drawn from this flight's track. Change anything, then Log it."
      action={{ label: "Log", onClick: log.log, disabled: !draft || log.logging, testId: "autolog-log" }}
      more={
        <Button variant="ghost" onClick={log.discard} data-testid="autolog-discard">
          Not a Flight to Log
        </Button>
      }
    >
      {!log.signedIn && <p className={TEXT.prose}>Sign in to log it: the track is kept on this device until then.</p>}
      {log.pending && (
        <>
          <p role="status" className={cn("text-muted-foreground", TEXT.prose)}>
            Drawing the entry from the track…
          </p>
          <SkeletonLines lines={4} />
        </>
      )}
      {log.draftError && (
        <FieldError className={cn(FINDING_TONE.stop, TEXT.prose)}>
          The entry could not be drawn: {log.draftError.message}{" "}
          <Button variant="link" className="h-auto p-0" onClick={log.retry}>
            Try Again
          </Button>
        </FieldError>
      )}
      {log.problem && <p className={cn(FINDING_TONE.caution, TEXT.prose)}>{log.problem}</p>}
      {draft && <DraftRows log={log} draft={draft} />}
      {log.logError && (
        <FieldError className={cn(FINDING_TONE.stop, TEXT.prose)}>It could not be logged: {log.logError.message}</FieldError>
      )}
    </SheetDialog>
  );
}
