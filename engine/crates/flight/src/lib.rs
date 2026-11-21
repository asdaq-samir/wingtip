//! wingtip-flight: the flight's own rules, one step above wingtip-core
//! (engine/README.md) and using only it: the wind triangle, 91.159's
//! cruising altitudes, 91.151's reserve and the atmosphere. A crate of
//! its own, under wingtip-procedures and wingtip-brief, because both use
//! it (the diversion's triangle and the fuel strip's reserve, the runway
//! performance's density altitude), so it cannot sit in either.
//!
//! - flight: the wind triangle, 91.159's altitudes, 91.151's reserve, the
//!   atmosphere;
//! - performance: a light piston airplane in the day's air -- its cruise
//!   at an altitude and its climbs (moved here from the planner, #482
//!   phase 4).
//! - field: whether a field is open, from NASR's ARPT_STATUS (the owner's
//!   hard rule: a closed field is never shown or offered as open);
//! - limits: the altitudes a flight may be planned at (71.33, 91.119(c),
//!   91.121, 91.159, 91.179);
//! - typed: a cruise altitude as a pilot types it, read to feet (1.1's
//!   three figures of a flight level, feet), with why where it is not;
//! - filing: FAA Form 7233-4's items as AIM Appendix 4 writes them;
//! - route_read: a route typed as item 15's words, read back (DCT, the
//!   speed and level groups);
//! - sun: night and civil twilight (14 CFR 1.1), NOAA's solar calculation,
//!   and 61.57(b)'s night-passenger period;
//! - vfr: 91.155's basic VFR weather minimums;
//! - based: where an airplane is usually based, from its past flights;
//! - jurisdiction: whose rules a point is under, the United States' or
//!   another country's (14 CFR 91.1, 91.703; decision 0053), from Natural
//!   Earth's outlines in data/borders.txt; jurisdiction_call asks it by name;
//! - calls: these rules asked by name.

pub mod based;
pub mod calls;
pub mod field;
pub mod filing;
pub mod flight;
pub mod jurisdiction;
pub mod jurisdiction_call;
#[cfg(test)]
mod jurisdiction_tests;
pub mod limits;
pub mod performance;
pub mod route_read;
pub mod sun;
pub mod typed;
pub mod vfr;
