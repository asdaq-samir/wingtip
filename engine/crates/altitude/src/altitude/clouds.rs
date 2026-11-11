//! 14 CFR 91.155's distance under the clouds, as the band keeps it.

use super::track::{track_nm, Point};
use crate::geo::distance_nm;

/// 14 CFR 91.155(a), VFR under a cloud layer: 500 ft below it under
/// 10,000 ft MSL (wingtip_flight::vfr, the one copy) ...
pub const CLOUD_CLEARANCE_FT: f64 = wingtip_flight::vfr::CLOUD_BELOW_FT;
/// ... and 1,000 ft below it at and above 10,000 ft MSL -- in Class E by
/// day and by night, and in Class G more than 1,200 ft above the surface.
/// Class G within 1,200 ft of the surface asks only "clear of clouds" by
/// day; the planner cannot tell Class G from Class E there, so it keeps
/// the 500 ft day and night, which is legal in both (the safer reading).
pub const CLOUD_CLEARANCE_HIGH_FT: f64 = wingtip_flight::vfr::HIGH_CLOUD_BELOW_FT;
pub const CLOUD_CLEARANCE_HIGH_FROM_FT: f64 = wingtip_flight::vfr::HIGH_FROM_MSL_FT;

/// A TAF speaks for 5 sm of the airport's centre (TAF_AREA_SM, FAA-H-8083-28B 27.4.1
/// and NWSI 10-813): a leg takes the forecasts of the stations this close
/// to its own line, the planner's own reach beyond that area, the same
/// one a field without a TAF of its own is briefed from
/// (wingtip_weather::forecast::field::TAF_REACH_NM, where the choice is
/// said).
pub const CLOUD_STATION_RADIUS_NM: f64 = wingtip_weather::forecast::field::TAF_REACH_NM;

/// The highest altitude that keeps 91.155's distance below a cloud base
/// (MSL): 500 ft under it, or 1,000 ft under it where that is at or above
/// 10,000 ft -- and just under 10,000 ft where 500 ft below would be up
/// there but 1,000 ft below would not.
pub fn highest_under_ft(cloud_base_ft: f64) -> f64 {
    let high = cloud_base_ft - CLOUD_CLEARANCE_HIGH_FT;
    if high >= CLOUD_CLEARANCE_HIGH_FROM_FT {
        return high;
    }
    (cloud_base_ft - CLOUD_CLEARANCE_FT).min(CLOUD_CLEARANCE_HIGH_FROM_FT - 1.0)
}

/// The distance 91.155(a) keeps under the clouds at an altitude: 1,000 ft
/// at or above 10,000 ft MSL, 500 below.
pub fn clearance_at_ft(altitude_ft: f64) -> f64 {
    if altitude_ft >= CLOUD_CLEARANCE_HIGH_FROM_FT {
        CLOUD_CLEARANCE_HIGH_FT
    } else {
        CLOUD_CLEARANCE_FT
    }
}

/// A TAF station's forecast ceiling for the flight (feet above the field,
/// the lowest broken or overcast layer) and the field's elevation.
/// A stated simplification: 91.155(a)'s distances are from any cloud, but
/// only the ceiling is read, not a FEW or SCT layer's base under it, so a
/// scattered deck lower than the ceiling is not kept clear of here; the
/// pilot keeps the distances from what is seen.
pub struct Station {
    pub ident: String,
    pub at: Point,
    pub ceiling_ft: Option<f64>,
    pub elevation_ft: Option<f64>,
}

/// Each leg's lowest forecast cloud base, MSL, and the station it is
/// from: the ceiling each station within CLOUD_STATION_RADIUS_NM of the
/// leg's own line forecasts, plus its field's elevation. None where no
/// station near the leg forecasts one: nothing known, nothing capped.
pub fn leg_bases(legs: &[(Point, Point)], stations: &[Station]) -> Vec<Option<(f64, String)>> {
    legs.iter()
        .map(|&(a, b)| {
            let length = distance_nm(a.0, a.1, b.0, b.1);
            let mut lowest: Option<(f64, String)> = None;
            for s in stations {
                let (Some(ceiling), Some(elevation)) = (s.ceiling_ft, s.elevation_ft) else { continue };
                let (cross, along) = track_nm(s.at, a, b);
                let off = if (0.0..=length).contains(&along) {
                    cross.abs()
                } else {
                    distance_nm(s.at.0, s.at.1, a.0, a.1).min(distance_nm(s.at.0, s.at.1, b.0, b.1))
                };
                let base = ceiling + elevation;
                if off <= CLOUD_STATION_RADIUS_NM && lowest.as_ref().is_none_or(|(l, _)| base < *l) {
                    lowest = Some((base, s.ident.clone()));
                }
            }
            lowest
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn under_the_clouds_by_500_ft_below_10000_and_1000_above() {
        assert_eq!(highest_under_ft(6000.0), 5500.0);
        assert_eq!(highest_under_ft(12000.0), 11000.0);
        let between = highest_under_ft(10800.0);
        assert!(between > 9500.0 && between < 10000.0);
        assert_eq!(clearance_at_ft(9999.0), 500.0);
        assert_eq!(clearance_at_ft(10000.0), 1000.0);
    }
}
