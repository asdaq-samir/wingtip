// Guards against the usual causes of a flaky unit test, run before every
// test file (vite.config.ts test.setupFiles). The tests run in a random
// order (test.sequence), so whatever one test leaves behind lands on a
// different test each run; these catch it in the test that left it.
import { afterAll, afterEach, vi } from "vitest";

// A menu or popover closes itself when its trigger goes out of sight
// (ui/anchorHidden, Floating UI's hide middleware). jsdom lays nothing out,
// every box 0 by 0 in a 0 by 0 page, so a trigger always read hidden and an
// open menu shut whenever that check landed before a test's tap on a choice
// (ClearanceCard's Listen through, six runs in eight). Mocked here, not in
// a test file: the popups' chunk is loaded below, before a test file's own
// vi.mock could reach it. Out of sight is a browser's to measure.
vi.mock("../components/ui/anchorHidden", () => ({ anchorHiddenRender: () => undefined }));

// Testing Library unmounts what a test rendered only when vitest's
// globals are on, which they are not here: without this, a component
// stayed mounted after its test, and its debounce timer
// (useAirportSearch's) fired after the file's jsdom was torn down, an
// unhandled error that failed whichever run it landed in. Unmounting
// runs the effects' cleanups, which clear their timers. Only in a file
// with a document (the jsdom ones); the rest never load the library.
if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);
  lingeringTimers();
  // jsdom has no matchMedia, which the app's one way of asking (SheetDialog,
  // through useIsMobile) reads as it draws: a window that matches nothing,
  // a desktop's, where a test stubs none of its own.
  if (!window.matchMedia)
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  // The menus, popovers and tooltips are on a chunk of their own
  // (components/popupsChunk), which main.tsx fetches while the page waits
  // for the engine, so a pilot's first tap finds it in. A test had no such
  // wait: the first tap on a pull-down in a file fetched and transformed
  // the chunk then, and ClearanceCard's "Find Inputs" test, waiting the
  // default second for the menu's rows, failed whenever a busy run took
  // longer (two runs of 2026-11-09, at 1016 ms). In before
  // any test, as in the app, so no test races its import.
  await (await import("../components/popupsChunk")).loadPopups();
}

/**
 * The timers a file with a document leaves still to fire are cleared as
 * it ends: one firing after the file's jsdom is gone throws ("window is
 * not defined"), an unhandled error that failed whichever run it landed
 * in. Cleared, not failed: a first try that failed the file on them found
 * 7 of the 25 such files leaving some, up to 42 in one, mostly timers the
 * libraries keep rather than a test's own.
 * Real timers only; fake ones are vi's to clear.
 */
function lingeringTimers() {
  const pending = new Set<ReturnType<typeof setTimeout>>();
  const { setTimeout: set, clearTimeout: clear, setInterval: every, clearInterval: stop } = globalThis;
  globalThis.setTimeout = ((handler: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
    const id = set(
      (...a: unknown[]) => {
        pending.delete(id);
        return typeof handler === "function" ? handler(...a) : undefined;
      },
      ms,
      ...args,
    );
    pending.add(id);
    return id;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id?: ReturnType<typeof setTimeout>) => {
    if (id !== undefined) pending.delete(id);
    clear(id);
  }) as typeof clearTimeout;
  globalThis.setInterval = ((handler: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
    const id = every(handler, ms, ...args);
    pending.add(id);
    return id;
  }) as typeof setInterval;
  globalThis.clearInterval = ((id?: ReturnType<typeof setInterval>) => {
    if (id !== undefined) pending.delete(id);
    stop(id);
  }) as typeof clearInterval;
  afterAll(() => {
    for (const id of pending) {
      clear(id);
      stop(id);
    }
    pending.clear();
  });
}

// No warnings (the owner's rule): a test that makes React, a library or
// the app write a warning or an error to the console fails, with what was
// said, rather than passing over it in the run's output. Only what a test
// means to provoke is let through, matched here with why; a test that
// expects one of its own spies on console itself (vi.spyOn), which
// replaces this for that test.
const ALLOWED_CONSOLE: RegExp[] = [
  // The copilot says in the console when the engine refused its question
  // and it answers nothing (features/copilot/copilotInput's watch).
  /^copilot_watch:/,
];
const consoleSaid: string[] = [];
for (const level of ["warn", "error"] as const) {
  const write = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    const text = args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a))).join(" ");
    if (ALLOWED_CONSOLE.some((allowed) => allowed.test(text))) return;
    consoleSaid.push(`console.${level}: ${text}`);
    write(...args);
  };
}
afterEach(() => {
  if (consoleSaid.length === 0) return;
  const said = consoleSaid.splice(0).join("\n");
  throw new Error(
    `This test wrote to the console:\n${said}\n` +
      "Fix the cause; if the test means to provoke it, spy on console in the test, or add it to " +
      "ALLOWED_CONSOLE in src/test/guards.ts with why.",
  );
});

// A test that turns on fake timers turns them off again (vi.useRealTimers
// in its own afterEach or finally). Left on, the next test's setTimeout
// never fires and it times out, or its Date.now() is frozen at another
// test's clock. Its own afterEach runs before this one, so fake timers
// still on here were left on.
afterEach(() => {
  if (!vi.isFakeTimers()) return;
  const pending = vi.getTimerCount();
  vi.useRealTimers();
  throw new Error(
    `This test left fake timers on${pending ? `, with ${pending} timer(s) still pending` : ""}. ` +
      "Call vi.useRealTimers() in its afterEach (after vi.runOnlyPendingTimers() if what they do matters), " +
      "so the next test gets real ones.",
  );
});
