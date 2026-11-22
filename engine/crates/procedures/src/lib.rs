//! wingtip-procedures: the four pilot pages' figures, over wingtip-core only
//! (engine/README.md). Its `figures::words` are the numbers written as
//! the web writes them, which most crates above it share.
//!
//! - figures: the debrief of a flown track (ACS PA.VI.A), the diversion
//!   drill (PA.VI.C), a hold's entry and wind (AIM 5-3-8) and lost
//!   communications' altitudes (14 CFR 91.185), with their words.
//! - legs: how far a coded leg with no end of its own is drawn, and the
//!   course reversal flown where a procedure's path turns back (AIM 5-4-9).
//! - missed: which of an approach's coded legs are its missed approach,
//!   and where the route is suspended at its missed approach point (AIM 5-4-21).
//! - occurrence: whether an accident or incident report, the FAA's
//!   registry and an ADS-B track are one airplane at one time and place
//!   (the Studio's crash drafts, docs/STUDIO-PIPELINE.md).
//! - track_start: whether a recorded ADS-B track starts at its takeoff
//!   from the nearest field (AC 90-66C's departure, the traffic card's
//!   "left from").

pub mod figures;
pub mod legs;
pub mod missed;
pub mod occurrence;
pub mod paths;
pub mod track_start;

// The modules below this crate by the names they had when the engine was
// one crate, so the code reads them as crate::json and so on.
use wingtip_core::{geo, json, sort, text};
use wingtip_flight::flight;
