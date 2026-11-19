//! A flown instrument approach debriefed against the procedure it flew,
//! at the owner's ask (2026-10-30, the plan to teach flying approaches):
//! which of the field's approaches the track flew, found by its final --
//! through the final approach fix inbound and down the final course --
//! then fix by fix how far off the coded course it was and for how long
//! past full-scale deflection, how high it crossed each fix against the
//! altitude published there, how far above or below the glidepath it came
//! down where one is published, how low before the missed approach point,
//! and when the missed approach began or where it landed.
//!
//! The procedure is the FAA's CIFP as the planner draws it
//! (wingtip.procedures.procedure_drawing): its lines, its fixes with their
//! roles and crossing altitudes, and its placed glidepath (runway_path).
//! The track is GPS's (a GPX or KML file, or a followed airplane's ADS-B
//! reports), so its altitude is not the altimeter's and its course is a
//! ground track: what is measured here is close to what an instructor
//! sees, not the panel's needles. Measured, not judged, where no figure is
//! sure: a VOR's or an NDB's course is given in miles off and marked
//! nowhere.
//!
//! Flat over the approach (a plane through the missed approach point, as
//! the flight debrief takes each leg): within 30 nm of it the error is a
//! few feet in a mile.
//!
//! The web's lib/approachDebrief, ported line for line with its words.

use super::tags::TERPS_EARTH_FT;
use super::{Drawing, RunwayPath, FT_PER_NM};
use crate::figures::debrief::{airborne, Point};
use crate::figures::words::{alt_ft, grouped, js_num, js_round_f, to_fixed};
use crate::geo::{distance_nm, Flat};
use crate::motion::rad;
use crate::{json, sort::StableSort};

/// How near a fix the track has to come, nm off the course through it, to
/// have flown over it -- the app's own figure for "it went that way", a
/// terminal GPS's full scale (AIM 1-1-17), not a rule.
pub const PASS_NM: f64 = 1.0;
/// The mean distance off the final, nm, from the final approach fix to the
/// missed approach point, over which a track is not taken to have flown
/// that approach at all (a straight-in from somewhere else). The app's.
pub const MATCH_NM: f64 = 0.5;
/// How far over the final approach fix's altitude, ft, the track may cross
/// it and still be flying the approach rather than overflying it.
pub const MATCH_FT: f64 = 1500.0;

/// A localizer's full scale: 2.5° either side of its course (the
/// Instrument Flying Handbook, FAA-H-8083-15B, chapter 9: "a full-scale
/// deflection shows when the aircraft is 2.5° to either side of the
/// centerline"), its width set to 700 ft from full fly-left to full
/// fly-right at the threshold, transmitted from the far end of the runway
/// (AIM 1-1-9). So half of it is 350 ft at the threshold, opening at 2.5°
/// from there out.
pub const LOCALIZER_DEG: f64 = 2.5;
pub const LOCALIZER_THRESHOLD_FT: f64 = 350.0;
/// A GPS's full scale, nm either side (AIM 1-1-17): terminal ±1 nm to 2 nm
/// before the final approach waypoint, from there narrowing smoothly to
/// the approach's ±0.3 nm at it, and ±0.3 nm down the final. An LPV's is
/// angular and narrower near the runway (AIM 1-1-18): LNAV's is used for
/// every RNAV (GPS) final, the wider of the two.
pub const GPS_TERMINAL_NM: f64 = 1.0;
pub const GPS_APPROACH_NM: f64 = 0.3;
pub const GPS_RAMP_NM: f64 = 2.0;
/// A glide slope's full scale: its beam is 1.4° thick (AIM 1-1-9; FAA-H-
/// 8083-15B chapter 9), 0.7° either side of the path, from its antenna 750
/// to 1,250 ft down the runway (AIM 1-1-9): 1,000 ft taken here.
pub const GLIDESLOPE_DEG: f64 = 0.7;
pub const GLIDESLOPE_ANTENNA_FT: f64 = 1000.0;
/// The mean distance off a glidepath, ft, within which the track is
/// taken to have come down it: two approaches down one final are told
/// apart by it. The app's.
const GLIDEPATH_FIT_FT: f64 = 150.0;
/// A climb of this much from the lowest point after the final approach
/// fix is the missed approach begun, its start that lowest point. The
/// app's: GPS altitude wanders tens of feet.
pub const CLIMB_FT: f64 = 150.0;
/// Where the track, slowed to taxiing, is taken to have landed on the
/// approach's runway: within this of its missed approach point, nm.
const LANDED_NM: f64 = 3.0;
/// Two approaches over a final approach fix within this, ms, are one time
/// down a final; and a transition's attempt is the vectors' one within
/// TRANSITION_MS of it.
const SAME_MS: f64 = 180_000.0;
const TRANSITION_MS: f64 = 120_000.0;
/// As good laterally, nm: the pick and the glidepath decide between two.
const AS_GOOD_NM: f64 = 0.05;

/// How the course is flown, by the approach's coded identifier (ARINC
/// 424-18 5.10, wingtip.procedures APPROACH_TYPES): a localizer's ("I", "L"),
/// a GPS's ("R", "P", and the circling "RNV-", "GPS-"), or another (VOR,
/// NDB, LDA, back course), whose course is measured and marked nowhere:
/// a VOR's and an NDB's full scale is an angle from a station the
/// drawing does not place.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Guidance {
    Localizer,
    Gps,
    Other,
}

impl Guidance {
    pub fn key(self) -> &'static str {
        match self {
            Guidance::Localizer => "localizer",
            Guidance::Gps => "gps",
            Guidance::Other => "other",
        }
    }
}

pub fn guidance_of(id: &str) -> Guidance {
    let b = id.as_bytes();
    let upper = |c: u8| c.is_ascii_uppercase();
    // /^(RNV|GPS)-?[A-Z]$/: a circling RNAV or GPS approach.
    if (id.starts_with("RNV") || id.starts_with("GPS")) && ((b.len() == 4 && upper(b[3])) || (b.len() == 5 && b[3] == b'-' && upper(b[4])))
    {
        return Guidance::Gps;
    }
    // /^([A-Z])\d\d[LCR]?(-?[A-Z])?$/: the kind, the runway, a letter.
    let kind = (|| {
        if b.len() < 3 || !upper(b[0]) || !b[1].is_ascii_digit() || !b[2].is_ascii_digit() {
            return None;
        }
        let mut rest = &b[3..];
        let tail_ok = |t: &[u8]| t.is_empty() || (t.len() == 1 && upper(t[0])) || (t.len() == 2 && t[0] == b'-' && upper(t[1]));
        if tail_ok(rest) {
            return Some(b[0]);
        }
        if matches!(rest.first(), Some(b'L' | b'C' | b'R')) {
            rest = &rest[1..];
            if tail_ok(rest) {
                return Some(b[0]);
            }
        }
        None
    })();
    match kind {
        Some(b'I' | b'L') => Guidance::Localizer,
        Some(b'R' | b'P') => Guidance::Gps,
        _ => Guidance::Other,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Tone {
    Stop,
    Caution,
    Ok,
    Info,
}

impl Tone {
    pub fn key(self) -> &'static str {
        match self {
            Tone::Stop => "stop",
            Tone::Caution => "caution",
            Tone::Ok => "ok",
            Tone::Info => "info",
        }
    }

    pub fn read(s: &str) -> Option<Tone> {
        Some(match s {
            "stop" => Tone::Stop,
            "caution" => Tone::Caution,
            "ok" => Tone::Ok,
            "info" => Tone::Info,
            _ => return None,
        })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Finding {
    pub tone: Tone,
    pub text: String,
    /// The minimums' finding, put in again as the pilot types theirs.
    pub minimums: bool,
}

fn finding(tone: Tone, text: String) -> Finding {
    Finding { tone, text, minimums: false }
}

/// Stop first, then caution, ok and info, each kind in the order found.
fn ordered(mut findings: Vec<Finding>) -> Vec<Finding> {
    findings.stable_sort_by_key(|f| f.tone);
    findings
}

#[derive(Clone, Debug, PartialEq)]
pub struct FixCrossing {
    pub ident: String,
    pub roles: Vec<String>,
    pub min_ft: Option<f64>,
    pub max_ft: Option<f64>,
    /// When it was crossed (ms), and how high (ft, GPS).
    pub t: f64,
    pub alt_ft: Option<f64>,
    /// Its furthest under its minimum on the way to it, ft (+ under).
    pub under_ft: Option<f64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Landed,
    Missed,
    Unknown,
}

impl Outcome {
    pub fn key(self) -> &'static str {
        match self {
            Outcome::Landed => "landed",
            Outcome::Missed => "missed",
            Outcome::Unknown => "unknown",
        }
    }

    pub fn read(s: &str) -> Option<Outcome> {
        Some(match s {
            "landed" => Outcome::Landed,
            "missed" => Outcome::Missed,
            "unknown" => Outcome::Unknown,
            _ => return None,
        })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct PlanFix {
    pub ident: String,
    pub lat: f64,
    pub lon: f64,
    pub roles: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ProfileFix {
    pub ident: String,
    pub to_go_nm: f64,
    pub min_ft: Option<f64>,
    pub max_ft: Option<f64>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ProfileGlidepath {
    pub from_nm: f64,
    pub from_ft: f64,
    pub to_nm: f64,
    pub to_ft: f64,
}

/// One attempt at an approach debriefed.
#[derive(Clone, Debug, PartialEq)]
pub struct Debrief {
    pub airport: String,
    pub id: String,
    pub name: String,
    pub transition: Option<String>,
    pub guidance: Guidance,
    /// When the track crossed the final approach fix inbound, ms.
    pub faf_at: f64,
    /// How far off the final it flew on average, nm; and off the
    /// glidepath, ft, where there is one and altitudes to say.
    pub fit_nm: f64,
    pub glidepath_fit_ft: Option<f64>,
    /// The fixes passed, in order, the missed approach's left out.
    pub crossings: Vec<FixCrossing>,
    pub findings: Vec<Finding>,
    /// The plate's plan view: the way in, the missed approach's lines, the
    /// fixes, and the track over it, each point off where it was past full
    /// scale or under a minimum.
    pub plan_inbound: Vec<(f64, f64)>,
    pub plan_missed: Vec<Vec<(f64, f64)>>,
    pub plan_fixes: Vec<PlanFix>,
    pub plan_track: Vec<(f64, f64, bool)>,
    /// The profile: the track's altitude by its distance to the missed
    /// approach point along the procedure (to go, ft, off), the fixes'
    /// minimums there, and the glidepath from the final approach fix to
    /// the runway.
    pub profile_track: Vec<(f64, f64, bool)>,
    pub profile_fixes: Vec<ProfileFix>,
    pub profile_glidepath: Option<ProfileGlidepath>,
    pub outcome: Outcome,
    pub seconds_after_map: Option<f64>,
    /// The way in's fixes before the final approach fix, and how many of
    /// them the track passed: all, where it came in by the transition.
    pub way_in_fixes: usize,
    pub way_in_passed: usize,
    pub has_altitude: bool,
    /// The lowest the track came after the final approach fix, before the
    /// missed approach point (or the climb, or the landing), ft.
    pub lowest_ft: Option<f64>,
    /// Approaches whose final the track fitted as well, by name.
    pub also_fits: Vec<String>,
}

/// An attempt at the approach: the point the track crossed the final
/// approach fix inbound from, and the points from and to which it is
/// this attempt's.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Attempt {
    pub faf: usize,
    pub from: usize,
    pub to: usize,
}

mod path;
pub use path::*;
mod locate;
use locate::*;
mod course;
use course::*;
mod altitudes;
use altitudes::*;
mod glidepath;
use glidepath::*;
mod outcome;
use outcome::*;
mod run;
pub use run::*;
mod tail;
pub use tail::*;
mod write;
pub use write::*;
