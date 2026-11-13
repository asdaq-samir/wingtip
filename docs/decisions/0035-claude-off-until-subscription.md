# 0035. The Claude features are off until the subscription is decided

- **Date:** 2026-11-10
- **Status:** Superseded by [0041](0041-claude-taken-out.md) (2026-11-12): the features, the switch and the assistant service are taken out

## Context

A cost audit of the running app found Claude to be 90-96% of the bill.
Ask on Opus cost about $0.076 a question. Every pilot signed in had the
features (`APP_CLAUDE_FEATURES=EVERYONE`, the default then), and the app
is free ([0022](0022-free-app-for-now.md)), so nothing paid for them. The
audit also found the privacy inventory's list of what Anthropic receives
incomplete.

## Decision

"To keep the cost low, we only add the claude feature later when we
decide about subscription model. For now just the free siri and gemini."

- **Off by default, everywhere.** The gateway's `app.claude-features`
  (`APP_CLAUDE_FEATURES`) defaults to `OFF` in `application.yml`, both
  compose files, `.env.example` and the server's environment. `OFF` wins
  over a sold subscription, a developer and an open machine: the
  gateway refuses every assistant route (a 404, "not offered yet") before
  the assistant is asked, so no request reaches Anthropic.
- **The assistant service need not run.** It sits behind the `claude`
  compose profile in `docker-compose.yml` and
  `infra/docker-compose.prod.yml`. The gateway neither needs it nor
  watches it while the features are off.
- **The apps read the switch** from `GET /api/auth/capabilities`
  (`claudeFeatures`). Anything unknown counts as off.
  - **Web:** `useClaudeOn` in `lib/subscription.ts`.
  - **iPhone:** `API/ServerFeatures.swift`.
  - **Android:** `ai/ClaudeGate.kt`.
- **With the features off, each one falls back or is hidden; none shows
  an error.**
  - **iPhone:** Apple's Foundation Models on the device. Private Cloud
    Compute is used only where it is switched on and free. Siri and App
    Intents stay.
  - **Android:** Gemini Nano through ML Kit on the phone, and App
    Functions.
  - **Everywhere:** the engine's own words and figures.
  - **The web:** no browser has a built-in model the code uses, so Ask
    and the words are hidden there.
  - **No free path:** the mock oral, the trip planner, the written
    briefing and checkpoint descriptions are hidden. Nothing is promised
    in their place.
  - **Flight watch:** the email lists the planner's own line for each
    change (`ChangeLines`) instead of Claude's sentences.
- **The code stays**, behind the switch. Nothing is deleted.

## Consequences

- Turning the features on takes three settings: `ANTHROPIC_API_KEY`,
  `APP_CLAUDE_FEATURES` (`DEVELOPERS` or `EVERYONE`) and
  `COMPOSE_PROFILES=claude`. That waits for the owner's subscription
  decision.
- Revisit the cost audit's advice on models, caps and caching at the same
  time.
- No new Claude-backed feature is added in the meantime.
- These privacy pages say Anthropic receives nothing while the features
  are off, and list in full what it would receive once they are on:
  - [privacy-inventory.md](../privacy-inventory.md)
  - [store/privacy-labels.md](../store/privacy-labels.md)
  - [legal/privacy.md](../legal/privacy.md)
- Browser tests that need a Claude feature turn it on for themselves (the
  `claudeFeatures` helper in `apps/web/e2e/claude.ts`).
  `claude-off.spec.ts` checks that nothing is asked while the features
  are off.

## Source

The owner, 2026-11-10, after the cost audit.
