import type { Page } from "@playwright/test";
import { TAPPABLE } from "./metrics";

/** P11: how far the page scrolls sideways; 0 or less passes. */
export const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

export type Insets = { top: number; right: number; bottom: number; left: number };

/** P12's notch, island and home indicator, which no desktop engine has:
 *  every env(safe-area-inset-*) in the page's own style sheets and style
 *  attributes rewritten to these insets, in place, so the app is
 *  measured with the CSS it ships. */
export async function emulateSafeArea(page: Page, insets: Insets) {
  await page.evaluate((insets) => {
    const re = /env\(\s*safe-area-inset-(top|right|bottom|left)\s*(?:,[^()]*(?:\([^()]*\)[^()]*)*)?\)/g;
    const patch = (style: CSSStyleDeclaration) => {
      if (style.cssText.includes("safe-area-inset")) {
        style.cssText = style.cssText.replace(re, (_, side: keyof typeof insets) => `${insets[side]}px`);
      }
    };
    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) patch(rule.style);
        if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules);
      } catch {
        /* another origin's sheet: not ours */
      }
    }
    for (const el of document.querySelectorAll<HTMLElement>("[style*='safe-area-inset']")) patch(el.style);
    // What reads the insets in script (the map's room under the status
    // bar) reads them again on a resize, which on a phone
    // is what turning it fires.
    window.dispatchEvent(new Event("resize"));
  }, insets);
}

type InsetFinding = { control: string; box: string };

/** P12: controls pinned to the screen that reach into an inset. Pinned:
 *  in a fixed or sticky box with no scroll container between (content
 *  that scrolls is not pinned, and the map's own markers and popups are
 *  the map's). Covered at its centre: not on show, not judged. One
 *  exception, the pilot's (2026-10-10): an airport card's tiles and tabs
 *  run down to the sheet's own edge, over the home indicator's inset
 *  ([data-to-edge], MapPanel's toEdge) -- the bottom inset only. */
export function outsideSafeArea(page: Page, insets: Insets): Promise<InsetFinding[]> {
  return page.evaluate(
    ({ insets, tappable }) => {
      const pinned = (el: HTMLElement) => {
        for (let a: HTMLElement | null = el; a; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (/fixed|sticky/.test(cs.position)) return true;
          if (a !== el && /auto|scroll/.test(cs.overflowX + cs.overflowY)) return false;
        }
        return false;
      };
      const found: { control: string; box: string }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(tappable)) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || el.closest(".maplibregl-canvas-container") || !pinned(el)) continue;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !(hit === el || el.contains(hit))) continue;
        const toEdge = !!el.closest("[data-to-edge]");
        if (
          r.top >= insets.top &&
          r.left >= insets.left &&
          r.right <= innerWidth - insets.right &&
          (toEdge || r.bottom <= innerHeight - insets.bottom)
        )
          continue;
        const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
        found.push({
          control: `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ""} "${name}"`,
          box: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`,
        });
      }
      return found;
    },
    { insets, tappable: TAPPABLE },
  );
}

type KeyboardFinding = { field: string; missing: string };

/** P19: every field a finger types in says what its keyboard is for, as
 *  iOS's text fields do (HIG, "Text fields"): an `enterkeyhint`, so the
 *  return key reads Search, Go, Next or Done rather than a bare "return",
 *  and an `autocomplete`, so Safari's AutoFill offers the pilot's own
 *  email, name or one-time code where one fits and nothing where none
 *  does ("off" says so). Multi-line text keeps its return key for new
 *  lines. Fields in a hidden or inert part of the page are not in reach. */
export function keyboardFindings(page: Page, scope = "body"): Promise<KeyboardFinding[]> {
  return page.evaluate((scope) => {
    // A date's or a time's field opens iOS's wheels, which have no return
    // key and no AutoFill.
    const NOT_TYPED = new Set([
      "checkbox",
      "radio",
      "range",
      "hidden",
      "file",
      "button",
      "submit",
      "reset",
      "color",
      "image",
      "date",
      "time",
      "datetime-local",
      "month",
      "week",
    ]);
    const out: { field: string; missing: string }[] = [];
    for (const el of document.querySelectorAll<HTMLInputElement>(`${scope} input`)) {
      if (NOT_TYPED.has(el.type)) continue;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || el.closest("[inert], [aria-hidden=true], .tab-away, .tab-page[data-hidden]")) continue;
      const missing = [!el.hasAttribute("enterkeyhint") && "enterkeyhint", !el.hasAttribute("autocomplete") && "autocomplete"]
        .filter(Boolean)
        .join(", ");
      if (!missing) continue;
      const name = el.getAttribute("aria-label") || el.labels?.[0]?.textContent?.trim() || el.placeholder || el.dataset.testid || el.id;
      out.push({ field: `${el.type} "${(name ?? "").slice(0, 40)}"`, missing });
    }
    return out;
  }, scope);
}
