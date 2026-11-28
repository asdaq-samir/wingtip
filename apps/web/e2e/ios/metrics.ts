import type { Page } from "@playwright/test";

/**
 * The iOS audit's measurements. Each returns what breaks its rule, as
 * data, so a spec can both assert that nothing does and attach the list
 * for the audit's report. All in CSS px, which on an iPhone at
 * width=device-width are points.
 *
 * The rules, by the audit's numbering: P1 a 44-point hit region for
 * everything tappable; P2 text on iOS's type scale; P3 each size at its
 * iOS leading; P11 no sideways scroll, at 100% and at Safari's 150% page
 * zoom; P12 nothing pinned to the screen under the notch, the island or
 * the home indicator; P16 the app's own typeface everywhere; P17 reading
 * text and headings in the text's own colour; P18 the same component at
 * the same size wherever it is; P14 an iPad's sheets as iOS's form sheet;
 * P15 every word at WCAG's contrast, light and dark.
 */

/** What a finger can tap. */
export const TAPPABLE = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  "[role=button]",
  "[role=tab]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=switch]",
  "[role=menuitem]",
  "[role=option]",
  "[role=slider]",
  "[tabindex='0']",
].join(", ");

/** P1's declared exceptions, the pilot's call (2026-09-30): the map's
 *  markers keep their own tap boxes (36 points for a numbered checkpoint,
 *  an airport's chip its own size, icons.ts), since 44-point areas would
 *  overlap along a route and take each other's taps; and a segmented
 *  control's segments keep iOS's own 32-point track. */
// The map panel's grabber is the mark of where to drag, as iOS's is: the
// whole head drags, and tapping it is a keyboard's and VoiceOver's way.
const HIT_EXEMPT = [".maplibregl-marker", "[data-slot=tabs-trigger]", "[data-testid=sidebar-trigger-button]"].join(", ");

/** P3's: a marker's number or ident, centred in its dot or chip as a
 *  glyph is (icons.ts), not a line of text. */
const LEADING_EXEMPT = ".maplibregl-marker";

/** iOS's text styles at the default text size: size → leading. */
const IOS_TYPE: Record<number, number> = { 11: 13, 12: 16, 13: 18, 15: 20, 16: 21, 17: 22, 20: 25, 22: 28, 28: 34, 34: 41 };

/** Every finite animation on the page run out -- a sheet's slide, a
 *  section opening: measured mid-slide, a control is not where it rests.
 *  A spinner's endless spin is left alone, and the wait is capped at
 *  three seconds: in WebKit an animation's promise could stay pending
 *  for good, and the wait with it. */
export async function still(page: Page) {
  await page.evaluate(async () => {
    // Two frames first: a change just made -- the colour scheme switched
    // for P15's dark pass, a control enabled -- starts its transitions
    // only when the page's style is next worked out, and a wait begun
    // before then found none to wait for. CI's landscape phone measured
    // a row's words at 1.1:1, dark on dark, a frame into a theme change.
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    await Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((done) => setTimeout(done, 3000)),
    ]);
  });
}

/** The planner's progress toasts gone ("Scoring checkpoints…"): over
 *  the top of a phone's screen they cover the controls under them for a
 *  moment, which is not the screen's layout. Up to twenty seconds; past
 *  that, P1 looks round a toast that stays rather than at it. */
export async function quiet(page: Page) {
  await page
    .locator("[data-slot=toast]")
    .first()
    .waitFor({ state: "detached", timeout: 20000 })
    .catch(() => undefined);
}

type HitMiss = { control: string; box: string; lost: number; by: string };

/** P1: every control whose 44 × 44 square, centred on it, is not wholly
 *  its own, by nine elementFromPoint probes. That sees a pseudo-element
 *  hit area as its element (index.css's ::after), and sees whatever
 *  covers or clips the square: a neighbour's area, an overflow:hidden
 *  ancestor, a sticky bar. Not judged: a control covered at its own
 *  centre (behind a drawer, under an overlay -- not on show), one whose
 *  square crosses a scroll container's or a clipping one's edge (scrolled
 *  into view it would be judged: a row half under the panel's sheet's
 *  clipped foot, the tab bar under it), and a probe that lands on a toast, which is gone in a
 *  moment and is not the layout, or on a sticky heading a row has
 *  scrolled under. */
export function hitAreaMisses(page: Page, scope = "body", size = 44): Promise<HitMiss[]> {
  return page.evaluate(
    ({ scope, size, tappable, exempt }) => {
      const half = size / 2 - 1;
      const misses: { control: string; box: string; lost: number; by: string }[] = [];
      const root = document.querySelector(scope);
      if (!root) return misses;
      for (const el of root.querySelectorAll<HTMLElement>(tappable)) {
        // A tab list is focusable for its arrow keys; its tabs are what is tapped.
        if (el.getAttribute("role") === "tablist" || el.matches(exempt)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || getComputedStyle(el).visibility !== "visible") continue;
        const own = (hit: Element | null) =>
          !!hit && (hit === el || el.contains(hit) || (hit.closest("label") as HTMLLabelElement | null)?.control === el);
        const toast = (hit: Element | null) => !!hit?.closest("[data-slot=toast-viewport]");
        // A sticky heading over a row scrolled half under it: the row is
        // half out of view, as at a scroll container's edge, not covered.
        const pinned = (hit: Element | null) => {
          for (let a = hit; a && a !== document.body; a = a.parentElement)
            if (getComputedStyle(a).position === "sticky") return !a.contains(el);
          return false;
        };
        // A popover, a menu or a sheet open over the page covers what is
        // under its edge, as iOS's do: a row half under it is covered, not
        // crowded. A menu (role=menu, Base UI's Menu popup) as a popover
        // (the owner, 2026-11-27: "Yes, like popovers"; an airplane's Alert
        // menu over the map's buttons on the Duo's cover screen).
        const over = (hit: Element | null) => {
          const layer = hit?.closest('[data-slot="popover-content"], [data-slot="sheet-content"], [role="dialog"], [role="menu"]');
          return !!layer && !layer.contains(el);
        };
        const cx = r.left + r.width / 2,
          cy = r.top + r.height / 2;
        if (!own(document.elementFromPoint(cx, cy))) continue;
        let port = { l: 0, t: 0, r: innerWidth, b: innerHeight };
        for (let a = el.parentElement; a; a = a.parentElement) {
          const o = getComputedStyle(a);
          if (!/auto|scroll|clip|hidden/.test(o.overflowX + o.overflowY)) continue;
          const b = a.getBoundingClientRect();
          // What is under the sheet's sticky heads (its band, a card's
          // pinned head) is scrolled under them, not covered (pinned, above).
          port = { l: Math.max(port.l, b.left), t: Math.max(port.t, b.top), r: Math.min(port.r, b.right), b: Math.min(port.b, b.bottom) };
        }
        // A port's right and bottom edges are past it: a probe on one
        // finds what is beyond (a row cut off at 992 by its list, probed
        // at 992, found the panel's foot under it).
        if (cx - half < port.l || cx + half >= port.r || cy - half < port.t || cy + half >= port.b) continue;
        // Nor one cut off by that edge itself: a row half scrolled under the
        // sheet's foot, its square a point short of crossing it.
        if (r.top < port.t - 0.5 || r.bottom > port.b + 0.5) continue;
        const probes = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ];
        const takers: string[] = [];
        const lost = probes.filter(([dx, dy]) => {
          const hit = document.elementFromPoint(cx + dx * half, cy + dy * half);
          // A field's disclosure (its arrow, data-disclosure) is tapped
          // anywhere on the field's lines, its area stretched over them; the
          // field's symbol beside it is the field's menu, at the owner's ask
          // ("Use the airport icon as the more button"), so the arrow's left
          // edge is the symbol's: the arrow is not crowded on the lines.
          const mark = el.matches("[data-disclosure]") && !!hit?.closest("[data-point-mark]");
          // A field and its own button at its end (the N-number's, the
          // altitude's), one pill: where their areas meet, each the other's
          // neighbour in the one control, not crowding it -- the field's text
          // the field's, to edit it, the button's round it its own.
          const pill = el.closest('[data-testid="aircraft-select"], [data-testid="altitude-group"]');
          const field = !!hit && !!pill && pill.contains(hit);
          const taken = !own(hit) && !toast(hit) && !pinned(hit) && !over(hit) && !mark && !field;
          if (taken && hit)
            takers.push(
              `${hit.tagName.toLowerCase()}${(hit as HTMLElement).dataset.testid ? `[${(hit as HTMLElement).dataset.testid}]` : ""} "${(hit.getAttribute("aria-label") ?? hit.textContent ?? "").trim().slice(0, 20)}"`,
            );
          return taken;
        }).length;
        if (!lost) continue;
        const name = (el.getAttribute("aria-label") ?? el.getAttribute("title") ?? el.textContent ?? "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 40);
        const id = el.dataset.testid ?? el.dataset.slot ?? [...el.classList].find((c) => c.startsWith("maplibregl-")) ?? "";
        misses.push({
          control: `${el.tagName.toLowerCase()}${id ? `[${id}]` : ""} "${name}"`,
          box: `${Math.round(r.width)}×${Math.round(r.height)}`,
          lost,
          by: [...new Set(takers)].join(", "),
        });
      }
      return misses;
    },
    { scope, size, tappable: TAPPABLE, exempt: HIT_EXEMPT },
  );
}

type TypeFinding = { size: number; leading: number | null; want: number | null; where: string; text: string; count: number; face?: string };

/** P2 and P3: visible text off iOS's scale, and text at an iOS size off
 *  that size's leading by more than a pixel -- each kind grouped by size
 *  (and leading) and by where it is (the nearest test id, shadcn slot or
 *  MapLibre part), with an example and how many pieces of text. Not seen:
 *  text clipped to a pixel (a screen reader's alone), and text above or
 *  left of the page, where no scroll reaches, and text kept for a screen
 *  reader (sr-only, whose padding can leave it a box of its own). */
export function typeFindings(
  page: Page,
  scope = "body",
): Promise<{ offScale: TypeFinding[]; offLeading: TypeFinding[]; offFace: TypeFinding[] }> {
  return page.evaluate(
    ({ scope, type, glyphs }) => {
      const offScale = new Map<string, TypeFinding>(),
        offLeading = new Map<string, TypeFinding>(),
        offFace = new Map<string, TypeFinding>();
      // P16: the app's own face -- the body's -- or its monospace where a
      // font-mono class asks for one. The map's words were the old map's
      // Helvetica Neue, and every size check passed them.
      const first = (family: string) => family.split(",")[0].replace(/["']/g, "").trim();
      const appFace = first(getComputedStyle(document.body).fontFamily);
      const root = document.querySelector(scope);
      if (root) {
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const text = (n.textContent ?? "").trim().replace(/\s+/g, " ");
          const el = n.parentElement;
          if (!text || !el) continue;
          const rect = el.getBoundingClientRect();
          // Nor a figure set smaller to fit its column, as iOS's
          // adjustsFontSizeToFitWidth sets one (TripFigures' data-fitted):
          // off the scale by design, on a screen too narrow for it.
          if (rect.width <= 1 || rect.height <= 1 || rect.right <= 0 || rect.bottom <= 0 || el.closest(".sr-only, [data-fitted]")) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility !== "visible" || cs.opacity === "0") continue;
          const size = Math.round(parseFloat(cs.fontSize) * 100) / 100;
          const leading = cs.lineHeight === "normal" ? null : Math.round(parseFloat(cs.lineHeight) * 10) / 10;
          const want = Math.abs(size - Math.round(size)) <= 0.25 ? (type[Math.round(size)] ?? null) : null;
          let where = el.tagName.toLowerCase();
          for (let a: HTMLElement | null = el; a; a = a.parentElement) {
            const mapClass = [...a.classList].find((c) => c.startsWith("maplibregl-") && c !== "maplibregl-map");
            const id = a.dataset.testid ? `#${a.dataset.testid}` : (a.dataset.slot ?? mapClass);
            if (id) {
              where = id;
              break;
            }
          }
          const add = (map: Map<string, TypeFinding>, key: string) => {
            const found = map.get(key);
            if (found) found.count++;
            else map.set(key, { size, leading, want, where, text: text.slice(0, 40), count: 1 });
          };
          const face = first(cs.fontFamily);
          if (face !== appFace && !el.closest(".font-mono")) {
            const key = `${face}|${where}`,
              found = offFace.get(key);
            if (found) found.count++;
            else offFace.set(key, { size, leading, want, where, text: text.slice(0, 40), count: 1, face });
          }
          if (want === null) add(offScale, `${size}|${where}`);
          else if (leading !== null && Math.abs(leading - want) > 1 && !el.closest(glyphs)) add(offLeading, `${size}/${leading}|${where}`);
        }
      }
      return { offScale: [...offScale.values()], offLeading: [...offLeading.values()], offFace: [...offFace.values()] };
    },
    { scope, type: IOS_TYPE, glyphs: LEADING_EXEMPT },
  );
}

type RoleFinding = { role: string; text: string; where: string };

/** P17: reading text -- a paragraph or a list item at the prose size, 15
 *  to a finger -- and headings in the text's own colour, never in the
 *  grey that is for a row's detail, a section's summary, a note and a
 *  status. The consoles' guides were grey where the sidebar's briefing
 *  is black, and every size check passed them. Not judged: rows and
 *  summaries (their grey is their role), a group's small-capital header,
 *  a status (role="status"), and red or amber words, which say something
 *  of their own. */
export function roleFindings(page: Page, scope = "body"): Promise<RoleFinding[]> {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope);
    if (!root) return [];
    const probe = document.createElement("span");
    probe.className = "text-muted-foreground";
    document.body.append(probe);
    const muted = getComputedStyle(probe).color;
    probe.remove();
    const found: { role: string; text: string; where: string }[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("p, li, h1, h2, h3, h4")) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || el.closest(".sr-only")) continue;
      if (
        el.closest(
          '[role="status"], [data-slot^="item"], [data-slot="section-summary"], [data-slot="accordion-trigger"], [data-slot=toast-viewport], .maplibregl-canvas-container',
        )
      )
        continue;
      const cs = getComputedStyle(el);
      // A group's header is grey by design: iOS's small capitals over a
      // grouped list (13, semibold, uppercase), as the settings' are.
      const groupHeader = cs.textTransform === "uppercase" && parseFloat(cs.fontSize) <= 13.25;
      const heading = /^H\d$/.test(el.tagName) && !groupHeader;
      const reading = !heading && Math.abs(parseFloat(cs.fontSize) - 15) <= 0.25;
      if ((heading || reading) && cs.color === muted) {
        let where = el.tagName.toLowerCase();
        for (let a: HTMLElement | null = el; a; a = a.parentElement) {
          const id = a.dataset.testid ? `#${a.dataset.testid}` : a.dataset.slot;
          if (id) {
            where = id;
            break;
          }
        }
        found.push({ role: heading ? "heading" : "reading", text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40), where });
      }
    }
    return found;
  }, scope);
}
