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

/// `gonogo_brief` by name: its input read, the findings put together and
/// written with the line over them.
pub fn call(name: &str, v: &Value) -> R<String> {
    let i = In { name };
    let given = i.obj(v, "verdict")?.map_or_else(|| i.err("verdict", "is missing"), Ok)?;
    let input = verdict_input(i, given)?;
    // The alternate is an IFR flight's alone (14 CFR 91.169(a)): under VFR
    // its answer, if one was sent, says nothing.
    let alternate = if input.weather.ifr { verdict::alternate_finding(alternates(i, v.get("alternate"))?.as_ref()) } else { None };
    let fields = permission_item(&read_fields(i, v, "fields")?);
    let items = assemble(verdict::verdict_items(&input), alternate.as_ref().map(|(f, d)| (*f, d.as_str())), fields, truth(v, "airplane"));
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
    fn a_stopping_alternate_takes_the_weathers_place_unless_it_already_stops() {
        let got = assemble(vec![item("weather", "caution")], Some(("stop", "KXYZ is under")), None, true);
        assert_eq!((got[0].finding.as_str(), got[0].tab.as_str()), ("stop", "arrive"));
        let kept = assemble(vec![item("weather", "stop")], Some(("stop", "KXYZ is under")), None, true);
        assert_eq!(kept[0].detail, "As found");
    }
}
