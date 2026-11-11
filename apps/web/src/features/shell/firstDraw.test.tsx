// @vitest-environment jsdom
/**
 * The planner's first draw before the shared engine's .wasm is there
 * (MapPage, lib/engine/engineGate): the search, the sheet and the chart at
 * once, only what asks the engine waiting in its place. Every other test
 * runs with the engine loaded (vitestSetup.ts), so this is the one that
 * fails when a part drawn at once starts asking it: callEngine throws its
 * words (engine.ts), React reports it, and the console guard fails the test.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

// No WebGL here: the map's shell draws nothing (its layers are its children).
vi.mock("../../components/map/GlMapShell", () => ({ default: () => null }));
vi.mock("../../lib/map/gl/worker", () => ({}));

const wasm = join(dirname(fileURLToPath(import.meta.url)), "../../lib/engine/wingtip-engine.wasm");
let unmount: (() => void) | null = null;

afterEach(async () => {
  unmount?.();
  unmount = null;
  // The page asks for the route's panel chunk once it has painted
  // (routePanelParts' loadRoutePanel), and a test can end before it is in:
  // the last one's import then landed after the environment was torn down,
  // failing the run with every test passed. Each test waits here for the
  // imports its page started: a cold transform of the chunk's modules, so
  // the tests' own 30 s, not a hook's default 10 s, which a busy CI runner
  // went past.
  await vi.dynamicImportSettled();
}, 30_000);

/** The page at `address`, drawn from a fresh copy of every module: the
 *  engine's not loaded, and nothing answering on the network. */
async function drawAt(address: string, before?: () => Promise<void>) {
  vi.resetModules();
  await before?.();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  const engine = await import("../../lib/engine/engine");
  const library = await import("@testing-library/react");
  const { createMemoryRouter } = await import("react-router");
  const { RouterProvider } = await import("react-router/dom");
  const { QueryClientProvider } = await import("@tanstack/react-query");
  const { queryClient } = await import("../../lib/queryClient");
  const { default: MapPage } = await import("./MapPage");
  const router = createMemoryRouter([{ path: "/plan", element: createElement(MapPage, { mode: "pilot" }) }], { initialEntries: [address] });
  // In an awaited act: a part that waits for the engine suspends, and
  // React's retry once it is there is flushed inside one.
  await library.act(async () => {
    unmount = library.render(
      createElement(QueryClientProvider, { client: queryClient }, createElement(RouterProvider, { router })),
    ).unmount;
  });
  return { ...library, engine };
}

describe("the planner before the engine is there", () => {
  test("draws the search and the sheet at once", { timeout: 30_000 }, async () => {
    const { engine, screen } = await drawAt("/plan");
    expect(engine.engineLoaded()).toBe(false);
    expect(await screen.findByPlaceholderText(/^Search airports/, undefined, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByText("Skip to the map")).toBeTruthy();
  });

  test("draws with location on and a fix in hand", { timeout: 30_000 }, async () => {
    // Flying mode, the own-ship mark and the Ready to Fly prompt ask
    // whether the airplane is underway on the first draw.
    const { screen } = await drawAt("/plan", async () => {
      const { useOwnShip } = await import("../../lib/map/position/ownShip");
      useOwnShip.setState({
        enabled: true,
        fix: { lat: 42.1, lon: -87.9, accuracyM: 10, speedKt: 0, headingDeg: null, altitudeFt: null, at: Date.now() },
      });
    });
    expect(await screen.findByPlaceholderText(/^Search airports/, undefined, { timeout: 10_000 })).toBeTruthy();
  });

  test("says Working out in a card's place, opened from the address", { timeout: 30_000 }, async () => {
    const { screen } = await drawAt("/plan?place=KOSH");
    expect(await screen.findByText("Working out…", undefined, { timeout: 10_000 })).toBeTruthy();
  });

  test("waits to read a route in the address, then draws it", { timeout: 30_000 }, async () => {
    const { act, engine, screen } = await drawAt("/plan?dep=KMSN&dest=KOSH");
    // Long enough for the page's chunks to have drawn it, were it not waiting.
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(screen.queryByText("Skip to the map")).toBeNull();
    await act(() => engine.loadEngine(readFileSync(wasm)));
    expect(await screen.findByText("Skip to the map", undefined, { timeout: 10_000 })).toBeTruthy();
  });
});
