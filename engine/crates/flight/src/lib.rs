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
//!   at an altitude and its climbs (the planner's wingtip.performance,
//!   #482 phase 4).
//! - field: whether a field is open, from NASR's ARPT_STATUS (the owner's
//!   hard rule: a closed field is never shown or offered as open);
//! - limits: the altitudes a flight may be planned at (71.33, 91.119(c),
//!   91.121, 91.159, 91.179);
//! - filing: FAA Form 7233-4's items as AIM Appendix 4 writes them;
//! - sun: night and civil twilight (14 CFR 1.1), NOAA's solar calculation,
//!   and 61.57(b)'s night-passenger period;
//! - vfr: 91.155's basic VFR weather minimums;
//! - calls: these rules asked by name.

pub mod calls;
pub mod field;
pub mod filing;
pub mod flight;
pub mod limits;
pub mod performance;
pub mod sun;
pub mod vfr;
