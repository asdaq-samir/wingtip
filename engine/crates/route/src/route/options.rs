//! Ways to fly a route, for the pilot to pick from (was the planner's
//! wingtip.route_options): the fastest, the one in the best weather, the
//! one with the fewest stops and the one that keeps over land, each kept
//! clear of what an airplane under VFR must keep clear of, at the owner's
//! ask ("smart to reroute for fastest time along safe weather, over
//! terrain, best tailwinds, refueling and giving pilot flexibility to make
//! changes as they please", 2026-10-23).
//!
//! A grid of cells round the route (`grid`) is read once from what the
//! planner fetched (`ask`, `read`):
//!
//! - the ground: a cell closed where its highest ground with the
//!   planner's 1,000 ft (at or above 14 CFR 91.119's) and the coarse
//!   read's margin is over the highest VFR cruising altitude the airplane
//!   reaches (91.159, under its ceiling and Class A's 18,000 ft);
//! - the weather over the flight's time: a TAF's worst in the window, and
//!   a METAR for a flight leaving soon, under the pilot's minimums -- never
//!   under 91.155's basic ones -- closes the cells round its field, and one
//!   in MVFR marks them marginal;
//! - the G-AIRMETs between the fields: IFR and mountains obscured closed,
//!   low-level turbulence, icing and wind shear marginal;
//! - thunderstorms, by AIM 7-1-27's "avoid by at least 20 miles": a TAF or
//!   a METAR with TS or VCTS, and a convective SIGMET's area, close the
//!   cells within 20 nm; any other SIGMET under 18,000 ft closes its own
//!   area;
//! - prohibited areas (91.133) and the TFRs in force (91.137 to 91.145)
//!   close their cells; restricted areas, MOAs, warning and alert areas,
//!   whose times of use are not read, cost more;
//! - large water: each cell's share out of a glide's reach of dry land,
//!   dearer for the way that keeps over land;
//! - the winds aloft: the best groundspeed in each direction at the legal
//!   cruising altitudes (91.159) over the cell's ground.
//!
//! The quickest way over open cells (`ways`, in minutes) is the fastest;
//! the same with marginal cells costing more is the best weather's. Each
//! is straightened where a straight line keeps to open cells and loses no
//! more than a minute, and its turns named (`naming`). The fuel stops
//! along it (`stops`) land with the reserve (91.151) each time.
//!
//! It only suggests. A way picked is planned as any route is, its
//! altitudes, cloud clearance, airspace and fuel checked leg by leg at
//! full resolution; the coarse read here can be wrong, and the plan says
//! so where it is.
//!
//! Its frame -- where the cells and their samples are, the flight's time
//! and the cruising altitudes the winds are wanted at -- comes first
//! (`route_options_frame`), for the planner to read the ground, the shores
//! and the winds there; then the ways (`route_options`). The way round
//! high ground for a plan with no legal altitude is `terrain`'s; the fuel
//! stops a planned flight too long for its tanks needs, and the fields
//! along a route for the map's Stops, `fuel`'s; whether a leg enters
//! Class B and the fixes that take it round, `classb`'s; the route round
//! the Class B it enters, Avoid Class B, `class_b_way`'s.

mod answer;
pub mod ask;
pub mod classb;
pub mod fuel;
pub mod grid;
pub mod naming;
pub mod read;
pub mod special_use;
pub mod stops;
pub mod terrain;
pub mod ways;
pub mod words;
pub mod wrap;

use self::answer::{along_json, ints, path_json, strings, way_json};
use self::ask::{Ask, Field, Reader};
use self::grid::{Grid, CELL_DEG, PER_CELL};
use self::read::{highest_cruise_ft, LEGAL_CEILING_FT, LEGAL_VISIBILITY_SM, LOWEST_CRUISE_FT, METAR_AHEAD_S};
use self::stops::{Fuel, Stop, MARGINAL_STOP_MIN, STOP_FIELD_NM, TURNAROUND_MIN};
use self::ways::{along, crossed, line_minutes, minutes_along, straightened, way, Along};
use self::words::r1;
use crate::json::{self, Value};
use crate::{geo, sort::StableSort};
use std::cell::RefCell;
use wingtip_core::grid::Point;
use wingtip_core::wmm;
use wingtip_flight::flight;

/// The kinds of way, in the order they are offered, and their titles.
pub const KINDS: [&str; 4] = ["fastest", "weather", "stops", "land"];
fn title(kind: &str) -> &'static str {
    match kind {
        "fastest" => "Fastest",
        "weather" => "Best weather",
        "stops" => "Fewest stops",
        _ => "Over land",
    }
}
/// What a marginal cell costs more, a share of its minutes, for the best
/// weather's way.
pub const MARGINAL_COST: f64 = 1.0;
/// A straight line taken over the grid's way when it is no more than this
/// many minutes slower; more, a step at a time, for a way of more than
/// MAX_TURNS turns, which a pilot would not fly.
pub const STRAIGHTEN_STEPS_MIN: [f64; 5] = [1.0, 3.0, 6.0, 12.0, 24.0];
pub const MAX_TURNS: usize = 8;
/// Where no way keeps clear of everything -- the Rockies in an airplane
/// that cannot top them, a field under a G-AIRMET -- the way that crosses
/// least of it, a closed cell costing this many times its minutes more:
/// offered with what it crosses said, the owner's rule ("I don't want to
/// put hard limits on anything. A warning tick or a label is enough",
/// 2026-10-23).
pub const CLOSED_COST: f64 = 20.0;
/// How much dearer a cell out of glide of dry land is for the way that
/// keeps over land, a share of its own minutes: eleven times as dear, so
/// it goes round Lake Michigan from Milwaukee to Muskegon (an hour and a
/// quarter more; at four times as dear it crossed the 51 nm of water),
/// and only crosses where going round is the longer by hours (the
/// owner's ask, 2026-10-25: "for engine failure emergency, landing is
/// feasible on a dry land").
pub const WATER_COST: f64 = 10.0;

mod build;
use build::*;
mod class_b_way;
mod request;
use request::*;
mod entry;
pub use entry::*;

#[cfg(test)]
mod tests;
