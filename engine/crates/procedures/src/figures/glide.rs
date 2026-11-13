//! An airplane's glide with the engine stopped: the still-air range from
//! a height over the ground, whether a field is within it at pattern
//! height, and how far it goes over the ground into a wind. Held here,
//! under both the map's own-ship ring (route's motion::glide) and the
//! emergency's best fields (brief's fields), so both glide by one sum.

use super::debrief::AIRBORNE_KT;
use crate::flight;
use wingtip_core::units::FT_PER_NM;

/// Below this over the ground (or slower than AIRBORNE_KT, the debrief's
/// too), the airplane is on the ground or about to be, and there is no
/// ring to draw.
pub const AIRBORNE_AGL_FT: f64 = 500.0;
/// The height to arrive at over a field glided to: its pattern, AC
/// 90-66C's 1,000 ft above it for a propeller airplane, from where a
/// landing can still be flown.
pub const ARRIVE_AGL_FT: f64 = 1000.0;

/// Still-air nm for every 1,000 ft from an airplane's glide ratio (feet
/// forward for each foot down, its POH's Section 3 "Maximum glide"); None
/// with no ratio, or none above nothing. There is no stock figure behind
/// it: an airplane whose profile has no glide has no glide worked out
/// (the owner, 2026-11-09: no Cessna 172 figure fills the gap).
pub fn nm_per_1000_ft(glide_ratio: Option<f64>) -> Option<f64> {
    glide_ratio.filter(|r| r.is_finite() && *r > 0.0).map(|r| r * 1000.0 / FT_PER_NM)
}

/// How far own ship glides in still air from its GPS altitude over
/// `ground_ft` -- the nearest field's elevation, as near as the page knows
/// the ground -- at the airplane's `glide_ratio`, nm; None on the ground,
/// with a height not known or with no glide ratio in its profile.
pub fn range_nm(altitude_ft: Option<f64>, speed_kt: Option<f64>, ground_ft: Option<f64>, glide_ratio: Option<f64>) -> Option<f64> {
    let per_1000 = nm_per_1000_ft(glide_ratio)?;
    let agl = altitude_ft? - ground_ft?;
    if agl < AIRBORNE_AGL_FT || speed_kt.unwrap_or(0.0) < AIRBORNE_KT {
        return None;
    }
    Some((agl / 1000.0) * per_1000)
}

/// Whether own ship can glide, in still air, to a field `distance_nm` off
/// and arrive over it at pattern height -- from its GPS altitude over that
/// field's own elevation, not the nearest one's: a field on higher ground
/// is nearer the airplane's height. False where either height is not
/// known, or the airplane's profile has no glide ratio.
pub fn reaches(
    altitude_ft: Option<f64>, speed_kt: Option<f64>, distance_nm: f64, elevation_ft: Option<f64>, glide_ratio: Option<f64>,
) -> bool {
    let (Some(alt), Some(elevation), Some(per_1000)) = (altitude_ft, elevation_ft, nm_per_1000_ft(glide_ratio)) else { return false };
    if speed_kt.unwrap_or(0.0) < AIRBORNE_KT {
        return false;
    }
    let spare = alt - elevation - ARRIVE_AGL_FT;
    spare > 0.0 && (spare / 1000.0) * per_1000 >= distance_nm
}

/// Own ship moving at flying speed: in the air, or about to be.
pub fn underway(speed_kt: Option<f64>) -> bool {
    speed_kt.unwrap_or(0.0) >= AIRBORNE_KT
}

/// An airplane's glide as its handbook gives it: the best-glide speed,
/// indicated, and the glide ratio there (feet forward for each foot
/// down), from the POH's Section 3 (Emergency Procedures, "Maximum
/// glide") under GAMA Specification No. 1. The speed is None for a
/// pilot's own airplane given its ratio alone: none is taken from another
/// airplane (the owner, 2026-11-09).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Glide {
    pub best_glide_kias: Option<f64>,
    pub ratio: f64,
}

impl Glide {
    /// Still-air nm for every 1,000 ft of height: the ratio's feet over a
    /// nautical mile's.
    pub fn nm_per_1000_ft(&self) -> f64 {
        nm_per_1000_ft(Some(self.ratio)).unwrap_or(0.0)
    }

    /// The true airspeed at best glide at `altitude_ft`, on a standard
    /// day: the indicated speed over the root of the air's density ratio
    /// in the standard atmosphere (flight's, ICAO Doc 7488). The
    /// calibration error is the handbook's to give and is left out. None
    /// with no best-glide speed.
    pub fn tas_kt(&self, altitude_ft: f64) -> Option<f64> {
        let sigma = flight::density_ratio(altitude_ft, flight::isa_temp_c(altitude_ft));
        self.best_glide_kias.map(|kias| kias / sigma.sqrt())
    }
}

/// How far over the ground a glide of `still_nm` in still air goes along
/// the true course `course_deg`, with the wind from `wind_from_deg` at
/// `wind_kt` and the airplane at `tas_kt`: the time aloft is the same
/// whatever the wind, so the distance is the still-air one times the
/// groundspeed over the airspeed (the wind triangle, flight's). Into a
/// headwind past the airspeed it goes nowhere: 0.
pub fn ground_nm(still_nm: f64, tas_kt: f64, course_deg: f64, wind_from_deg: f64, wind_kt: f64) -> f64 {
    if wind_kt <= 0.0 || tas_kt <= 0.0 {
        return still_nm;
    }
    match flight::wind_triangle(course_deg, tas_kt, wind_from_deg, wind_kt) {
        Some((_, _, gs)) => still_nm * gs / tas_kt,
        None => 0.0,
    }
}
