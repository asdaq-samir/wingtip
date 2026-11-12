//! The rules of the things that move on the map, one copy for the web app
//! (through the WebAssembly), the planner and the phones (wt_call):
//!
//! - traffic: another airplane's height against own ship's as TCAS writes
//!   it and whether it is near own ship's (14 CFR 91.159's spacing), which
//!   airplane is own ship's own transponder, and when and how near one
//!   comes (the web's lib/map/traffic);
//! - alerts: whether a watched airplane is in the air, and when its
//!   takes-off, lands and comes-near alerts go off (lib/aircraftAlerts);
//! - glide: the still-air glide range and a field within it
//!   (lib/map/glide);
//! - profile: the plan's altitudes as a line over the ground, from the
//!   nav log's rows (navlog/profile);
//! - dry_run: the planned flight flown on paper along the nav log's rows,
//!   by its procedures and holds, going missed when asked
//!   (navlog/dryRun);
//! - track: a flown track read from a GPX or KML file, and thinned for
//!   keeping (lib/track);
//! - replay: a recorded flight made ready to replay -- its gaps, its
//!   height smoothed, its vertical speed (features/replay);
//! - along: where a real airplane is along the route, whether it is on
//!   it, and the fuel the plan has burnt by there (the phones' strips);
//! - instruments: a flight under way against its route -- the next
//!   waypoint and the destination, the desired track, the fuel left --
//!   with the vertical speed and the glide ring (#218);
//! - diagram: own ship on the FAA's airport diagram, by its own latitude
//!   and longitude labels (#218);
//! - terrain_view: the pilot's-eye view's amber and red bands of the
//!   ground under the airplane (lib/map/gl/terrain).
//!
//! What runs every frame stays in each app -- where a replay's airplane is
//! between two reports, a report carried on along its track, the dry run's
//! figures between two of its points -- as crossing into the engine costs
//! microseconds a call, a thousand times the sum itself; the rules those
//! frames read are worked out here once a report, a route or a file. So
//! does the merging of the internet's reports with a cockpit receiver's,
//! which holds no rule and would carry every airplane across twice an
//! answer (14 ms for 554 against the web's 0.2).

pub mod alerts;
pub mod along;
pub mod diagram;
pub mod dry_run;
pub mod glide;
pub mod instruments;
pub mod profile;
pub mod replay;
pub mod terrain_view;
pub mod track;
pub mod traffic;

use crate::json::Value;

/// Degrees to radians as the web's lib/geo writes it (`deg * PI / 180`),
/// a last bit apart from Rust's to_radians, so a figure ported from it
/// comes out the same.
pub(crate) fn rad(deg: f64) -> f64 {
    deg * std::f64::consts::PI / 180.0
}

/// A member that is a number; None where it is missing or null, as the
/// web's `?? ` takes either. Anything else is an error.
pub(crate) fn opt(name: &str, v: &Value, key: &str) -> Result<Option<f64>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

pub(crate) fn num(name: &str, v: &Value, key: &str) -> Result<f64, String> {
    opt(name, v, key)?.ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

/// A member that is true or false; None where missing or null.
pub(crate) fn opt_bool(name: &str, v: &Value, key: &str) -> Result<Option<bool>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Bool(b)) => Ok(Some(*b)),
        Some(_) => Err(format!("{name}: \"{key}\" is not true or false")),
    }
}

/// Whether a member is there and not null, false or zero: the web's
/// truthiness, for an object it only asks to be there.
pub(crate) fn present(v: &Value, key: &str) -> bool {
    !matches!(v.get(key), None | Some(Value::Null) | Some(Value::Bool(false)))
}

/// The rules of this module by name, as their contract files
/// (crates/route/contract) name it to the dispatcher.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    match name {
        "traffic_marks" => traffic::marks_rule(v),
        "traffic_fresh" => traffic::fresh_rule(v),
        "own_ship_hex" => traffic::own_ship_hex_rule(v),
        "closest_approach" => traffic::closest_approach_rule(v),
        "airborne_now" => alerts::airborne_now_rule(v),
        "alert_fires" => alerts::fires_rule(v),
        "glide_range" => glide::range_rule(v),
        "glide_reaches" => glide::reaches_rule(v),
        "underway" => glide::underway_rule(v),
        "plan_profile" => profile::profile_rule(v),
        "dry_run" => dry_run::dry_run_rule(v),
        "read_track" => track::read_rule(v),
        "thin_track" => track::thin_rule(v),
        "replay_track" => replay::replay_rule(v),
        "route_position" => along::position_rule(v),
        "in_flight" => instruments::in_flight_rule(v),
        "vertical_speed" => instruments::vertical_speed_rule(v),
        "glide_ring" => instruments::glide_ring_rule(v),
        "diagram_labels" => diagram::labels_rule(v),
        "diagram_graticule" => diagram::graticule_rule(v),
        "diagram_point" => diagram::point_rule(v),
        "diagram_fix_usable" => diagram::fix_usable_rule(v),
        "terrain_view_bands" => terrain_view::bands_rule(v),
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}
