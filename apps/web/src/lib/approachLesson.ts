import { queryOptions } from "@tanstack/react-query";
import { api } from "./api/client";
import type { Frequency, ProcedureDrawing, ProcedureFix } from "./api/types";
import type { TaughtApproach } from "./api/plannerTeaching";
import type { LessonFocus } from "./engine/contract";
import type { LatLon } from "./geo";

/** What a step of the lesson shows on the map: a fix ringed, a part of
 *  the procedure's line drawn over (the engine's contract). */
export type { LessonFocus };

/**
 * An approach taught as an instructor teaches it, at the owner's ask
 * ("do it all", 2026-10-30): briefed before anything moves, flown fix by
 * fix with a word at each, and asked back. All of it from the FAA's coded
 * procedure (wingtip.procedures, the CIFP) and the field's radio: what the
 * coded data does not hold -- the minimums above all -- is "See the
 * plate", never a figure made up. A training aid; the plate flies.
 *
 * Worked out by the shared engine (engine/crates/route/src/approach/lesson.rs),
 * asked of the planner (POST /api/approach/lesson) so the WebAssembly every
 * phone downloads leaves it out, and asked on the phones with no signal:
 * the descent rate on the path (the TPP's rate of descent table), the
 * approach category (14 CFR 97.3), the minimums' kind (AIM 5-4-5), the
 * missed approach in the plate's words, and the briefing's, the steps' and
 * the quiz's sentences, which state the procedure's own figures. The
 * airplane moved along the line on the map stays the page's.
 */

export interface LessonInput {
  drawing: ProcedureDrawing;
  /** The field's radio (its card's), where it is in. */
  frequencies?: Frequency[] | null;
  /** The airplane's reference landing speed, kt, or its stall speed in the
   *  landing configuration, where its figures carry either: its approach
   *  category (14 CFR 97.3). */
  vrefKt?: number | null;
  vsoKt?: number | null;
}

/** The approach's own fixes in the order flown: its missed approach's left out. */
export function approachFixes(drawing: ProcedureDrawing): ProcedureFix[] {
  return drawing.fixes.filter((f) => !f.missed);
}

export interface CoachStep {
  key: string;
  title: string;
  /** What to do. */
  say: string;
  /** Why, or what to know as it is done. */
  why: string | null;
  /** Where the airplane is at the step: a fix, or the missed approach's end. */
  at: LatLon | null;
  focus: LessonFocus;
  /** The altitude the step's fix is crossed at, for the profile; null where
   *  none is coded (the minimums). */
  altitudeFt: number | null;
  /** The procedure's line from the step before's place to this one's, each
   *  end the very place: the way the lesson's airplane flies to it; only
   *  its place at the first, none where it has no place. */
  way: LatLon[];
}

/** A point of the approach's side view: a fix's distance along the line
 *  from the first and the altitude it is crossed at. */
interface ProfileMark {
  ident: string;
  alongNm: number;
  ft: number | null;
  faf: boolean;
  map: boolean;
}

/** A question: `answer` is the right choice's index, `explain` where the
 *  answer is, said once a choice is made. */
export type QuizQuestion = TaughtApproach["quiz"][number];

/**
 * The lesson at a ground speed of `gsKt`:
 * - `brief`, the approach briefing the way an instructor has a student brief
 *   it (FAA-H-8083-16B, chapter 4, "Approach Briefing", in the order of the
 *   plate's briefing strip and plan view), each item showing its fix or part;
 * - `steps`, the approach flown fix by fix with a word at each: what to do
 *   crossing each fix, the descent on the published path at that speed from
 *   the FAF and the time to the missed approach point, at the minimums the
 *   decision -- land, or the missed approach in its own words (14 CFR
 *   91.175(c) and (e)) -- and then the missed approach flown;
 * - `profile`, the approach from the side as the plate's profile view
 *   draws it: each fix at its distance along the line and its crossing
 *   altitude, and where a path angle is coded the path down from the FAF;
 * - `quiz`, the lesson asked back, multiple choice made from the
 *   procedure's own data, so the right one is known only by knowing it.
 */
export interface Lesson {
  brief: TaughtApproach["brief"];
  steps: CoachStep[];
  profile: { marks: ProfileMark[]; path: TaughtApproach["profile"]["path"] };
  quiz: QuizQuestion[];
}

function shaped(t: TaughtApproach): Lesson {
  return {
    brief: t.brief,
    steps: t.steps.map(({ altitude_ft, ...step }) => ({ ...step, altitudeFt: altitude_ft })),
    profile: { marks: t.profile.marks.map(({ along_nm, ...m }) => ({ ...m, alongNm: along_nm })), path: t.profile.path },
    quiz: t.quiz,
  };
}

/** The lesson asked of the planner, kept for the page's life (a cycle's
 *  procedure holds for its 28 days). */
export const lessonQuery = (input: LessonInput, gsKt: number) =>
  queryOptions({
    queryKey: [
      "approach-lesson",
      input.drawing.airport,
      input.drawing.id,
      input.drawing.transition,
      input.drawing.cycle,
      gsKt,
      input.vrefKt ?? null,
      input.vsoKt ?? null,
      JSON.stringify(input.frequencies ?? []),
    ],
    queryFn: ({ signal }) =>
      api
        .approachLesson(
          {
            drawing: input.drawing,
            frequencies: input.frequencies ?? [],
            vref_kt: input.vrefKt ?? null,
            vso_kt: input.vsoKt ?? null,
            gs_kt: gsKt,
          },
          signal,
        )
        .then(shaped),
    staleTime: Infinity,
  });
