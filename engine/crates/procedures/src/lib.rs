//! wingtip-procedures: the four pilot pages' figures, over wingtip-core only
//! (engine/README.md). Its `figures::words` are the numbers written as
//! the web writes them, which most crates above it share.
//!
//! - figures: the debrief of a flown track (ACS PA.VI.A), the diversion
//!   drill (PA.VI.C), a hold's entry and wind (AIM 5-3-8) and lost
//!   communications' altitudes (14 CFR 91.185), with their words.
//! - occurrence: whether an accident or incident report, the FAA's
//!   registry and an ADS-B track are one airplane at one time and place
//!   (the Studio's crash drafts, docs/STUDIO-PIPELINE.md).

pub mod figures;
pub mod occurrence;
pub mod paths;

// The modules below this crate by the names they had when the engine was
// one crate, so the code reads them as crate::json and so on.
use wingtip_core::{geo, json, sort};
use wingtip_flight::flight;
