//! Runways, the wind on them and the traffic pattern, one copy for the web
//! app (callEngine), the planner (wingtip_native.call) and the phones
//! (the generated `call`), so none states a rule of its own:
//!
//! - `wind`: a wind along and across a runway, the gust's crosswind, calm,
//!   the end each runway's reported wind favours, and the end picked into
//!   a wind the field did not report (web lib/wind, lib/pattern windPick,
//!   wingtip.runway_wind);
//! - `pick`: the runway end flown -- the pilot's pick, else the one most
//!   nearly into the wind (AC 90-66C 11.5), else the most used -- and its
//!   pattern's side (14 CFR 91.126(b)(1)), entry (AC 90-66C 11.3), exit
//!   (11.8) and altitude (web lib/pattern, wingtip.pattern);
//! - `performance`: pressure and density altitude, a POH's short-field
//!   distances and how an end suits the airplane (web lib/takeoffLanding,
//!   lib/runwayFit), which the Brief's runway check goes by too
//!   (crate::gonogo::runways);
//! - `fit`: how well an end fits today, one finding and its reason for
//!   FPL's runway chips and the Brief's runway check alike;
//! - `circuit`: the pattern's legs and its 45° entry, and the way out of
//!   a field (web lib/trafficPattern, wingtip.pattern's circuits);
//! - `landing`: the runway landed on with an instrument approach, its own
//!   straight in, another only by circling (AIM 5-4-20);
//! - `marks`: the wind as the map marks a field: its least crosswind, its
//!   arrow and its station model's barb;
//! - `proximity`: own ship against the field's runways and hot spots on
//!   the ground and below the pattern, the runway proximity advisor (AC
//!   120-74B, AIM 2-3-5, AC 150/5300-13B's holding positions), which
//!   wingtip-wording words as `runway_proximity`;
//! - `calls`: the rules by name, as crate::call lists them.
//!
//! Where the web's TypeScript and the planner's Python had drifted apart,
//! the web's rule was taken unless it was plainly wrong (the coordinator's
//! decision, 3 Nov 2026); the data they are fed from -- NASR's flags, the
//! FAA's published pattern altitudes, the field's magnetic variation --
//! stays each host's to read.

pub mod calls;
pub mod circuit;
#[cfg(test)]
mod crosswind_tests;
pub mod fit;
pub mod landing;
pub mod marks;
pub mod performance;
pub mod pick;
pub mod proximity;
pub mod wind;
