import { test, expect, type Page } from "@playwright/test";
import { grabberTo, openBrief, settle, sideDrawer, slow } from "./helpers";
import { pick } from "./cardEntries";
import { pickAirplane } from "./startState";
import { steady } from "./pacing";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * The HIG audit of 2026-11-23's findings on the iPad, each a measurement:
 * the pill's figures whole at the owner's larger text (H2), the Brief's
 * arrival the timeline's with the stops' time on the ground in (H1), the
 * floating bars clear of the side panel's grabber (M3) and the search's
 * results kept beside a card in the inspector (M4). A touch screen, as an
 * iPad is; in a wave's validation and at night.
 */
test.use({ hasTouch: true, isMobile: true });

/** The owner's larger text, as iOS's Dynamic Type sets the root. */
const larger = (page: Page) => page.evaluate(() => (document.documentElement.style.fontSize = "19.65px"));

/** A box's rect, points. */
const rect = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const all = [...document.querySelectorAll(s)].filter((e) => e.getBoundingClientRect().height > 0);
    const r = all.at(-1)?.getBoundingClientRect();
    return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null;
  }, selector);

test("the pill's figures are never cut short on an iPad held upright at the owner's larger text (H2)", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/app/plan?dep=C81&stops=KMSN&dest=KDLH");
  await settle(page);
  await larger(page);
  await expect(page.getByTestId("navlog-ete").first()).toBeAttached({ timeout: slow(120000) });
  await grabberTo(page, "peek");
  const strip = page.getByTestId("flight-line").locator("dl").first();
  await expect(strip).toBeVisible();
  // No figure's run wider than its box, the names' and the values' alike.
  await expect
    .poll(() =>
      strip.evaluate((dl) =>
        [...dl.querySelectorAll("dt, dd, [data-fitted]")]
          .filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1)
          .map((e) => e.textContent),
      ),
    )
    .toEqual([]);
});

test("the Brief's Arrive is the time FPL's timeline gives the destination, the stop's time on the ground in (H1)", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/app/plan?dep=C81&stops=KMSN&dest=KDLH&view=full");
  await settle(page);
  await expect(page.getByTestId("navlog-ete").first()).toBeVisible({ timeout: slow(120000) });
  const times = sideDrawer(page).getByTestId("timeline-time");
  await expect(times.last()).toHaveText(/\d\d:\d\d/, { timeout: slow(60000) });
  const atDestination = ((await times.last().textContent()) ?? "").match(/\d\d:\d\d/)![0];
  await openBrief(page);
  const arrive = sideDrawer(page).getByTestId("brief-glance-arrive");
  await expect(arrive).toContainText(atDestination, { timeout: slow(30000) });
});

test("on an iPad the floating bars sit over the side panel's grabber, not on it (M3)", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  for (const [url, item] of [
    ["/app/plan?dep=C81&dest=KDLH", "route-navlog"],
    ["/app/plan?place=KOSH", "place-tab-radio"],
  ] as const) {
    await page.goto(url);
    await settle(page);
    await expect(page.getByTestId(item)).toBeAttached({ timeout: slow(120000) });
    await grabberTo(page, "full");
    await expect(page.getByTestId(item)).toBeVisible();
    const bar = await rect(page, "[data-floating-bar]:not([data-single])");
    const grabber = await rect(page, '[data-testid="sidebar-trigger-button"]');
    expect(bar && grabber, url).toBeTruthy();
    expect(bar!.bottom, `${url}: the bar's foot over the grabber's box`).toBeLessThanOrEqual(grabber!.top);
  }
});

test("on an iPad on its side the search's results stay under the field while a result's card is in the inspector (M4)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await pick(page, "KOSH", "airport");
  await expect(page.locator('[data-slot="map-inspector"] [data-sheet-card][data-open]')).toBeVisible();
  // The field keeps the words, and the results their rows, as Apple Maps' sidebar does.
  await expect(sideDrawer(page).getByTestId("search-airports")).toHaveValue("KOSH");
  await expect(sideDrawer(page).getByTestId("airport-result").first()).toBeVisible();
});

/** Each column of the pinned strip: where its name's and its value's seen
 *  runs are centred, and their ends (what only a screen reader hears left out). */
const stripColumns = (page: Page) =>
  page.evaluate(() => {
    const dl = [...document.querySelectorAll('[data-testid="flight-line"] dl')].find((d) => d.getBoundingClientRect().height > 0)!;
    const run = (part: Element) => {
      const range = document.createRange();
      let left = Infinity;
      let right = -Infinity;
      const walk = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
      for (let node = walk.nextNode(); node; node = walk.nextNode()) {
        if (!node.textContent?.trim() || node.parentElement?.closest(".sr-only")) continue;
        range.selectNodeContents(node);
        const box = range.getBoundingClientRect();
        left = Math.min(left, box.left);
        right = Math.max(right, box.right);
      }
      return { left, right, centre: (left + right) / 2 };
    };
    return {
      stacked: dl.hasAttribute("data-stacked"),
      columns: [...dl.children].map((column) => ({ name: run(column.children[0]!), value: run(column.children[1]!) })),
    };
  });

test("the strip's names sit centred over their values, every column (the owner, 2026-11-26)", async ({ page }) => {
  test.setTimeout(slow(300000));
  for (const size of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
  ]) {
    for (const root of ["", "19.65px"]) {
      await page.setViewportSize(size);
      await page.goto("/app/plan?dep=C81&stops=KMSN&dest=KDLH");
      await settle(page);
      await page.evaluate((r) => (document.documentElement.style.fontSize = r), root);
      await expect(page.getByTestId("navlog-ete").first()).toBeAttached({ timeout: slow(120000) });
      await grabberTo(page, "peek");
      // The strip at rest at the pill's size before it is measured.
      await steady(() => page.locator("[data-foot-strip]").first().boundingBox());
      const { columns } = await stripColumns(page);
      const where = `${size.width} at ${root || "the default size"}`;
      expect(columns.length, where).toBeGreaterThanOrEqual(3);
      columns.forEach(({ name, value }, i) => {
        expect(Math.abs(name.centre - value.centre), `${where}: column ${i}'s name centred over its value`).toBeLessThanOrEqual(1);
      });
    }
  }
});
