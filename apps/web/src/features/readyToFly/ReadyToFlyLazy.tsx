import { Suspense, lazy } from "react";

// The Brief's Ready to fly on a chunk of its own: the prompt as the pilot
// starts (ReadyToFlyPrompt) is in the first load, and the feature's entry
// naming this beside it put the Brief's rows there too
// (scripts/first-load.mjs, 2026-11-12). The Brief draws it.
const Rows = lazy(() => import("./ReadyToFly").then((m) => ({ default: m.ReadyToFly })));
const Todo = lazy(() => import("./ReadyToFly").then((m) => ({ default: m.ReadyTodo })));

/** Preflight's Ready to Fly (ReadyToFly), loaded when drawn. */
export function ReadyToFly() {
  return (
    <Suspense fallback={null}>
      <Rows />
    </Suspense>
  );
}

/** The Brief's Before You Go row's count (ReadyTodo), loaded when drawn. */
export function ReadyTodo() {
  return (
    <Suspense fallback={null}>
      <Todo />
    </Suspense>
  );
}
