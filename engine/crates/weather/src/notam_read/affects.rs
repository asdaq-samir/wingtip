//! Which part of the planned flight a NOTAM affects (`notam_affects`): of
//! the roles its field plays in the plan, the departure, a stop, the
//! destination and the alternate filed, each it reaches, and whether it
//! takes away a procedure that role flies (the red chip) or is only the
//! field's (the neutral one). The apps each kept this rule, and they came
//! to disagree: it is read here from the card's own
//! parts (notam_card), never from its English.
//!
//! A procedure taken away reaches only the roles that fly it. A departure
//! procedure, a SID, an ODP or a DVA (AIM 5-2-9), is flown leaving the
//! field: the departure and each stop. An arrival, a STAR (AIM 5-4-1), or
//! an approach (AIM 5-4-5) is flown coming to it: the destination, each
//! stop and the alternate, which a pilot plans to land at (14 CFR 91.169).
//! What a NOTAM says happened to the field itself, a runway closed or a
//! light out, reaches every role there.

use super::{card, Card, Flown};
use crate::json::{self, Value};

/// The roles in the order the chip names them.
const ROLES: [&str; 4] = ["departure", "stop", "arrival", "alternate"];

/// Whether `role` flies a procedure flown `way`: a stop both leaves and
/// lands.
fn flies(role: &str, way: Flown) -> bool {
    match way {
        Flown::Leaving => matches!(role, "departure" | "stop"),
        Flown::Landing => matches!(role, "stop" | "arrival" | "alternate"),
    }
}

fn way(departure: bool) -> Flown {
    if departure {
        Flown::Leaving
    } else {
        Flown::Landing
    }
}

/// Each of `roles` the card reaches, with whether it takes away a
/// procedure that role flies: those taken first, then in the chip's order.
/// A procedure NOTAM whose procedures it cannot name (part of one taken,
/// an approach's) still reaches the roles that fly its kind, neutral: said
/// rather than missed, never red on a guess.
pub fn affects(c: &Card, roles: &[&str]) -> Vec<(&'static str, bool)> {
    let reached: Vec<(&'static str, bool)> = ROLES
        .into_iter()
        .filter(|r| roles.contains(r))
        .filter_map(|r| {
            let taken = c.procedures.iter().any(|p| flies(r, way(p.departure)));
            let reached = taken || c.field_wide || c.flown.is_some_and(|w| flies(r, w));
            reached.then_some((r, taken))
        })
        .collect();
    // Those taken first, each half kept in the chip's order.
    let (taken, rest): (Vec<_>, Vec<_>) = reached.into_iter().partition(|(_, taken)| *taken);
    taken.into_iter().chain(rest).collect()
}

/// `notam_affects`: `{"text", "idents"?, "roles": [...]}` to `{"affects":
/// [{"role", "taken"}]}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "notam_affects" {
        return Err(format!("{name}: not a rule of notam_affects"));
    }
    let text = v.get("text").and_then(Value::as_str).ok_or("notam_affects: \"text\" is missing")?;
    let idents: Vec<String> =
        v.get("idents").and_then(Value::as_array).unwrap_or(&[]).iter().filter_map(Value::as_str).map(str::to_owned).collect();
    // The roles are refused whole where any is wrong: missing, or a member
    // that is not one of the role names, a number among them as much as an
    // unknown word, so one mistake has one failure.
    let asked = v.get("roles").and_then(Value::as_array).ok_or("notam_affects: \"roles\" is missing")?;
    let roles = asked
        .iter()
        .map(|r| match r.as_str() {
            Some(s) if ROLES.contains(&s) => Ok(s),
            Some(s) => Err(format!("notam_affects: {s:?} is not a role")),
            None => Err("notam_affects: a role is not a string".to_owned()),
        })
        .collect::<Result<Vec<&str>, String>>()?;
    let mut out = String::from("{\"affects\":[");
    for (i, (role, taken)) in affects(&card(text, &idents), &roles).into_iter().enumerate() {
        out.push_str(if i == 0 { "{\"role\":" } else { ",{\"role\":" });
        json::string(&mut out, role);
        out.push_str(if taken { ",\"taken\":true}" } else { ",\"taken\":false}" });
    }
    out.push_str("]}");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FDC_6_3373: &str = "!FDC 6/3373 ARR SID AURORA MUNI, CHICAGO/AURORA, IL. ADELL EIGHT DEPARTURE (RNAV)... BLOKR EIGHT DEPARTURE (RNAV)... RWY 18/36 PROCEDURES NA. RWY 18/36 PERMANENTLY CLSD. 2605271843-2805271843EST";
    const SID_NA: &str = "!FDC 6/2 ORD SID CHICAGO O'HARE INTL, CHICAGO, IL. MOBLE FIVE DEPARTURE NA. 2611010000-2612010000";
    const STAR_NA: &str = "!FDC 6/1 ORD STAR CHICAGO O'HARE INTL, CHICAGO, IL. BENKY SIX ARRIVAL NA. 2611010000-2612010000";
    const RWY_CLSD: &str = "!OSH 11/041 OSH RWY 18/36 CLSD 2511120900-2511121700";

    fn of(text: &str, roles: &[&str]) -> Vec<(&'static str, bool)> {
        affects(&card(text, &[]), roles)
    }

    #[test]
    fn a_runway_closed_with_its_departures_is_red_leaving_and_neutral_landing() {
        assert_eq!(of(FDC_6_3373, &["departure"]), [("departure", true)]);
        assert_eq!(of(FDC_6_3373, &["arrival"]), [("arrival", false)]);
        // The same field both ends: the red one first.
        assert_eq!(of(FDC_6_3373, &["departure", "arrival"]), [("departure", true), ("arrival", false)]);
        assert_eq!(of(FDC_6_3373, &["arrival", "stop"]), [("stop", true), ("arrival", false)]);
    }

    #[test]
    fn a_procedure_taken_reaches_only_who_flies_it() {
        assert_eq!(of(SID_NA, &["departure"]), [("departure", true)]);
        assert_eq!(of(SID_NA, &["arrival"]), []);
        assert_eq!(of(SID_NA, &["alternate"]), []);
        assert_eq!(of(STAR_NA, &["alternate"]), [("alternate", true)]);
        assert_eq!(of(STAR_NA, &["departure"]), []);
        assert_eq!(of(STAR_NA, &["stop"]), [("stop", true)]);
    }

    #[test]
    fn the_fields_own_reaches_every_role_neutral() {
        assert_eq!(of(RWY_CLSD, &["stop"]), [("stop", false)]);
        assert_eq!(of(RWY_CLSD, &["alternate", "departure"]), [("departure", false), ("alternate", false)]);
        assert_eq!(of(RWY_CLSD, &[]), []);
    }

    #[test]
    fn a_procedure_it_cannot_name_reaches_its_kinds_roles_neutral() {
        let part = "!FDC 6/4 ORD SID CHICAGO O'HARE INTL, CHICAGO, IL. MOBLE FIVE DEPARTURE NA AT NIGHT. 2611010000-2612010000";
        assert_eq!(of(part, &["departure", "arrival"]), [("departure", false)]);
    }

    #[test]
    fn a_role_it_does_not_know_is_refused() {
        let v: Value = json::parse(r#"{"text":"x","roles":["enroute"]}"#).unwrap();
        assert!(call("notam_affects", &v).is_err());
    }

    #[test]
    fn roles_missing_or_not_words_are_refused() {
        for asked in [r#"{"text":"x"}"#, r#"{"text":"x","roles":[1]}"#, r#"{"text":"x","roles":["departure",null]}"#] {
            let v: Value = json::parse(asked).unwrap();
            assert!(call("notam_affects", &v).is_err(), "{asked}");
        }
        let v: Value = json::parse(r#"{"text":"x","roles":[]}"#).unwrap();
        assert_eq!(call("notam_affects", &v).unwrap(), r#"{"affects":[]}"#);
    }
}
