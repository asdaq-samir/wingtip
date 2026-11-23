//! The airspace over a point in bands, from the ground to FL600, with the
//! rules of each: wingtip.airspace_at's `column`, `minimums`, `equipment`,
//! `speed_kt` and `ENTRY`, written again here so the phone answers as the
//! planner does with no network. services/planner/tests_wingtip/test_native.py holds the two to
//! the same answer at every tap it asks.

use crate::{json, sort::StableSort};
use wingtip_flight::vfr;

/// Class A, from here to FL600 (14 CFR 71.33): IFR only; the one copy in
/// wingtip_flight::limits.
pub use wingtip_flight::limits::CLASS_A_FLOOR_FT;
/// Class E from here up wherever nothing lower is designated, but not
/// below 1,500 ft above the surface (71.71(a)(2)).
pub const CLASS_E_EVERYWHERE_FT: f64 = 14500.0;
pub const CLASS_E_ABOVE_SURFACE_FT: f64 = 1500.0;
/// Where 91.117's speed and 91.215's transponder rule change; 91.155's
/// minimums change there too (wingtip_flight::vfr::HIGH_FROM_MSL_FT).
pub const TEN_THOUSAND_FT: f64 = 10000.0;
/// Class G's minimums differ at and below this height (91.155(a)).
pub const G_LOW_AGL_FT: f64 = vfr::CLASS_G_LOW_AGL_FT;
/// Above 10,000 ft MSL a transponder and ADS-B Out are asked for, but
/// not at or below this height above the ground (91.215(b)(5), 91.225(d)(4)).
pub const TRANSPONDER_EXEMPT_AGL_FT: f64 = 2500.0;
/// 91.117(b): no more than 200 kt "at or below 2,500 feet above the
/// surface within 4 nautical miles of the primary airport of a Class C
/// or Class D airspace area". The same figure as the transponder's today,
/// but its own rule, so an amendment to one cannot move the other.
pub const SPEED_200_KT_AGL_FT: f64 = 2500.0;
/// The Mode C veil's radius round each airport of part 91 appendix D
/// section 1 (91.215(b)(2), 91.225(d)(2)), surface to 10,000 ft MSL.
pub const MODE_C_VEIL_NM: f64 = 30.0;
/// 14 CFR 91.155(c) and (d): 1,000 ft and 3 sm within a surface area of
/// controlled airspace -- the surface-area minimums, which the planner
/// holds every route to, and its "VFR flight not recommended" line (AIM
/// 7-1-5); not the least VFR ever asks (wingtip_flight::vfr).
pub use wingtip_flight::vfr::{SURFACE_AREA_CEILING_FT, SURFACE_AREA_VISIBILITY_SM};
/// The top of the column: FL600, where Class A ends (71.33).
const TOP_FT: f64 = 60000.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FloorRef {
    Sfc,
    Agl,
    Msl,
}

/// One Class B, C, D or E volume holding the point, as wingtip.airspace_at's
/// `_volume` gives it: its floor in feet over its reference, its ceiling
/// in feet MSL, and the primary airport's identifier where NASR's Class
/// Airspace file names one (IDENT: ORD, MSN), which tells the 33 airports
/// of part 91 Appendix D, section 3, from the rest (special_vfr).
#[derive(Clone, Debug)]
pub struct Volume {
    pub class: char,
    pub name: String,
    pub ident: Option<String>,
    pub floor_ft: f64,
    pub floor_ref: FloorRef,
    pub ceiling_ft: f64,
}

/// 91.155(a)'s visibility and distance from clouds: clear of them where
/// `below_ft` is None.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rule {
    pub visibility_sm: f64,
    pub below_ft: Option<f64>,
    pub above_ft: Option<f64>,
    pub horizontal_ft: Option<f64>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Minimums {
    pub day: Rule,
    pub night: Rule,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Band {
    pub floor_ft: f64,
    pub ceiling_ft: f64,
    pub class: char,
    pub name: Option<String>,
    /// The B, C or D volume's primary airport (Volume's `ident`).
    pub ident: Option<String>,
    pub minimums: Option<Minimums>,
    pub entry: &'static str,
    pub equipment: Option<&'static str>,
    pub speed_kt: Option<u32>,
}

fn rule(visibility_sm: f64, clouds: Option<(f64, f64, f64)>) -> Rule {
    Rule { visibility_sm, below_ft: clouds.map(|c| c.0), above_ft: clouds.map(|c| c.1), horizontal_ft: clouds.map(|c| c.2) }
}

/// 91.155(a)'s basic VFR weather minimums for a band of `class` whose
/// bottom is `floor_msl`, `agl` above the ground there. None in Class A.
pub fn minimums(class: char, floor_msl: f64, agl: f64) -> Option<Minimums> {
    let clouds = Some((vfr::CLOUD_BELOW_FT, vfr::CLOUD_ABOVE_FT, vfr::CLOUD_HORIZONTAL_FT));
    let standard = rule(vfr::VISIBILITY_SM, clouds);
    let high = rule(vfr::HIGH_VISIBILITY_SM, Some((vfr::HIGH_CLOUD_BELOW_FT, vfr::HIGH_CLOUD_ABOVE_FT, vfr::HIGH_CLOUD_HORIZONTAL_FT)));
    let same = |r: Rule| Some(Minimums { day: r, night: r });
    match class {
        'A' => None,
        'B' => same(rule(vfr::VISIBILITY_SM, None)),
        'C' | 'D' => same(standard),
        'E' => same(if floor_msl >= vfr::HIGH_FROM_MSL_FT { high } else { standard }),
        // Class G.
        _ if agl < G_LOW_AGL_FT => Some(Minimums { day: rule(vfr::CLASS_G_DAY_VISIBILITY_SM, None), night: standard }),
        _ if floor_msl >= vfr::HIGH_FROM_MSL_FT => same(high),
        _ => Some(Minimums { day: rule(vfr::CLASS_G_DAY_VISIBILITY_SM, clouds), night: standard }),
    }
}

/// What it takes to go in.
pub fn entry(class: char) -> &'static str {
    match class {
        'A' => "IFR only: an instrument rating, an IFR flight plan and a clearance (91.135).",
        'B' => "An ATC clearance into the Class B, and a private pilot certificate or a student's endorsement for it (91.131).",
        'C' => "Two-way radio communication with ATC established before entering (91.130).",
        'D' => "Two-way radio communication with the tower established before entering (91.129).",
        'E' => "Nothing for VFR.",
        _ => "Nothing.",
    }
}

/// What a pilot needs to fly into a Class B, C or D airspace area, and the
/// speeds in and under it, each a rule and the section of 14 CFR part 91
/// it comes from (eCFR, current on 2026-10-30), for the airspace's card:
/// the band's `entry`, `equipment` and `speed_kt` itemised. VFR, in the 48
/// states, for a civil airplane with an engine-driven electrical system:
/// the exceptions for gliders, balloons and the rest (91.215(b)(3),
/// 91.225(e)) are left out. The figures are this file's own, so the card
/// and the band cannot disagree on them. Empty for any other class.
pub fn entry_rules(class: char) -> Vec<(String, &'static str)> {
    use crate::figures::words::grouped;
    let ten = grouped(TEN_THOUSAND_FT);
    // 91.117(b): at or below 2,500 ft above the surface within 4 nm of the
    // primary airport of a Class C or D.
    let near_field = format!("200 kt at or below {} ft above the surface within 4 nm of its primary airport", grouped(SPEED_200_KT_AGL_FT));
    match class {
        'B' => vec![
            ("An ATC clearance before you enter".to_owned(), "14 CFR 91.131(a)(1)"),
            ("A two-way radio for ATC's frequencies".to_owned(), "14 CFR 91.131(c)(2)"),
            (
                format!(
                    "A transponder with altitude reporting and ADS-B Out, in it, above it to {ten} ft MSL, and within {} nm of its primary airport",
                    MODE_C_VEIL_NM
                ),
                "14 CFR 91.215(b), 91.225(d)",
            ),
            (
                "At least a private pilot certificate, or a student, sport or recreational pilot's endorsement for it".to_owned(),
                "14 CFR 91.131(b)(1)",
            ),
            (format!("200 kt under its shelves and in a VFR corridor through it; 250 kt below {ten} ft MSL in it"), "14 CFR 91.117(a), (c)"),
        ],
        'C' => vec![
            ("Two-way radio contact with ATC before you enter".to_owned(), "14 CFR 91.130(c)(1)"),
            (
                format!("A transponder with altitude reporting and ADS-B Out, in it and above it to {ten} ft MSL"),
                "14 CFR 91.130(d), 91.215(b), 91.225(d)",
            ),
            (near_field, "14 CFR 91.117(b)"),
        ],
        'D' => vec![("Two-way radio contact with the tower before you enter".to_owned(), "14 CFR 91.129(c)(1)"), (near_field, "14 CFR 91.117(b)")],
        _ => Vec::new(),
    }
}

/// The frequencies to call before entering, by the primary airport's
/// types (NASR FRQ): approach for a Class B or C (91.131(a)(1),
/// 91.130(c)(1)), the tower for a Class D (91.129(c)).
pub fn call_types(class: char) -> &'static [&'static str] {
    if class == 'D' {
        &["TWR"]
    } else {
        &["APP", "TWR"]
    }
}

const TRANSPONDER: &str = "A transponder with altitude reporting and ADS-B Out (91.215, 91.225).";

/// What the airplane must carry to be there (91.215, 91.225), or None
/// where nothing is asked beyond the basics. `above_bc`: over a Class
/// B's or C's ceiling, inside its lateral limits.
pub fn equipment(class: char, floor_msl: f64, agl: f64, in_veil: bool, above_bc: bool) -> Option<&'static str> {
    match class {
        // IFR only: the instrument flight asks for far more than this.
        'A' => None,
        'B' | 'C' => Some(TRANSPONDER),
        // A Class D asks for a two-way radio (91.129(c)), and the
        // transponder too wherever 91.215(b)'s general arms reach it.
        'D' => Some(general(floor_msl, agl, in_veil, above_bc).map_or("A two-way radio.", |k| WITH_RADIO[k])),
        _ => general(floor_msl, agl, in_veil, above_bc).map(|k| ALONE[k]),
    }
}

/// 91.215(b)'s arms that hold in any class, the first that does, in the
/// rule's own order of reach: (b)(5)(i), at and above 10,000 ft MSL but
/// not within 2,500 ft of the surface (here at 2,500 ft too, the safer
/// side); (b)(4), above a Class B or C, within its lateral limits, to
/// 10,000 ft MSL; (b)(2), within 30 nm of a Class B primary airport,
/// surface to 10,000 ft MSL. Each before any class's own arm, so a Class
/// D reaching one is asked for the transponder too.
fn general(floor_msl: f64, agl: f64, in_veil: bool, above_bc: bool) -> Option<usize> {
    if floor_msl >= TEN_THOUSAND_FT {
        (agl >= TRANSPONDER_EXEMPT_AGL_FT).then_some(0)
    } else if above_bc {
        Some(1)
    } else {
        in_veil.then_some(2)
    }
}

/// The general arms' words (general's index), alone and in a Class D.
const ALONE: [&str; 3] = [
    TRANSPONDER,
    "A transponder with altitude reporting and ADS-B Out: above a Class B or C, within its lateral limits, to 10,000 ft MSL (91.215(b)(4), 91.225(d)(3)).",
    "A transponder with altitude reporting and ADS-B Out: inside a 30 nm Mode C veil (91.215(b)(2), 91.225(d)(2)).",
];
const WITH_RADIO: [&str; 3] = [
    "A two-way radio, and a transponder with altitude reporting and ADS-B Out: at or above 10,000 ft MSL (91.215(b)(5), 91.225(d)(4)).",
    "A two-way radio, and a transponder with altitude reporting and ADS-B Out: above a Class B or C, within its lateral limits, to 10,000 ft MSL (91.215(b)(4), 91.225(d)(3)).",
    "A two-way radio, and a transponder with altitude reporting and ADS-B Out: inside a 30 nm Mode C veil (91.215(b)(2), 91.225(d)(2)).",
];

/// The 91.117 speed limit, where one applies: 200 kt under a Class B's
/// shelf (91.117(c)), 200 kt at or below 2,500 ft above the surface in a
/// Class C or D (the whole surface band: a point does not know its
/// distance from the airport, and the lower speed is the safe error),
/// and 250 kt below 10,000 ft MSL (91.117(a)).
pub fn speed_kt(class: char, floor_msl: f64, under_b: bool, agl: f64) -> Option<u32> {
    if class == 'A' || floor_msl >= TEN_THOUSAND_FT {
        return None;
    }
    if under_b || (matches!(class, 'C' | 'D') && agl < SPEED_200_KT_AGL_FT) {
        return Some(200);
    }
    Some(250)
}

fn restrictiveness(class: char) -> u8 {
    match class {
        'B' => 0,
        'C' => 1,
        'D' => 2,
        'E' => 3,
        _ => 4,
    }
}

mod column;
pub use column::*;

#[cfg(test)]
mod tests;
