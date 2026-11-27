// The page's first frame in the pilot's own theme, look and sunlight
// scheme, before the stylesheet paints the body. Loaded by index.html's
// head as a plain blocking script, which the page's Content-Security-Policy
// allows as same-origin (script-src 'self'; the gateway's
// ContentSecurityPolicy), where an inline one is refused. Without it the
// `dark` class came only from next-themes' effect after React's first
// render, so every load at night opened on a #ffffff page in a dark
// cockpit (AIM 8-1-6, dark adaptation; the round-4 themes audit). The
// keys are the app's own: THEME_KEY (lib/prefs/theme) and the
// preferences' persist name (lib/preferences), and the looks lib/brand's
// BRANDS, all pinned by firstFrame.test.
(function () {
  var root = document.documentElement;
  var theme = null;
  var kept = {};
  try {
    theme = localStorage.getItem("wingtip.theme");
    kept = (JSON.parse(localStorage.getItem("wingtip.preferences") || "{}") || {}).state || {};
  } catch (e) {
    // Storage refused (a private window, blocked site data): the device's scheme and the defaults.
  }
  var dark = theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  // One of the four looks, or the default: a kept name no look has (an
  // old one, a hand-edited store) left the page without a look's tokens.
  var looks = ["wingtip", "cockpit", "ink", "native"];
  root.dataset.brand = looks.indexOf(kept.brand) >= 0 ? kept.brand : "wingtip";
  // Sunlight "on" is bright at once; Auto waits for the light sensor (lib/sunlight).
  root.dataset.chartLight = kept.chartLight === "on" ? "bright" : "normal";
})();
