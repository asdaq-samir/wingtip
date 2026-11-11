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
/// The lowest an altitude may be asked for: 500 ft, 91.119(c)'s least
/// height over other than congested areas (the planner still raises it
/// over the ground, obstacles and towns, 91.119(b)).
pub const LOWEST_FT: f64 = 500.0;
/// 91.159(a)'s cruising altitudes are thousands plus 500, so the wheel
/// steps by 500 ft.
pub const STEP_FT: f64 = 500.0;

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
