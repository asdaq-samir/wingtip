//! wingtip-brief: the Brief's Go / No-Go and the runways it checks, over
//! wingtip-core and wingtip-procedures (engine/README.md). One crate because
//! the two lean on each other: the Go / No-Go's runway check goes by the
//! runway pick, and the runway rules by name read their input as the Go /
//! No-Go's do.
//!
//! - airport_use: who may use a field (public, private, military, joint)
//!   and how far its data is to be trusted, in the words every app shows;
//! - alternates: the IFR alternate, 14 CFR 91.169 -- whether the
//!   destination needs one and whether a field will do as one;
//! - fields: the best fields to land at from where the airplane is,
//!   ranked with their reasons -- within a glide with the engine stopped,
//!   or for a diversion (the emergency assistant, the in-flight copilot);
//! - icing_forecast: the icing the AWC forecasts on each leg of an IFR
//!   route at the altitude flown (#216);
//! - gonogo: the Brief's Go / No-Go -- its seven findings and the line
//!   over them, the pilot's minimums, icing under IFR, the risk
//!   assessment, the runway check, the weight and balance and the pass
//!   times (the web's lib/verdict and the modules it is fed from);
//! - runway: runways, the wind on them and the traffic pattern -- the end
//!   flown, its pattern's side, entry, altitude and legs, a POH's
//!   short-field distances and how an end suits the airplane.

pub mod airport_use;
pub mod alternates;
pub mod fields;
pub mod gonogo;
pub mod icing_forecast;
pub mod passengers;
pub mod runway;

// The modules below this crate by the names they had when the engine was
// one crate, so the code reads them as crate::json and so on.
use wingtip_core::{geo, json};
use wingtip_flight::flight;
use wingtip_procedures::figures;
