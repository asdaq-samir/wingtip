import { describe, expect, it } from "vitest";
import { workerHolds } from "./keepRoute";

/** A page's service worker container: active when `ready` settles, the
 *  page's controller set by `claim` (clientsClaim), which fires
 *  controllerchange as the browser does. */
function container(controlled: boolean) {
  const listeners = new Set<() => void>();
  const sw = {
    ready: Promise.resolve({} as ServiceWorkerRegistration),
    controller: controlled ? ({} as ServiceWorker) : null,
    addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
  };
  const claim = () => {
    sw.controller = {} as ServiceWorker;
    for (const fn of [...listeners]) fn();
  };
  return { sw: sw as unknown as Parameters<typeof workerHolds>[0], claim, listeners };
}

describe("workerHolds", () => {
  it("holds at once where the worker already controls the page", async () => {
    expect(await workerHolds(container(true).sw, 1000)).toBe(true);
  });

  it("waits past `ready` for the worker to claim the page, as a keep's first asks go round it until then", async () => {
    const { sw, claim, listeners } = container(false);
    let held: boolean | null = null;
    const asked = workerHolds(sw, 1000).then((v) => (held = v));
    await Promise.resolve();
    await Promise.resolve();
    expect(held, "active, not yet the page's").toBeNull();
    claim();
    await asked;
    expect(held).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it("gives up after its wait where the page is never claimed", async () => {
    const { sw, listeners } = container(false);
    expect(await workerHolds(sw, 20)).toBe(false);
    expect(listeners.size).toBe(0);
  });
});
