# The website (wingtipmaps.app)

Wingtip Maps' own pages: the home page (the icon, a screenshot, what the
app does, where it runs), and the privacy policy, terms and support at
`/privacy/`, `/terms/` and `/support/`. The planner itself stays the web
app at `/app/`.

```
python3 apps/site/build.py     # writes apps/site/dist (gitignored)
python3 apps/site/check.py     # its pages parse, its links resolve, nothing from another host
scripts/dev/check.sh site      # both, as CI's "Website" job runs them
```

## Why plain HTML and a Python script

The site is five pages that change a few times a year. Plain HTML and
CSS, put together by a script on Python's standard library, needs no
npm, no lockfile, no image and no framework to keep up; CI runs it in
seconds with the Python every runner has. Astro or the web app's Vite
would bring a second Node project for no page that needs JavaScript;
the site has none.

What it shares with the apps rather than copying:

- **Colours:** `tokens.css` is written from `design/tokens.json`
  (`color.theme` light and dark, `color.brand`), the source the web,
  iOS and Android take theirs from. Light and dark follow the device.
- **Legal pages:** `/privacy/`, `/terms/` and `/support/` are the web
  app's own `apps/web/public/*.html`, their body put in the site's
  layout, so the wording has one source.
- **Images:** `assets/` holds the icon (`icon-512.png`, `icon-180.png`,
  `favicon.svg`, `favicon.ico`), written by
  `scripts/build/app-icons.sh` from `docs/brand`, and `hero.png`, a
  framed iPhone screenshot from the store set (`docs/store`). The build
  copies whatever is there; `check.py --strict` fails while one is
  missing.

Type is the system's face (SF Pro, Roboto), as the phone apps use, so no
font is fetched.

## Where it would be served

Nothing is deployed. In the AWS design (`docs/README-AWS.md`, #115) one
CloudFront distribution fronts everything, with the server behind it.
The site fits as one more origin there: `dist/` synced to an S3 bucket
(private, read through an origin access control), as the default
behaviour for the apex `wingtipmaps.app`, while the behaviours the
design already has keep `/app/*`, `/api/*`, sign-in and `/tiles/*` on
the server and the tiles bucket. Two things it needs then:

- A CloudFront Function on the site's behaviour that turns `/privacy`
  and `/privacy/` into `/privacy/index.html` (S3 behind an origin access
  control serves no directory index), and the error response for 404
  pointed at `/404.html`.
- The web app's own `/app/privacy.html` (and terms, support) can then
  redirect to the site's pages, or stay as they are: both come from the
  same file.

The App Store and Play listings' privacy and support URLs
(`docs/store/listing.md`) would then be `https://wingtipmaps.app/privacy/`
and `https://wingtipmaps.app/support/`.
