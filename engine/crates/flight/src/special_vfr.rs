//! 14 CFR 91.157, special VFR, for a fixed-wing airplane (the app plans
//! airplanes; 91.157(b)(3), (4) and (c) except helicopters), and 91.155(b)(2),
//! Class G's night pattern exception (vfr.rs), each asked by name. The
//! regulation's words, eCFR current on 2026-11-21:
//!
//! - (a) "Except as provided in appendix D, section 3, of this part,
//!   special VFR operations may be conducted under the weather minimums
//!   and requirements of this section, instead of those contained in
//!   § 91.155, below 10,000 feet MSL within the airspace contained by the
//!   upward extension of the lateral boundaries of the controlled airspace
//!   designated to the surface for an airport."
//! - (b) "only (1) With an ATC clearance; (2) Clear of clouds; (3) ... when
//!   flight visibility is at least 1 statute mile; and (4) ... between
//!   sunrise and sunset (or in Alaska, when the sun is 6 degrees or less
//!   below the horizon) unless (i) The person being granted the ATC
//!   clearance meets the applicable requirements for instrument flight
//!   under part 61 ...; and (ii) The aircraft is equipped as required in
//!   § 91.205(d)."
//! - (c) "No person may take off or land an aircraft (other than a
//!   helicopter) under special VFR (1) Unless ground visibility is at least
//!   1 statute mile; or (2) If ground visibility is not reported, unless
//!   flight visibility is at least 1 statute mile."
//!
//! What a host does not know (a visibility not given, a rating not said)
//! rules nothing out: it stays among the answer's `needs`, for the pilot
//! to see to, and is never said to be met.

use crate::special_vfr_airports::{self, Listed};
use crate::vfr;
use wingtip_core::ask::Ask;
use wingtip_core::json::{self, Value};

/// 91.157(a): "below 10,000 feet MSL". Its own figure, though 91.155(a)'s
/// rows change at the same altitude, so an amendment to one cannot move
/// the other.
pub const BELOW_MSL_FT: f64 = 10_000.0;
/// 91.157(b)(3) and (c): 1 statute mile, the flight visibility in the air
/// and the ground visibility (else the flight visibility) to take off or land.
pub const VISIBILITY_SM: f64 = 1.0;
/// 91.157(b)(4): in Alaska special VFR by day is "when the sun is 6 degrees
/// or less below the horizon", not sunrise to sunset.
pub const ALASKA_SUN_BELOW_DEG: f64 = 6.0;

/// The surface areas special VFR is flown in: the controlled airspace
/// designated to the surface for an airport, a Class B, C, D or E one.
const SURFACE_CLASSES: [char; 4] = ['B', 'C', 'D', 'E'];

/// What the pilot asks special VFR of: where, how high, when, who and in
/// what, and the weather where known.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Asked {
    /// The class of the surface area the airplane is in, or None where it
    /// is in none (Class G, or controlled airspace that does not reach the
    /// surface).
    pub surface_area: Option<char>,
    /// The surface area's primary airport, FAA or ICAO ident.
    pub airport: String,
    pub altitude_ft: Option<f64>,
    /// Between sunset and sunrise; None where not known.
    pub night: Option<bool>,
    /// In Alaska, with the sun's elevation in degrees where known.
    pub alaska: bool,
    pub sun_elevation_deg: Option<f64>,
    /// 91.157(b)(4)(i): the pilot meets part 61's requirements for
    /// instrument flight (rated and current, 61.57(c)).
    pub instrument_current: Option<bool>,
    /// 91.157(b)(4)(ii): the airplane is equipped for IFR, 91.205(d).
    pub ifr_equipped: Option<bool>,
    pub flight_visibility_sm: Option<f64>,
    pub ground_visibility_sm: Option<f64>,
    pub clear_of_clouds: Option<bool>,
    /// Taking off or landing under special VFR (91.157(c)).
    pub takeoff_or_landing: bool,
}

/// A line of the answer: its words and its rule.
#[derive(Clone, Debug, PartialEq)]
pub struct Line {
    pub words: String,
    pub source: &'static str,
}

fn line(words: impl Into<String>, source: &'static str) -> Line {
    Line { words: words.into(), source }
}

pub struct Answer {
    /// Nothing known rules special VFR out.
    pub available: bool,
    /// What rules it out, each with its rule.
    pub problems: Vec<Line>,
    /// What it asks, each with its rule.
    pub needs: Vec<Line>,
    pub listed: Option<&'static Listed>,
}

/// Whether it is night for 91.157(b)(4): sunset to sunrise, or in Alaska
/// the sun more than 6 degrees below the horizon where its elevation is
/// known (sunset to sunrise where it is not: the longer night, the safer).
fn svfr_night(a: &Asked) -> Option<bool> {
    match (a.alaska, a.sun_elevation_deg) {
        (true, Some(elevation)) => Some(elevation < -ALASKA_SUN_BELOW_DEG),
        _ => a.night,
    }
}

/// 91.157 for an airplane: what rules special VFR out, and what it asks.
pub fn special_vfr(a: &Asked) -> Answer {
    let mut problems = Vec::new();
    if !a.surface_area.is_some_and(|c| SURFACE_CLASSES.contains(&c)) {
        problems.push(line(
            "Special VFR is flown only within the surface area of an airport's Class B, C, D or E airspace",
            "14 CFR 91.157(a)",
        ));
    }
    let listed = special_vfr_airports::listed(&a.airport);
    if let Some(l) = listed {
        problems.push(line(format!("No fixed-wing special VFR at {}", l.name), "14 CFR 91.157(a); part 91 appendix D, section 3"));
    }
    if a.altitude_ft.is_some_and(|ft| ft >= BELOW_MSL_FT) {
        problems.push(line("Special VFR is flown only below 10,000 ft MSL", "14 CFR 91.157(a)"));
    }
    if a.clear_of_clouds == Some(false) {
        problems.push(line("Special VFR keeps clear of clouds", "14 CFR 91.157(b)(2)"));
    }
    if let Some(v) = a.flight_visibility_sm
        && v < VISIBILITY_SM
    {
        problems.push(line(format!("The flight visibility, {v} sm, is under special VFR's 1 sm"), "14 CFR 91.157(b)(3)"));
    }
    if svfr_night(a) == Some(true) && (a.instrument_current == Some(false) || a.ifr_equipped == Some(false)) {
        problems.push(line(
            "At night special VFR asks a pilot rated and current for instrument flight in an airplane equipped for it",
            "14 CFR 91.157(b)(4)",
        ));
    }
    if a.takeoff_or_landing {
        match (a.ground_visibility_sm, a.flight_visibility_sm) {
            (Some(g), _) if g < VISIBILITY_SM => problems.push(line(
                format!("The ground visibility, {g} sm, is under the 1 sm to take off or land under special VFR"),
                "14 CFR 91.157(c)(1)",
            )),
            (None, Some(f)) if f < VISIBILITY_SM => problems.push(line(
                format!("With no ground visibility reported, the flight visibility, {f} sm, is under the 1 sm to take off or land"),
                "14 CFR 91.157(c)(2)",
            )),
            _ => {}
        }
    }

    let mut needs = vec![
        line("An ATC clearance", "14 CFR 91.157(b)(1)"),
        line("Clear of clouds", "14 CFR 91.157(b)(2)"),
        line("At least 1 sm flight visibility", "14 CFR 91.157(b)(3)"),
        line("Below 10,000 ft MSL, in the surface area", "14 CFR 91.157(a)"),
    ];
    if a.takeoff_or_landing {
        needs.push(line(
            "At least 1 sm ground visibility to take off or land, or flight visibility where none is reported",
            "14 CFR 91.157(c)",
        ));
    }
    if svfr_night(a) != Some(false) {
        let when = if a.alaska { "With the sun more than 6° below the horizon" } else { "Between sunset and sunrise" };
        needs.push(line(
            format!("{when}, a pilot rated and current for instrument flight, in an airplane equipped for IFR (91.205(d))"),
            "14 CFR 91.157(b)(4)",
        ));
    }
    Answer { available: problems.is_empty(), problems, needs, listed }
}

fn tri(ask: &Ask, key: &str) -> Result<Option<bool>, String> {
    match ask.v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Bool(b)) => Ok(Some(*b)),
        Some(_) => Err(format!("{}: \"{key}\" is not true, false or null", ask.name)),
    }
}

fn lines(out: &mut String, items: &[Line]) {
    out.push('[');
    for (i, l) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"words\":");
        json::string(out, &l.words);
        out.push_str(",\"source\":");
        json::string(out, l.source);
        out.push('}');
    }
    out.push(']');
}

fn class_letter(ask: &Ask, key: &str) -> Result<Option<char>, String> {
    let text = ask.opt_str(key)?.trim().to_ascii_uppercase();
    match text.as_str() {
        "" => Ok(None),
        "A" | "B" | "C" | "D" | "E" | "G" => Ok(text.chars().next()),
        other => Err(format!("{}: \"{key}\" is A, B, C, D, E, G or null, not {other:?}", ask.name)),
    }
}

/// `special_vfr` (91.157) and `vfr_class_g_night_pattern` (91.155(b)(2)).
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut out = String::new();
    match name {
        "special_vfr" => {
            let asked = Asked {
                surface_area: class_letter(&ask, "surface_area")?,
                airport: ask.opt_str("airport")?.to_owned(),
                altitude_ft: ask.opt_num("altitude_ft")?,
                night: tri(&ask, "night")?,
                alaska: ask.opt_bool("alaska")?,
                sun_elevation_deg: ask.opt_num("sun_elevation_deg")?,
                instrument_current: tri(&ask, "instrument_current")?,
                ifr_equipped: tri(&ask, "ifr_equipped")?,
                flight_visibility_sm: ask.opt_num("flight_visibility_sm")?,
                ground_visibility_sm: ask.opt_num("ground_visibility_sm")?,
                clear_of_clouds: tri(&ask, "clear_of_clouds")?,
                takeoff_or_landing: ask.opt_bool("takeoff_or_landing")?,
            };
            let a = special_vfr(&asked);
            out.push_str(if a.available { "{\"available\":true" } else { "{\"available\":false" });
            out.push_str(",\"problems\":");
            lines(&mut out, &a.problems);
            out.push_str(",\"needs\":");
            lines(&mut out, &a.needs);
            out.push_str(",\"listed\":");
            json::opt_string(&mut out, a.listed.map(|l| format!("{} ({})", l.listed, l.name)).as_deref());
            out.push_str(",\"visibility_sm\":");
            json::number(&mut out, VISIBILITY_SM);
            out.push_str(",\"below_msl_ft\":");
            json::number(&mut out, BELOW_MSL_FT);
            out.push('}');
        }
        "vfr_class_g_night_pattern" => {
            let class_g = class_letter(&ask, "class")? == Some('G');
            let applies = vfr::night_pattern_exception(
                class_g,
                ask.num("agl_ft")?,
                ask.opt_bool("night")?,
                ask.opt_bool("in_pattern")?,
                ask.opt_num("visibility_sm")?,
            );
            out.push_str(if applies { "{\"applies\":true" } else { "{\"applies\":false" });
            out.push_str(",\"visibility_sm\":");
            json::number(&mut out, vfr::PATTERN_LEAST_VISIBILITY_SM);
            out.push_str(",\"under_visibility_sm\":");
            json::number(&mut out, vfr::PATTERN_UNDER_VISIBILITY_SM);
            out.push_str(",\"below_agl_ft\":");
            json::number(&mut out, vfr::CLASS_G_LOW_AGL_FT);
            out.push_str(",\"words\":");
            json::string(&mut out, vfr::NIGHT_PATTERN_WORDS);
            out.push_str(",\"source\":\"14 CFR 91.155(b)(2)\"}");
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}

#[cfg(test)]
#[path = "special_vfr_tests.rs"]
mod tests;
