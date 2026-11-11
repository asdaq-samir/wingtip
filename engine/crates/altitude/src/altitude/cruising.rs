//! The cruising altitudes a course allows, VFR's and IFR's.

use crate::flight::lowest_vfr_cruising_altitude;
use crate::geo::py_mod;
use wingtip_core::sort::StableSort;

/// 14 CFR 71.33: Class A airspace begins at 18,000 ft MSL, and 91.135
/// takes no VFR flight into it: no VFR cruising above 17,500. The figures
/// are wingtip_flight::limits', the one copy every app asks.
pub use wingtip_flight::limits::CLASS_A_FLOOR_FT;

/// The highest VFR cruising altitude: 91.159(a)'s last thousand plus 500
/// under Class A (limits::VFR_HIGHEST_FT).
pub const VFR_TOP_FT: f64 = wingtip_flight::limits::VFR_HIGHEST_FT;

/// 14 CFR 91.159: the odd/even thousands plus 500 are for cruising "more
/// than 3,000 feet above the surface". Below that any altitude is legal,
/// and the planner offers every 500 ft there as well as the rule's.
pub const HEMISPHERIC_RULE_AGL_FT: f64 = 3000.0;

/// The step the altitudes under 91.159's reach are offered on
/// (limits::STEP_FT).
pub const LOW_STEP_FT: f64 = wingtip_flight::limits::STEP_FT;

/// Where no 500 ft step fits under a ceiling, the step a tight altitude
/// is found on.
pub const TIGHT_STEP_FT: f64 = 100.0;

/// 14 CFR 91.179(b)(4) and FAA Order JO 7110.65 TBL 4-5-1: every 2,000 ft
/// by the direction of flight up to FL410 in RVSM airspace (all of the
/// US's domestic airspace from FL290 to FL410; limits::IFR_HIGHEST_FT).
pub const IFR_TOP_FT: f64 = wingtip_flight::limits::IFR_HIGHEST_FT;

/// The altitude wheel's lowest row: the owner's wheel of 2026-10-20 runs
/// every 500 ft from 1,000 ft up to VFR_TOP_FT besides the legal ones.
pub const WHEEL_LOWEST_FT: f64 = 1000.0;

/// Every legal VFR cruising altitude for the magnetic course from the
/// floor up to the ceiling, ascending: 91.159(a)'s thousands plus 500,
/// 2,000 ft apart, capped under Class A; and, up to `rule_from_ft` (3,000
/// ft above the lowest ground, where 91.159 begins to apply), every 500 ft
/// besides. Empty where the first one above the floor is over the ceiling.
///
/// The rule used to be applied at every altitude, which on a low-ceiling
/// day left out the altitudes under the clouds: a westbound leg with cloud
/// at 2,600 ft kept nothing, its first even thousand plus 500 being 2,500
/// -- too close to the cloud -- where 2,000 was legal.
pub fn legal_vfr(floor_ft: f64, ceiling_ft: Option<f64>, magnetic_course_deg: f64, rule_from_ft: Option<f64>) -> Vec<f64> {
    let top = ceiling_ft.map_or(VFR_TOP_FT, |c| c.min(VFR_TOP_FT));
    let mut out = Vec::new();
    let mut candidate = lowest_vfr_cruising_altitude(floor_ft, magnetic_course_deg);
    while candidate <= top {
        out.push(candidate);
        candidate += 2000.0;
    }
    if let Some(rule_from) = rule_from_ft {
        let mut candidate = (floor_ft / LOW_STEP_FT).ceil() * LOW_STEP_FT;
        while candidate <= top.min(rule_from) {
            out.push(candidate);
            candidate += LOW_STEP_FT;
        }
    }
    out.stable_sort_by(f64::total_cmp);
    out.dedup();
    out
}

/// Where no 500 ft step fits between the floor and the ceiling (a 1,800
/// ft floor under Chicago's 1,900 ft Class B shelf), the highest whole
/// hundred under the ceiling that clears the floor: legal below 3,000 ft
/// above the ground, where 91.159's altitudes do not apply -- under the
/// shelf, not at it, as its floor is Class B -- but tight, and said so.
/// None where nothing fits, there is no ceiling, or it is above where the
/// rule begins.
pub fn tight(floor_ft: f64, ceiling_ft: Option<f64>, rule_from_ft: Option<f64>) -> Option<f64> {
    let (ceiling, rule_from) = (ceiling_ft?, rule_from_ft?);
    let altitude = ((ceiling / TIGHT_STEP_FT).ceil() - 1.0) * TIGHT_STEP_FT;
    (altitude >= floor_ft && altitude < rule_from).then_some(altitude)
}

/// Every IFR cruising altitude for the magnetic course from the floor up
/// to the ceiling, ascending: odd thousands (and odd flight levels) on a
/// course of 000 to 179, even on 180 to 359 -- 14 CFR 91.179(b)(1), (2)
/// and (4), and FAA Order JO 7110.65 TBL 4-5-1 as ATC assigns them in
/// controlled airspace -- to FL410. Empty where the first one above the
/// floor is over the ceiling.
pub fn legal_ifr(floor_ft: f64, ceiling_ft: Option<f64>, magnetic_course_deg: f64) -> Vec<f64> {
    let odd = py_mod(magnetic_course_deg, 360.0) < 180.0;
    let mut thousands = ((floor_ft / 1000.0).ceil() as i64).max(1);
    if (thousands.rem_euclid(2) == 1) != odd {
        thousands += 1;
    }
    let top = ceiling_ft.map_or(IFR_TOP_FT, |c| c.min(IFR_TOP_FT));
    let last = (top / 1000.0).floor() as i64;
    (thousands..=last).step_by(2).map(|t| (t * 1000) as f64).collect()
}

/// The altitude wheel's rows (the owner's pick of 2026-10-20): the legal
/// altitudes given, the one flown, and every 500 ft from 1,000 ft up to
/// 17,500 under Class A besides, at the owner's "I don't want to put hard
/// limits on anything", highest first. An altitude off the legal list is
/// flown as the pilot's own, with its cautions.
pub fn wheel(legal_ft: &[f64], flown_ft: Option<f64>) -> Vec<f64> {
    let mut rows: Vec<f64> = legal_ft.to_vec();
    rows.extend(flown_ft);
    // The ladder is limits' vfr_altitudes, the one the apps ask by name.
    rows.extend(wingtip_flight::limits::vfr_altitudes(WHEEL_LOWEST_FT));
    rows.stable_sort_by(|a, b| b.total_cmp(a));
    rows.dedup();
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn under_3000_ft_over_the_ground_every_500_ft_is_legal_besides_the_rules() {
        // 91.159 applies above 4,500 ft over 1,500 ft ground.
        let legal = legal_vfr(2000.0, None, 0.0, Some(4500.0));
        assert_eq!(&legal[..8], &[2000.0, 2500.0, 3000.0, 3500.0, 4000.0, 4500.0, 5500.0, 7500.0]);
        assert_eq!(*legal.last().unwrap(), 17500.0);
    }

    #[test]
    fn ifr_flies_odd_thousands_east_and_even_west() {
        assert_eq!(legal_ifr(4100.0, Some(12000.0), 90.0), vec![5000.0, 7000.0, 9000.0, 11000.0]);
        assert_eq!(legal_ifr(4100.0, Some(12000.0), 270.0), vec![6000.0, 8000.0, 10000.0, 12000.0]);
        assert_eq!(legal_ifr(2100.0, Some(6000.0), 179.9), vec![3000.0, 5000.0]);
        assert_eq!(legal_ifr(2100.0, Some(6000.0), 180.0), vec![4000.0, 6000.0]);
        assert!(legal_ifr(8100.0, Some(8900.0), 90.0).is_empty());
        assert_eq!(*legal_ifr(38000.0, None, 90.0).last().unwrap(), 41000.0);
        assert_eq!(*legal_ifr(38000.0, None, 270.0).last().unwrap(), 40000.0);
    }

    #[test]
    fn a_tight_altitude_is_the_highest_hundred_under_the_ceiling() {
        assert_eq!(tight(1800.0, Some(1900.0), Some(3600.0)), Some(1800.0));
        assert_eq!(tight(1750.0, Some(1950.0), Some(3600.0)), Some(1900.0));
        assert_eq!(tight(1850.0, Some(1900.0), Some(3600.0)), None);
        assert_eq!(tight(1800.0, None, Some(3600.0)), None);
        assert_eq!(tight(3800.0, Some(4000.0), Some(3600.0)), None);
    }

    #[test]
    fn the_wheel_runs_from_1000_to_17500_with_the_legal_ones() {
        let rows = wheel(&[4500.0, 2200.0], Some(3300.0));
        assert_eq!(rows[0], 17500.0);
        assert_eq!(*rows.last().unwrap(), 1000.0);
        assert!(rows.contains(&2200.0) && rows.contains(&3300.0));
        assert_eq!(rows.iter().filter(|&&r| r == 4500.0).count(), 1);
    }
}
