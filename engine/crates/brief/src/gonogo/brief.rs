//! The Brief's Go / No-Go put together, `gonogo_brief`: the seven
//! findings (verdict::verdict_items), the IFR alternate's say in the
//! weather's (14 CFR 91.169), the fields row for a closed, private or
//! military-only field (permission, decision 0043; 14 CFR 91.103), the
//! airplane's findings left out where none is picked, and the line over
//! what is left. The web put these together itself in its view model;
//! one call now does it, so a phone or the planner that shows the Brief
//! puts them together the same way. The findings are the planner's; the
//! decision is the pilot in command's (14 CFR 91.3).

use super::calls::{alternates, truth, verdict_input, In};
use super::permission::{permission_item, read_fields};
use super::verdict::{self, item_json, Item};
use crate::json::{self, Value};
use wingtip_flight::limits::oxygen_asked;

type R<T> = Result<T, String>;

/// The findings that need an airplane's figures, left out when none is
/// picked: the fuel, the runways' distances and crosswind and the weight
/// and balance are an airplane's, and are not judged on one assumed (the
/// owner, 2026-11-08: "don't assume"). The departure window leaves them
/// out of each hour the same way.
pub const AIRPLANE_ITEMS: [&str; 3] = ["fuel", "runways", "balance"];

/// The findings in the order the Brief shows them: the seven with the
/// alternate's put in the weather's, then the fields row, and without the
/// airplane's where there is none.
pub fn assemble(items: Vec<Item>, alternate: Option<(&str, &str)>, fields: Option<Item>, airplane: bool) -> Vec<Item> {
    verdict::with_alternate(items, alternate)
        .into_iter()
        .chain(fields)
        .filter(|i| airplane || !AIRPLANE_ITEMS.contains(&i.key.as_str()))
        .collect()
}

/// The oxygen finding, after the altitude's: what 14 CFR 91.211 asks of
/// the highest altitude the nav log flies (`highest_ft`) in the airplane
/// (wingtip_flight::limits::oxygen_asked): (a), its cabin at that
/// altitude, where it is not known to carry oxygen (`oxygen`) or a
/// pressurised cabin (`pressurized`); (b)(1)'s FL250 and FL350 where it is
/// pressurised. With none picked, neither is known: the safer side. A
/// caution, not a stop: the pilot may carry portable oxygen the planner
/// cannot see (the owner, 2026-10-23: a warning, never a limit). FL-145
/// for 13 hours said nothing of it (the UI audit's A2). None at or under
/// 12,500 ft unpressurised, or before the nav log.
pub fn oxygen_item(altitude: Option<&Value>) -> Option<Item> {
    let altitude = altitude?;
    let highest = altitude.get("highest_ft").and_then(Value::as_f64)?;
    let words = oxygen_asked(highest, truth(altitude, "oxygen"), truth(altitude, "pressurized"))?;
    let section = Some("Cruise Altitude".to_owned());
    Some(Item {
        key: "oxygen".into(),
        label: "Oxygen".into(),
        tab: "enroute".into(),
        section,
        finding: "caution".into(),
        detail: words.into(),
    })
}

/// The findings with the oxygen's after the altitude's.
fn with_oxygen(mut items: Vec<Item>, oxygen: Option<Item>) -> Vec<Item> {
    let at = items.iter().position(|i| i.key == "altitude").map_or(items.len(), |n| n + 1);
    items.splice(at..at, oxygen);
    items
}

/// `gonogo_brief` by name: its input read, the findings put together and
/// written with the line over them.
pub fn call(name: &str, v: &Value) -> R<String> {
    let i = In { name };
    // The facts (gonogo_input's input) put together here, the risk beside
    // them, where a caller sends those rather than the sections built:
    // the web, which then makes no copy of the shapes either way.
    let built = match i.obj(v, "facts")? {
        Some(facts) => {
            let Value::Object(mut sections) = json::parse(&super::input::call("gonogo_input", facts)?)? else {
                return i.err("facts", "made no sections");
            };
            sections.push(("risk".to_owned(), v.get("risk").cloned().unwrap_or(Value::Null)));
            Some(Value::Object(sections))
        }
        None => None,
    };
    let given = match &built {
        Some(b) => b,
        None => i.obj(v, "verdict")?.map_or_else(|| i.err("verdict", "is missing"), Ok)?,
    };
    let mut input = verdict_input(i, given)?;
    // The oxygen said once, in its own finding: a pilot's own altitude's
    // cautions (altitude::cautions) say it too, last.
    let oxygen = oxygen_item(given.get("altitude"));
    input.altitude.cautions.retain(|c| oxygen.as_ref().is_none_or(|o| *c != o.detail));
    // The alternate is an IFR flight's alone (14 CFR 91.169(a)): under VFR
    // its answer, if one was sent, says nothing; under IFR none sent is
    // none checked, which is unknown, never ok (91.169(b)).
    let alternate = if input.weather.ifr {
        match alternates(i, v.get("alternate"))? {
            Some(a) => verdict::alternate_finding(Some(&a)),
            None => Some(verdict::alternate_unchecked()),
        }
    } else {
        None
    };
    let fields = permission_item(&read_fields(i, v, "fields")?);
    let items = assemble(
        with_oxygen(verdict::verdict_items(&input), oxygen),
        alternate.as_ref().map(|(f, d)| (*f, d.as_str())),
        fields,
        truth(v, "airplane"),
    );
    let (finding, words) = verdict::verdict_line(&items);
    let mut out = String::from("{\"items\":[");
    for (n, item) in items.iter().enumerate() {
        if n > 0 {
            out.push(',');
        }
        item_json(&mut out, item);
    }
    out.push_str("],\"line\":{\"finding\":");
    json::string(&mut out, finding);
    out.push_str(",\"words\":");
    json::string(&mut out, &words);
    out.push_str("}}");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(key: &str, finding: &str) -> Item {
        Item {
            key: key.into(),
            label: key.into(),
            tab: "preflight".into(),
            section: None,
            finding: finding.into(),
            detail: "As found".into(),
        }
    }

    fn keys(items: &[Item]) -> Vec<&str> {
        items.iter().map(|i| i.key.as_str()).collect()
    }

    #[test]
    fn the_fields_row_goes_after_the_seven() {
        let seven = vec![item("weather", "ok"), item("risk", "ok")];
        let got = assemble(seven, None, Some(item("fields", "caution")), true);
        assert_eq!(keys(&got), ["weather", "risk", "fields"]);
    }

    #[test]
    fn no_airplane_leaves_its_findings_out() {
        let all = ["weather", "airspace", "altitude", "fuel", "runways", "balance", "risk"].map(|k| item(k, "ok")).to_vec();
        assert_eq!(keys(&assemble(all.clone(), None, None, false)), ["weather", "airspace", "altitude", "risk"]);
        assert_eq!(assemble(all.clone(), None, None, true).len(), 7);
    }

    #[test]
    fn oxygen_over_12500_ft_after_the_altitude_unless_the_airplane_carries_it() {
        let at = |v: &str| oxygen_item(Some(&json::parse(v).unwrap()));
        // 14 CFR 91.211(a): each height is "above"; FL-145 is (a)(2)'s.
        assert!(at(r#"{"highest_ft": 12500}"#).is_none());
        assert!(at(r#"{"highest_ft": 12600}"#).unwrap().detail.contains("(a)(1)"));
        assert!(at(r#"{"highest_ft": 14500}"#).unwrap().detail.ends_with("(14 CFR 91.211(a)(2))"));
        assert!(at(r#"{"highest_ft": 15000}"#).unwrap().detail.ends_with("(14 CFR 91.211(a)(2))"));
        assert!(at(r#"{"highest_ft": 15100}"#).unwrap().detail.contains("(3)"));
        assert!(at(r#"{"highest_ft": 14500, "oxygen": true}"#).is_none());
        // 91.211(b)(1): a pressurised airplane is no longer passed over
        // whole; above FL250 its supply, above FL350 the mask.
        assert!(at(r#"{"highest_ft": 14500, "pressurized": true}"#).is_none());
        assert!(at(r#"{"highest_ft": 28000, "pressurized": true}"#).unwrap().detail.contains("(b)(1)(i)"));
        assert!(at(r#"{"highest_ft": 39000, "pressurized": true, "oxygen": true}"#).unwrap().detail.contains("(b)(1)(ii)"));
        assert!(at(r#"{"highest_ft": null}"#).is_none());
        let got = with_oxygen(vec![item("weather", "ok"), item("altitude", "ok"), item("risk", "ok")], at(r#"{"highest_ft": 14500}"#));
        assert_eq!(keys(&got), ["weather", "altitude", "oxygen", "risk"]);
    }

    #[test]
    fn the_facts_are_put_together_here_with_the_risk_beside_them() {
        // gonogo_input's input sent as `facts`: the sections built by it,
        // the risk added, the findings as from the sections themselves.
        let facts = r#"{"briefed": true, "failed": null, "ifr": false, "route_figures": {"least_margin_gal": 4, "required_gal": 21.5, "reserve_min": 30, "tfrs_in_force": [], "tfrs_near": 0},
            "nav": {"flown": "custom", "altitude_ft": 27000, "options": [], "cautions": []}, "legs_ft": [27000], "totals": true,
            "aircraft": {"pressurized": true}}"#;
        let asked = format!(r#"{{"facts": {facts}, "risk": {{"level": "low", "line": "Low"}}, "airplane": false}}"#);
        let got = json::parse(&call("gonogo_brief", &json::parse(&asked).unwrap()).unwrap()).unwrap();
        let items = got.get("items").and_then(Value::as_array).unwrap();
        let keys: Vec<&str> = items.iter().filter_map(|i| i.get("key").and_then(Value::as_str)).collect();
        assert_eq!(keys, ["weather", "airspace", "altitude", "oxygen", "risk"]);
        let oxygen = items.iter().find(|i| i.get("key").and_then(Value::as_str) == Some("oxygen")).unwrap();
        assert!(oxygen.get("detail").and_then(Value::as_str).unwrap().ends_with("(14 CFR 91.211(b)(1)(i))"));
        assert!(call("gonogo_brief", &json::parse(r#"{"airplane": true}"#).unwrap()).unwrap_err().contains("\"verdict\" is missing"));
    }

    #[test]
    fn a_stopping_alternate_takes_the_weathers_place_unless_it_already_stops() {
        let got = assemble(vec![item("weather", "caution")], Some(("stop", "KXYZ is under")), None, true);
        assert_eq!((got[0].finding.as_str(), got[0].tab.as_str()), ("stop", "arrive"));
        let kept = assemble(vec![item("weather", "stop")], Some(("stop", "KXYZ is under")), None, true);
        assert_eq!(kept[0].detail, "As found");
    }
}
