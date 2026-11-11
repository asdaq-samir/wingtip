# 0015. Close goes back one level; no Back buttons

- **Date:** 2026-10-22
- **Status:** Accepted

## Context

Back arrows and close buttons together made the sheet's navigation ambiguous.

## Decision

Anything expanded opens with its title on top and a close at the right that goes back one level. No Back buttons anywhere. The expanded view has a fixed height and scrolls inside; a swipe only goes back; the minimized bar has Share at its left.

## Consequences

A new detail view gets a title and a close, not a Back button.

## Source

The owner's standing UI rule, 2026-10-22.

## Amended 2026-11-10

The owner approved the card rule. On Android a card or a page takes the
search's place with its name and ← at the start, as Google Maps does
("← KOSH"): ← and system Back go back one level, ✕ at the end closes
every card back to the search. Close at the right still goes back one
level on the web and the iPhone. Only the emergency assistant is full
screen, its close where the platform's full-screen page keeps it.

## Amended 2026-11-10 (stock as is)

The owner, 2026-11-10: rules made for hand-built parts do not bind a
stock one. On the iPhone a page pushed inside a card now goes back with
the system's Back button and edge swipe (the hidden-chevron close,
`closesBack`, is deleted); the close at the right stays on the cards and
sheets over the map. A card opened from the search closes back to the
search with what was typed, as Apple Maps' card does.
