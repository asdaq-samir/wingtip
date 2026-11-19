# 0011. With no airplane picked, never assume one

- **Date:** 2026-11-08
- **Status:** Accepted

## Context

The plan silently flew a Cessna 172 at 40 gallons usable while the chip read N-_____, and its figures could be read as the pilot's own.

## Decision

"If no airplane is entered, only show the distance and the things you can without airplane profile, don't assume." The default is no airplane. Without one the strip shows To and Dist, with ETE and Fuel kept as dashes that open the airplane's picker (2026-11-17), and the nav log shows each leg's magnetic course instead of a wind-corrected heading.

## Consequences

Any figure that needs an airplane (time, fuel, groundspeed, weight and balance) is left out, or shown as a dash, until one is chosen. The one place that asks for an airplane is the N-number field, which the strip's dashes open (2026-11-17, the UI audit's C2 and C3). No default aircraft profile in the preferences.

## Source

The owner, 2026-11-08 (commit e59d5324; the FPL audit's A14).
