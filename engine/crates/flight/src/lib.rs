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
//! - ident: a field's FAA ident and the ICAO names it may be filed under
//!   (FAA JO 7350.9GG 4-1), re-exported from field;
//! - limits: the altitudes a flight may be planned at (71.33, 91.119(c),
//!   91.121, 91.159, 91.179);
//! - typed: a cruise altitude as a pilot types it, read to feet (1.1's
//!   three figures of a flight level, feet), with why where it is not;
//! - filing: FAA Form 7233-4's items as AIM Appendix 4 writes them;
//! - route_read: a route typed as item 15's words, read back (DCT, the
//!   speed and level groups);
//! - sun: night and civil twilight (14 CFR 1.1), NOAA's solar calculation,
//!   and 61.57(b)'s night-passenger period; sun_times: a day's sunrise,
//!   sunset and civil twilight as times, and the periods read from them;
//! - vfr: 91.155's basic VFR weather minimums, and 91.155(b)(2)'s night
//!   pattern exception in Class G;
//! - special_vfr: 91.157's special VFR, and the airports of part 91
//!   appendix D, section 3 where an airplane may not fly it
//!   (special_vfr_airports);
//! - fuel_weight: a gallon of avgas or Jet A in pounds, the FAA's
//!   standard weights;
//! - based: where an airplane is usually based, from its past flights;
//! - jurisdiction: whose rules a point is under, the United States' or
//!   another country's (14 CFR 91.1, 91.703; decision 0053), from Natural
//!   Earth's outlines in data/borders.txt; jurisdiction_call asks it by name;
//! - adiz: the Air Defense Identification Zones a route meets (14 CFR
//!   99.41-99.49), each as part 99 draws it; adiz_call asks it by name;
//! - calls: these rules asked by name.

pub mod adiz;
pub mod adiz_call;
#[cfg(test)]
mod adiz_tests;
pub mod based;
pub mod calls;
pub mod field;
pub mod field_calls;
pub mod filing;
pub mod flight;
pub mod fuel_weight;
pub mod ident;
pub mod jurisdiction;
pub mod jurisdiction_call;
#[cfg(test)]
mod jurisdiction_tests;
pub mod limits;
pub mod performance;
pub mod route_read;
pub mod special_vfr;
pub mod special_vfr_airports;
pub mod sun;
pub mod sun_times;
pub mod typed;
pub mod vfr;
