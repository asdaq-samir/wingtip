import { useEffect } from "react";
import { usePreferences, type Brand } from "./preferences";

const INK: Brand = "ink";

/** The looks, as Setup's Theme lists them: Wingtip, the brand's own
 *  blue and the default (the owner, 2026-11-09: "the Wingtip brand look is
 *  the default on all three apps"); the Glass Cockpit, from the owner's
 *  brand canvas (2026-10-26); Chart ink, the app in the FAA sectional's
 *  own ink (2026-11-04); and Native, the stock components as they come
 *  out of the box, shadcn's own theme, corners, type and states (2026-11-10:
 *  "Native means how they come out of the box, look and behavior wise").
 *  Their colours are tokens on <html data-brand> (design/tokens.json's
 *  color.look); their typefaces load here. */
export const BRANDS: { value: Brand; label: string }[] = [
  { value: "wingtip", label: "Wingtip" },
  { value: "cockpit", label: "Glass Cockpit" },
  { value: INK, label: "Chart ink" },
  { value: "native", label: "Native" },
];

/** Each look's own typeface beyond Barlow, which both read in and which
 *  is in the first stylesheet (main.tsx), fetched only when it is
 *  picked: Chart ink's Barlow Condensed for a figure's label, an ident
 *  and a word button (index.css --display, lib/text's label and word). */
const FONTS: Record<Brand, () => Promise<unknown>> = {
  wingtip: () => Promise.resolve(),
  cockpit: () => Promise.resolve(),
  // shadcn's own face, Inter, which the page has already.
  native: () => Promise.resolve(),
  ink: () => Promise.all([import("@fontsource/barlow-condensed/latin-600.css"), import("@fontsource/barlow-condensed/latin-700.css")]),
};

/** Whether the Chart ink look is on, for what sets its own type or its
 *  own ink by it as it renders: the figures' sizes and labels
 *  (FigureStrip), the checkpoints' marks (RouteMap, PointMark). A
 *  canvas, which no render reaches, reads it off <html> instead
 *  (chartColors' isInkLook). */
export function useInkLook(): boolean {
  return usePreferences((s) => s.brand) === INK;
}

/** Puts the pilot's look on <html> (data-brand), and its typeface in. */
export function BrandLook() {
  const brand = usePreferences((s) => s.brand);
  useEffect(() => {
    document.documentElement.dataset.brand = brand;
    void FONTS[brand]?.()?.catch(() => {
      /* the system's face meanwhile */
    });
  }, [brand]);
  return null;
}
