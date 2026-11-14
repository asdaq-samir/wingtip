//! A way's one warning, the worst of what it crosses, in the words every
//! app says it in: route options' cards (options/special_use's
//! way_warning, each way's `warning`) and the route as typed, whose
//! crossings the planner gives with its chips (the web's "As typed" card).
//! Out of the route-options feature so an app's module takes it alone.
//!
//! The order, worst first: airspace a pilot may not enter (a prohibited
//! area, 14 CFR 91.133(a), AIM 3-4-2; a TFR, 91.137 to 91.145) or not
//! without permission while it is active (a restricted area, 91.133(a),
//! AIM 3-4-3), then storms and high ground, a SIGMET, no fuel in reach,
//! other weather, and last the areas flown through with a caution (a
//! warning area, a MOA and an alert area, AIM 3-4-4 to 3-4-6).

use crate::json::{self, Value};
use wingtip_core::ask::Ask;

const ORDER: [&str; 11] = ["prohibited", "tfr", "restricted", "storm", "terrain", "sigmet", "fuel", "weather", "warning", "moa", "alert"];

/// The worst of the hazard kinds crossed, as the card says it; None where
/// nothing is crossed. A kind not in the order is other weather.
pub fn worst<'a>(kinds: impl IntoIterator<Item = &'a str>) -> Option<&'static str> {
    let rank = |kind: &str| ORDER.iter().position(|k| *k == kind).unwrap_or(7);
    let worst = kinds.into_iter().min_by_key(|k| rank(k))?;
    Some(match worst {
        "fuel" => "No fuel stop in reach",
        "prohibited" => "Crosses a prohibited area",
        "tfr" => "Crosses a TFR",
        "restricted" => "Crosses a restricted area",
        "storm" => "Crosses storms",
        "terrain" => "Crosses high ground",
        "sigmet" => "Crosses a SIGMET",
        "warning" => "Crosses a warning area",
        "moa" => "Crosses a MOA",
        "alert" => "Crosses an alert area",
        _ => "Crosses weather",
    })
}

/// `route_way_warning`: `{kinds: [string]}`, the kinds of the hazards a
/// way crosses, answered with its warning or null.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let kinds: Vec<&str> = ask.list("kinds")?.iter().filter_map(Value::as_str).collect();
    let mut out = String::new();
    match worst(kinds) {
        Some(words) => json::string(&mut out, words),
        None => out.push_str("null"),
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::worst;

    #[test]
    fn the_worst_crossed_first_restricted_before_a_moa() {
        assert_eq!(worst(["moa", "restricted"]), Some("Crosses a restricted area"));
        assert_eq!(worst(["sigmet", "tfr"]), Some("Crosses a TFR"));
        assert_eq!(worst(["storm"]), Some("Crosses storms"));
        assert_eq!(worst(["icing"]), Some("Crosses weather"));
        assert_eq!(worst([]), None);
    }
}
