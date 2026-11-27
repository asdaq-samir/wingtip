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

/// What 14 CFR 91.211(a) asks of a flight up to `highest_ft` MSL in an
/// airplane with no pressurised cabin, its cabin at the altitude flown,
/// in a pilot's words: over 12,500 ft the crew's oxygen for any of it past
/// 30 minutes ((a)(1)), over 14,000 ft for all of it ((a)(2)), over 15,000
/// ft every occupant's ((a)(3)). Each height is the rule's "above", so
/// 12,500, 14,000 and 15,000 themselves ask no more than the band under.
/// The 30 minutes are not counted: said as the rule says them, the safer
/// side where the time up there is not known. None at or under 12,500 ft.
/// One copy for the pilot's own altitude's caution and the Brief's
/// oxygen finding.
pub fn oxygen_words(highest_ft: f64) -> Option<&'static str> {
    if highest_ft > OXYGEN_EVERYONE_FT {
        Some("Over 15,000 ft MSL: oxygen for the crew the whole time there and for every occupant (14 CFR 91.211(a)(2), (3))")
    } else if highest_ft > OXYGEN_CREW_FT {
        Some("Over 14,000 ft MSL: oxygen for the crew the whole time there (14 CFR 91.211(a)(2))")
    } else if highest_ft > OXYGEN_CREW_PAST_30_MIN_FT {
        Some("Over 12,500 ft MSL: oxygen for the crew for any of it past 30 minutes (14 CFR 91.211(a)(1))")
    } else {
        None
    }
}

/// 14 CFR 91.211(b)(1), an airplane with a pressurised cabin, by its
/// flight altitude (a pressure altitude, the flight level): (i) "above
/// flight level 250", a 10-minute supply of supplemental oxygen for each
/// occupant, for a descent should the cabin lose pressure; (ii) "above
/// flight level 350", one pilot at the controls wearing and using an
/// oxygen mask, unless two pilots at the controls each have a
/// quick-donning mask, at or below FL410. Each is the rule's "above".
pub const OXYGEN_PRESSURISED_SUPPLY_FT: f64 = 25_000.0;
pub const OXYGEN_PRESSURISED_MASK_FT: f64 = 35_000.0;

/// What 14 CFR 91.211 asks of a flight up to `highest_ft`, by the
/// airplane: with no pressurised cabin, its cabin at the altitude flown,
/// (a)'s three heights (oxygen_words), none where it carries supplemental
/// oxygen (`carried`); with a pressurised cabin, (a) is its cabin's,
/// kept under 12,500 ft as it is pressurised, and (b)(1)'s two flight
/// levels apply: above FL250 the 10-minute supply for every occupant
/// (none said where it carries oxygen), above FL350 the mask, which
/// carrying oxygen does not answer. One copy for the Go / No-Go's oxygen
/// finding and a pilot's own altitude's caution. Unknown airplane: none
/// carried, not pressurised, the safer side.
pub fn oxygen_asked(highest_ft: f64, carried: bool, pressurized: bool) -> Option<&'static str> {
    if !pressurized {
        return if carried { None } else { oxygen_words(highest_ft) };
    }
    if highest_ft > OXYGEN_PRESSURISED_MASK_FT {
        Some(if carried {
            "Above FL350 in a pressurised cabin: one pilot at the controls wearing and using an oxygen mask, unless two pilots there each have a quick-donning mask at or below FL410 (14 CFR 91.211(b)(1)(ii))"
        } else {
            "Above FL350 in a pressurised cabin: one pilot at the controls wearing and using an oxygen mask, unless two pilots there each have a quick-donning mask at or below FL410, and a 10-minute supply for every occupant (14 CFR 91.211(b)(1))"
        })
    } else if highest_ft > OXYGEN_PRESSURISED_SUPPLY_FT && !carried {
        Some("Above FL250 in a pressurised cabin: a 10-minute supply of oxygen for every occupant, for a descent if the cabin loses pressure (14 CFR 91.211(b)(1)(i))")
    } else {
        None
    }
}

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

    #[test]
    fn oxygen_by_the_airplane_91_211_a_and_b() {
        // (a): no pressurised cabin, nothing carried; "above" each height.
        assert!(oxygen_asked(12_500.0, false, false).is_none());
        assert!(oxygen_asked(12_600.0, false, false).unwrap().contains("(a)(1)"));
        assert!(oxygen_asked(14_500.0, true, false).is_none());
        // (b)(1)(i): pressurised, FL250 itself asks nothing, above it the supply.
        assert!(oxygen_asked(16_000.0, false, true).is_none());
        assert!(oxygen_asked(25_000.0, false, true).is_none());
        assert!(oxygen_asked(26_000.0, false, true).unwrap().ends_with("(14 CFR 91.211(b)(1)(i))"));
        assert!(oxygen_asked(26_000.0, true, true).is_none());
        // (b)(1)(ii): above FL350 the mask, oxygen carried or not.
        assert!(oxygen_asked(35_000.0, true, true).is_none());
        assert!(oxygen_asked(37_000.0, true, true).unwrap().ends_with("(14 CFR 91.211(b)(1)(ii))"));
        assert!(oxygen_asked(37_000.0, false, true).unwrap().ends_with("(14 CFR 91.211(b)(1))"));
    }
}
