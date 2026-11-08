/**
 * An instructor's students as one list (the owner's canvas, 2026-11-03):
 * who needs them today first -- a solo cross-country flown today or
 * before and still waiting on a sign-off, a solo endorsement lapsing
 * within a week -- then everyone, each with two dots (their solo
 * endorsement's standing, and the Go / No-Go of the next flight put to
 * the instructor) and a line of status. Made only from what
 * GET /api/instructor already gives (InstructorDto): a student's own
 * currency is their logbook's, which the gateway keeps to them.
 */
import type { CrossCountryReview, Instructor, StudentRow } from "./api/types";
import { reviewRoute, said } from "./endorsements";
import { riskLine } from "./frat";
import type { Finding } from "./findings";
import { callEngine } from "./engine/engine";

export interface StudentLine {
  row: StudentRow;
  /** Why they need the instructor today, and the word on the button. */
  needs: { words: string; action: "Sign off" | "Endorse" } | null;
  /** Their solo endorsement's standing: in force (ok), lapsing within a
   *  week (caution), lapsed (stop), none on record (unknown). */
  currency: Finding;
  /** The next flight put to the instructor, by its risk assessment:
   *  none waiting is unknown. */
  goNoGo: Finding;
  status: string;
}

const RISK_FINDING: Record<string, Finding> = { low: "ok", caution: "caution", high: "stop" };

/** A student's 14 CFR 61.87(n) solo endorsement on `today`, the engine's
 *  (`solo_standing`): the days to its last good day, negative once gone
 *  by, and its standing -- lapsing within a week (the owner's choice) or
 *  lapsed wants the instructor. */
const soloStanding = (until: string | null | undefined, today: string) => callEngine("solo_standing", { until: until ?? null, today });

function lapseWords(days: number, on: string): string {
  if (days < 0) return `lapsed ${said(on)}`;
  if (days === 0) return "lapses today";
  return `lapses in ${days} day${days === 1 ? "" : "s"}`;
}

export function studentLines(instructor: Instructor, today: string): { needs: StudentLine[]; everyone: StudentLine[] } {
  const waiting = (s: StudentRow): CrossCountryReview[] =>
    instructor.reviews.filter(r => r.studentId === s.studentId && !r.answeredAt).sort((a, b) => a.flightOn.localeCompare(b.flightOn));
  const lines = instructor.students.map((s): StudentLine => {
    const reviews = waiting(s);
    const next = reviews[0];
    const due = reviews.find(r => r.flightOn <= today);
    const solo = soloStanding(s.soloUntil, today);
    const soloDays = solo.days;
    const needs: StudentLine["needs"] = due
      ? {
        words: `Solo ${reviewRoute(due)} ${due.flightOn === today ? "today" : said(due.flightOn)} · ${due.flight.risk ? riskLine(due.flight.risk) : "no risk assessment"}`,
        action: "Sign off",
      }
      : soloDays != null && solo.standing !== "ok"
        ? { words: `Solo endorsement ${lapseWords(soloDays, s.soloUntil!)}`, action: "Endorse" }
        : null;
    const currency: Finding = solo.standing;
    const goNoGo: Finding = next?.flight.risk ? RISK_FINDING[next.flight.risk.level] ?? "unknown" : "unknown";
    const status = [
      next ? `${reviewRoute(next)} ${next.flightOn === today ? "today" : said(next.flightOn)}` : null,
      `${s.experienceMet} of ${s.experienceOf} of 61.109`,
      s.soloUntil ? `solo to ${said(s.soloUntil)}` : null,
      reviews.length ? `${reviews.length} waiting on you` : null,
    ].filter(Boolean).join(" · ");
    return { row: s, needs, currency, goNoGo, status };
  });
  return { needs: lines.filter(l => l.needs), everyone: lines };
}
