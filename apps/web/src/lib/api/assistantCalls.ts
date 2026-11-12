import { assistant, data, ndjson } from "./http";
import type {
  CheckpointDescriptionMessage,
  NarrativeMessage,
  NarrativeRequest,
  OralGrade,
  OralGradeRequest,
  OralQuestion,
  OralQuestionRequest,
} from "./types";

/** The assistant's calls, every one a Claude call (./client's `api`). */
export const assistantCalls = {
  /**
   * The Brief's narrative: the nav log on screen told in words by
   * Claude, streamed as it is written -- `delta` lines, then `done` or
   * `error`, the same NDJSON shape as `navlog`. A real, billed Claude
   * call, so the gateway lets a subscribed, signed-in pilot through
   * within the month's cap (PlannerProxyController).
   */
  async *narrative(request: NarrativeRequest, signal?: AbortSignal): AsyncGenerator<NarrativeMessage> {
    const result = await assistant.POST("/api/briefing/narrative", { body: request, parseAs: "stream", signal });
    yield* ndjson<NarrativeMessage>(result.data as ReadableStream | undefined);
  },

  /**
   * One "how to spot it" line per checkpoint, in route order -- the
   * same streaming shape as `detect`, so a slow LLM call on one
   * checkpoint doesn't hold up the ones that already arrived.
   */
  async *describeCheckpoints(
    dep: string,
    dest: string,
    signal?: AbortSignal,
    stops: string[] = [],
  ): AsyncGenerator<CheckpointDescriptionMessage> {
    // A POST: each checkpoint without a note is a billed Claude call.
    const result = await assistant.POST("/api/checkpoint-notes/generate", {
      body: { departure_ident: dep, destination_ident: dest, stops },
      parseAs: "stream",
      signal,
    });
    yield* ndjson<CheckpointDescriptionMessage>(result.data as ReadableStream | undefined);
  },
  /** The mock oral (the planner's app.oral): a question about this
   *  flight, and an answer graded. The developer's, for now. */
  oral: {
    question: (body: OralQuestionRequest) => assistant.POST("/api/oral/question", { body }).then(data<OralQuestion>),
    grade: (body: OralGradeRequest) => assistant.POST("/api/oral/grade", { body }).then(data<OralGrade>),
  },
};
