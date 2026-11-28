//! What an instructor is warned of before signing an endorsement, never a
//! refusal (the owner's rule, 2026-10-26: make the pilot aware, never
//! restrict them): the words are AC 61-65K's and are signed as given.
//!
//! AC 61-65K A.13 ("Solo at an Airport in Class B Airspace", 14 CFR
//! 61.95(b)) names any airport, but 14 CFR 91.131(b)(2) has no one take off
//! or land "at those airports listed in section 4 of appendix D to this
//! part unless the pilot in command holds at least a private pilot
//! certificate": at those 12 no endorsement lets a student, sport or
//! recreational pilot fly solo (wingtip_flight::special_vfr_airports).

use crate::json::{self, Value};
use wingtip_flight::special_vfr_airports::class_b_solo_barred;

/// The A.13 endorsement's code (kinds.rs) and the field naming its airport.
const CLASS_B_AIRPORT: &str = "class-b-airport";
const AIRPORT_FIELD: &str = "airport";

/// The warnings for an endorsement of `code` with its fields as given
/// (`field`): for A.13, one for each appendix D section 4 airport the
/// airport field names by its FAA or ICAO ident ("O'Hare (KORD)"). The
/// field is the instructor's own words, so an airport named only in words
/// ("Chicago O'Hare") is not seen.
pub fn warnings(code: &str, field: &dyn Fn(&str) -> Option<String>) -> Vec<String> {
    if code != CLASS_B_AIRPORT {
        return Vec::new();
    }
    let named = field(AIRPORT_FIELD).unwrap_or_default();
    let mut out: Vec<String> = Vec::new();
    for word in named.split(|c: char| !c.is_ascii_alphanumeric()) {
        if let Some(a) = class_b_solo_barred(word) {
            let said = format!(
                "No student, sport or recreational pilot may take off or land solo at {} ({}), whatever this endorsement says: it wants at least a private pilot certificate (14 CFR 91.131(b)(2); part 91 appendix D, section 4).",
                a.name, a.faa
            );
            if !out.contains(&said) {
                out.push(said);
            }
        }
    }
    out
}

/// `endorsement_warnings`: `{"code", "fields"?: {key: text}}` to the
/// warnings, `[text]`, empty where there are none.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let code = v.get("code").and_then(Value::as_str).ok_or_else(|| format!("{name}: \"code\" is not a string"))?;
    let given = match v.get("fields") {
        None | Some(Value::Null) => None,
        Some(f @ Value::Object(_)) => Some(f),
        Some(_) => return Err(format!("{name}: \"fields\" is not an object of names to words")),
    };
    let mut out = String::from("[");
    for (i, w) in warnings(code, &|key| given.and_then(|g| g.get(key)).and_then(Value::as_str).map(str::to_owned)).iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(&mut out, w);
    }
    out.push(']');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(code: &str, airport: &str) -> Vec<String> {
        let airport = airport.to_owned();
        warnings(code, &move |k| (k == "airport").then(|| airport.clone()))
    }

    #[test]
    fn a13_at_an_appendix_d_section_4_airport_is_warned_of() {
        let o_hare = at("class-b-airport", "Chicago O'Hare (KORD)");
        assert_eq!(o_hare.len(), 1);
        assert!(o_hare[0].contains("Chicago-O'Hare International Airport (ORD)"), "{o_hare:?}");
        assert!(o_hare[0].contains("14 CFR 91.131(b)(2)"));
        assert_eq!(at("class-b-airport", "lga").len(), 1);
        // Named twice, said once.
        assert_eq!(at("class-b-airport", "JFK / KJFK").len(), 1);
    }

    #[test]
    fn elsewhere_or_another_endorsement_is_not() {
        // Midway sits under O'Hare's Class B and is not in section 4; BWI
        // is in section 3 (special VFR) only.
        assert!(at("class-b-airport", "Chicago Midway (KMDW)").is_empty());
        assert!(at("class-b-airport", "KBWI").is_empty());
        assert!(at("class-b", "KORD").is_empty());
        assert!(at("class-b-airport", "").is_empty());
    }
}
