//! wingtip-flight: the flight's own rules, one step above wingtip-core
//! (engine/README.md) and using nothing: the wind triangle, 91.159's
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

pub mod flight;
pub mod performance;
