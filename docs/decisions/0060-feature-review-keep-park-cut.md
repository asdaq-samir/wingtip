# 0060. Feature review: keep, park, cut

- **Date:** 2026-11-21
- **Status:** Accepted (the owner, 2026-11-21: every recommendation of
  the feature review taken)
- **Amends:** [0039](0039-crash-and-mcp-boundaries.md), whose crash
  pipeline left this repository with Studio

## Context

Before the store submission, every feature no pilot had asked for was
weighed for who it serves, what it costs to keep (code, specs, feeds,
store reviews) and whether the first submission needs it:
[../store/feature-review.md](../store/feature-review.md).

## Decision

1. **Keep** the features the review marks Keep, as they are.
2. **Park** nine: the ATC copilot and clearance listener, the cockpit
   ADS-B receiver, another airplane's flights, Follow and history, model
   weather, the web's 3D, the Apple Watch app, Ask on Android, the MCP
   connector, and the training tools. A parked feature stays in the code
   with its tests (each test turning its switch on first), is off to
   start behind one stock switch in a Settings group of its own,
   **Extras**, right after In Flight on each app, and is out of the
   store listing, the screenshots, the review notes and the privacy
   answers. Where a switch cannot do it, the build or the server does:
   the Watch app is not embedded, ML Kit GenAI is not linked by
   default, the microphone and connected-device foreground services are
   not declared, `MCP_ENABLED` and `WEATHER_FLOW_ON` are off on
   production.
3. **Cut** three: Studio and the crash videos (to a local repository of
   their own, `~/Developer/wingtip-studio`), the subscription's
   leftovers, and adsb.fi as a traffic source.
4. A new parked feature gets its switch in Extras, never a second home
   (decision 0014).

## Consequences

- The first review meets fewer questions: no 2.5.4 radio recording, no
  Play microphone or connected-device declaration, no Watch screenshots
  or 2.5.16 note, no "Device or other IDs" row on Data safety, no open
  OAuth registration.
- The iPhone keeps the `audio` background mode, for the alerts said
  aloud with the phone locked; the review notes give that as its reason.
- Followed airplanes are asked of adsb.lol in the background (its trace,
  then its API with `ADSBLOL_API_KEY`), not adsb.fi.
- Bringing a feature back is turning its switch on by default and
  putting it back in the listing, with whatever the build or server left
  out (feature-review.md, "Applied").
