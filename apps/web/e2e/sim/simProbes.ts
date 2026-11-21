import type { Page } from "@playwright/test";

/* What the test flight (flight.sim.ts) puts in the page before the app
 * starts, and reads back from it: a GPS the test moves with the
 * simulator's own fixes, a stand-in Screen Wake Lock that keeps what it is
 * asked, and the waste audit's two measures of the work a fix does
 * (2026-11-21): the engine's calls by rule, counted at the WebAssembly
 * boundary every callEngine crosses (lib/engine/engine.ts's wt_call), and
 * the page's DOM mutations. Nothing in the app is changed for it. */

/** A fix as the feed serves it (tools/sim-flight's sim_flight.state). */
export interface SimCraft {
  hex: string;
  callsign: string;
  lat: number;
  lon: number;
  alt_m: number;
  alt_ft: number;
  gs_mps: number;
  gs_kt: number;
  vs_fpm: number;
  track_deg: number | null;
}

export interface SimState {
  seq: number;
  t: number;
  utc: number;
  own: SimCraft;
  on_ground: boolean;
  phase: string;
  point: string;
  next: string;
  done: boolean;
  traffic: SimCraft[];
}

/** What the page counted since the last read. */
export interface Work {
  engine: number;
  byRule: Record<string, number>;
  mutations: number;
}

interface SimWindow {
  __simGps: { push(fix: SimCraft, at: number): void };
  __simWake: () => { taken: number; held: number };
  __simWork: () => Work;
}

/** The GPS, the wake lock and the counters, before any of the app's code. */
export async function installProbes(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as SimWindow;
    // The GPS: answers only with the simulator's fixes, as they are
    // pushed, and the last one at once to a new watcher (asynchronously,
    // as a real GPS answers: own ship watches as its store is made).
    const watchers = new Map<number, PositionCallback>();
    let last: GeolocationPosition | null = null;
    let next = 0;
    const position = (f: SimCraft, at: number) =>
      ({
        coords: {
          latitude: f.lat,
          longitude: f.lon,
          accuracy: 5,
          altitude: f.alt_m,
          altitudeAccuracy: 5,
          heading: f.track_deg,
          speed: f.gs_mps,
          toJSON() {
            return this;
          },
        },
        timestamp: at,
        toJSON() {
          return this;
        },
      }) as unknown as GeolocationPosition;
    Geolocation.prototype.watchPosition = function (success: PositionCallback) {
      const id = ++next;
      watchers.set(id, success);
      if (last) window.setTimeout(() => last && success(last), 0);
      return id;
    };
    Geolocation.prototype.clearWatch = function (id: number) {
      watchers.delete(id);
    };
    Geolocation.prototype.getCurrentPosition = function (success: PositionCallback) {
      if (last) window.setTimeout(() => last && success(last), 0);
    };
    w.__simGps = {
      push(fix, at) {
        last = position(fix, at);
        for (const success of watchers.values()) success(last);
      },
    };
    // The wake lock: a sentinel kept for each ask, released when the app
    // lets it go (headless Chromium has none of its own to hold).
    const locks: { released: boolean }[] = [];
    const lock = {
      request: async (type: string) => {
        const sentinel = Object.assign(new EventTarget(), { type, released: false, onrelease: null });
        Object.assign(sentinel, {
          release: async () => {
            if (sentinel.released) return;
            sentinel.released = true;
            sentinel.dispatchEvent(new Event("release"));
          },
        });
        locks.push(sentinel);
        return sentinel;
      },
    };
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: lock });
    w.__simWake = () => ({ taken: locks.length, held: locks.filter((l) => !l.released).length });
    // The engine's calls by rule: every callEngine is one wt_call, its
    // rule's name in the module's memory at (name_ptr, name_len).
    let work: Work = { engine: 0, byRule: {}, mutations: 0 };
    const decoder = new TextDecoder();
    const counted = (instance: WebAssembly.Instance) => {
      const exports = instance.exports as Record<string, unknown>;
      const call = exports.wt_call as ((n: number, nl: number, i: number, il: number) => number) | undefined;
      const memory = exports.memory as WebAssembly.Memory | undefined;
      if (!call || !memory) return instance;
      const wt_call = (n: number, nl: number, i: number, il: number) => {
        const name = decoder.decode(new Uint8Array(memory.buffer, n, nl));
        work.engine += 1;
        work.byRule[name] = (work.byRule[name] ?? 0) + 1;
        return call(n, nl, i, il);
      };
      return { exports: { ...exports, wt_call } } as unknown as WebAssembly.Instance;
    };
    const instantiate = WebAssembly.instantiate.bind(WebAssembly);
    const streaming = WebAssembly.instantiateStreaming?.bind(WebAssembly);
    const wrap = (made: WebAssembly.WebAssemblyInstantiatedSource | WebAssembly.Instance) =>
      made instanceof WebAssembly.Instance ? counted(made) : { module: made.module, instance: counted(made.instance) };
    Object.assign(WebAssembly, {
      instantiate: async (...args: Parameters<typeof WebAssembly.instantiate>) => wrap(await instantiate(...args)),
      ...(streaming && {
        instantiateStreaming: async (...args: Parameters<typeof WebAssembly.instantiateStreaming>) => wrap(await streaming(...args)),
      }),
    });
    // The DOM's mutations, from the first paint on.
    new MutationObserver((records) => {
      work.mutations += records.length;
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    w.__simWork = () => {
      const read = work;
      work = { engine: 0, byRule: {}, mutations: 0 };
      return read;
    };
  });
}

/** The simulator's fix, given to the app as its GPS's. */
export const pushFix = (page: Page, state: SimState) =>
  page.evaluate(([fix, at]) => (window as unknown as SimWindow).__simGps.push(fix, at), [state.own, Math.round(state.utc * 1000)] as const);

/** The work the page did since the last read, the count started again. */
export const readWork = (page: Page) => page.evaluate(() => (window as unknown as SimWindow).__simWork());

/** The wake locks asked for, and how many are held. */
export const readWake = (page: Page) => page.evaluate(() => (window as unknown as SimWindow).__simWake());
