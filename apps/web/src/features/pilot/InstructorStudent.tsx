import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { cn } from "cn";
import ConsoleClose from "../../components/ConsoleClose";
import { ListGroup, ListRow } from "../../components/GroupedList";
import RowField from "../../components/RowField";
import { Textarea } from "../../components/ui/textarea";
import { api } from "../../lib/api/client";
import { feet, gal, hm, nm } from "../../lib/format";
import type { CrossCountryReview, EndorsementKind, Instructor, StudentRow } from "../../lib/api/types";
import { planHrefOf } from "../../lib/flightLink";
import { LEVEL_TONE, riskLine, type RiskLevel } from "../../lib/frat";
import { FINDING_TONE } from "../../lib/findings";
import { TEXT } from "../../lib/text";
import { ExperienceGroup, KnowledgeCodes } from "./CheckridePage";
import { acDay, inForce, reviewRoute, said } from "../../lib/endorsements";
import { GoodTo, SignedRow, SignForm } from "./Endorsements";
import StudentLessons from "./LessonAssign";
import { FieldError } from "../../components/ui/field";
import { WORDING } from "../../lib/wording/generated/wording";

/** What the student's record answers of 61.93(d), and the flight as saved. */
function ReviewSection({
  review,
  kind,
  studentId,
  studentName,
  instructor,
}: {
  review: CrossCountryReview;
  kind: EndorsementKind;
  studentId: number;
  studentName: string;
  instructor: Instructor;
}) {
  const queryClient = useQueryClient();
  const [answering, setAnswering] = useState<"sign" | "decline" | null>(null);
  const [note, setNote] = useState("");
  const noteId = useId();
  const decline = useMutation({
    mutationFn: () => api.instructor.decline(review.id, note.trim()),
    onSuccess: (next) => {
      queryClient.setQueryData(["instructor"], next);
      void queryClient.invalidateQueries({ queryKey: ["student-training", studentId] });
      setAnswering(null);
    },
  });
  const f = review.flight;
  const landings = [...f.stops, f.destinationIdent];
  return (
    <div className="space-y-4" data-testid="review">
      <ListGroup title={`${reviewRoute(review)}, ${said(review.flightOn)}`}>
        {/* The student's note with it, first, where it was a footnote. */}
        {review.note && <ListRow title={<span className="italic">“{review.note}”</span>} data-testid="review-note" />}
        <ListRow title="Airplane" value={[review.makeModel, f.aircraftTailNumber].filter(Boolean).join(" · ")} />
        <ListRow title="Altitude" value={feet(f.cruiseAltitudeFt)} />
        {f.totalDistanceNm != null && <ListRow title="Distance" value={nm(f.totalDistanceNm)} />}
        {f.totalEteMin != null && <ListRow title="Time" value={hm(f.totalEteMin)} />}
        {f.totalFuelGal != null && <ListRow title="Fuel" value={gal(f.totalFuelGal)} />}
        {f.risk && (
          <ListRow
            title="Risk"
            description={f.risk.factors.join(" · ") || undefined}
            value={<span className={LEVEL_TONE[f.risk.level as RiskLevel]}>{riskLine(f.risk)}</span>}
          />
        )}
        <ConsoleClose>
          <ListRow title={WORDING.showOnMap} description="Its nav log, and today's weather and NOTAMs along it" to={planHrefOf(f)} />
        </ConsoleClose>
      </ListGroup>
      {/* 14 CFR 61.93(d)(4) and (5), as their record has them. */}
      <ListGroup title="The Student's Endorsements">
        {review.checks.map((c) => (
          <ListRow
            key={c.rule}
            title={c.label}
            description={`${c.rule} · ${c.detail}`}
            data-testid="review-check"
            media={
              c.met ? (
                <Check className={cn("size-5", FINDING_TONE.ok)} aria-label="Met" />
              ) : (
                <X className={cn("size-5", FINDING_TONE.stop)} aria-label="Not met" />
              )
            }
          />
        ))}
      </ListGroup>
      {answering === "sign" ? (
        <SignForm
          kind={kind}
          studentId={studentId}
          studentName={studentName}
          instructor={instructor}
          reviewId={review.id}
          initial={{
            from: f.departureIdent,
            to: f.destinationIdent,
            via: f.stops.length ? f.stops.join(", ") : "direct",
            landings: landings.join(", "),
            mm: review.makeModel,
            date: acDay(review.flightOn),
          }}
          onDone={() => setAnswering(null)}
          onCancel={() => setAnswering(null)}
        />
      ) : answering === "decline" ? (
        // The note goes to the student by email and on their Checkride page.
        <ListGroup title="Not Endorsed">
          <div className="p-2">
            <RowField id={noteId} error={undefined} wide label="Why Not">
              <Textarea
                id={noteId}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Why, and what to change"
              />
            </RowField>
          </div>
          <ListRow
            title={<span className="font-medium text-tint">Send</span>}
            disabled={!note.trim() || decline.isPending}
            onClick={() => decline.mutate()}
          />
          <ListRow title="Cancel" onClick={() => setAnswering(null)} />
        </ListGroup>
      ) : (
        <ListGroup>
          <ListRow
            title={<span className="font-medium text-tint">Endorse This Flight</span>}
            onClick={() => setAnswering("sign")}
            data-testid="review-endorse"
          />
          <ListRow
            title={<span className="font-medium text-destructive">Not Endorsed</span>}
            onClick={() => setAnswering("decline")}
            data-testid="review-decline"
          />
        </ListGroup>
      )}
      {decline.error && <FieldError className={cn("px-1", FINDING_TONE.stop, TEXT.prose)}>{decline.error.message}</FieldError>}
    </div>
  );
}

/**
 * One student, as their instructor reads them: the solo cross-countries
 * waiting on them, the approaches set them as lessons (LessonAssign),
 * 61.109's experience from the student's logbook, their
 * knowledge test codes, and each AC 61-65K endorsement -- signed here,
 * recorded from paper, or not yet, with a tap to sign one.
 */
export function StudentPage({ row, instructor }: { row: StudentRow; instructor: Instructor }) {
  const { data: training, error } = useQuery({
    queryKey: ["student-training", row.studentId],
    queryFn: () => api.instructor.student(row.studentId),
  });
  const [signing, setSigning] = useState<EndorsementKind | null>(null);
  if (error)
    return (
      <FieldError className={cn("px-1", FINDING_TONE.stop, TEXT.prose)}>Their record could not be fetched ({error.message}).</FieldError>
    );
  if (!training)
    return (
      <p role="status" className={cn("px-1 text-muted-foreground", TEXT.note)}>
        Fetching their record…
      </p>
    );
  const signed = inForce(training.signed);
  const recorded = new Map(training.endorsements.map((e) => [e.code, e]));
  const crossCountry = training.kinds.find((k) => k.code === "solo-xc-flight")!;
  const waiting = training.reviews.filter((r) => !r.answeredAt);
  const name = training.fullName ?? row.name;
  return (
    <div className="space-y-5" data-testid="student-page">
      {waiting.map((r) => (
        <ReviewSection key={r.id} review={r} kind={crossCountry} studentId={row.studentId} studentName={name} instructor={instructor} />
      ))}
      {signing ? (
        <SignForm
          kind={signing}
          studentId={row.studentId}
          studentName={name}
          instructor={instructor}
          onDone={() => setSigning(null)}
          onCancel={() => setSigning(null)}
        />
      ) : (
        // Each signed in AC 61-65K's words, which name the student as on
        // their certificate: none until they have given it.
        <ListGroup title="Endorsements">
          {!training.fullName && <ListRow muted title="Waiting for their name as on their certificate" />}
          {training.kinds.map((kind) => {
            const e = signed.get(kind.code);
            if (e) return <SignedRow key={kind.code} kind={kind} e={e} />;
            const paper = recorded.get(kind.code);
            return (
              <ListRow
                key={kind.code}
                title={kind.label}
                description={
                  <>
                    <span className="block">
                      {kind.rule}
                      {paper ? ` · on paper ${said(paper.endorsedOn)}` : ""}
                    </span>
                    <GoodTo until={paper?.until} />
                  </>
                }
                value="Sign"
                disabled={!training.fullName}
                onClick={() => setSigning(kind)}
                data-testid={`sign-${kind.code}`}
              />
            );
          })}
        </ListGroup>
      )}
      <StudentLessons studentId={row.studentId} training={training} />
      <ExperienceGroup training={training} />
      <KnowledgeCodes codes={training.knowledgeTestCodes} />
    </div>
  );
}
