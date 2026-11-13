// @vitest-environment jsdom
/**
 * The parts that say how far and which way (lib/geo's Geo), drawn before
 * the engine's .wasm is there: each draws without its figure and throws
 * nothing, and says it once the engine is loaded, as a pilot sees "12 nm
 * NE" come in a moment after the page. Every other test runs with the
 * engine loaded (vitestSetup.ts); the plan screen's own first draw is
 * features/shell/firstDraw.test.tsx's.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import type { TrafficAircraft } from "../../../lib/api/types";

const wasm = join(dirname(fileURLToPath(import.meta.url)), "../../../lib/engine/wingtip-engine.wasm");

/** Own ship at Campbell (C81), the engine not loaded: fresh copies of
 *  every module, as the page has them on a cold open. */
async function unloaded() {
  vi.resetModules();
  const engine = await import("../../../lib/engine/engine");
  const library = await import("@testing-library/react");
  const { useOwnShip } = await import("../../../lib/map/position/ownShip");
  useOwnShip.setState({
    enabled: true,
    fix: { lat: 42.3246, lon: -88.0741, accuracyM: 10, speedKt: 0, headingDeg: null, altitudeFt: null, at: Date.now() },
  });
  const { PointWhere } = await import("../../../lib/map/cards/PointWhere");
  const { default: AircraftRow } = await import("./AircraftRow");
  const { useAway, useAwayWords } = await import("../../../lib/useAway");
  return { ...library, engine, PointWhere, AircraftRow, useAway, useAwayWords };
}

describe("the distances before the engine is there", () => {
  test("draw without the figure, then with it", { timeout: 30_000 }, async () => {
    const { act, engine, render, screen, PointWhere, AircraftRow, useAway, useAwayWords } = await unloaded();
    expect(engine.engineLoaded()).toBe(false);
    // Waukegan (KUGN), a dozen miles east-northeast of Campbell.
    const at = { lat: 42.4222, lon: -87.8679 };
    function Pill() {
      return <p data-testid="pill">{useAwayWords(at.lat, at.lon) ?? "none"}</p>;
    }
    function Tile() {
      return <p data-testid="tile">{useAway()({ ident: "KUGN", name: "Waukegan National", municipality: "Waukegan", ...at })}</p>;
    }
    const plane = { hex: "a1b2c3", callsign: "N12345", altitude_ft: null, ...at } as TrafficAircraft;
    render(
      <>
        <PointWhere {...at} />
        <AircraftRow plane={plane} from={{ lat: 42.3246, lon: -88.0741 }} ownFt={null} onPick={() => {}} />
        <Pill />
        <Tile />
      </>,
    );
    // Drawn, each without its figure: the card's place, the row's name,
    // the pill's nothing, the tile's town.
    expect(screen.getByTestId("point-where").textContent).not.toMatch(/nm/);
    expect(screen.getByText("N12345")).toBeTruthy();
    expect(screen.getByTestId("pill").textContent).toBe("none");
    expect(screen.getByTestId("tile").textContent).toBe("Waukegan");

    await act(() => engine.loadEngine(readFileSync(wasm)));
    expect(screen.getByTestId("point-where").textContent).toMatch(/1\d nm (NE|E) of you/);
    expect(screen.getByTestId("aircraft-row").textContent).toMatch(/1\d nm (NE|E)/);
    expect(screen.getByTestId("pill").textContent).toMatch(/^1\d nm (NE|E) of you$/);
    expect(screen.getByTestId("tile").textContent).toMatch(/^1\d nm$/);
  });
});
