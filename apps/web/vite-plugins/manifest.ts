import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import type { Plugin } from "vite";
import type { ManifestOptions } from "vite-plugin-pwa";
import { BRAND } from "../src/lib/tokens.ts";

// The installed app's shortcuts (a long press on its icon, a desktop
// taskbar's menu), generated from design/screens.json by
// scripts/build/screens.sh with the same screens, in the same order, as
// Android's app shortcuts: never written here by hand.
const MANIFEST_SHORTCUTS = JSON.parse(
  readFileSync(fileURLToPath(new URL("../src/lib/navigation/generated/manifest-shortcuts.json", import.meta.url)), "utf8"),
).shortcuts;

// The pictures Chrome's richer install dialog shows (web.dev, "Richer
// install UI"): the phone's sheet and the desktop's side panel, each the
// app's own screen, captured by e2e/manifest-screenshots.spec.ts into
// public/screenshots. Named only once taken, so the manifest never points
// at a picture that is not there.
const SCREENSHOTS = [
  {
    src: "screenshots/wide.png",
    sizes: "1280x800",
    type: "image/png",
    form_factor: "wide",
    label: "The route over the sectional, with its plan beside it",
  },
  {
    src: "screenshots/narrow.png",
    sizes: "390x844",
    type: "image/png",
    form_factor: "narrow",
    label: "The route over the sectional, with its plan in the sheet",
  },
].filter((shot) => existsSync(fileURLToPath(new URL(`../public/${shot.src}`, import.meta.url))));
/** The installed web app's manifest (vite-plugin-pwa writes it), its
 *  shortcuts and screenshots above (docs/design/web.md, section 15). */
export const MANIFEST: Partial<ManifestOptions> = {
  // The name on the Home Screen is the short one: iOS cuts a long
  // name under the icon.
  name: "Wingtip Maps",
  short_name: "Wingtip",
  description: "The map for flying: every airport and airspace on the chart, and the route, checkpoints and nav log when you go.",
  // The app's own name for itself, as browsers know it apart from
  // where it opens: a later start_url must not make a second app
  // (MDN, "id").
  id: "/app/plan",
  start_url: "/app/plan",
  scope: "/app/",
  // A link to the app, a shortcut or a shared flight, opens in the
  // app already running rather than a second window (MDN,
  // "launch_handler"; Chromium only, ignored elsewhere).
  launch_handler: { client_mode: ["focus-existing", "auto"] },
  shortcuts: MANIFEST_SHORTCUTS,
  ...(SCREENSHOTS.length ? { screenshots: SCREENSHOTS } : {}),
  display: "standalone",
  // Android's launch ground for the installed app: color.brand.launch.
  background_color: BRAND.launch,
  theme_color: BRAND.launch,
  icons: [
    // docs/brand/appicon.svg drawn by scripts/build/app-icons.sh: rounded
    // as shown (192, 512), full bleed where masked (maskable 192/512,
    // iOS's 180 from index.html). Beside the manifest, under /app/: the page's
    // own links get the base put in front of them (index.html), the
    // manifest's do not, and "/icon-192.png" asked the server's root,
    // which answered 401 -- no icon to install with, and an error
    // in the console Lighthouse counts.
    { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

/** The page's two theme-color metas, the browser's bar in the launch
 *  ground by day and the night navy at night (design/tokens.json's
 *  color.brand.launch and launch-night), by the device's scheme before
 *  the script runs; the look and Setup's theme take over from there
 *  (lib/brand's BrandLook). */
export const themeColor: Plugin = {
  name: "theme-color",
  transformIndexHtml: () =>
    (
      [
        ["light", BRAND.launch],
        ["dark", BRAND.launchNight],
      ] as const
    ).map(([scheme, content]) => ({
      tag: "meta",
      attrs: { name: "theme-color", media: `(prefers-color-scheme: ${scheme})`, content },
      injectTo: "head" as const,
    })),
};
