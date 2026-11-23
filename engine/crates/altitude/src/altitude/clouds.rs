//! 14 CFR 91.155's distance under the clouds, as the band keeps it.

use super::track::{surely_off_nm, track_from, track_nm, Point};
use crate::geo::{bearing_deg, distance_nm, sphere_nm, SPHERE_WITHIN};
use wingtip_core::sort::StableSort;

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
            // The leg's course solved once for every station (track_from
            // is track_nm with it given).
            let course = bearing_deg(a.0, a.1, b.0, b.1);
            let mut lowest: Option<(f64, String)> = None;
            for s in stations {
                let (Some(ceiling), Some(elevation)) = (s.ceiling_ft, s.elevation_ft) else { continue };
                // A station surely more than the radius off the leg's line
                // is more than it from the line and from `a` (core's
                // surely_off_nm), and one the sphere puts more than the
                // radius and its 1% from `b` is more than it from `b` on the
                // ellipsoid (SPHERE_WITHIN): its `off` below, either way it
                // is taken, is past the radius, so it is let go after one
                // inverse solve and a haversine, not track_nm's several.
                if surely_off_nm(s.at, a, course, CLOUD_STATION_RADIUS_NM)
                    && sphere_nm(s.at.0, s.at.1, b.0, b.1) * (1.0 - SPHERE_WITHIN) > CLOUD_STATION_RADIUS_NM
                {
                    continue;
                }
                let (cross, along) = track_from(s.at, a, course);
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

/// Each station's forecast cloud base along a route through `path`, for
/// the profile: (ident, nm along the route from its start, base MSL), in
/// order along it, each station whose ceiling is known and which is within
/// CLOUD_STATION_RADIUS_NM of some leg -- the leg's own stations, as
/// leg_bases takes them -- placed at its foot on the nearest such leg (at
/// the leg's end where it is past one). The base is the ceiling, above the
/// field, plus the field's elevation, as leg_bases has it.
pub fn along_route(path: &[Point], stations: &[Station]) -> Vec<(String, f64, f64)> {
    let mut out = Vec::new();
    for s in stations {
        let (Some(ceiling), Some(elevation)) = (s.ceiling_ft, s.elevation_ft) else { continue };
        let mut start = 0.0;
        let mut best: Option<(f64, f64)> = None;
        for leg in path.windows(2) {
            let (a, b) = (leg[0], leg[1]);
            let length = distance_nm(a.0, a.1, b.0, b.1);
            let (cross, along) = track_nm(s.at, a, b);
            let (off, at) = if (0.0..=length).contains(&along) {
                (cross.abs(), along)
            } else {
                let (to_a, to_b) = (distance_nm(s.at.0, s.at.1, a.0, a.1), distance_nm(s.at.0, s.at.1, b.0, b.1));
                if to_a <= to_b {
                    (to_a, 0.0)
                } else {
                    (to_b, length)
                }
            };
            if off <= CLOUD_STATION_RADIUS_NM && best.is_none_or(|(o, _)| off < o) {
                best = Some((off, start + at));
            }
            start += length;
        }
        if let Some((_, along)) = best {
            out.push((s.ident.clone(), along, ceiling + elevation));
        }
    }
    out.stable_sort_by(|a, b| a.1.total_cmp(&b.1));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geo::destination;

    #[test]
    fn a_stations_base_is_placed_along_the_route_and_one_too_far_off_left_out() {
        // North along -88 from 42 to 43 (60 nm) and on to 44: KAAA beside
        // the first leg at 42.5, KBBB on the second at 43.5, KFAR 1.5
        // degrees of longitude east (some 66 nm off), no ceiling at KNIL.
        let path = [(42.0, -88.0), (43.0, -88.0), (44.0, -88.0)];
        let st = |ident: &str, at: Point, ceiling: Option<f64>| Station {
            ident: ident.to_owned(),
            at,
            ceiling_ft: ceiling,
            elevation_ft: Some(800.0),
        };
        let found = along_route(
            &path,
            &[
                st("KBBB", (43.5, -88.0), Some(2500.0)),
                st("KAAA", (42.5, -88.05), Some(3000.0)),
                st("KFAR", (42.5, -86.5), Some(1000.0)),
                st("KNIL", (42.5, -88.0), None),
            ],
        );
        assert_eq!(found.iter().map(|f| f.0.as_str()).collect::<Vec<_>>(), ["KAAA", "KBBB"]);
        // 3,000 ft above an 800 ft field is 3,800 MSL.
        assert_eq!(found[0].2, 3800.0);
        assert!((found[0].1 - 30.0).abs() < 0.5 && (found[1].1 - 90.0).abs() < 0.5, "{found:?}");
    }

    #[test]
    fn under_the_clouds_by_500_ft_below_10000_and_1000_above() {
        assert_eq!(highest_under_ft(6000.0), 5500.0);
        assert_eq!(highest_under_ft(12000.0), 11000.0);
        let between = highest_under_ft(10800.0);
        assert!(between > 9500.0 && between < 10000.0);
        assert_eq!(clearance_at_ft(9999.0), 500.0);
        assert_eq!(clearance_at_ft(10000.0), 1000.0);
    }

    #[test]
    fn a_station_past_the_legs_end_still_caps_it_and_a_far_one_never() {
        // A leg due east along 40 N, a station just past its end (its `off`
        // the distance to `b`, not the cross-track) and one far to the
        // north: the near one's ceiling is the leg's base after the first
        // cut as before it, the far one never is.
        let (a, b) = ((40.0, -90.0), (40.0, -89.0));
        let station = |ident: &str, at: Point, ceiling: f64| Station {
            ident: ident.into(),
            at,
            ceiling_ft: Some(ceiling),
            elevation_ft: Some(600.0),
        };
        let past = destination(b.0, b.1, 90.0, CLOUD_STATION_RADIUS_NM * 0.8);
        let far = destination(a.0, a.1, 0.0, CLOUD_STATION_RADIUS_NM * 3.0);
        let bases = leg_bases(&[(a, b)], &[station("FAR", far, 500.0), station("PAST", past, 2000.0)]);
        assert_eq!(bases, vec![Some((2600.0, "PAST".to_string()))]);
        assert_eq!(leg_bases(&[(a, b)], &[station("FAR", far, 500.0)]), vec![None]);
    }
}
