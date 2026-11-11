//! wingtip-weather: the weather and NOTAM products, over wingtip-core
//! only (engine/README.md).
//!
//! - metar, taf, winds, notam, tfr: the products as sent, read strictly;
//! - forecast: a field's flight category from what is known of its
//!   ceiling and visibility, and an hour of its TAF from the groups then;
//! - validity: when a weather report stops counting;
//! - notam_read: a NOTAM as a pilot reads it -- its keyword as a heading,
//!   its words written out (contractions: the FAA's contractions, the one
//!   table, which the radio's D-ATIS reads by too) and its window in UTC;
//! - notam_rank: which of a flight's NOTAMs matter to it, best first
//!   (14 CFR 91.103);
//! - rvr: runway visual range against a visibility minimum (91.175(h));
//! - cycles: when an FAA data set's edition stops counting (AIRAC,
//!   the 56-day charts, the obstacle file);
//! - ready: ready to fly -- whether the device holds the charts, the
//!   cycle packs, the weather and the NOTAMs the flight needs, and what to
//!   fix while there is still a signal;
//! - worse: what counts as a route's weather getting worse between two
//!   readings of its briefing (AIM 7-1-6, 7-1-7).

pub mod contractions;
pub mod cycles;
pub mod forecast;
pub mod metar;
pub mod notam;
pub mod notam_rank;
pub mod notam_read;
pub mod ready;
pub mod rvr;
pub mod sky;
pub mod taf;
pub mod tfr;
pub mod validity;
pub mod winds;
pub mod worse;

// The modules below this crate by the names they had when the engine was
// one crate, so the code reads them as crate::json and so on.
use wingtip_core::{geo, json, sort, time, xml};
