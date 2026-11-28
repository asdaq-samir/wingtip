import type { EngineAnswer } from "../engine/engine";
import type { LatLon } from "../geo";
import { planner, data } from "./http";
import type { ApproachFindAsk, ApproachTransitionAsk, DebriefAnswer, DebriefAsk, LessonAsk } from "./types";

/** An approach taught, as the planner answers it from the engine's rules
 *  (app.routers.approach_teaching): the engine's own shapes, which the
 *  planner's document gives only as objects. */
export interface TaughtApproach {
  brief: EngineAnswer<"approach_brief">;
  /** Each step with the way the lesson's airplane flies to it. */
  steps: (EngineAnswer<"approach_coaching">[number] & { way: LatLon[] })[];
  quiz: EngineAnswer<"approach_quiz">;
  profile: EngineAnswer<"approach_profile">;
}

/** The planner's calls for teaching and debriefing (./client's `api`): the
 *  engine's rules read only on their own pages, asked of the planner so
 *  the WebAssembly every phone downloads leaves them out. */
export const plannerTeaching = {
  /** A saved flight debriefed against its flown track (the engine's
   *  debrief, ACS PA.VI.A), the fields' pattern altitudes the planner's own. */
  debrief: (body: DebriefAsk, signal?: AbortSignal) => planner.POST("/api/debrief", { body, signal }).then(data<DebriefAnswer>),
  /** An approach's briefing, its steps flown at a ground speed, its quiz and its side view. */
  approachLesson: (body: LessonAsk, signal?: AbortSignal) =>
    planner.POST("/api/approach/lesson", { body, signal }).then((r) => r.data as unknown as TaughtApproach),
  /** The approaches a track flew, of a field's drawn (the engine's approach_find). */
  approachDebriefs: (body: ApproachFindAsk, signal?: AbortSignal) =>
    planner.POST("/api/approach/debriefs", { body, signal }).then((r) => r.data as unknown as EngineAnswer<"approach_find">),
  /** Of an approach's transitions drawn, the one the track came in by (approach_transition). */
  approachTransition: (body: ApproachTransitionAsk, signal?: AbortSignal) =>
    planner
      .POST("/api/approach/debriefs/transition", { body, signal })
      .then((r) => r.data as unknown as EngineAnswer<"approach_transition">),
};
