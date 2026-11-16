//! wingtip-radio: what is heard on the radio, over wingtip-core,
//! wingtip-flight and wingtip-weather (engine/README.md).
//!
//! - clearance: an ATC clearance heard, read into its items (the web's
//!   lib/clearance and lib/heardCall);
//! - callsign: our call sign in a transmission and where (AIM 4-2-3 c,
//!   4-2-4), so a call to us is told from our own readback;
//! - instruction: an instruction heard in flight read into its items in
//!   the order said: altitude, heading, direct, hold, frequency, code,
//!   altimeter, approach, runway;
//! - readback: the pilot's readback checked against what was cleared
//!   (AIM 4-4-7 b);
//! - atc: the ATC copilot's rules, `atc_call` and `readback_check`;
//! - atis: an ATIS or AWOS/ASOS broadcast as the phone heard it, read
//!   into its figures;
//! - datis: a digital ATIS as the tower's data link sends it, read into
//!   the same figures (its weather by wingtip-weather's METAR reader);
//! - datis_remarks: a D-ATIS's remarks as the airport card lists them,
//!   an item a sentence in the FAA's words, like runways folded into one;
//! - mayday: the distress call in AIM 6-3-2's order, the code (6-2-2) and
//!   the frequencies to call on;
//! - guidance: what to do in an emergency with no airplane picked, the
//!   AIM's and the Airplane Flying Handbook's general good practice.

pub mod atc;
pub mod atis;
pub mod calls;
pub mod callsign;
pub mod clearance;
pub mod datis;
pub mod datis_remarks;
pub mod guidance;
pub mod instruction;
pub mod mayday;
pub mod readback;

// The modules below this crate by the names they had when the engine was
// one crate, so the code reads them as crate::json.
use wingtip_core::{json, text};
