//! An altitude as a pilot types it, read to feet, with what the planner says
//! of it: one reading for every app's typed cruise altitude (the web's FPL
//! pill read it by hand, and read "0450" as 500 ft and "0045" as nothing).
//!
//! The ways a pilot writes one (the owner, 2026-10-27): a flight level's
//! three figures, "075", "FL075" or "FL-075", in hundreds of feet (14 CFR
//! 1.1: a flight level "is stated in three digits that represent hundreds of
//! feet"), the app writing every altitude so at the owner's pick
//! (2026-10-20); or feet, "7500" or "7,500", four figures or five. Nothing is
//! guessed: four or five figures starting with a 0 are neither (a flight
//! level is three, feet do not start with a 0), and six or more are no
//! altitude, so each is answered with why rather than a figure.
//!
//! Warn, never limit (the owner): a figure the planner can fly is planned
//! even where the rules say no, with the reason, and the planner's own
//! altitude cautions (own_altitude_caution) say the rest.

use crate::limits::{self, CLASS_A_FLOOR_FT, IFR_HIGHEST_FT, LOWEST_FT};

/// The top of Class A, FL600 (14 CFR 71.33(a): "from 18,000 feet MSL to
/// and including FL600"). Above it no airplane this app plans for flies;
/// a figure there is a slip of the finger, not a cruise, so it is not
/// planned.
pub const CLASS_A_CEILING_FT: f64 = 60_000.0;

/// The most figures an altitude typed has: five, feet to 99,999.
const MOST_FIGURES: usize = 5;

/// An altitude typed, read: `ft` the altitude to plan, or none where none
/// can be; `reason` why not, or the warning a planned one carries.
#[derive(Debug, PartialEq)]
pub struct Typed {
    pub ft: Option<f64>,
    pub reason: Option<&'static str>,
}

const fn refused(reason: &'static str) -> Typed {
    Typed { ft: None, reason: Some(reason) }
}

/// What `text`, typed as a cruise altitude under VFR or IFR, is.
pub fn read(text: &str, ifr: bool) -> Typed {
    let upper = text.trim().to_ascii_uppercase();
    let rest = upper.strip_prefix("FL").unwrap_or(&upper);
    let figures: String = rest.chars().filter(|c| !matches!(c, '-' | ',' | ' ')).collect();
    if figures.is_empty() {
        return Typed { ft: None, reason: None };
    }
    if !figures.bytes().all(|b| b.is_ascii_digit()) {
        return refused("Not an altitude: type a flight level, 075, or feet, 7500");
    }
    if figures.len() > MOST_FIGURES {
        return refused("Five figures at most: 075 for a flight level, 7500 for feet");
    }
    let n: f64 = figures.parse().unwrap_or(0.0);
    let ft = if figures.len() <= 3 {
        n * 100.0
    } else if figures.starts_with('0') {
        // "0450": FL045 with a figure too many, or FL450 with a 0 too many.
        return refused("A flight level is three figures (14 CFR 1.1): 045 for 4,500 ft, 450 for FL450");
    } else {
        // Feet, to the hundred a flight level and the planner's steps are in.
        (n / 100.0).round() * 100.0
    };
    if ft < LOWEST_FT {
        return refused("Under 500 ft MSL, the lowest a cruise is planned at");
    }
    if ft > CLASS_A_CEILING_FT {
        return refused("Above FL600, the top of Class A (14 CFR 71.33(a)): too high to plan");
    }
    let reason = if limits::allowed(ft, ifr) {
        None
    } else if ifr {
        debug_assert!(ft > IFR_HIGHEST_FT);
        Some("Above FL410, the highest 14 CFR 91.179(b) names: planned as asked")
    } else {
        debug_assert!(ft >= CLASS_A_FLOOR_FT);
        Some("In Class A from 18,000 ft MSL, IFR only (14 CFR 71.33(a), 91.135(a)): planned as asked")
    };
    Typed { ft: Some(ft), reason }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ft(text: &str, ifr: bool) -> Option<f64> {
        read(text, ifr).ft
    }

    #[test]
    fn a_flight_levels_three_figures_are_hundreds_of_feet() {
        // 14 CFR 1.1: "flight level 250 represents ... 25,000 feet".
        assert_eq!(ft("250", true), Some(25_000.0));
        assert_eq!(ft("075", false), Some(7_500.0));
        assert_eq!(ft("FL075", false), Some(7_500.0));
        assert_eq!(ft("fl-045", false), Some(4_500.0));
        assert_eq!(ft("45", false), Some(4_500.0));
        assert_eq!(read("075", false).reason, None);
    }

    #[test]
    fn four_or_five_figures_are_feet() {
        assert_eq!(ft("7500", false), Some(7_500.0));
        assert_eq!(ft("7,500", false), Some(7_500.0));
        assert_eq!(ft("12345", true), Some(12_300.0));
    }

    #[test]
    fn nothing_is_guessed() {
        for text in ["0450", "0045", "04500", "123456", "12345678", "KOSH", "0", "000", "4"] {
            let typed = read(text, false);
            assert_eq!(typed.ft, None, "{text}");
            assert!(typed.reason.is_some(), "{text}");
        }
        assert_eq!(read("", false), Typed { ft: None, reason: None });
        assert_eq!(read("FL-", false), Typed { ft: None, reason: None });
    }

    #[test]
    fn the_bounds_both_sides() {
        // 500 ft the design floor (limits::LOWEST_FT).
        assert_eq!(ft("005", false), Some(500.0));
        assert_eq!(ft("004", false), None);
        // Class A from 18,000 ft MSL (71.33(a)): VFR planned there with its warning.
        assert_eq!(read("175", false), Typed { ft: Some(17_500.0), reason: None });
        let class_a = read("18000", false);
        assert_eq!(class_a.ft, Some(18_000.0));
        assert!(class_a.reason.unwrap().contains("91.135"));
        assert_eq!(read("180", true).reason, None);
        // FL410 the highest 91.179(b) names; above it planned, warned.
        assert_eq!(read("410", true).reason, None);
        assert_eq!(read("430", true).ft, Some(43_000.0));
        assert!(read("430", true).reason.is_some());
        // FL600 Class A's top (71.33(a)); above it nothing is planned.
        assert_eq!(ft("600", true), Some(60_000.0));
        assert_eq!(ft("610", true), None);
        assert_eq!(ft("99999", true), None);
    }
}
