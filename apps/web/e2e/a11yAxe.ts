import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { settled, mapStill } from "./helpers";

/** axe-core's reading of a page, for a11y.spec and a11y-screens.spec. */

/** Every animation on the page finished (a spinner's, which never does,
 *  left out): a sheet sliding in is glass over a moving map, and its
 *  words were read against that. */
export async function atRest(page: Page) {
  await settled(page.locator("body"));
  await mapStill(page);
}

export async function violations(page: Page, within?: string) {
  await atRest(page);
  let axe = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude(".maplibregl-canvas-container");
  // The viewport no longer forbids zoom (#265, 2026-11-08), so
  // meta-viewport stays on. The sheet's thin grabber is exempt from
  // target-size (WCAG 2.2, not in these tags) as Apple Maps' is.
  // A sheet over the page: what is under its dimming is not what is read.
  if (within) axe = axe.include(within);
  const results = await axe.analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    );
}
