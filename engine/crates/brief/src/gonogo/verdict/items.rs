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
        item("airspace", "TFRs & Special Use", "preflight", "TFRs & Special Use", airspace(&v.airspace)),
        item("altitude", "Altitude", "enroute", "Cruise Altitude", altitude(&v.altitude)),
        item("fuel", "Fuel", "preflight", "Fuel", fuel(&v.fuel)),
        item("runways", "Runways", "depart", "Takeoff", runways(&v.runways)),
        item("balance", "Weight & Balance", "preflight", "Weight & Balance", balance(&v.balance)),
        item("risk", "Risk", "preflight", "Risk Assessment", risk),
    ]
}

/// What the findings come to, in a line over them: (finding, words). The
/// labels are named inside the sentence, so in its case, the FAA's codes
/// kept: "Look again at runways, risk", "No-go as planned: TFRs & special
/// use" (the Brief audit's finding 2, the owner 2026-11-21), as the fold's
/// rows already read them.
pub fn verdict_line(items: &[Item]) -> (&'static str, String) {
    let findings: Vec<&str> = items.iter().map(|i| i.finding.as_str()).collect();
    let finding = worst_of(&findings);
    let named = |f: &str| {
        items.iter().filter(|i| i.finding == f).map(|i| super::super::glance::in_sentence(&i.label)).collect::<Vec<_>>().join(", ")
    };
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
/// first reason; `failed` where the check was asked and could not be
/// made (the planner's /api/alternate refused or its forecasts failed),
/// `pending` while an app still awaits it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Alternates {
    pub required: bool,
    pub alternate: Option<FiledAlternate>,
    pub failed: bool,
    pub pending: bool,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct FiledAlternate {
    pub ident: String,
    pub good: Option<bool>,
    pub good_given: bool,
    pub first_reason: Option<String>,
}

/// What an IFR flight's alternate comes to where no check was made: 14
/// CFR 91.169(b) excuses the alternate only where the destination's
/// forecasts "indicate" the 1-2-3 ceiling and visibility, and with no
/// check nothing indicates it, so it is unknown, never ok (91.103: all
/// available information).
pub fn alternate_unchecked() -> (&'static str, String) {
    ("unknown", "Alternate not checked: 14 CFR 91.169(b) excuses one only where the destination's forecast shows it".into())
}

/// What the IFR alternate comes to for the Go / No-Go
/// (asked by the web's lib/verdict and the phones): a stop where one is
/// needed and none is filed (14 CFR 91.169(a)(2) is a prohibition: no IFR
/// flight without the fuel to fly on to an alternate, which a plan with
/// none can't show) or the one filed will not do; a caution where the one
/// filed is the pilot's to check; unknown where the check failed, pending
/// while it is awaited;
/// nothing where none is needed. The verdict is advice and the pilot can
/// still fly (the owner's "warn, never limit"; 91.3). (finding, detail).
pub fn alternate_finding(data: Option<&Alternates>) -> Option<(&'static str, String)> {
    if data.is_some_and(|d| d.failed) {
        return Some(alternate_unchecked());
    }
    if data.is_some_and(|d| d.pending) {
        return Some(("pending", "Checking the alternate (14 CFR 91.169)".into()));
    }
    let data = data.filter(|d| d.required)?;
    let Some(alt) = &data.alternate else {
        return Some(("stop", "An alternate is required (14 CFR 91.169(a)(2)) and none is filed: file one in Weather".into()));
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

/// Strings as JSON, for the planner's lists.
pub fn strings_json(items: &[String]) -> String {
    let mut out = String::new();
    strings(&mut out, items);
    out
}
