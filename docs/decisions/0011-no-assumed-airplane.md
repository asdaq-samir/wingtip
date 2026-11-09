# 0011. With no airplane picked, never assume one

- **Date:** 2026-11-08
- **Status:** Accepted

## Context

The plan silently flew a Cessna 172 at 40 gallons usable while the chip read N-_____, and its figures could be read as the pilot's own.

## Decision

"If no airplane is entered, only show the distance and the things you can without airplane profile, don't assume." The default is no airplane. Without one the strip shows To and Dist, and the nav log shows each leg's magnetic course instead of a wind-corrected heading.

## Consequences

Any figure that needs an airplane (time, fuel, groundspeed, weight and balance) is left out until one is chosen. No default aircraft profile in the preferences.

## Source

The owner, 2026-11-08 (commit e59d5324; the FPL audit's A14).
