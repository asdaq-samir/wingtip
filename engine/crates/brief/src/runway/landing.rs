//! The runway landed on at a field the route flies an instrument approach
//! to (the web's PatternChips and useProceduresRoute, the phones' runway
//! line), one rule where the web had it in a component.
//!
//! A straight-in approach is flown to the runway its final course is
//! aligned with (within 30°, 15° for GPS: AIM 5-4-20, Approach and Landing
//! Minimums), and its straight-in minimums are that runway's (14 CFR
//! 91.175, the runway of intended landing); landing on any other runway is
//! a circle to land, flown to the plate's circling minimums and only where
//! the plate publishes them (AIM 5-4-20, circling minimums). So with an approach
//! the landing runway is the approach's own, unless the pilot picked
//! another and the plate lets the approach be circled. A wind's runway is
//! not taken over the approach's: the controller or the pilot chooses to
//! circle, the wind does not. An approach with no runway in its name
//! ("RNAV (GPS)-B", circling only) lands on whichever the pilot picks.

use super::pick::runway_number;
use crate::gonogo::calls::{truth, In};
use crate::json::{self, Value};

/// What the landing comes to: the runway landed on (None: none picked and
/// none the approach's), and whether a runway other than the approach's
/// own may be picked (a circle to land; any runway with no approach).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Landing {
    pub runway: Option<String>,
    pub others_allowed: bool,
}

/// `approach`: whether an approach is flown at the field; `straight_in`:
/// its runway, None for one circling only; `circling`: whether its plate
/// publishes circling minimums (None while the plate is still coming,
/// taken as not, so no circle is offered before the plate says so);
/// `picked`, `by_pilot`: the runway picked there and whether the pilot
/// picked it (else it was picked into the wind).
pub fn landing_runway(
    approach: bool,
    straight_in: Option<&str>,
    circling: Option<bool>,
    picked: Option<&str>,
    by_pilot: bool,
) -> Landing {
    let number = |r: &str| runway_number(r.trim()).to_ascii_uppercase();
    let picked = picked.filter(|p| !p.trim().is_empty()).map(number);
    let Some(own) = straight_in.filter(|r| approach && !r.trim().is_empty()).map(number) else {
        return Landing { runway: picked, others_allowed: true };
    };
    let others_allowed = circling == Some(true);
    let runway = match picked {
        Some(p) if p == own || (by_pilot && others_allowed) => p,
        _ => own,
    };
    Landing { runway: Some(runway), others_allowed }
}

/// The rule by name (contract/landing_runway.json).
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let i = In { name };
    let circling = match v.get("circling") {
        None | Some(Value::Null) => None,
        Some(_) => Some(truth(v, "circling")),
    };
    let l = landing_runway(
        truth(v, "approach"),
        i.opt_str(v, "straight_in")?.as_deref(),
        circling,
        i.opt_str(v, "picked")?.as_deref(),
        truth(v, "by_pilot"),
    );
    let mut out = String::from("{\"runway\":");
    json::opt_string(&mut out, l.runway.as_deref());
    out.push_str(&format!(",\"others_allowed\":{}}}", l.others_allowed));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn land(approach: bool, own: Option<&str>, circling: Option<bool>, picked: Option<&str>, by_pilot: bool) -> (Option<String>, bool) {
        let l = landing_runway(approach, own, circling, picked, by_pilot);
        (l.runway, l.others_allowed)
    }

    #[test]
    fn an_ils_with_nothing_picked_lands_on_its_own_runway() {
        // KDLH's ILS RWY 09, no runway picked: Land RWY 9 (hig.md Q3).
        assert_eq!(land(true, Some("09"), Some(false), None, false), (Some("9".into()), false));
    }

    #[test]
    fn the_winds_runway_gives_way_to_the_approachs() {
        // 27 picked into the wind, the plate circling or not: straight in.
        assert_eq!(land(true, Some("9"), Some(false), Some("27"), false), (Some("9".into()), false));
        assert_eq!(land(true, Some("9"), Some(true), Some("27"), false), (Some("9".into()), true));
    }

    #[test]
    fn the_pilots_circle_to_another_runway_stands_only_where_the_plate_allows_it() {
        assert_eq!(land(true, Some("9"), Some(true), Some("27"), true), (Some("27".into()), true));
        assert_eq!(land(true, Some("9"), Some(false), Some("27"), true), (Some("9".into()), false));
        // The plate still coming: no circle yet.
        assert_eq!(land(true, Some("9"), None, Some("27"), true), (Some("9".into()), false));
    }

    #[test]
    fn a_circling_only_approach_or_none_keeps_the_pick() {
        assert_eq!(land(true, None, Some(true), Some("24"), true), (Some("24".into()), true));
        assert_eq!(land(true, None, None, None, false), (None, true));
        assert_eq!(land(false, Some("9"), None, Some("27"), false), (Some("27".into()), true));
    }

    #[test]
    fn a_lettered_runway_keeps_its_letter() {
        assert_eq!(land(true, Some("08l"), Some(false), None, false), (Some("8L".into()), false));
    }
}
