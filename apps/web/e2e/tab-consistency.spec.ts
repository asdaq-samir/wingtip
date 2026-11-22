import { test, expect, type Page } from "@playwright/test";
import { FILING_OFF, FILING_OFFERED } from "./filing";
import { grabberTo, openConsole, settle, settled, showSearch, sideDrawer, slow } from "./helpers";

/**
 * The sheet's own pages laid out as one (TabPage), at the owner's ask
 * ("consistent look and feel for all tabs"), kept since the one search
 * took the tabs' place (2026-11-09): the search's own page, the traffic
 * and the account page. Measured on each half way and all the way up: the
 * sections' sides, their headings, and the room between them, from the
 * sheet's first row (the one search).
 */

test.beforeEach(async ({ page }) => {
  // Recents on both search tabs, so each page has more than one section.
  await page.addInitScript(() => {
    const key = "wingtip.preferences";
    const kept = JSON.parse(localStorage.getItem(key) ?? '{"state":{},"version":1}');
    kept.state.recentAirports = [
      { ident: "KDLH", name: "Duluth International" },
      { ident: "C81", name: "Campbell" },
    ];
    kept.state.recentAircraft = [{ hex: "a0b1c2", name: "N123AB", type: "C172" }];
    localStorage.setItem(key, JSON.stringify(kept));
  });
});

interface Section {
  heading: string | null;
  font: string | null;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The tab page in sight and its sections, the outermost in it, in
 *  points from the panel's edges, the tops from the first row's foot. */
async function layout(page: Page) {
  const panel = sideDrawer(page);
  await settled(panel);
  return panel.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const shown = (e: Element) => e.getBoundingClientRect().height > 0;
    const tabPage = [...el.querySelectorAll("[data-panel-body] [data-tab-page]")].find(shown);
    const bar = el.querySelector("[role=search]")!.getBoundingClientRect();
    if (!tabPage) return null;
    const sections = [...tabPage.querySelectorAll("section")]
      .filter((s) => {
        for (let up = s.parentElement; up && up !== tabPage; up = up.parentElement) if (up.tagName === "SECTION") return false;
        return shown(s);
      })
      .map((s): Section => {
        const b = s.getBoundingClientRect();
        // A labelled section's heading: its title, or the menu that is its
        // title (PillSection). A list's own small heading counts too; an
        // untitled list's first row is no heading (Setup's Pilot details).
        const heading = s.querySelector(":scope > div:first-child:not([role=group]) :is(h3, button)");
        const css = heading && getComputedStyle(heading);
        return {
          heading: heading?.textContent?.trim() || null,
          font: css && `${css.fontSize} ${css.fontWeight} ${css.textTransform}`,
          top: b.top - bar.bottom,
          bottom: b.bottom - bar.bottom,
          left: b.left - box.left,
          right: box.right - b.right,
        };
      });
    return { sections };
  });
}

test("every page of the sheet is laid out as one: its sections' sides, headings and the room between them", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  const pages: Record<string, Section[]> = {};
  const opens: [string, () => Promise<void>][] = [
    ["Search", () => showSearch(page)],
    ["Account", () => openConsole(page)],
  ];
  for (const [name, open] of opens) {
    await open();
    for (const size of ["half", "full"] as const) {
      await grabberTo(page, size);
      // The account page is its own chunk: drawn a moment after the menu's
      // tap on a first visit, so waited for, not read at once.
      await expect.poll(async () => (await layout(page)) !== null, { message: `${name} ${size}: a page` }).toBe(true);
      const seen = await layout(page);
      pages[`${name} ${size}`] = seen!.sections;
    }
  }
  const all = Object.entries(pages);
  for (const [where, sections] of all) {
    expect(sections.length, `${where}: its sections`).toBeGreaterThan(0);
    for (const s of sections) {
      expect(Math.round(s.left), `${where} ${s.heading}: left`).toBe(16);
      expect(Math.round(s.right), `${where} ${s.heading}: right`).toBe(16);
    }
  }
  // One heading, the Favorites' (PillSection), on every page.
  const fonts = new Set(all.flatMap(([, sections]) => sections.filter((s) => s.font).map((s) => s.font)));
  expect([...fonts]).toHaveLength(1);
  // One room between sections, on every page.
  const gaps = all.flatMap(([where, sections]) => sections.slice(1).map((s, i) => ({ where, gap: s.top - sections[i]!.bottom })));
  expect(gaps.length).toBeGreaterThan(2);
  for (const { where, gap } of gaps) expect(Math.abs(gap - gaps[0]!.gap), `${where}: ${gap} apart`).toBeLessThan(1.5);
});

/** The floating bar in sight (FloatingBar): its rect and its items' in
 *  points, its bottom from the window's foot. */
async function floatingBar(page: Page) {
  return page.evaluate(() => {
    const bar = [...document.querySelectorAll("[data-floating-bar]:not([data-single])")]
      .filter((b) => b.getBoundingClientRect().height > 0)
      .pop();
    if (!bar) return null;
    const items = [...bar.querySelectorAll("button, [role=tab]")].filter((e) => !e.parentElement?.closest("button, [role=tab]"));
    const box = bar.getBoundingClientRect();
    // FPL's File button stands beside the bar and the pair is centred.
    const file = document.querySelector("[data-single]")?.getBoundingClientRect();
    return {
      centre: file ? (box.left + file.right) / 2 : box.left + box.width / 2,
      foot: innerHeight - box.bottom,
      height: box.height,
      items: items.map((i) => {
        const b = i.getBoundingClientRect();
        const glyph = i.querySelector("svg")!.getBoundingClientRect();
        const word = getComputedStyle(i.querySelector(":scope > span:last-child")!);
        return { width: b.width, height: b.height, glyph: glyph.width, word: `${word.fontSize}/${word.lineHeight}` };
      }),
    };
  });
}

test("FPL's floating bar and the airport card's sit in one place and look alike: foot, height, centre, items, glyph and word", async ({
  page,
}) => {
  test.setTimeout(slow(240000));
  // At the default text size and the owner's (19.65 px on a 393-point iPhone).
  for (const root of ["", "19.65px"]) {
    const bars = [];
    for (const [url, item] of [
      ["/app/plan?dep=C81&dest=KDLH", "route-navlog"],
      ["/app/plan?place=KOSH", "place-tab-radio"],
    ] as const) {
      await page.goto(url);
      await settle(page);
      await page.evaluate((size) => (document.documentElement.style.fontSize = size), root);
      // A route's link opens at the pill, its bar put away there (FlightFoot): in
      // sight from half.
      await expect(page.getByTestId(item)).toBeAttached({ timeout: slow(120000) });
      await grabberTo(page, "half");
      await expect(page.getByTestId(item)).toBeVisible();
      await expect.poll(() => floatingBar(page)).not.toBeNull();
      bars.push((await floatingBar(page))!);
    }
    const [fpl, card] = bars as [
      NonNullable<Awaited<ReturnType<typeof floatingBar>>>,
      NonNullable<Awaited<ReturnType<typeof floatingBar>>>,
    ];
    const where = root || "the default size";
    expect(fpl.foot, `${where}: foot`).toBeCloseTo(card.foot, 0);
    expect(fpl.height, `${where}: height`).toBeCloseTo(card.height, 0);
    expect(fpl.centre, `${where}: centre`).toBeCloseTo(card.centre, 0);
    for (const item of [...fpl.items, ...card.items]) {
      expect(item.width, `${where}: an item's width`).toBeCloseTo(card.items[0]!.width, 0);
      expect(item.height, `${where}: an item's height`).toBeCloseTo(card.items[0]!.height, 0);
      expect(item.glyph, `${where}: a glyph`).toBeCloseTo(card.items[0]!.glyph, 0);
      expect(item.word, `${where}: a word`).toBe(card.items[0]!.word);
    }
  }
});

test("FPL's File button stands beside its bar, at its height, and the pair fits the phone", async ({ page }) => {
  test.skip(!FILING_OFFERED, FILING_OFF);
  test.setTimeout(slow(240000));
  for (const root of ["", "17.88px", "19.65px"]) {
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await page.evaluate((size) => (document.documentElement.style.fontSize = size), root);
    await expect(page.getByTestId("route-navlog")).toBeAttached({ timeout: slow(120000) });
    await grabberTo(page, "half");
    const file = page.getByTestId("file-flight-plan");
    await expect(file).toBeVisible();
    const m = await page.evaluate(() => {
      const bar = document.querySelector("[data-floating-bar]:not([data-single])")!.getBoundingClientRect();
      const one = document.querySelector("[data-single]")!.getBoundingClientRect();
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return {
        rem,
        barLeft: bar.left,
        barRight: bar.right,
        barH: bar.height,
        left: one.left,
        right: one.right,
        h: one.height,
        w: innerWidth,
      };
    });
    const where = root || "the default size";
    test.info().annotations.push({ type: "fit", description: `${where} ${JSON.stringify(m)}` });
    expect(m.h, `${where}: height`).toBeCloseTo(m.barH, 0);
    expect(m.left - m.barRight, `${where}: gap`).toBeCloseTo(m.rem / 2, 0);
    expect(m.barLeft, `${where}: left margin`).toBeGreaterThanOrEqual(0);
    expect(m.right, `${where}: right margin`).toBeLessThanOrEqual(m.w);
  }
});
