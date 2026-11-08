//! wingtip-route: the route and what flies it, over wingtip-core,
//! wingtip-flight and wingtip-procedures (engine/README.md).
//!
//! - route: the route's pilot-made pieces as the address writes them
//!   and the planner reads them -- the pilot's own point off a fix, holds,
//!   procedures and runways picked;
//! - motion: the things that move -- traffic about own ship, a watched
//!   airplane's alerts, the glide range, the plan's profile and its dry
//!   run, a flown track read from its file;
//! - approach: instrument approaches taught (the brief, the coached dry
//!   run, the quiz) and debriefed against the procedure flown;
//! - navlog: the nav log -- each leg's wind triangle, headings, time and
//!   fuel in the airplane's own air, the climbs and descents, the four
//!   altitude plans, the fuel plan and the holds flown (#482 phase 4).

pub mod approach;
pub mod motion;
pub mod navlog;
pub mod route;

// The modules below this crate by the names they had when the engine was
// one crate, so the code reads them as crate::json and so on.
use wingtip_procedures::figures;
use wingtip_core::{geo, json, time, xml};
