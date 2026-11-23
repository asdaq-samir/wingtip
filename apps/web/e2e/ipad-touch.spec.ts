import { test, expect, type Page } from "@playwright/test";
import { library, openConsole, consoleSheet, roleMenu, settle, openPanel, grabberTo } from "./helpers";
import { extrasOn } from "./extras";

/**
 * What makes the page feel installed under a finger in Safari's engine,
 * on an iPad (the webkit-ipad project, the primary device) and an iPhone
 * (webkit-phone): the mobile-native review of 2026-11-22
 * (docs/design/web.md, "A tap's feedback"). Each is a computed style, not
 * a look: a field is 16 or more to a finger in every look, or Safari
 * zooms the page in on it and leaves it zoomed; a control takes a tap at
 * once (touch-action: manipulation) and a long press selects none of its
 * words; no hover look without a fine pointer; the page's edge is never
 * pulled; and the viewport lets the page under the notch and still zoom.
 * At night.
 */

const LOOKS = ["", "native"] as const;

/** The font size, CSS px, of what the locator finds, in each look:
 *  the look set on <html> as BrandLook sets it ("" is Wingtip's own). */
async function sizesInEachLook(page: Page, testId: string) {
  const sizes: Record<string, number> = {};
  for (const look of LOOKS) {
    await page.evaluate((brand) => {
      if (brand) document.documentElement.dataset.brand = brand;
      else delete document.documentElement.dataset.brand;
    }, look);
    sizes[look || "wingtip"] = await page
      .locator(`[data-testid="${testId}"]:visible`)
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  }
  await page.evaluate(() => delete document.documentElement.dataset.brand);
  return sizes;
}

test("a field is 16 or more to a finger in every look, so Safari never zooms the page in on it", async ({ page }) => {
  await page.route("**/api/aircraft", (route) =>
    route.request().method() === "GET" ? route.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : route.abort(),
  );
  await page.goto("/app/plan");
  await settle(page);
  for (const [look, size] of Object.entries(await sizesInEachLook(page, "search-airports")))
    expect(size, `the search, ${look}`).toBeGreaterThanOrEqual(16);

  // The stock Input (ui/input), in the new airplane's form: 14 from md
  // in the Native look, an iPad's width, before md:pointer-fine.
  await openConsole(page);
  await library(consoleSheet(page), "Airplanes");
  await consoleSheet(page).getByTestId("new-aircraft-button").click();
  const tail = page.getByLabel("Tail Number");
  await expect(tail).toBeVisible();
  await tail.evaluate((el) => el.setAttribute("data-testid", "probe-tail"));
  for (const [look, size] of Object.entries(await sizesInEachLook(page, "probe-tail")))
    expect(size, `Tail Number, ${look}`).toBeGreaterThanOrEqual(16);
});

test("the clearance card's two boxes are 16 or more to a finger in every look", async ({ page }) => {
  await extrasOn(page, "atcCopilot");
  // No recognizer, so the comms button opens the card to type in (clearance.spec).
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
  });
  await page.goto("/app/plan");
  await settle(page);
  // The comms button in sight over the phone's sheet; beside the iPad's panel already.
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await openPanel(page);
    await grabberTo(page, "half");
  }
  await page.getByTestId("radio-button").click();
  await expect(page.getByTestId("clearance-text")).toBeVisible();
  for (const [look, size] of Object.entries(await sizesInEachLook(page, "clearance-text")))
    expect(size, `the clearance as heard, ${look}`).toBeGreaterThanOrEqual(16);
  await page.getByTestId("clearance-row-readback").click();
  await expect(page.getByTestId("clearance-readback-text")).toBeVisible();
  for (const [look, size] of Object.entries(await sizesInEachLook(page, "clearance-readback-text")))
    expect(size, `your read back, ${look}`).toBeGreaterThanOrEqual(16);
});

test("a control takes a tap at once and a long press selects none of its words, and a hover look needs a fine pointer", async ({
  page,
}) => {
  await page.goto("/app/plan");
  await settle(page);
  const style = (testId: string) =>
    page
      .getByTestId(testId)
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { touch: cs.touchAction, select: cs.webkitUserSelect || cs.userSelect };
      });
  expect(await style("account-button")).toEqual({ touch: "manipulation", select: "none" });

  // A menu's row, a role and not a button (Base UI's Menu.RadioItem).
  const { developer } = await roleMenu(page);
  const row = await developer.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { touch: cs.touchAction, select: cs.webkitUserSelect || cs.userSelect };
  });
  expect(row).toEqual({ touch: "manipulation", select: "none" });
  await page.keyboard.press("Escape");

  const page_ = await page.evaluate(() => {
    // Every hover rule of the app's own (Tailwind's hover: classes) inside
    // a (hover: hover) and (pointer: fine) query, none in (hover: hover) alone.
    const ungated: string[] = [];
    const walk = (rules: CSSRuleList, gated: boolean) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule) walk(rule.cssRules, gated || /pointer:\s*fine/.test(rule.conditionText));
        else if (rule instanceof CSSStyleRule) {
          if (/hover\\:/.test(rule.selectorText) && !gated) ungated.push(rule.selectorText);
          if (rule.cssRules.length) walk(rule.cssRules, gated);
        } else if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules, gated);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules, false);
      } catch {
        // another origin's sheet: not the app's
      }
    }
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!.content;
    return {
      ungated: ungated.slice(0, 5),
      overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
      viewport,
      hover: matchMedia("(hover: hover) and (pointer: fine)").matches,
    };
  });
  expect(page_.ungated).toEqual([]);
  expect(page_.hover).toBe(false);
  expect(page_.overscroll).toBe("none");
  expect(page_.viewport).toContain("viewport-fit=cover");
  expect(page_.viewport).not.toMatch(/user-scalable=no|maximum-scale/);
});
