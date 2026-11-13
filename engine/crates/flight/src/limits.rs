//! The altitudes a flight may be planned at, one copy for every app: the
//! web's wheel and typed altitude, the iPhone's and Android's, the point
//! altitudes in the address, the filed level (crate::filing) and the
//! altitude as ATC says it each had their own 18,000, 17,500 or 41,000 before (#482 phase 1).

/// Class A begins at 18,000 ft MSL (14 CFR 71.33(a)) and takes no VFR
/// flight (91.135(a): IFR only).
pub const CLASS_A_FLOOR_FT: f64 = 18_000.0;
/// From here up the altimeter is set to 29.92 and the altitude is a flight
/// level (14 CFR 91.121(a)(2), 1.1 "flight level").
pub const FLIGHT_LEVELS_FROM_FT: f64 = 18_000.0;
/// The highest VFR cruising altitude under Class A: 17,500 ft, the top of
/// 91.159(a)'s odd and even thousands plus 500.
pub const VFR_HIGHEST_FT: f64 = 17_500.0;
/// The highest altitude IFR is planned at here: FL410, the highest
/// 91.179(b)(4) names ("such as flight level 290, 310, ... 410").
pub const IFR_HIGHEST_FT: f64 = 41_000.0;
/// The lowest an altitude may be asked for, ft MSL: a design floor for the
/// wheel and the typed altitude, no rule. 91.119(c)'s 500 ft is above the
/// surface, not sea level; the legal floor over the ground, obstacles and
/// towns is the planner's (altitude floor.rs, 91.119(b), (c)).
pub const LOWEST_FT: f64 = 500.0;
/// 91.159(a)'s cruising altitudes are thousands plus 500, so the wheel
/// steps by 500 ft.
pub const STEP_FT: f64 = 500.0;

/// The pattern as the engine sketches it (wingtip_brief's runway::circuit
/// draws it, the nav log descends to it): the downwind three-quarters of
/// a statute mile out, the middle of the half a mile to a mile FAA-H-8083-
/// 3C ch. 8 gives, and the 45-degree entry drawn 1.2 nm long to where it
/// joins the downwind abeam the runway's midpoint (AC 90-66C 11.3:
/// "Entry to the downwind leg should be at a 45-degree angle abeam the
/// midpoint of the runway"). Both are a sketch's sizes, not a rule: the
/// size of a pattern is the pilot's.
pub const PATTERN_DOWNWIND_NM: f64 = 0.75 * wingtip_core::units::NM_PER_SM;
pub const PATTERN_ENTRY_NM: f64 = 1.2;

/// How far from the field's centre the 45-degree entry begins, nm (about
/// 1.7): where a descent to the pattern altitude is to be finished. AC
/// 90-66C 11.2: "proceed to a point well clear of the pattern before
/// descending to and entering at pattern altitude"; 11.3: "Arriving
/// aircraft should be at traffic pattern altitude and allow for
/// sufficient time to view the entire traffic pattern before entering.
/// Entries into traffic patterns while descending may create collision
/// hazards and should be avoided." The entry's start, the downwind's
/// distance out plus the entry's run across and along, is the least of
/// it; the pilot levels sooner where the traffic asks.
pub fn pattern_entry_start_nm() -> f64 {
    let half = PATTERN_ENTRY_NM * std::f64::consts::FRAC_1_SQRT_2;
    (PATTERN_DOWNWIND_NM + half).hypot(half)
}

/// 14 CFR 91.211(a), supplemental oxygen in an airplane without a
/// pressurised cabin, its cabin at the altitude flown: (a)(1) above
/// 12,500 ft MSL up to 14,000 ft, the minimum flight crew for any of it
/// past 30 minutes; (a)(2) above 14,000 ft, the crew the whole time;
/// (a)(3) above 15,000 ft, every occupant provided with it. One copy for
/// the nav log's plans (held under the first) and the cautions.
pub const OXYGEN_CREW_PAST_30_MIN_FT: f64 = 12_500.0;
pub const OXYGEN_CREW_FT: f64 = 14_000.0;
pub const OXYGEN_EVERYONE_FT: f64 = 15_000.0;

/// The highest altitude for the flight rules flown.
pub fn highest_ft(ifr: bool) -> f64 {
    if ifr {
        IFR_HIGHEST_FT
    } else {
        VFR_HIGHEST_FT
    }
}

/// Whether an altitude asked for may be planned: no lower than LOWEST_FT,
/// under Class A for VFR (any figure under 18,000 ft, not only 91.159's,
/// as the pilot may fly one of their own), no higher than FL410 for IFR.
pub fn allowed(ft: f64, ifr: bool) -> bool {
    ft.is_finite() && ft >= LOWEST_FT && if ifr { ft <= IFR_HIGHEST_FT } else { ft < CLASS_A_FLOOR_FT }
}

/// Every 500 ft from `from_ft` (rounded up to a step) to 17,500 ft: the
/// VFR altitudes a wheel offers.
pub fn vfr_altitudes(from_ft: f64) -> Vec<f64> {
    let mut ft = (from_ft.max(LOWEST_FT) / STEP_FT).ceil() * STEP_FT;
    let mut out = Vec::new();
    while ft <= VFR_HIGHEST_FT {
        out.push(ft);
        ft += STEP_FT;
    }
    out
}

/// Whether an altitude is a flight level (91.121(a)(2)).
pub fn is_flight_level(ft: f64) -> bool {
    ft >= FLIGHT_LEVELS_FROM_FT
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn class_a_is_the_vfr_ceiling() {
        assert!(allowed(17_999.0, false));
        assert!(!allowed(18_000.0, false));
        assert!(allowed(41_000.0, true));
        assert!(!allowed(41_500.0, true));
        assert!(!allowed(499.0, false));
        assert!(allowed(500.0, false));
    }

    #[test]
    fn the_wheel() {
        let wheel = vfr_altitudes(1_000.0);
        assert_eq!(wheel.first(), Some(&1_000.0));
        assert_eq!(wheel.last(), Some(&17_500.0));
        assert_eq!(wheel.len(), 34);
        assert_eq!(vfr_altitudes(1_400.0).first(), Some(&1_500.0));
    }
}
