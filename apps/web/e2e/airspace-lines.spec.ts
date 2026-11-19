import { test, expect, type Page } from "@playwright/test";
import { airportMark, drawn, openMapSettings, slow } from "./helpers";
import { mapStill } from "./mapHelpers";
import { wheelIn } from "./mapZoom";

/**
 * The Class B, C and D over the chart, with their altitudes as the
 * sectional writes them, ceiling over floor, along their lines, and
 * the VORs (AirspaceGl, NavaidsGl, from the overlay tiles): on
 * unless turned off, the owner's pick of the map's looks. Against the
 * real planner and its overlay tiles of the FAA airspace file, as the point is that the lines
 * and numbers are Chicago's own.
 */

/** How many of the volumes' lines are drawn in the view, as the map's probe
 *  says (AirspaceGl). */
const lines = async (page: Page): Promise<number> => new Set((await drawn(page, "airspace-lines")).map((l) => l.id)).size;
/** The altitudes on the rings, each label's words and its turn along its
 *  ring (AirspaceGl's probe, the tiles' `angle`). */
const labels = async (page: Page): Promise<{ id: string; text: string; angle: number }[]> =>
  (await drawn(page, "airspace-edge-labels")).map((l) => ({ id: String(l.id), text: String(l.text), angle: Number(l.angle ?? 0) }));
/** The VORs' idents drawn (NavaidsGl's probe). */
const vors = async (page: Page): Promise<string[]> =>
  (await drawn(page, "navaid-marks")).filter((m) => m.kind === "vor").map((m) => String(m.ident));

test("Chicago's airspace is drawn over the chart with its altitudes, and the switch takes it off", async ({ page }) => {
  // The planner's overlay tiles, through the gateway: the cycle's archive
  // and its airspace layer (in CI the suite's own, round Chicago).
  const answer = await page.request.get("/api/planner/overlay-tiles");
  expect(answer.ok()).toBe(true);
  const tiles: { name: string; layers: { name: string; features: number }[] } = await answer.json();
  expect(tiles.layers.find((l) => l.name === "airspace")!.features).toBeGreaterThan(10);
  const header = await page.request.get(`/api/planner/overlay-tiles/${tiles.name}.pmtiles`, { headers: { Range: "bytes=0-6" } });
  expect(header.status()).toBe(206);
  expect((await header.body()).toString("latin1")).toBe("PMTiles");

  // O'Hare's card brings the map in on it, close enough for the labels.
  await page.goto("/app/plan?place=KORD");
  await expect.poll(() => lines(page), { timeout: slow(30000) }).toBeGreaterThan(5);
  // The altitudes on the rings in their dark tabs, as the sectional
  // writes them (the engine's words in the tiles, the owner's pick,
  // 2026-11-18): the ceiling over the floor in hundreds of feet MSL,
  // O'Hare's shelves among them ("100" over "30"), and a Class D its
  // ceiling alone, a minus where it stops under a Class B shelf ("-30");
  // the same words the 3D view stands at each shelf's top.
  await expect.poll(async () => (await labels(page)).some((l) => /^100\n(SFC|\d+)$/.test(l.text)), { timeout: slow(15000) }).toBe(true);
  // Closer in over Wheeling, where a Class D's small ring has room for its
  // tab: a tab in its ceiling over its floor is a box two lines tall, and
  // MapLibre keeps it off the fields' marks and the other tabs, so at the
  // card's zoom a ring 35 px across has none (the labels audit, 6fe7e631a).
  await wheelIn(
    page,
    async () => (await airportMark(page, "KPWK")) ?? { x: page.viewportSize()!.width / 2, y: 200 },
    async () => (await labels(page)).some((l) => /^-?\d+$/.test(l.text)),
  );
  const written = await labels(page);
  expect(written.some((l) => /^-?\d+$/.test(l.text))).toBe(true);
  expect(written.some((l) => /^\d+\n\d+$/.test(l.text))).toBe(true);
  expect(written.length).toBeGreaterThan(3);
  // One a shelf, not one every few hundred pixels round its ring.
  expect(new Set(written.map((l) => l.id)).size).toBe(written.length);
  // Upright, along the ring.
  expect(written.every((l) => l.angle > -90 && l.angle <= 90)).toBe(true);
  // And the VORs about it: Northbrook's, north of the field.
  await expect.poll(() => vors(page), { timeout: slow(15000) }).toContain("OBK");

  await openMapSettings(page);
  // The Map card's Aeronautical, the airspace and the VORs together.
  await page.getByTestId("aeronautical-toggle").click();
  await page.keyboard.press("Escape");
  await expect.poll(() => lines(page)).toBe(0);
  await expect.poll(async () => (await labels(page)).length).toBe(0);
  await expect.poll(() => vors(page)).toEqual([]);
});

test("a tap on a Class D ring opens its card, with its ceiling and hours", async ({ page }) => {
  // Wheeling's, under O'Hare's 3,000 ft shelf: up to but not including it.
  // O'Hare's card brings the map in on Chicago, Wheeling's ring in sight
  // (KPWK's own card left the map where it was).
  await page.goto("/app/plan?place=KORD");
  // A point on a Class D ring in sight, as the canvas writes one of each
  // ring it drew at rest (data-airspace-rings, in the map's own points),
  // clear of the airports' marks (which take a tap near them) and of the
  // sheet over the lower half of a phone's screen.
  const ringPoint = async () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLElement>("[data-airspace-lines]");
      const marks = [...document.querySelectorAll<HTMLElement>("[data-airport-marks]")];
      if (!canvas) return null;
      const box = document.querySelector(".maplibregl-map")!.getBoundingClientRect();
      // Only the fields wearing a mark take a tap near them; the canvas
      // writes every field it knows, mark or not.
      const fields: { x: number; y: number; chip: boolean }[] = marks.flatMap((m) => JSON.parse(m.dataset.airportMarks || "[]"));
      // Each Class D ring's box (AirspaceGl's probe), its pieces cut at the
      // tiles' edges put back together: the probe places a ring, a polygon
      // in the tiles, at the middle of its box, which is its field, not its
      // line. A ring is round, so the middle of each side of its box is on
      // it.
      const pieces = JSON.parse(canvas.dataset.airspaceLines || "[]") as { id: string; cls: string; box?: number[] }[];
      const boxes = new Map<string, number[]>();
      for (const l of pieces) {
        if (l.cls !== "D" || !l.box) continue;
        const was = boxes.get(l.id);
        boxes.set(
          l.id,
          was
            ? [Math.min(was[0]!, l.box[0]!), Math.min(was[1]!, l.box[1]!), Math.max(was[2]!, l.box[2]!), Math.max(was[3]!, l.box[3]!)]
            : l.box,
        );
      }
      const onRings = [...boxes.values()].flatMap(([x0, y0, x1, y1]) => [
        { x: (x0! + x1!) / 2, y: y0! },
        { x: (x0! + x1!) / 2, y: y1! },
        { x: x0!, y: (y0! + y1!) / 2 },
        { x: x1!, y: (y0! + y1!) / 2 },
      ]);
      // Of those, one where the Class D is the only airspace line in a
      // finger's square (TAP.line, 10 px either way), as the map finds
      // them (the map a test drives, on window.__wingtipMaps): a box's side
      // is not always on its ring, and round O'Hare a Class B shelf's line
      // runs a few pixels from most of them, the tap rightly its (CI's
      // run, the B's card opened from the ring's tiles in another order).
      type Found = { layer: { id: string } }[];
      const map = (window as unknown as { __wingtipMaps?: { queryRenderedFeatures(b: unknown, o: unknown): Found }[] }).__wingtipMaps?.[0];
      const dAlone = (x: number, y: number) => {
        const found = map?.queryRenderedFeatures(
          [
            [x - 10, y - 10],
            [x + 10, y + 10],
          ],
          { layers: ["airspace-D", "airspace-C", "airspace-B"] },
        );
        return !!found?.length && found.every((f) => f.layer.id === "airspace-D");
      };
      // A Class D ring is 35 px across its radius at the card's zoom on a
      // phone, so the clearance is the mark's own reach (22 px) and a little;
      // and clear of the map's buttons down the right edge (BUTTONS_CLEAR).
      for (const ring of onRings) {
        if (ring.y < 80 || ring.y > box.height * 0.48 || ring.x < 20 || ring.x > box.width - 64) continue;
        if (fields.some((f) => f.chip && Math.hypot(f.x - ring.x, f.y - ring.y) < 26)) continue;
        if (!dAlone(ring.x, ring.y)) continue;
        return { x: box.left + ring.x, y: box.top + ring.y };
      }
      return null;
    });
  await expect.poll(ringPoint, { timeout: slow(30000) }).not.toBeNull();
  // Taken with the map still, so the tap lands where the ring is drawn.
  await mapStill(page);
  await expect.poll(ringPoint, { timeout: slow(10000) }).not.toBeNull();
  const at = (await ringPoint())!;
  await page.mouse.click(at.x, at.y);
  const card = page.getByTestId("airspace-card");
  await expect(card).toBeVisible({ timeout: slow(10000) });
  // Its name the card's, "Class D" the line under it in its head (the
  // owner, 2026-11-18: the title is the thing's name, the line its kind).
  await expect(
    page
      .getByTestId("card-sub")
      .filter({ hasText: /^Class D$/ })
      .first(),
  ).toBeAttached();
  // Opened by its address, as its link opens it, its edge lit in the
  // selection's yellow while its card is up.
  expect(new URL(page.url()).searchParams.get("mark")).toMatch(/^airspace:/);
  await expect.poll(async () => (await drawn(page, "airspace-picked")).length, { timeout: slow(10000) }).toBeGreaterThan(0);
  await expect(card).toContainText("Ceiling");
  await expect(card).toContainText(/\d,\d{3} ft MSL/);
  await expect(card).toContainText("Hours");
  // On a phone, one close, the card's own in its head, the tabs static
  // over it (the owner, 2026-11-09).
  if (page.viewportSize()!.width < 768) {
    await expect(page.locator("[data-sheet-card]").getByTestId("sheet-card-close")).toHaveCount(1);
    await page.screenshot({ path: "test-results/look/airspace-card.png" });
  }
});

test("a tap on a field's mark opens the field, over an airspace ring or a VOR beside it", async ({ page }) => {
  // KDPA: its Class D ring through its mark and the DPA VOR on the field
  // (the owner, 2026-10-30: the airspace or the VOR took the tap).
  await page.goto("/app/plan?place=KORD");
  await expect.poll(() => lines(page), { timeout: slow(30000) }).toBeGreaterThan(0);
  await expect.poll(async () => (await airportMark(page, "KDPA")) != null, { timeout: slow(15000) }).toBe(true);
  const mark = (await airportMark(page, "KDPA"))!;
  await page.mouse.click(mark.x, mark.y);
  await expect(page).toHaveURL(/[?&]place=KDPA/, { timeout: slow(10000) });
  await expect(page.getByTestId("airspace-card")).toHaveCount(0);
});
