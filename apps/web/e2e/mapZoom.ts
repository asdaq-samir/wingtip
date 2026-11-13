import { expect, type Page } from "@playwright/test";
import { mapStill } from "./helpers";

/* Closer in on the map by the wheel, for the specs that need a level the
 * page does not open at (places.spec, procedures.spec). */

/** The map's zoom at rest, in the app's levels (GlMapShell's data-zoom). */
export const mapZoom = async (page: Page) => Number(await page.getByTestId("gl-map").getAttribute("data-zoom"));

/** In by the wheel over `at` (asked again at each notch, as the point
 *  moves with the zoom), a notch at a time with the map still between,
 *  until `done`: as many as it takes, sixteen at most. How far a notch
 *  goes is MapLibre's to say (0.09 of a level for a 60 px turn in MapLibre
 *  6), so a count of notches lands at another level as its version changes. */
export async function wheelIn(page: Page, at: () => Promise<{ x: number; y: number }>, done: () => Promise<boolean>) {
  for (let notch = 0; notch < 16 && !(await done()); notch++) {
    const { x, y } = await at();
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -300);
    await mapStill(page);
  }
  expect(await done()).toBe(true);
}
