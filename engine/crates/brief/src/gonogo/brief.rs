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
use wingtip_flight::limits::oxygen_words;

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

/// The oxygen finding, after the altitude's: what 14 CFR 91.211(a) asks
/// of the highest altitude the nav log flies (`highest_ft`), its cabin
/// at it, where the airplane is not known to carry oxygen or a pressurised
/// cabin (`oxygen`; with none picked, not known: the safer side). A
/// caution, not a stop: the pilot may carry portable oxygen the planner
/// cannot see (the owner, 2026-10-23: a warning, never a limit). FL-145
/// for 13 hours said nothing of it (the UI audit's A2). None at or under
/// 12,500 ft, or before the nav log.
pub fn oxygen_item(altitude: Option<&Value>) -> Option<Item> {
    let altitude = altitude.filter(|a| !truth(a, "oxygen"))?;
    let words = oxygen_words(altitude.get("highest_ft").and_then(Value::as_f64)?)?;
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
    let given = i.obj(v, "verdict")?.map_or_else(|| i.err("verdict", "is missing"), Ok)?;
    let mut input = verdict_input(i, given)?;
    // The oxygen said once, in its own finding: a pilot's own altitude's
    // cautions (altitude::cautions) say it too, last.
    let oxygen = oxygen_item(given.get("altitude"));
    input.altitude.cautions.retain(|c| oxygen.as_ref().is_none_or(|o| *c != o.detail));
    // The alternate is an IFR flight's alone (14 CFR 91.169(a)): under VFR
    // its answer, if one was sent, says nothing.
    let alternate = if input.weather.ifr { verdict::alternate_finding(alternates(i, v.get("alternate"))?.as_ref()) } else { None };
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
        assert!(at(r#"{"highest_ft": null}"#).is_none());
        let got = with_oxygen(vec![item("weather", "ok"), item("altitude", "ok"), item("risk", "ok")], at(r#"{"highest_ft": 14500}"#));
        assert_eq!(keys(&got), ["weather", "altitude", "oxygen", "risk"]);
    }

    #[test]
    fn a_stopping_alternate_takes_the_weathers_place_unless_it_already_stops() {
        let got = assemble(vec![item("weather", "caution")], Some(("stop", "KXYZ is under")), None, true);
        assert_eq!((got[0].finding.as_str(), got[0].tab.as_str()), ("stop", "arrive"));
        let kept = assemble(vec![item("weather", "stop")], Some(("stop", "KXYZ is under")), None, true);
        assert_eq!(kept[0].detail, "As found");
    }
}
