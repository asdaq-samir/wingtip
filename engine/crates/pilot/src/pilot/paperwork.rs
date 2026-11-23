//! What falls due for a pilot and their airplanes, each named and with the
//! rule that asks for it: the gateway's "Coming up" list and its reminder
//! emails (PaperworkService) show these as they come, adding only the
//! days and hours left. The gateway's Java chose each citation and name
//! before; `pilot_currency` and `inspections_due` now answer them with
//! their dates (`due`).

use super::currency::day;
use crate::json::{self, Value};

/// One thing that falls due: what it is ("annual", "item"), the owner's
/// item it is where it is one, its name, the rule that asks for it (an
/// owner's item may cite none), its last good day or the hours it is due
/// at, and the reminder's start, to which the day is added.
pub struct Due {
    pub what: &'static str,
    pub item_id: Option<i64>,
    pub label: String,
    pub rule: Option<String>,
    pub until: Option<String>,
    pub due_at_hours: Option<f64>,
    pub lead: String,
}

fn dated(what: &'static str, label: &str, rule: &str, until: Option<String>, lead: String) -> Option<Due> {
    until.map(|until| Due {
        what,
        item_id: None,
        label: label.to_owned(),
        rule: Some(rule.to_owned()),
        until: Some(until),
        due_at_hours: None,
        lead,
    })
}

/// The pilot's own last good days, as `pilot_currency` works them out.
pub struct PilotDays {
    pub flight_review_until: Option<String>,
    pub medical_expires_on: Option<String>,
    pub day_passengers_until: Option<String>,
    pub night_passengers_until: Option<String>,
    pub instrument_until: Option<String>,
}

/// The pilot's: the flight review (14 CFR 61.56(c)), the medical (61.23),
/// passengers by day and at night (61.57(a), (b)) and instrument currency
/// (61.57(c)), each where it can be had.
pub fn pilot_due(d: PilotDays) -> Vec<Due> {
    [
        dated("flight-review", "Flight Review", "14 CFR 61.56(c)", d.flight_review_until, "Your flight review runs out".into()),
        dated("medical", "Medical Certificate", "14 CFR 61.23", d.medical_expires_on, "Your medical certificate runs out".into()),
        dated(
            "day-passengers",
            "Passengers by Day",
            "14 CFR 61.57(a)",
            d.day_passengers_until,
            "You may carry passengers by day until".into(),
        ),
        dated(
            "night-passengers",
            "Passengers at Night",
            "14 CFR 61.57(b)",
            d.night_passengers_until,
            "You may carry passengers at night until".into(),
        ),
        dated("instrument", "Instrument Currency", "14 CFR 61.57(c)", d.instrument_until, "Your instrument currency runs out".into()),
    ]
    .into_iter()
    .flatten()
    .collect()
}

/// An airplane's last good days and hours, as `inspections_due` works
/// them out, with what the owner keeps of it.
pub struct AircraftDays {
    pub tail: String,
    pub for_hire: bool,
    pub annual_until: Option<String>,
    pub hundred_hour_due_at: Option<f64>,
    pub elt_until: Option<String>,
    pub elt_battery_due_on: Option<String>,
    pub static_until: Option<String>,
    pub transponder_until: Option<String>,
    /// The VOR check's last good day, where it was within its limit.
    pub vor_until: Option<String>,
}

/// An owner's own item: an airworthiness directive (14 CFR part 39) or
/// anything else they want reminded of, with its reference ("AD
/// 2011-10-09") and its next day or hours.
pub struct Kept {
    pub id: i64,
    pub ad: bool,
    pub title: String,
    pub reference: Option<String>,
    pub due_on: Option<String>,
    pub due_at_hours: Option<f64>,
}

/// An airplane's: the annual (14 CFR 91.409(a)), the 100-hour where it is
/// flown for hire (91.409(b): carrying a person for hire, or flight
/// instruction for hire in an airplane the instructor provides), the ELT's
/// inspection (91.207(d)) and its battery (91.207(c)), the altimeter and
/// static system (91.411(a)), the transponder (91.413(a)) and the VOR
/// check for IFR (91.171(a)(2)) -- each as recorded, so one never recorded
/// is not listed -- and the owner's dated items: an AD cites its own
/// number and part 39, which makes it binding ("No person may operate a
/// product to which an airworthiness directive applies except in
/// accordance with the requirements of that airworthiness directive",
/// 14 CFR 39.7).
pub fn aircraft_due(a: AircraftDays, kept: Vec<Kept>) -> Vec<Due> {
    let t = &a.tail;
    let mut out: Vec<Due> = Vec::new();
    out.extend(dated("annual", "Annual Inspection", "14 CFR 91.409(a)", a.annual_until, format!("{t}'s annual inspection runs out")));
    if let Some(hours) = a.hundred_hour_due_at.filter(|_| a.for_hire) {
        out.push(Due {
            what: "hundred-hour",
            item_id: None,
            label: "100-Hour Inspection".into(),
            rule: Some("14 CFR 91.409(b)".into()),
            until: None,
            due_at_hours: Some(hours),
            lead: format!("{t}'s 100-hour inspection is due"),
        });
    }
    out.extend(dated("elt", "ELT Inspection", "14 CFR 91.207(d)", a.elt_until, format!("{t}'s ELT inspection runs out")));
    out.extend(dated(
        "elt-battery",
        "ELT Battery",
        "14 CFR 91.207(c)",
        a.elt_battery_due_on,
        format!("{t}'s ELT battery is to be replaced by"),
    ));
    out.extend(dated(
        "static",
        "Altimeter and Static System",
        "14 CFR 91.411(a)",
        a.static_until,
        format!("{t}'s altimeter and static system test runs out"),
    ));
    out.extend(dated("transponder", "Transponder", "14 CFR 91.413(a)", a.transponder_until, format!("{t}'s transponder test runs out")));
    out.extend(dated("vor-check", "VOR Check for IFR", "14 CFR 91.171(a)(2)", a.vor_until, format!("{t}'s VOR check runs out")));
    for k in kept.into_iter().filter(|k| k.due_on.is_some() || k.due_at_hours.is_some()) {
        let reference = k.reference.filter(|r| !r.trim().is_empty());
        let (rule, named) = match (k.ad, &reference) {
            (true, Some(r)) => (Some(format!("{r}, 14 CFR 39.7")), format!("{r} ({})", k.title)),
            (true, None) => (Some("14 CFR 39.7".to_owned()), k.title.clone()),
            (false, _) => (reference.clone(), k.title.clone()),
        };
        out.push(Due {
            what: "item",
            item_id: Some(k.id),
            label: k.title,
            rule,
            until: k.due_on,
            due_at_hours: k.due_at_hours,
            lead: format!("{t}: {named} is due"),
        });
    }
    out
}

/// The owner's items as the host sends them (`kept`).
pub fn kept_of(name: &str, v: &Value) -> Result<Vec<Kept>, String> {
    let list = match v.get("kept") {
        None | Some(Value::Null) => return Ok(Vec::new()),
        Some(l) => l.as_array().ok_or_else(|| format!("{name}: \"kept\" is not a list"))?,
    };
    let text = |k: &Value, key: &str| k.get(key).and_then(Value::as_str).map(str::to_owned);
    list.iter()
        .map(|k| {
            let id = k.get("id").and_then(Value::as_f64).ok_or_else(|| format!("{name}: a kept item has no \"id\""))?;
            let due_on = text(k, "due_on");
            if let Some(d) = &due_on {
                day(name, d)?;
            }
            Ok(Kept {
                id: id as i64,
                ad: k.get("kind").and_then(Value::as_str) == Some("AD"),
                title: text(k, "title").unwrap_or_default(),
                reference: text(k, "reference"),
                due_on,
                due_at_hours: k.get("due_at_hours").and_then(Value::as_f64),
            })
        })
        .collect()
}

/// The list as JSON: `[{"what", "itemId", "label", "rule", "until",
/// "dueAtHours", "lead"}]`.
pub fn write(out: &mut String, due: &[Due]) {
    out.push('[');
    for (i, d) in due.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"what\":");
        json::string(out, d.what);
        out.push_str(",\"itemId\":");
        out.push_str(&d.item_id.map_or_else(|| "null".to_owned(), |id| id.to_string()));
        out.push_str(",\"label\":");
        json::string(out, &d.label);
        out.push_str(",\"rule\":");
        json::opt_string(out, d.rule.as_deref());
        out.push_str(",\"until\":");
        json::opt_string(out, d.until.as_deref());
        out.push_str(",\"dueAtHours\":");
        json::opt_number(out, d.due_at_hours);
        out.push_str(",\"lead\":");
        json::string(out, &d.lead);
        out.push('}');
    }
    out.push(']');
}
