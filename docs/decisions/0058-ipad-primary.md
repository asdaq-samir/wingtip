# 0058. The iPad is the primary device

- **Date:** 2026-11-21
- **Status:** Accepted (the owner, 2026-11-21: "Primary app users are on
  iPad, so make sure we pay special attention to iPad layout etc.")
- **Amends:** 0034 (what main's push and a wave's validation run, not
  tier 1), 0038 (web first stays; the web's proof is judged on the iPad
  too) and 0054 (a wave's run includes the iPad)

## Context

Pilots fly with iPads: on a kneeboard or a yoke mount, as their
electronic flight bag. The rules said "judge every screen at an iPhone's
width first" (CLAUDE.md, "The app on the phone"), and the review skill
was the iPhone's. CI tested the iPad only at night: the native app's
whole suite on an iPad simulator, and the web's iOS audit at the 13-inch
iPad's upright size in Chromium. Main's push ran the iOS UI smoke on the
iPhone alone and the browser smoke on phone projects alone, and a wave's
validation ran no iPad at all, so an iPad layout broken by a merge was
found the next morning at the earliest.

## Decision

1. **Every screen is judged on the iPad**, in portrait, landscape and
   split views, as well as on the iPhone, against Apple's Human
   Interface Guidelines (CLAUDE.md, "The app on the phone"). The review
   skill is `ipad-iphone-review`, with measurable checks for size
   classes, split view widths, the pointer and keyboard, the sidebar and
   inspector, and popovers against sheets in a regular width.
2. **CI, within decision 0034's lean rules:**
   - **Tier 1 (a pull request) does not grow.** The iOS build and unit
     tests stay on the iPhone; the browser specs a change reaches stay on
     the phone project.
   - **Main's push:** the browser smoke (`@smoke` and `@flight-critical`)
     also runs on `webkit-ipad`, Safari's engine on an 11-inch iPad Pro
     upright (834 x 1194, touch), over three shards where two held the
     phone's alone; Native iOS's unit tests and `CardSmokeTests` run on
     the newest iPad as well as the iPhone, each on its own runner.
   - **A wave's validation** (`validate-wave.yml`) runs the iPad's whole
     native suite, as the night does, split over two runners so the wave
     stays near 20 to 25 minutes: `test (iPad 1/2)` runs the UI classes
     `scripts/ci/ios_test.sh`'s `IPAD_FIRST` names (the accessibility audit
     among them, 614 of the iPad's 1,309 s of UI tests on 2026-11-21's
     night), `test (iPad 2/2)` every other test by skipping those, so no
     class falls between. The iPhone keeps main's smoke set (unit tests
     and `CardSmokeTests`). The browser smoke runs on `webkit-ipad` beside
     every spec on the other projects. A wave runs off the pull-request
     tier, on free minutes and in parallel (the coordinator's
     recommendation, taken by the owner: "I will take your recs").
   - **The night** keeps the iPad, the iPhone and iPhone Duo for the
     native suite, and the web's iOS audit adds the 13-inch iPad on its
     side to the devices every run measures.
   - `webkit-ipad` runs only the smoke set, by its own `grep`, so the
     night does not run the whole suite a fourth time in WebKit.
3. **Unchanged:** moving a panel or a control still needs the owner's
   word in its issue (CLAUDE.md, "Never"). An iPad layout that would move
   one is proposed with a recommendation, not built.

## Consequences

- An iPad regression from a merge shows in main's push or the wave's
  run, in minutes, not the next night.
- Main's push uses one more Linux shard and one more macOS runner, and a
  wave two more macOS runners. No existing timeout or budget was raised:
  `ci_budget.py` gives main's iPad leg the iPhone leg's budget by pattern
  (`Native iOS / test*`), and the wave's two iPad legs a row of their own,
  30 minutes, half the night's iPad leg (34 to 48 minutes, 2026-11-19 to
  21) with its build; their job timeout is 45 minutes.
- `webkit-ipad` may find specs that assume a phone or a mouse. Each is
  fixed in the spec or the app, never by dropping the project.
