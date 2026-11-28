//! The Brief as it opens, `gonogo_glance_lines` (the owner's rule,
//! 2026-11-03: a pilot "doesn't want to spend too much time in studying
//! the briefs so make it simpler for them to just look and go"): each
//! finding that stops the flight or wants a look as one sentence with
//! what to do about it, the stops first, at most LINES_MAX of them, each
//! with why it matters and the rule it rests on, and every other finding
//! folded into one row. The findings and their figures are the Go /
//! No-Go's (brief::assemble); this words them for a look. The web wrote
//! these words itself (features/brief/glance); they state the rules,
//! so they are here once for every app; `glance_calls` reads and
//! writes them by name.

use super::verdict::Item;
use crate::figures::words::js_num;

/// The most a line a pilot reads before flying may run: one sentence, two
/// rows of an iPhone at the body size (the owner's rule, 2026-11-03).
/// Counted in characters, as the web counted them (UTF-16 units, the same
/// for every character these lines hold).
pub const LINE_MAX: usize = 140;
/// The most lines a pilot acts on before the rest fold away.
pub const LINES_MAX: usize = 3;

/// Why each finding matters, in plain words, and the rule it rests on:
/// (key, why, cite). Explanations of the Go / No-Go's findings, not rules
/// of their own.
const WHY: [(&str, &str, &str); 9] = [
    (
        "weather",
        "VFR needs 14 CFR 91.155's visibility and distance from clouds all the way; a briefer's \"VFR not recommended\" (AIM 7-1-5) means the forecast is under them somewhere on the route, and your own minimums are stricter still.",
        "14 CFR 91.155; AIM 7-1-5",
    ),
    (
        "airspace",
        "A TFR is airspace closed by NOTAM, and flying through one in force breaks 14 CFR 91.137 (or 91.141 round the President); a restricted area in use is closed under 91.133, and a MOA can be busy with no NOTAM at all.",
        "14 CFR 91.133, 91.137, 91.141",
    ),
    (
        "altitude",
        "Above 3,000 ft AGL a VFR cruise follows the hemispheric rule (14 CFR 91.159), 91.119 sets the least height over terrain and people, and the altitude must keep 91.155's distance from the clouds.",
        "14 CFR 91.119, 91.155, 91.159",
    ),
    (
        // 91.211(a)(1)-(3), the three heights brief.rs's oxygen_item reads.
        "oxygen",
        "In an airplane without a pressurized cabin, 14 CFR 91.211(a) asks for oxygen for the crew for any time past 30 minutes over 12,500 ft MSL, all the time over 14,000 ft, and for every occupant over 15,000 ft.",
        "14 CFR 91.211(a)",
    ),
    (
        // 91.151(a) is a rule about beginning the flight: "No person may
        // begin a flight in an airplane under VFR conditions unless ...
        // there is enough fuel to fly to the first point of intended
        // landing and ... to fly after that for at least 30 minutes" by
        // day, 45 at night; 91.167(a) under IFR, to the destination, the
        // alternate where one is required, then 45 minutes. The web's
        // words said a flight "must land with" the reserve, which the
        // rule does not say.
        "fuel",
        "A VFR flight may only set out with fuel to its first landing and 30 minutes more by day, 45 at night (14 CFR 91.151); under IFR it is fuel to the alternate and 45 minutes more (91.167). Planning to fly into the reserve is a no-go, not a margin.",
        "14 CFR 91.151, 91.167",
    ),
    (
        // 91.103(b): runway lengths and takeoff and landing distance
        // information, the flight manual's where it has them.
        "runways",
        "The POH's demonstrated crosswind is what the test pilot showed, not a limit, but past it nothing was shown for your airplane; the takeoff and landing distances are its tables', which 14 CFR 91.103(b) asks you to work out before you go.",
        "14 CFR 91.103(b); the POH",
    ),
    (
        // 91.9(a): the flight manual's operating limitations; 91.103's
        // opening words, all available information. The web cited
        // 91.103(b), which is the runways' and distances' paragraph, not
        // the loading's.
        "balance",
        "Outside the envelope the airplane may not climb, or may not answer the controls; 14 CFR 91.9 forbids flying outside the flight manual's limits, and 91.103 asks you to know all about the flight before you go.",
        "14 CFR 91.9, 91.103",
    ),
    (
        "risk",
        "The risk assessment follows the FAA's PAVE and IMSAFE checklists (Risk Management Handbook, FAA-H-8083-2): the points are the planner's guide, and the decision is yours as pilot in command under 14 CFR 91.3.",
        "FAA-H-8083-2; 14 CFR 91.3",
    ),
    (
        // NASR APT_BASE's FACILITY_USE_CODE and ARPT_STATUS (permission.rs).
        "fields",
        "A private field is its owner's, landed at with their permission, and a military one with the service's prior permission (PPR); a field the FAA lists as closed is no landing field. 14 CFR 91.103 asks you to know all of it before you go.",
        "14 CFR 91.103; NASR APT_BASE",
    ),
];

/// What to do about a finding: (key, if it stops the flight, if it wants
/// a look). Flight Service's number with non-breaking hyphens (U+2011):
/// it broke after "(1-" on a phone.
const ACTION: [(&str, &str, &str); 9] = [
    ("weather", "wait for it to lift, or plan another day", "read it on En Route and plan around it"),
    ("airspace", "route around it, or go later", "ask Flight Service (1\u{2011}800\u{2011}WX\u{2011}BRIEF) before you go"),
    ("altitude", "pick another altitude or route", "pick an altitude the profile offers"),
    ("oxygen", "carry oxygen, or plan lower", "carry oxygen, or plan lower"),
    ("fuel", "add fuel, or plan a stop", "add fuel, or plan a stop"),
    ("runways", "pick a longer runway, or a lighter load", "ask for another runway, or wait for the wind"),
    ("balance", "move or leave some weight", "move or leave some weight"),
    ("risk", "talk it over with your instructor before you go", "tick the risk assessment and look at its factors"),
    ("fields", "plan another field", "settle it before you go, or plan another field"),
];

/// A departure's or destination's figures as the Brief's glance has them.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Field {
    pub ident: String,
    pub runway: Option<String>,
    pub crosswind_kt: Option<f64>,
    pub crosswind_over: bool,
    pub finding: String,
}

/// The reports the briefing holds as sent, for a finding's sources.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Raw {
    pub metars: Vec<String>,
    pub tafs: Vec<String>,
    pub tfrs: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Line {
    pub item: Item,
    /// The finding and its action, one sentence of at most LINE_MAX.
    pub line: String,
    /// The finding alone, and what to do about it.
    pub lead: String,
    pub action: String,
    pub why: &'static str,
    pub cite: &'static str,
    pub raw: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Rest {
    pub line: String,
    pub finding: &'static str,
    pub items: Vec<Item>,
}

fn trim_end(s: &str) -> &str {
    s.trim_end_matches(|c: char| ".;:,".contains(c) || c.is_whitespace())
}

fn capital(s: &str) -> String {
    let mut c = s.chars();
    c.next().map_or_else(String::new, |f| f.to_uppercase().chain(c).collect())
}

/// A section's name inside a sentence, in lower case but for a code's
/// words -- "TFRs & special use", where it read "tfrs" (the FAA's codes are kept).
/// The verdict's line names its labels
/// the same way (verdict/items.rs).
pub(super) fn in_sentence(label: &str) -> String {
    let code = |w: &str| w.chars().take(2).filter(char::is_ascii_uppercase).count() == 2;
    label.split(' ').map(|w| if code(w) { w.to_owned() } else { w.to_lowercase() }).collect::<Vec<_>>().join(" ")
}

/// A lead and its action in one sentence of at most LINE_MAX characters,
/// the lead cut short with an ellipsis where it must be.
fn sentence(lead: &str, action: &str) -> String {
    let head = trim_end(lead);
    let room = LINE_MAX.saturating_sub(action.chars().count() + 2);
    if head.chars().count() > room {
        let cut: String = head.chars().take(room.saturating_sub(1)).collect();
        format!("{}…: {action}", cut.trim_end())
    } else {
        format!("{head}: {action}")
    }
}

/// The crosswind finding in the glance's figures: each field's runway and
/// the knots across it, else the Go / No-Go's own words. Only a field
/// whose crosswind is past the demonstrated: a caution for its runway's
/// length alone read "has 0 kt across" (brief-glance.spec, 2026-11-13).
fn lead(item: &Item, fields: &[Field]) -> String {
    if item.key == "risk" {
        return risk_lead(&item.detail);
    }
    if item.key != "runways" || item.finding != "caution" {
        return item.detail.clone();
    }
    let each: Vec<String> = fields
        .iter()
        .filter(|f| f.finding == "caution" && f.crosswind_over)
        .filter_map(|f| {
            let kt = f.crosswind_kt?;
            let runway = f.runway.as_deref().filter(|r| !r.is_empty()).map_or_else(String::new, |r| format!("Runway {r} at "));
            Some(format!("{runway}{} has {} kt across", f.ident, js_num(kt)))
        })
        .collect();
    if each.is_empty() {
        item.detail.clone()
    } else {
        format!("{}, past the POH's demonstrated", each.join(", "))
    }
}

/// The risk's finding in plain words. Its detail is the assessment's
/// level and score alone (frat::risk_line, "High · 21 points"), which read
/// "Risk: High · 21 points" with nothing to say what the points were: the level as a risk, and the points as the
/// PAVE and IMSAFE checklist's (FAA-H-8083-2, the assessment's source).
/// Any other detail (one still waiting) is named as the risk's.
fn risk_lead(detail: &str) -> String {
    match detail.split_once(" · ") {
        Some((level, points)) if points.ends_with("points") || points.ends_with("point") => {
            format!("{level} risk, {points} on the PAVE and IMSAFE checklist")
        }
        _ => format!("Risk: {detail}"),
    }
}

/// The reports a finding was read from, as sent.
fn sources(key: &str, raw: Option<&Raw>) -> Vec<String> {
    match (key, raw) {
        ("weather", Some(r)) => r.metars.iter().chain(&r.tafs).cloned().collect(),
        ("runways", Some(r)) => r.metars.clone(),
        ("airspace", Some(r)) => r.tfrs.clone(),
        _ => vec![],
    }
}

/// The Brief's lines a pilot acts on, and the rest in one row.
pub fn glance_lines(items: &[Item], fields: &[Field], raw: Option<&Raw>) -> (Vec<Line>, Rest) {
    let acted: Vec<&Item> =
        items.iter().filter(|i| i.finding == "stop").chain(items.iter().filter(|i| i.finding == "caution")).take(LINES_MAX).collect();
    let act = acted
        .iter()
        .map(|i| {
            let (_, stop, caution) = ACTION.iter().find(|a| a.0 == i.key).copied().unwrap_or(("", "", ""));
            let action = if i.finding == "stop" { stop } else { caution };
            let (_, why, cite) = WHY.iter().find(|w| w.0 == i.key).copied().unwrap_or(("", "", ""));
            let said = lead(i, fields);
            Line {
                item: (*i).clone(),
                line: sentence(&said, action),
                lead: trim_end(&said).to_owned(),
                action: capital(action),
                why,
                cite,
                raw: sources(&i.key, raw),
            }
        })
        .collect();
    let rest: Vec<Item> = items.iter().filter(|i| !acted.iter().any(|a| std::ptr::eq(*a, *i))).cloned().collect();
    let more = rest.iter().filter(|i| i.finding != "ok").count();
    let pending: Vec<&Item> = rest.iter().filter(|i| i.finding == "pending").collect();
    let line = if rest.is_empty() {
        String::new()
    } else if !pending.is_empty() {
        format!("Still checking {}", pending.iter().map(|i| in_sentence(&i.label)).collect::<Vec<_>>().join(", "))
    } else if more > 0 {
        format!("{more} more to look at")
    } else {
        sentence(&capital(&rest.iter().map(|i| in_sentence(&i.label)).collect::<Vec<_>>().join(", ")), "nothing to fix")
    };
    let finding = if !pending.is_empty() {
        "pending"
    } else if rest.iter().any(|i| i.finding == "stop" || i.finding == "caution") {
        "caution"
    } else if more > 0 {
        "unknown"
    } else {
        "ok"
    };
    (act, Rest { line, finding, items: rest })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn risk(finding: &str, detail: &str) -> Item {
        Item {
            key: "risk".into(),
            label: "Risk".into(),
            tab: "preflight".into(),
            section: None,
            finding: finding.into(),
            detail: detail.into(),
        }
    }

    #[test]
    fn the_risk_says_what_its_points_are() {
        let (act, _) = glance_lines(&[risk("stop", "High · 21 points")], &[], None);
        assert_eq!(act[0].lead, "High risk, 21 points on the PAVE and IMSAFE checklist");
        assert_eq!(act[0].line, "High risk, 21 points on the PAVE and IMSAFE checklist: talk it over with your instructor before you go");
        let (act, _) = glance_lines(&[risk("caution", "Raised · 1 point")], &[], None);
        assert_eq!(act[0].lead, "Raised risk, 1 point on the PAVE and IMSAFE checklist");
        let (act, _) = glance_lines(&[risk("caution", "Waiting on the briefing…")], &[], None);
        assert_eq!(act[0].lead, "Risk: Waiting on the briefing…");
    }
}
