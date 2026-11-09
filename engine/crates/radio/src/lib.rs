//! wingtip-radio: what is heard on the radio, over wingtip-core,
//! wingtip-flight and wingtip-weather (engine/README.md).
//!
//! - clearance: an ATC clearance heard, read into its items, and a call
//!   to us by its call sign (the web's lib/clearance and lib/heardCall);
//! - readback: the pilot's readback of a clearance checked against it;
//! - atis: an ATIS or AWOS/ASOS broadcast as the phone heard it, read
//!   into its figures;
//! - datis: a digital ATIS as the tower's data link sends it, read into
//!   the same figures (its weather by wingtip-weather's METAR reader);
//! - mayday: the distress call in AIM 6-3-2's order, the code (6-2-2) and
//!   the frequencies to call on.

pub mod atis;
pub mod clearance;
pub mod datis;
pub mod mayday;
pub mod readback;

// The modules below this crate by the names they had when the engine was
// one crate, so the code reads them as crate::json.
use wingtip_core::json;
