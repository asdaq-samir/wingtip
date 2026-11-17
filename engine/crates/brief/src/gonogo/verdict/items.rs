use super::*;

/// Each tab's finding, in the order a pilot goes through them, each with
/// where it is shown in full.
pub fn verdict_items(v: &Input) -> Vec<Item> {
    let risk = match &v.risk {
        Some((level, line)) => (risk_finding(level), line.clone()),
        None => ("pending", "Waiting on the briefing…".into()),
    };
    vec![
        item("weather", "Weather", "enroute", "Adverse Conditions", weather(&v.weather)),
        item("airspace", "TFRs & special use", "preflight", "TFRs & Special Use", airspace(&v.airspace)),
        item("altitude", "Altitude", "enroute", "Cruise Altitude", altitude(&v.altitude)),
        item("fuel", "Fuel", "preflight", "Fuel", fuel(&v.fuel)),
        item("runways", "Runways", "depart", "Takeoff", runways(&v.runways)),
        item("balance", "Weight & balance", "preflight", "Weight & Balance", balance(&v.balance)),
        item("risk", "Risk", "preflight", "Risk Assessment", risk),
    ]
}

/// What the findings come to, in a line over them: (finding, words).
pub fn verdict_line(items: &[Item]) -> (&'static str, String) {
    let findings: Vec<&str> = items.iter().map(|i| i.finding.as_str()).collect();
    let finding = worst_of(&findings);
    let named = |f: &str| items.iter().filter(|i| i.finding == f).map(|i| i.label.as_str()).collect::<Vec<_>>().join(", ");
    let words = match finding {
        "stop" => format!("No-go as planned: {}", named("stop")),
        "caution" => format!("Look again at {}", named("caution")),
        "unknown" => format!("No problems found; not checked: {}", named("unknown")),
        "pending" => format!("Still checking: {}", named("pending")),
        _ => "Nothing found against this flight".into(),
    };
    (finding, words)
}

/// The IFR alternate's check as the planner answers /api/alternate, only
/// what the finding reads: whether the destination needs one, and the one
/// filed -- its ident, whether it is good (None: the pilot's to check;
/// `good_given` false where the answer has no `good` at all), and its
/// first reason.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Alternates {
    pub required: bool,
    pub alternate: Option<FiledAlternate>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct FiledAlternate {
    pub ident: String,
    pub good: Option<bool>,
    pub good_given: bool,
    pub first_reason: Option<String>,
}

/// What the IFR alternate comes to for the Go / No-Go
/// (asked by the web's lib/verdict and the phones): a stop where the
/// one filed will not do, a caution where one is needed (14 CFR
/// 91.169(a)(2), (b)) and none is filed or the one filed is the pilot's
/// to check; nothing where none is needed. (finding, detail).
pub fn alternate_finding(data: Option<&Alternates>) -> Option<(&'static str, String)> {
    let data = data.filter(|d| d.required)?;
    let Some(alt) = &data.alternate else {
        return Some(("caution", "An alternate is required (14 CFR 91.169): file one in Weather".into()));
    };
    match (alt.good, alt.good_given) {
        (Some(false), _) => Some(("stop", format!("{} is under its alternate minimums at the ETA there", alt.ident))),
        // `good === null`: one left out says nothing.
        (None, true) => Some(("caution", format!("{}: {}", alt.ident, alt.first_reason.as_deref().unwrap_or("check it")))),
        _ => None,
    }
}

/// The alternate is the weather's to say, where the weather says nothing
/// worse: a caution or a stop of its own, opening its section
/// (FlightBriefingView).
pub fn with_alternate(items: Vec<Item>, found: Option<(&str, &str)>) -> Vec<Item> {
    let Some((finding, detail)) = found else { return items };
    items
        .into_iter()
        .map(|i| {
            if i.key == "weather" && (i.finding == "ok" || (finding == "stop" && i.finding != "stop")) {
                Item { finding: finding.into(), detail: detail.into(), tab: "arrive".into(), section: Some("Alternate".into()), ..i }
            } else {
                i
            }
        })
        .collect()
}

pub fn item_json(out: &mut String, i: &Item) {
    out.push_str("{\"key\":");
    json::string(out, &i.key);
    out.push_str(",\"label\":");
    json::string(out, &i.label);
    out.push_str(",\"tab\":");
    json::string(out, &i.tab);
    out.push_str(",\"section\":");
    json::opt_string(out, i.section.as_deref());
    out.push_str(",\"finding\":");
    json::string(out, &i.finding);
    out.push_str(",\"detail\":");
    json::string(out, &i.detail);
    out.push('}');
}

pub fn items_json(items: &[Item]) -> String {
    let mut out = String::from("[");
    for (n, i) in items.iter().enumerate() {
        if n > 0 {
            out.push(',');
        }
        item_json(&mut out, i);
    }
    out.push(']');
    out
}

pub fn finding_json(found: Option<(&str, String)>) -> String {
    match found {
        None => "null".into(),
        Some((finding, detail)) => {
            let mut out = String::from("{\"finding\":");
            json::string(&mut out, finding);
            out.push_str(",\"detail\":");
            json::string(&mut out, &detail);
            out.push('}');
            out
        }
    }
}

/// Strings as JSON, for the planner's lists.
pub fn strings_json(items: &[String]) -> String {
    let mut out = String::new();
    strings(&mut out, items);
    out
}
