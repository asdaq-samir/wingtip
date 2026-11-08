//! The altitude a flight is planned at, moved here from the planner's
//! wingtip.altitude, wingtip.terrain, wingtip.ifr, wingtip.sua and
//! app.planning (#482 phase 3), so the planner, the web and the phones ask
//! one rule by name:
//!
//! - cruising: the cruising altitudes by course, VFR's (14 CFR 91.159,
//!   every 500 ft within 3,000 ft of the ground, under Class A) and IFR's
//!   (91.179(b), FAA Order JO 7110.65 TBL 4-5-1), the tight one under a
//!   shelf, and the altitude wheel's rows;
//! - clouds: 91.155's distance under a cloud base, and each leg's lowest
//!   forecast base from the TAFs near it;
//! - congested: whether a point is over a congested area, or within
//!   91.119(b)'s 2,000 ft of one, from the towns the planner reads;
//! - floor: the terrain and obstacle floor of each leg under VFR (91.119)
//!   and the minimum IFR altitude (91.177(a)), over Part 95's mountainous
//!   areas (`mountainous`);
//! - select: the band of each leg -- the floor up to the lowest of the
//!   Class B shelf, the clouds and the service ceiling, nothing in
//!   prohibited airspace -- and the recommendation;
//! - words: the altitude flown where none is legal (the owner's "warn,
//!   never limit") and why none is, in a pilot's words;
//! - calls: the names crate::call answers them by.
//!
//! The owner's four plans (2026-09-30) are built on these bands: lowest
//! and highest are the band's bottom and top, fastest the winds', and
//! economical the fuel's (the nav log's, #482 phase 4).

pub mod calls;
pub mod clouds;
pub mod congested;
pub mod cruising;
pub mod floor;
pub mod mountainous;
pub mod select;
pub mod track;
pub mod words;

/// Python's round(x, 1) as the planner wrote its figures, to a tenth.
pub(crate) fn tenth(x: f64) -> f64 {
    (x * 10.0).round_ties_even() / 10.0
}
