/**
 * The pages App Store Connect's URLs point at (Apple's Review Guidelines
 * 1.5 and 5.1.1(i)): plain HTML in public/, written from docs/legal by
 * scripts/build/legal_pages.py, so they open without the app's
 * JavaScript, and under /app/ because that is where the web server
 * serves the build (the gateway also answers /privacy, /terms and
 * /support with them, for the stores and the phones). Settings and the
 * sign-in dialog link them from this one list.
 */
export const LEGAL_PAGES = [
  { key: "privacy", title: "Privacy policy", href: "/app/privacy.html" },
  { key: "terms", title: "Terms of use", href: "/app/terms.html" },
  { key: "support", title: "Support", href: "/app/support.html" },
] as const;
