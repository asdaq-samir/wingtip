//! The best fields to land at from where the airplane is, ranked with
//! their reasons: the emergency assistant's (an engine stopped: the fields
//! within a glide) and the in-flight copilot's best alternative (a
//! diversion with the engine running), one rule with a `mode` for each.
//!
//! Composed of the rules already here: the glide (procedures'
//! figures::glide, the map's ring's sum, with the airplane's own
//! best-glide figures and the wind aloft), each runway end against the
//! airplane (runway::performance's end_fit: the POH's short-field landing
//! distance in the field's air and the demonstrated crosswind) and the
//! wind on it (runway::wind), and the wind triangle (flight's).
//!
//! - `reach`: what decides an emergency is whether the airplane gets there
//!   at all (FAA-H-8083-3C, the Emergency Procedures chapter: pick a field
//!   within gliding distance, at best glide), so in "glide" mode the fields
//!   are tiered by reach first -- over the field at pattern height (AC
//!   90-66C's 1,000 ft), reachable but lower, then beyond -- and only then
//!   by the runway and the distance. In "diversion" mode every field is
//!   reachable and the runway, the weather and the time decide.
//! - A field NASR lists as closed (its `status` not ARPT_STATUS O,
//!   wingtip_flight::field) is never ranked or offered as a landing site,
//!   in either mode: it is left out (the owner's hard rule, decision 0043).
//!   No candidate's status is refused for being missing: the host's own
//!   list then decides, as it did.
//! - Nothing else is refused (the owner's "warn, never limit"): a private or a
//!   military field, a runway shorter than the POH's distance, a crosswind
//!   past the demonstrated one, a field in IFR stay in the list with the
//!   reason said, ranked lower.
//! - With no airplane's glide figures the glide is not guessed: the fields
//!   are ranked by distance alone and the answer says the glide needs an
//!   airplane (`needs_airplane`).

pub mod calls;
mod rank;
mod reasons;

use crate::figures::glide::Glide;
use crate::runway::performance::{EndFit, FieldReport, FitWind, ShortField};
use crate::runway::pick::Runway;

pub use calls::call;
pub use rank::best_fields;

/// What the fields are ranked for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    /// The engine has stopped: what the airplane can glide to.
    Glide,
    /// The engine runs: where to divert to.
    Diversion,
}

/// A wind, true, knots.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Wind {
    pub from_deg: f64,
    pub kt: f64,
}

/// The airplane's figures the ranking uses, each None where its profile
/// has none.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Airplane {
    pub glide: Option<Glide>,
    /// The POH's short-field landing table.
    pub landing: Option<ShortField>,
    pub demonstrated_crosswind_kt: Option<f64>,
    /// For a diversion's heading and time.
    pub cruise_tas_kt: Option<f64>,
}

/// Where the airplane is and how it is going.
#[derive(Clone, Debug, PartialEq)]
pub struct Own {
    pub lat: f64,
    pub lon: f64,
    /// GPS altitude, feet MSL.
    pub altitude_ft: Option<f64>,
    pub speed_kt: Option<f64>,
    /// The wind at the airplane's altitude, where it is known.
    pub wind: Option<Wind>,
    /// Magnetic variation there, east positive, for the headings.
    pub variation_deg: Option<f64>,
}

/// A candidate field as the host found it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Field {
    pub ident: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub elevation_ft: Option<f64>,
    pub runways: Vec<Runway>,
    /// Its METAR's wind, altimeter and temperature.
    pub wind: Option<FitWind>,
    pub report: FieldReport,
    pub flight_category: Option<String>,
    pub towered: bool,
    pub private: bool,
    pub military: bool,
    /// NASR APT_BASE's ARPT_STATUS, None where the host has no NASR record.
    pub status: Option<String>,
}

/// How a field is reached.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Reach {
    /// Over the field at pattern height or more.
    Within,
    /// There, but lower than pattern height.
    Low,
    /// Not known: no airplane's glide, or no altitude or elevation.
    Unknown,
    /// Short of it.
    Beyond,
}

impl Reach {
    pub fn word(self) -> &'static str {
        match self {
            Reach::Within => "within",
            Reach::Low => "low",
            Reach::Unknown => "unknown",
            Reach::Beyond => "beyond",
        }
    }
}

/// The runway end picked at a field, and how it suits the airplane.
#[derive(Clone, Debug, PartialEq)]
pub struct EndPick {
    pub runway: usize,
    pub end: String,
    pub heading_true_deg: Option<f64>,
    pub surface: Option<String>,
    /// Along the end, a tailwind negative; None with no wind reported.
    pub headwind_kt: Option<f64>,
    pub fit: EndFit,
}

/// One field ranked.
#[derive(Clone, Debug, PartialEq)]
pub struct Ranked {
    pub field: Field,
    pub distance_nm: f64,
    /// The true course to it.
    pub course_deg: f64,
    /// The heading to fly there, true and magnetic, with the wind
    /// corrected; None where the airspeed or the wind is not known.
    pub heading_true_deg: Option<f64>,
    pub heading_mag_deg: Option<f64>,
    pub groundspeed_kt: Option<f64>,
    pub ete_min: Option<f64>,
    pub reach: Reach,
    /// How far the glide goes over the ground along the course, nm.
    pub reach_nm: Option<f64>,
    /// The height over the field on arrival, ft.
    pub arrive_agl_ft: Option<f64>,
    pub end: Option<EndPick>,
    pub reasons: Vec<(&'static str, String)>,
}

/// The glide from where the airplane is, for the ring on the map.
#[derive(Clone, Debug, PartialEq)]
pub struct Ring {
    pub nm_per_1000_ft: f64,
    pub agl_ft: f64,
    pub still_air_nm: f64,
    pub tas_kt: Option<f64>,
    /// The ground reached in each direction, wind corrected, every 10°.
    pub points: Vec<(f64, f64)>,
}

/// The ranked list and the glide it was ranked by.
#[derive(Clone, Debug, PartialEq)]
pub struct Answer {
    pub mode: Mode,
    pub ring: Option<Ring>,
    pub needs_airplane: bool,
    pub fields: Vec<Ranked>,
}
