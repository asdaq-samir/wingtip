//! The alerts ahead of the airplane: the planner's (`alerts_ahead`, from
//! the FAA data wingtip.alerts reads and passes in, the Digital Obstacle
//! File among them) and, with no network, the phone's from its packs --
//! the same rules either way. Advisory only, from a phone's GPS and the
//! FAA's published data: not a terrain awareness and warning system
//! (TSO-C151), nor a substitute for the chart, the pilot's own planning
//! (14 CFR 91.103) or looking outside. From the packs: the Class B, C and
//! D and special-use areas the track goes into in the next five minutes,
//! the TFRs as the phone last downloaded them, and the ground it comes within 500 ft of
//! in the next minute -- as the planner's /api/alerts/ahead answers it
//! (AheadAlert, the same names), with what cannot be known offline said
//! so: the obstacles (the FAA's Digital Obstacle File is not in a pack),
//! and the TFRs' age. Every figure is wingtip.alerts' own; see it for why.
//!
//! The ground is the pack's `terrain` (wingtip.cycle_pack's `_terrain`): the ground
//! grid's highest ground pooled to a 60th of a degree, plus the grid's
//! margin, so never under the planner's grid; the planner reads the zoom-12
//! tiles point by point, so the phone's ground can stand some hundreds of
//! feet higher on a ridge and alert sooner, never later.

use crate::geo::{self, destination};
use crate::json::{self, Value};
use crate::pack::{f64_at, u32_at};
use crate::{pack::Pack, sort::StableSort, sua_limit};

/// How far ahead the airspace is looked at: the minutes it takes to find
/// the frequency, call and be answered before a Class C or D, or to be
/// cleared into a Class B or turn away. A design choice, not a rule.
pub const LOOK_AHEAD_S: f64 = 300.0;
/// How often along the look-ahead the track is tested: about 0.2 nm at
/// 120 kt, finer than any Class D surface area.
pub const AIRSPACE_STEP_S: f64 = 5.0;
/// Within this much of a volume's floor or ceiling counts as going in: a
/// phone's GPS altitude is good to some tens of feet, and an airplane
/// drifts. The figure Garmin's own airspace alerts default to; a design
/// choice, not a rule.
pub const ALTITUDE_BUFFER_FT: f64 = 200.0;
/// The ground and obstacles are looked at a minute ahead, a warning given
/// at half a minute: the caution and the warning of an EGPWS's forward
/// look, about 60 and 30 seconds before the ground (NBAA's summary of TAWS
/// and GPWS).
pub const TERRAIN_LOOK_AHEAD_S: f64 = 60.0;
pub const TERRAIN_WARNING_S: f64 = 30.0;
pub const TERRAIN_STEP_S: f64 = 2.0;
/// Borrowed from 14 CFR 91.119(c)'s 500 ft above the surface away from
/// congested areas, so the alert comes before the rule is broken: a rule
/// about how close one may operate, not a TAWS threshold (TSO-C151's
/// required terrain clearance differs, and is not read here).
pub const TERRAIN_CLEARANCE_FT: f64 = 500.0;
/// A warning: the ground or an obstacle's top within this of the
/// projected altitude, which the terrain tiles' 38 m cells and a phone's
/// altitude cannot tell from the ground itself. A design choice.
pub const WARNING_CLEARANCE_FT: f64 = 100.0;
/// Either side of the track the ground and obstacles are looked at, for a
/// track that wanders a few degrees: 0.25 nm is some 1,500 ft.
pub const SWATH_NM: f64 = 0.25;
/// 91.119's minimums hold "except when necessary for takeoff or landing":
/// within this of a field, and no higher than NEAR_FIELD_AGL_FT over it,
/// the ground is not alerted (obstacles still are). A 3-degree approach is
/// about 950 ft above the field at 3 nm.
pub const NEAR_FIELD_NM: f64 = 3.0;
pub const NEAR_FIELD_AGL_FT: f64 = 1000.0;
/// Under flying speed nothing is said: the one figure the debrief and the
/// motion crate's `underway` (glide.rs) use too.
pub use crate::figures::debrief::AIRBORNE_KT;
/// Class A from here (14 CFR 71.33): a volume with no ceiling reaches it.
use wingtip_flight::limits::CLASS_A_FLOOR_FT as CLASS_A_FT;
/// wingtip.ground_grid's RESAMPLED_MARGIN_FT, added to every cell it reads.
pub const GROUND_MARGIN_FT: f64 = 150.0;
const GROUND_NONE: i16 = i16::MIN;

fn class_need(class: char) -> Option<(&'static str, &'static str)> {
    Some(match class {
        'B' => ("warning", "An ATC clearance before entering (91.131(a)(1))."),
        'C' => ("caution", "Two-way radio contact with ATC before entering (91.130(c)(1))."),
        'D' => ("caution", "Two-way radio contact with the tower before entering (91.129(c)(1))."),
        _ => return None,
    })
}

fn special_use_need(kind: &str) -> Option<(&'static str, &'static str)> {
    Some(match kind {
        "P" => ("warning", "No flight without the using agency's permission (91.133(a))."),
        "R" => ("caution", "No flight into it while in use without the controlling agency's permission (91.133(a)); ask ATC or Flight Service whether it is (AIM 3-4-3)."),
        "MOA" => ("caution", "Military training may be under way: ask ATC or Flight Service whether it is active (AIM 3-4-5)."),
        "W" => ("caution", "Hazardous military activity may be under way (AIM 3-4-4)."),
        "A" => ("caution", "Heavy pilot training or unusual flying: keep a lookout (AIM 3-4-6)."),
        _ => return None,
    })
}

const TERRAIN_WARNING: &str = "At or near the airplane's altitude: climb or turn now.";
const TERRAIN_CAUTION: &str = "Within 500 ft of the airplane's altitude: climb or turn (91.119(c)).";

struct Track {
    times: Vec<f64>,
    along: Vec<f64>,
    lats: Vec<f64>,
    lons: Vec<f64>,
    alts: Option<Vec<f64>>,
    track_deg: f64,
}

impl Track {
    // The airplane's state, one figure an argument as wt_ahead and the
    // rule's JSON give them, and how far and how finely to look ahead.
    #[allow(clippy::too_many_arguments)]
    fn new(lat: f64, lon: f64, track_deg: f64, gs_kt: f64, alt_ft: Option<f64>, vs_fpm: f64, seconds: f64, step: f64) -> Track {
        let n = (seconds / step).round() as usize + 1;
        let times: Vec<f64> = (0..n).map(|i| i as f64 * step).collect();
        let along: Vec<f64> = times.iter().map(|t| gs_kt * t / 3600.0).collect();
        let (lats, lons) = along.iter().map(|&d| destination(lat, lon, track_deg, d)).unzip();
        let alts = alt_ft.map(|a| times.iter().map(|t| a + vs_fpm * t / 60.0).collect());
        Track { times, along, lats, lons, alts, track_deg }
    }

    /// [west, south, east, north] round the track, `pad_nm` wider: core's
    /// corridor_bbox over its corners.
    fn bbox(&self, pad_nm: f64) -> [f64; 4] {
        let fold = |v: &[f64], f: fn(f64, f64) -> f64, s: f64| v.iter().copied().fold(s, f);
        let low = (fold(&self.lats, f64::min, f64::INFINITY), fold(&self.lons, f64::min, f64::INFINITY));
        let high = (fold(&self.lats, f64::max, f64::NEG_INFINITY), fold(&self.lons, f64::max, f64::NEG_INFINITY));
        let (s, w, n, e) = geo::corridor_bbox(low, high, pad_nm);
        [w, s, e, n]
    }

    /// (inside now, the first sample in it or within the buffer of it).
    fn entry(&self, holds: &dyn Fn(f64, f64) -> bool, floor: f64, ceiling: f64) -> (bool, Option<usize>) {
        let lateral: Vec<bool> = self.lats.iter().zip(&self.lons).map(|(&la, &lo)| holds(lo, la)).collect();
        match &self.alts {
            None => (lateral[0], lateral.iter().position(|&l| l)),
            Some(alts) => {
                let inside = lateral[0] && floor <= alts[0] && alts[0] <= ceiling;
                let first = (0..alts.len())
                    .find(|&i| lateral[i] && alts[i] >= floor - ALTITUDE_BUFFER_FT && alts[i] <= ceiling + ALTITUDE_BUFFER_FT);
                (inside, first)
            }
        }
    }
}

/// One alert, its fields in the planner's order and names.
#[derive(Clone, Debug, Default)]
pub struct Alert {
    pub id: String,
    pub kind: &'static str,
    pub level: &'static str,
    pub name: String,
    pub class: Option<String>,
    pub need: String,
    pub inside: bool,
    pub seconds: f64,
    pub distance_nm: f64,
    pub lat: f64,
    pub lon: f64,
    pub floor_ft: Option<f64>,
    pub ceiling_ft: Option<f64>,
    pub top_ft: Option<f64>,
    pub clearance_ft: Option<f64>,
    pub times_of_use: Option<String>,
    pub notam_id: Option<String>,
}

fn round_to(v: f64, places: i32) -> f64 {
    let k = 10f64.powi(places);
    (v * k).round() / k
}

fn at(track: &Track, i: usize) -> Alert {
    Alert {
        seconds: track.times[i],
        distance_nm: round_to(track.along[i], 1),
        lat: round_to(track.lats[i], 5),
        lon: round_to(track.lons[i], 5),
        ..Default::default()
    }
}

fn text<'a>(run: &'a [u8], r: &[u8], o: usize) -> Option<&'a str> {
    let (s, l) = (u32_at(r, o)? as usize, u32_at(r, o + 4)? as usize);
    std::str::from_utf8(run.get(s..s + l)?).ok()
}

fn meets(b: [f64; 4], box_: [f64; 4]) -> bool {
    !(b[2] < box_[0] || b[0] > box_[2] || b[3] < box_[1] || b[1] > box_[3])
}

/// The highest ground at a point from the packs' grids, feet, the grid's
/// margin added; None where no pack holds a grid there or no tile reached.
pub fn ground_ft(packs: &[Pack], lat: f64, lon: f64) -> Option<f64> {
    for p in packs {
        let Some(g) = p.section("terrain") else { continue };
        let (south, west) = (f64_at(g, 0)?, f64_at(g, 8)?);
        let (per, rows, cols) = (u32_at(g, 16)? as f64, u32_at(g, 20)? as usize, u32_at(g, 24)? as usize);
        let (r, c) = (((lat - south) * per).floor(), ((lon - west) * per).floor());
        if r < 0.0 || c < 0.0 || r as usize >= rows || c as usize >= cols {
            continue;
        }
        let o = 32 + 2 * (r as usize * cols + c as usize);
        let v = i16::from_le_bytes(g.get(o..o + 2)?.try_into().unwrap());
        return (v != GROUND_NONE).then_some(v as f64 + GROUND_MARGIN_FT);
    }
    None
}

mod areas;
use areas::*;
mod tfr;
use tfr::*;
mod terrain;
pub use terrain::*;
mod run;
pub use run::*;
mod entry;
pub use entry::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_on_the_ground_and_a_tfr_ahead_in_the_air() {
        let ring = "-93.0 45.05,-92.9 45.05,-92.9 45.15,-93.0 45.15,-93.0 45.05";
        let line = format!("6/1234\tA stadium\t\t\t\t3000\tAGL\t\t\t{ring}");
        let none: [Pack; 0] = [];
        let parked = ahead(&none, 45.0, -92.95, 0.0, 10.0, Some(1000.0), 0.0, 0, Some(&line), Some(0));
        assert!(parked.starts_with("{\"alerts\":[],\"unavailable\":[]"), "{parked}");
        let flying = ahead(&none, 45.0, -92.95, 0.0, 120.0, Some(2000.0), 0.0, 0, Some(&line), Some(0));
        assert!(flying.contains("\"id\":\"tfr:6/1234\""), "{flying}");
        // No packs: no ground to read.
        assert!(flying.contains("\"terrain\""), "{flying}");
        assert!(flying.ends_with(",\"ground_ft\":null}"), "{flying}");
    }

    #[test]
    fn a_tfr_far_from_the_look_ahead_is_passed_over_by_its_box() {
        let near = "-93.0 45.05,-92.9 45.05,-92.9 45.15,-93.0 45.15,-93.0 45.05";
        let far = "-80.0 30.0,-79.9 30.0,-79.9 30.1,-80.0 30.1,-80.0 30.0";
        let lines = format!(
            "6/1	Near				3000	AGL			{near}
6/2	Far				3000	AGL			{far}"
        );
        let none: [Pack; 0] = [];
        let flying = ahead(&none, 45.0, -92.95, 0.0, 120.0, Some(2000.0), 0.0, 0, Some(&lines), Some(0));
        assert!(flying.contains("\"id\":\"tfr:6/1\"") && !flying.contains("tfr:6/2"), "{flying}");
        let track = Track::new(45.0, -92.95, 0.0, 120.0, Some(2000.0), 0.0, 300.0, 5.0);
        let far_box = shape_box(&tfrs_of(&lines)[1].shape).unwrap();
        assert!(!meets(far_box, track.bbox(1.0)));
    }
}
