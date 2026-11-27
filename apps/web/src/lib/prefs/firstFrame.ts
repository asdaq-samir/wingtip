/**
 * The page's first frame in the pilot's own theme, look and sunlight
 * scheme, before the stylesheet paints the body: the names it reads and
 * the script itself, which the build writes as /first-frame.js
 * (vite-plugins/firstFrame) for index.html's head to load as a plain
 * blocking script, allowed by the page's Content-Security-Policy as
 * same-origin (script-src 'self'; the gateway's ContentSecurityPolicy),
 * where an inline one is refused. Without it the `dark` class came only
 * from next-themes' effect after React's first render, so every load at
 * night opened on a #ffffff page in a dark cockpit (AIM 8-1-6, dark
 * adaptation). Written by hand in public/, it restated each key, the four
 * looks and the sunlight rule, and a test pinned the copy; now each is
 * said here once and the app reads the same names. Nothing here may
 * import React or the stores: the build's config reads this module.
 */

/** Where next-themes keeps the page's theme (main.tsx's ThemeProvider):
 *  "system", "light" or "dark", as a bare string. */
export const THEME_KEY = "wingtip.theme";

/** The preferences' persist name (lib/preferences). */
export const PREFERENCES_KEY = "wingtip.preferences";

/** The app's looks (lib/brand's BRANDS, their labels), the first the default. */
export const LOOKS = ["wingtip", "cockpit", "ink", "native"] as const;

/** The script's source: ES5, no module, run before anything else. */
export function firstFrameScript(): string {
  return `// Written by the build from src/lib/prefs/firstFrame.ts: edit it there.
(function () {
  var root = document.documentElement;
  var theme = null;
  var kept = {};
  try {
    theme = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    kept = (JSON.parse(localStorage.getItem(${JSON.stringify(PREFERENCES_KEY)}) || "{}") || {}).state || {};
  } catch (e) {
    // Storage refused (a private window, blocked site data): the device's scheme and the defaults.
  }
  var dark = theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  // One of the looks, or the default: a kept name no look has left the page without a look's tokens.
  var looks = ${JSON.stringify(LOOKS)};
  root.dataset.brand = looks.indexOf(kept.brand) >= 0 ? kept.brand : looks[0];
  // Sunlight "on" is bright at once; Auto waits for the light sensor (lib/sunlight).
  root.dataset.chartLight = kept.chartLight === "on" ? "bright" : "normal";
})();
`;
}
