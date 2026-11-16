import { test, expect, type Page } from "@playwright/test";
import { airportMark, drawn, openMapSettings, slow } from "./helpers";

/**
 * The Class B, C and D over the chart, with their altitudes as the
 * sectional words them, written along their lines as ForeFlight's, and
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
  // The altitudes on the rings in their dark tabs, as ForeFlight writes
  // them (2026-11-08): the floor and the ceiling in feet MSL, O'Hare's
  // shelves among them ("B: 3000–10000"), and a Class D's from the
  // surface ("D: SFC–<3000" under a Class B shelf). The surface area's
  // "B: SFC–10000" is a small ring round KORD's own mark, its label
  // skipped there.
  await expect.poll(async () => (await labels(page)).some((l) => /^B: (SFC|\d+)–10000$/.test(l.text)), { timeout: slow(15000) }).toBe(true);
  const written = await labels(page);
  expect(written.some((l) => /^D: SFC–<?\d+$/.test(l.text))).toBe(true);
  expect(written.some((l) => /^[BC]: \d+–\d+$/.test(l.text))).toBe(true);
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
      // A point on each line drawn (AirspaceGl's probe: its middle vertex).
      const rings: { class: string; x: number; y: number }[] = (
        JSON.parse(canvas.dataset.airspaceLines || "[]") as { cls: string; x: number; y: number }[]
      ).map((l) => ({ class: l.cls, x: l.x, y: l.y }));
      // A Class D ring is 35 px across its radius at the card's zoom on a
      // phone, so the clearance is the mark's own reach (22 px) and a little;
      // and clear of the map's buttons down the right edge (BUTTONS_CLEAR).
      for (const ring of rings) {
        if (ring.class !== "D" || ring.y < 80 || ring.y > box.height * 0.48 || ring.x < 20 || ring.x > box.width - 64) continue;
        if (fields.some((f) => f.chip && Math.hypot(f.x - ring.x, f.y - ring.y) < 26)) continue;
        return { x: box.left + ring.x, y: box.top + ring.y };
      }
      return null;
    });
  await expect.poll(ringPoint, { timeout: slow(30000) }).not.toBeNull();
  const at = (await ringPoint())!;
  await page.mouse.click(at.x, at.y);
  const card = page.getByTestId("airspace-card");
  await expect(card).toBeVisible({ timeout: slow(10000) });
  // Named "Class D": on a phone in the card's head, or in its pill's
  // (MapCard's pill) over it, a heading; over the chart on a desktop, in
  // the popup's head, a line of its own (MapCard's), as CI's desktop
  // project found it (run 41014180625).
  await expect(page.getByRole("heading", { name: "Class D" }).first()).toBeAttached();
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
