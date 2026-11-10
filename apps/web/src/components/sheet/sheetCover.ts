import { useEffect } from "react";
import { prefersReducedMotion } from "../../lib/motion";
import { DRAWER_MS } from "./insets";

/** Where the map's buttons and its credits ride on the sheet's top
 *  (--sheet-cover, their `bottom` in index.css): a rule of their own, set
 *  on them alone. Set on <body>, an inherited property, every change of it
 *  restyled the whole page (177 to 260 ms of a phone's at 4x, 2026-10-28). */
let declaration: CSSStyleDeclaration | null = null;
function rule(): CSSStyleDeclaration {
  if (!declaration) {
    const sheet = document.head.appendChild(document.createElement("style")).sheet!;
    sheet.insertRule("[data-map-controls], [data-map-food], .maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right {}", 0);
    declaration = (sheet.cssRules[0] as CSSStyleRule).style;
  }
  return declaration;
}

/**
 * The map's buttons on a phone's bottom sheet's top: at the height the
 * Drawer is going to (`px`, its snap point), eased on the Drawer's own
 * curve and time as it goes; none (null) leaves them on the map's inset.
 * Once per snap point, where a frame loop followed the popup's transform
 * (the stock sheet as it is, 2026-11-10): under a finger they wait for
 * the throw.
 */
export function useSheetCover(px: number | null) {
  useEffect(() => {
    const style = rule();
    if (px === null) {
      style.removeProperty("--sheet-cover");
      style.removeProperty("--sheet-cover-ease");
      return;
    }
    style.setProperty("--sheet-cover-ease", prefersReducedMotion() ? "0s" : `${DRAWER_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`);
    style.setProperty("--sheet-cover", `${Math.round(px)}px`);
  }, [px]);
  useEffect(
    () => () => {
      rule().removeProperty("--sheet-cover");
      rule().removeProperty("--sheet-cover-ease");
    },
    [],
  );
}
