# 0018. Panels are Liquid Glass sheets with detents; a throw moves one size

- **Date:** 2026-10-15
- **Status:** Accepted

## Context

The sheet should feel like Apple Maps, without a spring and without jumping from the pill to full.

## Decision

Panels are Liquid Glass sheets with detents (pill, half, full), as in Apple Maps. No spring: ease-out, 0.3 s for a pill-to-half move, with speed changed through the constants, not the curve. A throw moves one size: never pill to full or full to pill in one flick, though a finger dragging past half may carry it on. Panel fields share one glass fill and tinted glass buttons; glass glyphs are black.

## Consequences

Motion is transform only, with one shape at every size and no backdrop change mid-motion.

## Source

The owner, 2026-10-15 ("The pill should not go straight to full"), 2026-10-20, 2026-10-22 and 2026-10-23.
