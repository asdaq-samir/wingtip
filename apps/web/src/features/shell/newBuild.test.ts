import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { registerSW } from "virtual:pwa-register";
import { leavingIsAsked, takeNewBuildsWhenAway } from "./newBuild";

type Options = Parameters<typeof registerSW>[0] & {};

let visibility: DocumentVisibilityState = "visible";
const goTo = (state: DocumentVisibilityState) => {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
};

/** The plugin's registerSW, faked: its options kept, its update counted. */
function fakePlugin() {
  const seen: { options: Options; updates: number } = { options: {}, updates: 0 };
  const register = ((options: Options = {}) => {
    seen.options = options;
    return async () => {
      seen.updates += 1;
    };
  }) as typeof registerSW;
  return { seen, register };
}

beforeEach(() => {
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => vi.restoreAllMocks());

describe("a new build is taken while the app is away", () => {
  test("a build found in use waits, and is taken when the page is hidden", () => {
    const { seen, register } = fakePlugin();
    const reload = vi.fn();
    takeNewBuildsWhenAway(register, reload);
    seen.options.onNeedRefresh?.();
    expect(seen.updates).toBe(0);
    goTo("hidden");
    expect(seen.updates).toBe(1);
    seen.options.onNeedReload?.();
    expect(reload).toHaveBeenCalledOnce();
  });

  test("a takeover while the page is in use reloads it only once it is away", () => {
    const { seen, register } = fakePlugin();
    const reload = vi.fn();
    takeNewBuildsWhenAway(register, reload);
    seen.options.onNeedReload?.();
    expect(reload).not.toHaveBeenCalled();
    goTo("hidden");
    expect(reload).toHaveBeenCalledOnce();
  });

  test("a page with something unsaved is not reloaded", () => {
    const { seen, register } = fakePlugin();
    const reload = vi.fn();
    const ask = (e: Event) => e.preventDefault();
    window.addEventListener("beforeunload", ask);
    takeNewBuildsWhenAway(register, reload);
    seen.options.onNeedRefresh?.();
    goTo("hidden");
    expect(seen.updates).toBe(0);
    window.removeEventListener("beforeunload", ask);
    goTo("visible");
    goTo("hidden");
    expect(seen.updates).toBe(1);
  });

  test("leaving is asked only while a beforeunload handler cancels", () => {
    expect(leavingIsAsked()).toBe(false);
    const ask = (e: Event) => e.preventDefault();
    window.addEventListener("beforeunload", ask);
    expect(leavingIsAsked()).toBe(true);
    window.removeEventListener("beforeunload", ask);
  });
});
