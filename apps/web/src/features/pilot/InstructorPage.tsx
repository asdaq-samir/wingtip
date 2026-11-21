import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { ConsolePages, PageRow } from "../../components/ConsolePages";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { api } from "../../lib/api/client";
import { RECORDS_FRESH_MS } from "../../lib/queryClient";
import type { Instructor } from "../../lib/api/types";
import { FINDING_TONE, type Finding } from "../../lib/findings";
import { studentLines, type StudentLine } from "./students";
import { TEXT } from "../../lib/text";
import { localDay } from "../../lib/format";
import { GoodTo, SignedRow } from "./Endorsements";
import { CertificateForm } from "./InstructorCertificate";
import { StudentPage } from "./InstructorStudent";
import { FieldError } from "../../components/ui/field";

/** A finding as a dot, for a row's two: the solo endorsement's standing
 *  and the next flight's Go / No-Go (features/pilot/students). */
const DOT_FILL: Record<Finding, string> = {
  ok: "bg-go-ink",
  caution: "bg-caution",
  stop: "bg-destructive-ink",
  unknown: "bg-muted-foreground/40",
  pending: "bg-muted-foreground/40",
};
const DOT_WORDS: Record<Finding, string> = { ok: "good", caution: "look", stop: "no", unknown: "none", pending: "pending" };
function Dots({ line }: { line: StudentLine }) {
  return (
    <span className="flex gap-1.5" data-testid="student-dots" data-currency={line.currency} data-go={line.goNoGo}>
      <span
        className={cn("size-2.5 rounded-full", DOT_FILL[line.currency])}
        role="img"
        aria-label={`Solo endorsement: ${DOT_WORDS[line.currency]}`}
      />
      <span
        className={cn("size-2.5 rounded-full", DOT_FILL[line.goNoGo])}
        role="img"
        aria-label={`Next flight: ${DOT_WORDS[line.goNoGo]}`}
      />
    </span>
  );
}

/**
 * The Logbook's Instructing page, for a flight instructor: their
 * certificate as endorsements carry it, the students asking them in --
 * taken by signing in with the address asked -- their students, each a
 * page of their own with the solo cross-countries waiting on them, and
 * what they have signed in the last 3 years: the record 14 CFR 61.189(b)
 * and (c) ask an instructor to keep, each one voidable for a correction.
 */
export default function InstructorPage() {
  const queryClient = useQueryClient();
  const { data: instructor, error } = useQuery({ queryKey: ["instructor"], queryFn: api.instructor.get, staleTime: RECORDS_FRESH_MS });
  const [editing, setEditing] = useState(false);
  const keep = (next: Instructor) => queryClient.setQueryData(["instructor"], next);
  const accept = useMutation({ mutationFn: api.instructor.accept, onSuccess: keep });
  const leave = useMutation({ mutationFn: api.instructor.leave, onSuccess: keep });
  const voidOne = useMutation({ mutationFn: api.instructor.voidEndorsement, onSuccess: keep });
  const stop = useMutation({ mutationFn: api.instructor.stop, onSuccess: keep });
  if (error) return <FieldError className={cn("px-1", FINDING_TONE.stop, TEXT.prose)}>Could not fetch it ({error.message}).</FieldError>;
  if (!instructor)
    return (
      <p role="status" className={cn("px-1 text-muted-foreground", TEXT.note)}>
        Fetching…
      </p>
    );
  const problem = (accept.error ?? leave.error ?? voidOne.error ?? stop.error)?.message;
  const students = studentLines(instructor, localDay());
  const pages = Object.fromEntries(
    instructor.students.map((s) => [`student-${s.studentId}`, { title: s.name, content: <StudentPage row={s} instructor={instructor} /> }]),
  );
  const kindOf = (code: string) => instructor.kinds.find((k) => k.code === code);
  return (
    <ConsolePages back="Instructing" pages={pages}>
      <div className="space-y-5">
        {!instructor.certificate || editing ? (
          <CertificateForm instructor={instructor} onDone={instructor.certificate ? () => setEditing(false) : undefined} />
        ) : (
          <ListGroup title="Your certificate">
            <ListRow
              title={instructor.fullName ?? ""}
              description={<span className="font-mono">{instructor.certificate}</span>}
              value={<GoodTo until={instructor.until} />}
              data-testid="cfi-certificate"
            />
            <ListRow title={<span className="font-medium text-tint">Change</span>} onClick={() => setEditing(true)} />
          </ListGroup>
        )}

        {instructor.asking.length > 0 && (
          <ListGroup title="Asking you">
            {instructor.asking.map((s) => (
              <ListRow key={s.linkId} title={s.name} description={s.email} data-testid="student-ask">
                <span className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" disabled={leave.isPending} onClick={() => leave.mutate(s.linkId)}>
                    Decline
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={accept.isPending}
                    onClick={() => accept.mutate(s.linkId)}
                    data-testid="student-accept"
                  >
                    Accept
                  </Button>
                </span>
              </ListRow>
            ))}
          </ListGroup>
        )}

        {students.needs.length > 0 && (
          // Who needs the instructor today (features/pilot/students): a solo
          // cross-country flown today or before still waiting on its
          // sign-off, a solo endorsement lapsing within the week.
          <ListGroup title="Needs you today">
            {students.needs.map((l) => (
              <PageRow
                key={l.row.linkId}
                page={`student-${l.row.studentId}`}
                title={l.row.name}
                testId="student-needs"
                description={l.needs!.words}
                value={<span className="font-medium text-tint">{l.needs!.action}</span>}
              />
            ))}
          </ListGroup>
        )}
        <ListGroup
          title="Everyone"
          footer={
            instructor.students.length
              ? "Dots: their solo endorsement, and the next flight's Go / No-Go. Tap a student for their flights, lessons and endorsements."
              : undefined
          }
        >
          {instructor.students.length === 0 ? (
            <ListRow muted title="None yet" />
          ) : (
            students.everyone.map((l) => (
              <PageRow
                key={l.row.linkId}
                page={`student-${l.row.studentId}`}
                title={l.row.name}
                testId="student-row"
                description={l.status}
                value={<Dots line={l} />}
              />
            ))
          )}
        </ListGroup>

        {instructor.signed.length > 0 && (
          // What was signed here in the last 3 years, the record 14 CFR
          // 61.189 asks an instructor to keep: kept when a student's account goes.
          <ListGroup title="Signed">
            {instructor.signed.map((e) => (
              <SignedRow
                key={e.id}
                kind={kindOf(e.code)}
                e={e}
                who={e.studentName}
                onVoid={() => voidOne.mutate(e.id)}
                voiding={voidOne.isPending}
              />
            ))}
          </ListGroup>
        )}

        {instructor.certificate && !editing && (
          <ListGroup>
            <ListRow
              title={<span className="text-destructive">Stop instructing here</span>}
              disabled={stop.isPending}
              onClick={() => stop.mutate()}
            />
          </ListGroup>
        )}
        {problem && <FieldError className={cn("px-1", FINDING_TONE.stop, TEXT.prose)}>{problem}</FieldError>}
      </div>
    </ConsolePages>
  );
}
