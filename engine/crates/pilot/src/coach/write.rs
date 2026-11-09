//! The plan written as the contract's ProficiencyPlanAnswer
//! (contract/proficiency_plan.json).

use super::due::{reminder, Due};
use super::evidence::{Evidence, Weak};
use super::sessions::Session;
use crate::json::{self};
use crate::pilot::currency::iso_of_days;

fn key(out: &mut String, k: &str) {
    if !(out.ends_with('{') || out.ends_with('[')) {
        out.push(',');
    }
    json::string(out, k);
    out.push(':');
}

fn str_(out: &mut String, k: &str, v: &str) {
    key(out, k);
    json::string(out, v);
}

fn opt_day(out: &mut String, k: &str, d: Option<i64>) {
    key(out, k);
    json::opt_string(out, d.map(iso_of_days).as_deref());
}

fn strings(out: &mut String, k: &str, items: &[&str]) {
    key(out, k);
    out.push('[');
    for (i, s) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(out, s);
    }
    out.push(']');
}

fn each<T>(out: &mut String, k: &str, items: &[T], one: impl Fn(&mut String, &T)) {
    key(out, k);
    out.push('[');
    for (i, item) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push('{');
        one(out, item);
        out.push('}');
    }
    out.push(']');
}

fn due_item(out: &mut String, d: &Due) {
    str_(out, "key", d.key);
    str_(out, "id", &format!("due:{}", d.key));
    str_(out, "label", d.label);
    str_(out, "rule", d.rule);
    opt_day(out, "until", d.until);
    opt_day(out, "from", d.from);
    key(out, "days_left");
    match d.days_left {
        Some(n) => out.push_str(&n.to_string()),
        None => out.push_str("null"),
    }
    str_(out, "status", d.status.key());
    str_(out, "detail", &d.detail);
}

fn session(out: &mut String, (i, s): &(usize, &Session)) {
    str_(out, "id", &format!("session:{}", i + 1));
    str_(out, "key", s.key);
    str_(out, "practise", &s.practise);
    strings(out, "why", &s.why.iter().map(String::as_str).collect::<Vec<_>>());
    key(out, "place");
    match &s.place {
        Some((ident, name, nm)) => {
            out.push('{');
            str_(out, "ident", ident);
            str_(out, "name", name);
            key(out, "distance_nm");
            json::number(out, (nm * 10.0).round() / 10.0);
            key(out, "approach");
            json::opt_string(out, s.approach.as_deref());
            out.push('}');
        }
        None => out.push_str("null"),
    }
    key(out, "minutes");
    out.push_str(&s.minutes.to_string());
    key(out, "instructor");
    out.push_str(if s.instructor { "true" } else { "false" });
    key(out, "wings");
    match &s.wings {
        Some(w) => {
            out.push('{');
            str_(out, "area", w.area);
            str_(out, "acs", w.acs);
            str_(
                out,
                "note",
                "May count toward a WINGS flight activity when flown with an authorized instructor to the ACS standard (AC 61-91K 7.3)",
            );
            out.push('}');
        }
        None => out.push_str("null"),
    }
}

/// The whole answer.
pub fn plan(today: &str, due: &[Due], evidence: &[Evidence], weak: &[(Weak, Vec<&Evidence>)], sessions: &[Session]) -> String {
    let mut out = String::from("{");
    str_(&mut out, "today", today);
    each(&mut out, "due", due, due_item);
    let reminders: Vec<(&Due, String)> = due.iter().filter_map(|d| reminder(d).map(|t| (d, t))).collect();
    each(&mut out, "reminders", &reminders, |out, (d, text)| {
        str_(out, "key", d.key);
        str_(out, "text", text);
        opt_day(out, "until", d.until);
        key(out, "days_left");
        out.push_str(&d.days_left.unwrap_or(0).to_string());
    });
    each(&mut out, "evidence", evidence, |out, e| {
        str_(out, "id", &e.id);
        str_(out, "flown_on", &e.flown_on);
        str_(out, "place", &e.place);
        key(out, "procedure");
        json::opt_string(out, e.procedure.as_deref());
        str_(out, "area", e.weak.key());
        str_(out, "text", &e.text);
    });
    each(&mut out, "weak_areas", weak, |out, (w, ev)| {
        str_(out, "key", w.key());
        str_(out, "label", w.label());
        strings(out, "acs", w.acs());
        strings(out, "evidence", &ev.iter().map(|e| e.id.as_str()).collect::<Vec<_>>());
    });
    let numbered: Vec<(usize, &Session)> = sessions.iter().enumerate().collect();
    each(&mut out, "sessions", &numbered, session);
    out.push('}');
    out
}
