//! wingtip-wording: the FAA's own words in the app's, over wingtip-core,
//! wingtip-procedures and wingtip-airspace (engine/README.md).
//!
//! - wording: the FAA's capitals in sentence case, names, the advisories'
//!   intensities, a field's radio and fuel, a VOR's radial, Morse and
//!   service volume, and the radio calls for a route (over wingtip-brief's
//!   runway words and wingtip-route's descent).

pub mod wording;

// The modules below this crate by the names they had when the engine was
// one crate, so the code reads them as crate::json and so on.
use wingtip_airspace::rules;
use wingtip_procedures::figures;
use wingtip_core::{geo, json};
