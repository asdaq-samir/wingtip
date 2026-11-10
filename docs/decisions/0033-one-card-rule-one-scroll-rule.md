# 0033. One card rule and one scrolling rule on every platform

- **Date:** 2026-11-10
- **Status:** Accepted

## Context

Each app had a main way of showing a thing or a page and cards that
broke it: the same leg as two different views, the airplane in three
shapes, pages that kept the search showing beside cards that hid it,
dimmed sheets, second search fields, a Back that only lowered the sheet,
and cards that scrolled their title and close away or scrolled instead
of raising the sheet. A pilot could not learn one way and use it
everywhere.

## Decision

Two rules, each kept in its platform's own stock way, written out with
each platform's parts and tests in
[docs/design/rules.md](../design/rules.md):

- **The card rule.** A thing (an airport, an airplane, a waypoint, a
  leg, traffic, an airspace, the Map settings) and every page open as one
  card over the search, with ✕: the same card from every way in, Apple
  Maps' way on the web and the iPhone, Google Maps' "← KOSH" on Android.
  What opens inside a card stays in its stack, with Back. Only Emergency
  is full screen. One search field. Back and Escape close the top card
  first. Questions are the stock alert. The same thing is the same
  component.
- **The scrolling rule.** The title and ✕ always stay in view, the large
  title folding into a pinned head. Below full a drag up grows the sheet
  before the content scrolls, and at the top a drag down lowers it; no
  pull to refresh in a sheet. Everything scrolls at any text size.
  Sideways rows never move the sheet. Back returns to where you were and
  something new starts at the top. A form with an edit asks before it is
  thrown away.
- **Tests.** Each platform holds both rules with one table-driven suite
  of every card and its ways in: `cards.spec.ts` and
  `card-scroll.spec.ts` on the web, `CardRuleTests`, `CardScrollTests` and
  `CardSmokeTests` on the iPhone, `CardRuleTest` on Android.

## Consequences

A new card or page is a row in each platform's card table and passes
every check there; one that cannot meet a check says why in its row. The
owner approved the control moves the rules imply; any other move is
still the owner's call (decision 0013). Decisions 0015 and 0018 carry
the platform details as amendments of the same day.

## Source

The owner, 2026-11-10: "Ok let's try that recommendation" (the card
rule), "Let's try the scrolling recommendations" (the scrolling rule),
and "Can we have tests for opening/closing and scrolling of the cards?"
