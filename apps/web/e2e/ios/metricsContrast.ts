import type { Page } from "@playwright/test";

type ContrastFinding = { text: string; ratio: number; need: number; where: string };

/** P15: every visible word at WCAG's contrast against what is actually
 *  behind it -- 4.5:1, or 3:1 for large type (24, or 18.66 bold) -- in
 *  whichever scheme the page is in. The backgrounds behind a word are
 *  composited up to the first opaque one, its colour taken at its
 *  opacity and its ancestors'; a canvas reads any CSS colour (oklch,
 *  oklab, color-mix) as sRGB. Not judged: a disabled control's words
 *  (WCAG's own exception), text over the map's tiles or an image, whose
 *  background is not a colour, and a screen reader's own. */
export function contrastFindings(page: Page, scope = "body"): Promise<ContrastFinding[]> {
  return page.evaluate((scope) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const rgba = (color: string): number[] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const over = (top: number[], under: number[]) => {
      const a = top[3];
      return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
    };
    const lum = (c: number[]) => {
      const [r, g, b] = c.slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const root = document.querySelector(scope);
    const found = new Map<string, { text: string; ratio: number; need: number; where: string }>();
    if (!root) return [];
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = (n.textContent ?? "").trim();
      const el = n.parentElement;
      if (!text || !el || el.closest(".sr-only, [disabled], [aria-disabled='true'], [data-disabled], .maplibregl-canvas-container"))
        continue;
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility !== "visible") continue;
      // Nor a word in a panel tab not up (PanelTabs' tab-page[data-hidden],
      // content-visibility: hidden): it has a box, measured, but is not
      // drawn, and its colours read as one -- 1:1, on CI's iPhone.
      if (!el.checkVisibility()) continue;
      // Up to the first opaque background, every layer on the way, and
      // the opacity the word is drawn at.
      const layers: number[][] = [];
      let opacity = 1,
        base: number[] | null = null,
        unknown = false,
        drawnOn: number[] | null = null;
      // A word drawn over a shape of its own SVG -- a runway's number on the
      // runway, in the pattern diagram -- is read against that shape's
      // fill, not the panel behind the drawing: there it read 1.23:1, navy
      // on navy, where it is navy on the runway's light grey.
      if (el instanceof SVGElement) {
        const svg = el.closest("svg");
        // By geometry, not hit-testing: a drawing under pointer-events:
        // none is skipped by elementsFromPoint. The last filled shape
        // before the word in the drawing's order whose box holds the
        // word's middle is the one it is painted on.
        const x = box.left + box.width / 2,
          y = box.top + box.height / 2;
        const under =
          svg &&
          [...svg.querySelectorAll("rect, circle, ellipse, polygon, path")]
            .filter((e) => (e.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
            })
            .filter((e) => {
              const f = getComputedStyle(e);
              return f.fill.startsWith("rgb") && parseFloat(f.fillOpacity) >= 0.999 && rgba(f.fill)[3] >= 0.999;
            })
            .at(-1);
        if (under) drawnOn = rgba(getComputedStyle(under).fill);
      }
      for (let a: Element | null = el; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        opacity *= parseFloat(s.opacity);
        if (s.backgroundImage !== "none" || a.classList.contains("maplibregl-map")) {
          unknown = true;
          break;
        }
        const bg = rgba(s.backgroundColor);
        if (bg[3] >= 0.999) {
          base = bg;
          break;
        }
        if (bg[3] > 0) layers.push(bg);
      }
      // A toast fading in or out is between two states, neither of them its
      // own; at rest it is measured. So is a map's tooltip or card: MapLibre
      // fades one out over 0.2 s before it takes it away, and the course
      // line's, at no opacity under a pointer the map had moved from, read
      // 1:1 on CI's phones.
      if (unknown || (opacity < 0.99 && el.closest("[data-slot=toast-viewport], .maplibregl-popup, .maplibregl-popup"))) continue;
      let bg = base ?? [255, 255, 255, 1];
      for (const layer of layers.reverse()) bg = over(layer, bg);
      if (drawnOn) bg = drawnOn;
      const fill = el instanceof SVGElement && cs.fill.startsWith("rgb") ? cs.fill : cs.color;
      const fg = rgba(fill);
      fg[3] *= opacity;
      const shown = over(fg, bg);
      const [hi, lo] = [lum(shown), lum(bg)].sort((x, y) => y - x);
      const ratio = Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      const size = parseFloat(cs.fontSize),
        weight = parseFloat(cs.fontWeight);
      const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
      if (ratio + 0.005 < need) {
        let where = el.tagName.toLowerCase();
        for (let a: HTMLElement | null = el; a; a = a.parentElement) {
          const id = a.dataset.testid ? `#${a.dataset.testid}` : a.dataset.slot;
          if (id) {
            where = id;
            break;
          }
        }
        const key = `${where}|${ratio}`;
        if (!found.has(key)) found.set(key, { text: text.slice(0, 32), ratio, need, where });
      }
    }
    return [...found.values()];
  }, scope);
}
