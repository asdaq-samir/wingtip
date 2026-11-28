// The debrief's tolerances and marks are the engine's (debrief.rs), the very ones the planner and the phones give.
import { Suspense, lazy, useMemo, useState, type ReactNode } from "react";
import { FileTrigger } from "react-aria-components";
import { Pressable } from "react-aria/Pressable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import ConsoleClose from "../../components/ConsoleClose";
import { api } from "../../lib/api/client";
import type { Flight, FlightSummary } from "../../lib/api/types";
import { debriefQuery } from "./debrief";
import { Findings } from "./FlightFindings";
import { LEVEL_TONE, riskLine, type RiskLevel } from "../../lib/frat";
import { TEXT } from "../../lib/text";
import { keepTrack, keptTrack, readTrack, thin, TrackError, type TrackPoint } from "../../lib/track";
import { useFlownTrack } from "../../lib/map/position/flownTrack";
import { routeName } from "../../lib/identSchema";
import { dayMonthTime, dayMonthYear, feet, gal, grouped, hm, localDay, nm } from "../../lib/format";
import { reviewState, said } from "../../lib/endorsements";
import { ReviewAskForm, type ReviewAsk } from "../../components/ReviewAsk";
import { FINDING_TONE } from "../../lib/findings";
import { trainingQuery } from "../../lib/queryClientRecords";
import { proceduresOf, sameField } from "../../lib/procedures";
import { FieldError } from "../../components/ui/field";
import { WORDING } from "../../lib/wording/generated/wording";

// Its own chunk: the approach's debrief is drawn only where a track came
// down a final, and asks for the field's procedures as it is.
const ApproachDebriefs = lazy(() => import("../../components/ApproachDebrief"));

type Track = { source: string; points: TrackPoint[] };

/**
 * The debrief: a track imported from the pilot's own app (GPX or KML),
 * read against the saved flight's nav log (features/pilot/debrief). The track stays
 * on this device unless the pilot saves it to their account, and either
 * can be forgotten.
 */
function DebriefSection({ flight, planHref }: { flight: Flight; planHref: string }) {
  const queryClient = useQueryClient();
  const [local, setLocal] = useState<Track | null>(() => keptTrack(flight.id));
  const [problem, setProblem] = useState<string | null>(null);
  const saved = useQuery({ queryKey: ["flight-track", flight.id], queryFn: () => api.flights.track(flight.id) });
  const track: Track | null = useMemo(
    () => local ?? (saved.data ? { source: saved.data.source, points: saved.data.points } : null),
    [local, saved.data],
  );
  // The planner's debrief, with the fields' pattern altitudes their cards give.
  const debriefed = useQuery({ ...debriefQuery(flight, track?.points ?? []), enabled: !!track });
  const result = debriefed.data ?? null;

  const save = useMutation({
    mutationFn: (t: Track) => api.flights.saveTrack(flight.id, t),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["flight-track", flight.id] }),
  });
  const unsave = useMutation({
    mutationFn: () => api.flights.deleteTrack(flight.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["flight-track", flight.id] }),
  });

  const read = async (file: File) => {
    setProblem(null);
    try {
      const points = thin(readTrack(await file.text()));
      const next = { source: file.name.slice(0, 120), points };
      setLocal(next);
      if (!keepTrack(flight.id, next)) setProblem("This browser would not keep the track: it is here until you leave the page.");
    } catch (err) {
      setProblem(err instanceof TrackError ? err.message : "That file could not be read.");
    }
  };
  const forget = () => {
    keepTrack(flight.id, null);
    setLocal(null);
  };

  const showTrack = useFlownTrack((s) => s.show);
  const onAccount = !!saved.data;
  // The procedures picked for the flight (its `procs`), and the fields to
  // look for an approach flown at: the destination, and a stop an
  // approach was picked at (a departure's field is left out).
  const picked = useMemo(() => proceduresOf(new URLSearchParams(flight.picks ?? "").get("procs")), [flight.picks]);
  const approachFields = useMemo(() => {
    const fields = [flight.destinationIdent];
    for (const p of picked) {
      if (flight.stops.some((s) => sameField(s, p.ident)) && !fields.some((f) => sameField(f, p.ident))) fields.push(p.ident);
    }
    return fields;
  }, [flight.destinationIdent, flight.stops, picked]);
  return (
    <div className="space-y-4" data-testid="debrief">
      {/* A track log from ForeFlight, Garmin Pilot or a GPS, as GPX or KML,
          read against this flight's nav log; kept on this device unless
          saved to the account. */}
      <ListGroup title="Debrief">
        {track && (
          <ListRow
            title={track.source}
            description={`${grouped(track.points.length)} points · ${local ? "on this device" : "saved to your account"}${local && onAccount ? " and your account" : ""}`}
            data-testid="debrief-source"
          />
        )}
        {/* React Aria's FileTrigger: the hidden file input, opened by the row. */}
        <FileTrigger
          acceptedFileTypes={[".gpx", ".kml", "application/gpx+xml", "application/vnd.google-earth.kml+xml"]}
          data-testid="debrief-file"
          onSelect={(files) => {
            const file = files?.[0];
            if (file) void read(file);
          }}
        >
          <Pressable>
            <ListRow title={track ? "Import another track" : "Import a track"} media={<Upload className="size-5" aria-hidden />} />
          </Pressable>
        </FileTrigger>
        {track && !onAccount && (
          <ListRow title={WORDING.saveToAccount} onClick={() => save.mutate(track)} disabled={save.isPending} data-testid="debrief-save" />
        )}
        {onAccount && (
          <ListRow
            title={WORDING.removeFromAccount}
            onClick={() => unsave.mutate()}
            disabled={unsave.isPending}
            data-testid="debrief-unsave"
          />
        )}
        {local && <ListRow title="Forget on This Device" onClick={forget} data-testid="debrief-forget" />}
        {result && (
          // Onto the chart over its own route, red where it was outside a
          // tolerance; the map's buttons have its key and Hide.
          <ConsoleClose>
            <ListRow
              title={WORDING.showOnMap}
              to={planHref}
              data-testid="debrief-show"
              onClick={() =>
                showTrack({
                  flightId: flight.id,
                  title: routeName(flight.departureIdent, flight.destinationIdent, flight.stops),
                  departure: flight.departureIdent,
                  destination: flight.destinationIdent,
                  line: result.line,
                })
              }
            />
          </ConsoleClose>
        )}
      </ListGroup>
      {(problem || save.error || unsave.error) && (
        <FieldError className={cn("px-1", FINDING_TONE.stop, TEXT.prose)} data-testid="debrief-problem">
          {problem ?? (save.error ?? unsave.error)?.message}
        </FieldError>
      )}
      {debriefed.error && (
        <FieldError className={cn("px-1", FINDING_TONE.stop, TEXT.prose)}>
          The debrief could not be worked out: {debriefed.error.message}
        </FieldError>
      )}
      {track && debriefed.isSuccess && !result && (
        <p className={cn("px-1 text-muted-foreground", TEXT.prose)}>No flight in this track: it never went faster than taxiing.</p>
      )}
      {result && <Findings d={result} />}
      {result && track && (
        <Suspense fallback={null}>
          <ApproachDebriefs fields={approachFields} points={track.points} picked={picked} />
        </Suspense>
      )}
    </div>
  );
}

function Row({ title, value }: { title: string; value: ReactNode }) {
  return <ListRow title={title} value={value} />;
}

/**
 * The flight put to the student's instructor for the review 14 CFR
 * 61.93(c)(3) and (d) ask before each solo cross-country: to which of
 * their instructors, in what make and model and on what day, with a note;
 * and where each such ask of it stands. The instructor is emailed, and
 * answers from their Instructing page.
 */
function InstructorReview({ summary }: { summary: FlightSummary }) {
  const queryClient = useQueryClient();
  const { data: training } = useQuery(trainingQuery);
  const ask = useMutation({
    mutationFn: (a: ReviewAsk) => api.training.askReview({ flightId: summary.id, ...a }),
    onSuccess: (next) => queryClient.setQueryData(["training"], next),
  });
  if (!training) return null;
  const theirs = training.instructors.filter((l) => l.accepted);
  const asked = training.reviews.filter((r) => r.flight.id === summary.id);
  const waiting = asked.some((r) => !r.answeredAt);
  return (
    <>
      {/* Before each solo cross-country the instructor reviews its planning
          and the weather and endorses it (14 CFR 61.93(c)(3), (d)). */}
      <ListGroup title="Solo Cross-Country">
        {asked.map((r) => (
          <ListRow
            key={r.id}
            title={r.instructorName ?? "Your instructor"}
            description={`${said(r.flightOn)} · ${reviewState(r)}`}
            data-testid="flight-review"
          />
        ))}
        {theirs.length === 0 && <ListRow muted title="Ask your instructor in first, from Logbook, then Checkride" />}
      </ListGroup>
      {!waiting && theirs.length > 0 && (
        <ReviewAskForm
          instructors={theirs}
          pending={ask.isPending}
          onAsk={(a) => ask.mutate(a)}
          initialDay={localDay(summary.plannedFor ? new Date(summary.plannedFor) : new Date())}
        />
      )}
      {ask.error && <FieldError className={cn("px-1", FINDING_TONE.stop, TEXT.prose)}>{ask.error.message}</FieldError>}
    </>
  );
}

/**
 * One saved flight, as the console's Flights page opens it: what was
 * filed, the risk assessment it was saved with, a way back onto the map
 * at its altitude, and its debrief.
 */
export default function FlightPage({ summary, planHref }: { summary: FlightSummary; planHref: string }) {
  const asked = { queryKey: ["savedFlight", summary.id], queryFn: () => api.flights.get(summary.id) }; // not "flight", the traffic card's (WEB-30)
  const { data: flight, isPending, error } = useQuery(asked);
  return (
    <div className="space-y-4">
      <ListGroup>
        <Row title="Filed" value={dayMonthYear(new Date(summary.createdAt))} />
        {summary.aircraftTailNumber && <Row title="Airplane" value={summary.aircraftTailNumber} />}
        <Row title="Altitude" value={feet(summary.cruiseAltitudeFt)} />
        {summary.totalDistanceNm != null && <Row title="Distance" value={nm(summary.totalDistanceNm)} />}
        {summary.totalEteMin != null && <Row title="Time" value={hm(summary.totalEteMin)} />}
        {summary.totalFuelGal != null && <Row title="Fuel" value={gal(summary.totalFuelGal)} />}
        {summary.plannedFor && <Row title="Planned For" value={dayMonthTime(new Date(summary.plannedFor))} />}
        {summary.risk && (
          <ListRow
            title="Risk"
            description={summary.risk.factors.join(" · ") || undefined}
            value={<span className={LEVEL_TONE[summary.risk.level as RiskLevel]}>{riskLine(summary.risk)}</span>}
          />
        )}
        <ConsoleClose>
          <ListRow title={WORDING.showOnMap} to={planHref} data-testid="flight-open" />
        </ConsoleClose>
      </ListGroup>
      <InstructorReview summary={summary} />
      {isPending ? (
        <p role="status" className={cn("px-1 text-muted-foreground", TEXT.note)}>
          Fetching its nav log…
        </p>
      ) : error || !flight ? (
        <p className={cn("px-1", FINDING_TONE.stop, TEXT.prose)}>Its nav log could not be fetched ({error?.message ?? "not found"}).</p>
      ) : (
        <DebriefSection flight={flight} planHref={planHref} />
      )}
    </div>
  );
}
