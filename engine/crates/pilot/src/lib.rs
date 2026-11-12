//! wingtip-pilot: the pilot's records and the airplanes, over wingtip-core
//! and wingtip-flight, and procedures and route for a track's logbook
//! entry (engine/README.md).
//!
//! - pilot: the pilot's records and text -- a checklist, the logbook's
//!   CSV file, a handbook page, endorsements and ACS codes;
//! - autolog: a logbook entry drawn from the app's own flown track, each
//!   figure with its reason (14 CFR 1.1, 61.1(b), 61.51, 61.57);
//! - aircraft: the traffic list's filters (an airplane's kind, height,
//!   operator, emergency, how it stands to a field) and an airplane by its
//!   N-number, on its type's stock profile;
//! - coach: a pilot's proficiency plan -- what is due and when (61.56,
//!   61.57), the weak areas their own debriefs show, and the sessions
//!   that answer them.

pub mod aircraft;
pub mod autolog;
pub mod coach;
pub mod documents;
pub mod pilot;

// The modules below this crate by the names they had when the engine was
// one crate, so the code reads them as crate::json and so on.
use wingtip_core::{geo, json, sort, text, time};
