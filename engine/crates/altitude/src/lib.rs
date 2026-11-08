//! wingtip-altitude: the altitude a flight is planned at (#482 phase 3),
//! over wingtip-core, wingtip-flight (91.159's altitudes) and
//! wingtip-procedures (a figure in the pages' words) (engine/README.md).
//! The planner reads the ground, the obstacles, the airspace and the
//! weather and passes them in; nothing here fetches.
//!
//! - altitude: the floor, the band, the cruising altitudes, the selection
//!   and the words where no altitude fits.

pub mod altitude;

// The modules below this crate by the names they had when the engine was
// one crate, so the code reads them as crate::json and so on.
use wingtip_core::{geo, json};
use wingtip_flight::flight;
use wingtip_procedures::figures;
