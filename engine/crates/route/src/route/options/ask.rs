//! Route options' input as the planner sends it (wingtip.route_options):
//! the route, the airplane, and what the planner read for the grid -- the
//! ground and the shores at the cells' samples, the weather, the
//! advisories, the airspace, the winds aloft, the fields with fuel and
//! the fixes round the route. A source the planner could not read comes
//! as null, and the answer says it was not checked.

use super::grid::Area;
use crate::json::Value;
use wingtip_core::grid::Point;

/// The still-air speed the ways are costed at with no airplane (Profile).
pub const REFERENCE_TAS_KT: f64 = 100.0;

pub struct End {
    pub ident: String,
    pub at: Point,
}

/// The airplane, or none picked (`airplane` false): the ways are then the
/// route's own, costed in still air at REFERENCE_TAS_KT (which only orders
/// them and times the weather window), with no minutes, fuel or fuel
/// stops (the owner, 2026-11-09: "If no airplane is entered, only show
/// the distance and the things you can without airplane profile").
pub struct Profile {
    pub airplane: bool,
    pub tas_kt: f64,
    pub burn_gph: f64,
    /// None where not known: no figure is assumed (the owner, 2026-11-09).
    pub usable_gal: Option<f64>,
    pub taxi_gal: Option<f64>,
    pub ceiling_ft: Option<f64>,
}

/// A field's weather: a TAF's worst over the flight with every group's
/// weather in it, or a METAR.
pub struct Report {
    pub ident: String,
    pub lat: f64,
    pub lon: f64,
    pub wx: Vec<String>,
    pub ceiling_ft: Option<f64>,
    pub visibility_sm: Option<f64>,
    pub ceiling_unknown: bool,
}

/// A SIGMET or a G-AIRMET, as the AWC sends it.
pub struct Advisory {
    pub hazard: String,
    pub area: Area,
    pub points: usize,
    pub altitude_low_ft: Option<f64>,
    pub valid_from: Option<f64>,
    pub valid_to: Option<f64>,
    /// A G-AIRMET's snapshot time.
    pub valid: Option<f64>,
    pub raw: String,
}

/// A special-use airspace or a TFR.
pub struct Airspace {
    pub kind: String,
    pub name: String,
    pub area: Area,
}

pub struct Station {
    pub lat: f64,
    pub lon: f64,
    /// (from, kt) at each of the frame's cruising altitudes, None where
    /// the station gives none.
    pub winds: Vec<Option<(f64, f64)>>,
}

#[derive(Clone)]
pub struct Field {
    pub ident: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub runway_ft: f64,
    /// Somewhere to eat there; None where it was not read yet.
    pub food: Option<bool>,
}

#[derive(Clone)]
pub struct Fix {
    pub ident: String,
    pub lat: f64,
    pub lon: f64,
    pub navaid: bool,
    pub vfr: bool,
    pub kind: String,
    pub mag_var: Option<f64>,
}

pub struct Ask {
    pub dep: End,
    pub dest: End,
    pub profile: Profile,
    pub depart_s: f64,
    pub now_s: f64,
    pub min_ceiling_ft: Option<f64>,
    pub min_visibility_sm: Option<f64>,
    pub current: Option<Vec<Point>>,
    pub current_idents: Vec<String>,
    pub current_landed: Vec<bool>,
    pub filed: Option<(Vec<Point>, Vec<String>)>,
    /// Night at either end, where the host has already judged it; None,
    /// the engine judges it (wingtip_flight::sun) over the window.
    pub night: Option<bool>,
    pub terrain_ft: Option<Vec<f64>>,
    pub water_far: Option<Vec<bool>>,
    pub tafs: Option<Vec<Report>>,
    pub metars: Option<Vec<Report>>,
    pub sigmets: Option<Vec<Advisory>>,
    pub gairmets: Option<Vec<Advisory>>,
    pub sua: Option<Vec<Airspace>>,
    pub tfrs: Option<Vec<Airspace>>,
    pub winds: Vec<Station>,
    pub fields: Option<Vec<Field>>,
    pub food: bool,
    pub fixes: Vec<Fix>,
}

mod reader;
pub use reader::*;
