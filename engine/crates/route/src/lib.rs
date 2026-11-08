//! wingtip-route: the route and what flies it, over wingtip-core,
//! wingtip-flight, wingtip-weather and wingtip-procedures (engine/README.md).
//!
//! - route: the route's pilot-made pieces as the address writes them
//!   and the planner reads them -- the pilot's own point off a fix, holds,
//!   procedures and runways picked -- and the ways to fly it (options:
//!   route options, fuel stops, the way round high ground, Class B
//!   detours);
//! - motion: the things that move -- traffic about own ship, a watched
//!   airplane's alerts, the glide range, the plan's profile and its dry
//!   run, a flown track read from its file;
//! - approach: instrument approaches taught (the brief, the coached dry
//!   run, the quiz) and debriefed against the procedure flown.

pub mod approach;
pub mod motion;
pub mod route;

// The modules below this crate by the names they had when the engine was
// one crate, so the code reads them as crate::json and so on.
use wingtip_procedures::figures;
use wingtip_core::{geo, json, time, xml};
