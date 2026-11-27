import { useEffect } from "react";
import { useTheme } from "next-themes";
import { usePreferences, type Brand } from "./preferences";
import { useSunlightOn } from "./sunlight";

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
  { value: INK, label: "Chart Ink" },
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
 *  own ink by it as it renders: the checkpoints' marks (RouteMap,
 *  PointMark). A
 *  canvas, which no render reaches, reads it off <html> instead
 *  (chartColors' isInkLook). */
export function useInkLook(): boolean {
  return usePreferences((s) => s.brand) === INK;
}

/** The pilot's kept look put on <html> before React draws anything, so
 *  the first frame is in it rather than in Wingtip's until BrandLook's
 *  effect runs (the themes audit, 2026-11-27: Chart ink and Glass Cockpit
 *  flashed Wingtip's blue on every load). The preferences are read from
 *  localStorage as the store is made, so they are here already; where
 *  storage is refused the default look stays. */
export function applyKeptBrand(): void {
  try {
    document.documentElement.dataset.brand = usePreferences.getState().brand;
  } catch {
    document.documentElement.dataset.brand = "wingtip";
  }
}

/** Puts the pilot's look on <html> (data-brand), and its typeface in,
 *  and the browser's bar in the page's own ground (followThemeColor). */
export function BrandLook() {
  const brand = usePreferences((s) => s.brand);
  const theme = useTheme().resolvedTheme;
  // Sunlight changes the page's ground by day (white), so the bar follows it too.
  const sunlight = useSunlightOn();
  useEffect(() => {
    document.documentElement.dataset.brand = brand;
    void FONTS[brand]?.()?.catch(() => {
      /* the system's face meanwhile */
    });
  }, [brand]);
  useEffect(() => followThemeColor(), [brand, theme, sunlight]);
  return null;
}

/**
 * The browser's bar -- Android Chrome's toolbar, the installed app's
 * status bar, Safari's tab bar -- in the page's own ground, dark at
 * night against the pilot's dark adaptation (AIM 8-1-6). Before the
 * script, index.html's two theme-color metas (vite-plugins/manifest,
 * the launch tokens) follow the device's scheme by their media; once
 * the look and the theme are on, which Setup can set against the
 * device's, both say the page's ground. Read a frame on, after
 * next-themes has put its class on <html>.
 */
function followThemeColor(): () => void {
  const frame = requestAnimationFrame(() => {
    const ground = getComputedStyle(document.body).backgroundColor;
    if (!ground) return;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = ground;
  });
  return () => cancelAnimationFrame(frame);
}
