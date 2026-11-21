import type { Page } from "@playwright/test";

type ComponentFinding = { rule: string; what: string; measured: string };

/** P18: the same component at the same size wherever it is -- what the
 *  pilot found differing from one surface to the next, which no check of
 *  a size against iOS's list on its own could see:
 *  - a sheet's grabber at iOS's 36 by 5;
 *  - one radius for what floats, the theme's: sheets, pop-ups, dialogs,
 *    map cards, list cards and toasts -- but the map's panel on a phone,
 *    in Maps' own shapes: at rest a rectangle 24 round, its medium sheet
 *    36, and the console's sheet at half the same 36; a phone's other
 *    sheets the same 36, floating as it does (PhoneSheetContent), and the
 *    centred dialogs in glass 28, as iOS's alerts are -- the owner's pick
 *    of the sheets audit (D1, D3, 2026-10-17); a grouped list's box the
 *    look's card corner (GroupedList's GROUP, --radius-card);
 *  - one icon-only button, 36 with a 20 glyph, and a round one 44, as
 *    iOS 26's round buttons in a sheet's head and Apple Maps' map buttons
 *    are (IconButton's `round` and the map's buttons, the owner,
 *    2026-11-20: "let's do what Apple does", "make all buttons same size
 *    as Apple Maps") --
 *    outside the navigation bar, whose sizes are a decision still open,
 *    the map's markers, and the route's fold on the separator, small at
 *    the pilot's ask;
 *  - a drawer's or a sheet's words at least 16 in from its side, iOS's
 *    margin (a point less for a glyph's own side bearing);
 *  - a switch at iOS's own 51 by 31 to a finger, the pilot's one
 *    exception to keeping stock controls their stock size;
 *  - P14, on an iPad, the consoles as iOS's form sheet: 540 by 620 (or
 *    less, on a smaller window), centred;
 *  - on a phone, no panel scrolling sideways (the nav log's five columns
 *    are laid out to fit their drawer) -- not in Slide Over's 320, where
 *    the drawer is narrower than five columns need and the log scrolls,
 *    as it does with the text set large. */
export function componentFindings(page: Page): Promise<ComponentFinding[]> {
  return page.evaluate(() => {
    const found: { rule: string; what: string; measured: string }[] = [];
    // In sight: a tab kept out of sight (TabKept, tab-away) keeps its
    // last layout's boxes under content-visibility, so its size alone
    // said nothing (checkVisibility knows).
    const on = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility === "visible" && el.checkVisibility();
    };
    const name = (el: Element) =>
      (
        el.getAttribute("aria-label") ??
        (el as HTMLElement).dataset?.testid ??
        el.getAttribute("data-slot") ??
        el.className.toString().split(" ")[0]
      ).slice(0, 40);
    for (const grab of document.querySelectorAll(
      '[data-slot="console-sheet"] [data-grabber], [data-floating] [data-swipe-handle] > span',
    )) {
      const r = grab.getBoundingClientRect();
      if (!on(grab) || r.height > 12) continue;
      if (Math.abs(r.width - 36) > 0.5 || Math.abs(r.height - 5) > 0.5)
        found.push({ rule: "grabber 36×5", what: "sheet grabber", measured: `${r.width}×${r.height}` });
    }
    const theme = document.createElement("div");
    theme.className = "rounded-lg";
    document.body.append(theme);
    const radius = parseFloat(getComputedStyle(theme).borderTopLeftRadius);
    theme.style.borderRadius = "var(--radius-card)";
    const cardRadius = parseFloat(getComputedStyle(theme).borderTopLeftRadius);
    theme.style.borderRadius = "var(--radius-banner)";
    const bannerRadius = parseFloat(getComputedStyle(theme).borderTopLeftRadius);
    theme.remove();
    const floats = [
      '[data-slot="sheet-content"][data-side="bottom"]',
      '[data-slot="console-sheet"]',
      '[data-slot="map-panel"]',
      '[data-slot="popover-content"]',
      '[data-slot="dialog-content"]',
      '[data-slot="alert-dialog-content"]',
      ".maplibregl-popup-content",
      '[data-slot="item-group"].border',
      "[data-slot=toast]",
    ].join(", ");
    for (const box of document.querySelectorAll(floats)) {
      if (!on(box)) continue;
      // A sheet from the top of the screen is rounded at its bottom only.
      const r = Math.max(parseFloat(getComputedStyle(box).borderTopLeftRadius), parseFloat(getComputedStyle(box).borderBottomLeftRadius));
      // The map's panel a rectangle with its corners 24 round at every
      // size, at the pilot's ask (mapChrome's PILL_RADIUS: one shape, the
      // pill being the sheet at its lowest); a phone's other sheets (the
      // console) 36, with their far corners round.
      const sheet = box.matches('[data-slot="console-sheet"], [data-floating]');
      // A toast is Apple Maps' banner, a capsule (the toast rewrite,
      // 2026-10-27), at the banner's corner (design/tokens.json's
      // radius.banner, 22: half the 44-point tap target); the pill 24.
      const capsule = box.matches("[data-slot=toast]") ? bannerRadius : 24;
      const shape = box.matches("[data-capsule], [data-slot=toast]")
        ? Math.min(capsule, box.getBoundingClientRect().height / 2)
        : box.matches('[data-slot="map-panel"]')
          ? 24
          : sheet
            ? 36
            : box.matches("[data-glass]")
              ? 28
              : box.matches('[data-slot="item-group"]')
                ? cardRadius
                : radius;
      if (Math.abs(r - shape) > 0.5) found.push({ rule: `one radius, ${Math.round(shape)}`, what: name(box), measured: `${r}` });
    }
    for (const button of document.querySelectorAll<HTMLElement>('button, a[data-slot="button"]')) {
      const svg = button.querySelector("svg");
      // The airport card's runway sketch is a picture as wide as two tiles,
      // not an icon button: its svg is the drawing, not a glyph. Nor is a
      // text field's clear (ui/field-clear's FIELD_CLEAR), iOS's own 20-point circled cross
      // inside the field, which every field with words in it now wears.
      // Nor a list's disclosure (FPL's airport opened by the arrow by its
      // fuel), iOS's small chevron, at the owner's ask. Nor a card head's
      // picture (CardPictures), tapped to show it alone: its svg, where there
      // is no photo, is the picture. Nor the Ask row's round 48-point
      // microphone, Stop and Send beside its 48-point field (data-composer),
      // drawn as the canvas's Ask screen at the owner's ask (46502903).
      if (
        !svg ||
        !on(button) ||
        button.closest(
          'header, .maplibregl-marker, [data-slot=toast-viewport], [data-slot="tabs-trigger"], [data-testid="place-runway-sketch"], [data-slot="clear-button"], [data-disclosure], [data-point-mark], [data-picture-head], [data-composer]',
        )
      )
        continue;
      const words = [...button.querySelectorAll("*"), button].some((n) =>
        [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent!.trim() && !(n as Element).closest(".sr-only")),
      );
      // A button named by words laid over it -- a section's title over its
      // row-wide accordion trigger (AccordionSection) -- has words: it is
      // a row with a chevron, not an icon button.
      const labelled = (button.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .some((id) => id && document.getElementById(id)?.textContent?.trim());
      if (words || labelled || button.getAttribute("role") === "combobox") continue;
      const b = button.getBoundingClientRect(),
        g = svg.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      if (!hit || !(hit === button || button.contains(hit))) continue;
      // The close's cross at 24, and the back's chevron, its twin at the
      // owner's ask (CloseButton, BackButton): lucide's span half their box
      // where the other glyphs span most of theirs.
      const glyph = button.querySelector("svg.lucide-x") ? 24 : 20;
      // A round button (a disc: its corner half its height or more) is 44;
      // any other icon-only button 36.
      const round = parseFloat(getComputedStyle(button).borderTopLeftRadius) >= b.height / 2 - 0.5;
      const side = round ? 44 : 36;
      if (Math.abs(b.width - side) > 0.5 || Math.abs(b.height - side) > 0.5 || Math.abs(g.width - glyph) > 0.5) {
        found.push({
          rule: `icon button ${side}, glyph ${glyph}`,
          what: name(button),
          measured: `${Math.round(b.width)}×${Math.round(b.height)}, glyph ${Math.round(g.width)}`,
        });
      }
    }
    for (const panel of document.querySelectorAll('[data-slot="map-panel"], [data-slot="sheet-content"], [data-testid="console-sheet"]')) {
      if (!on(panel)) continue;
      const p = panel.getBoundingClientRect();
      let inset = Infinity,
        sample = "";
      const walk = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        // A tab's word is centred in its fifth of the bar, as in iOS's tab
        // bar: at 320 points "Nav Log" sits 14 from the edge by the width
        // of the cell, which is the bar's layout, not the content's margin.
        if (!n.textContent!.trim() || n.parentElement!.closest('.sr-only, [data-slot="tabs-trigger"]')) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const t = range.getBoundingClientRect();
        if (t.width < 1 || t.bottom < p.top || t.top > p.bottom) continue;
        // Words scrolled out of sight, or in something that scrolls
        // sideways (a wide table, its cells passing the edge as it moves),
        // are not the panel's margin.
        const at = document.elementFromPoint(t.left + Math.min(t.width / 2, 4), t.top + t.height / 2);
        if (!at || !(at === n.parentElement || n.parentElement!.contains(at) || at.contains(n.parentElement))) continue;
        let scrolls = false;
        for (let a = n.parentElement; a && a !== panel; a = a.parentElement)
          if (a.scrollWidth > a.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(a).overflowX)) scrolls = true;
        if (scrolls) continue;
        if (t.left - p.left < inset) {
          inset = t.left - p.left;
          sample = n.textContent!.trim().slice(0, 30);
        }
      }
      if (inset < 14.5) found.push({ rule: "margin 16", what: name(panel), measured: `${Math.round(inset)} at "${sample}"` });
    }
    if (matchMedia("(pointer: coarse)").matches) {
      for (const sw of document.querySelectorAll('[data-slot="switch"]')) {
        if (!on(sw)) continue;
        const b = sw.getBoundingClientRect();
        if (Math.abs(b.width - 51) > 0.5 || Math.abs(b.height - 31) > 0.5)
          found.push({ rule: "switch 51×31", what: name(sw), measured: `${b.width}×${b.height}` });
      }
    }
    if (matchMedia("(pointer: coarse) and (min-width: 744px) and (min-height: 600px)").matches) {
      for (const sheet of document.querySelectorAll('[data-testid="console-sheet"]')) {
        // The planner's Setup is a tab of the map's panel on an iPad too
        // (MapPage's inPanel), at the owner's ask: the panel's, not a sheet.
        if (!on(sheet) || sheet.closest('[data-slot="map-panel"]')) continue;
        const b = sheet.getBoundingClientRect();
        const w = Math.min(540, innerWidth - 40),
          h = Math.min(620, innerHeight * 0.85);
        const centred = Math.abs(b.left - (innerWidth - b.right)) <= 1 && Math.abs(b.top - (innerHeight - b.bottom)) <= 1;
        if (Math.abs(b.width - w) > 1 || Math.abs(b.height - h) > 1 || !centred) {
          found.push({
            rule: "P14 form sheet",
            what: "console",
            measured: `${Math.round(b.width)}×${Math.round(b.height)} at ${Math.round(b.left)},${Math.round(b.top)}`,
          });
        }
      }
    }
    if (innerWidth >= 375 && innerWidth < 768) {
      for (const el of document.querySelectorAll<HTMLElement>("*")) {
        const s = getComputedStyle(el);
        if (!/auto|scroll/.test(s.overflowX) || !on(el)) continue;
        // What is made to slide: a strip of hours or of chips across
        // (data-slides), as iOS's slide.
        if (el.hasAttribute("data-slides")) continue;
        if (el.scrollWidth - el.clientWidth > 1)
          found.push({ rule: "no sideways scroll in a panel", what: name(el), measured: `${el.scrollWidth} in ${el.clientWidth}` });
      }
    }
    return found;
  });
}
