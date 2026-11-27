//! The Go / No-Go's runway finding put together from the runway checks
//! (`gonogo_runway_findings`): which fields are short, past the POH's
//! demonstrated crosswind, read past its tables, with a tailwind, with
//! little to spare or not checked, each field once and in the route's
//! order -- `gonogo_brief`'s `runways`. One copy for the web
//! (features/brief/verdictInput) and the planner (app.gonogo.flight),
//! which each sorted the checks with the same predicates before
//! (the simplicity re-audit, 2026-11-27).
//!
//! The predicates are the checks' own flags (gonogo_runway_checks, from
//! runways.rs): a distance over the runway's length (14 CFR 91.103(b), the
//! runway lengths and takeoff and landing distances a pilot is to know);
//! past the demonstrated crosswind (the POH's section 4); read past the
//! POH's table; a tailwind, the wind along the end negative (AIM 4-3-6c:
//! the runway most nearly into the wind); less than SAFO 19001's 15 per
//! cent to spare; and a field whose elevation or a runway's length is not
//! known, so whether it fits is not known, never "within"; and a field
//! with no temperature reported, whose distances assume a standard day.

use super::calls::truth;
use crate::json::Value;

type R<T> = Result<T, String>;

const NAME: &str = "gonogo_runway_findings";

/// The idents of the checks `hit` holds for, each once, in order.
fn fields(checks: &[(String, &Value)], hit: impl Fn(&Value) -> bool) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for (ident, c) in checks {
        if hit(c) && !out.contains(ident) {
            out.push(ident.clone());
        }
    }
    out
}

/// Whether any of the check's distances has `flag`.
fn any_distance(c: &Value, flag: &str) -> bool {
    c.get("distances").and_then(Value::as_array).is_some_and(|ds| ds.iter().any(|d| truth(d, flag)))
}

/// Whether the airplane has a table to read: a POH short-field table with
/// its weights (`weights_lb`) and a grid for each (`tables`), neither
/// empty. An empty `{}` or `[]` is no table (the planner's `bool({})` was
/// false), and nor is a hollow one, `{"tables": []}`, which has no figure
/// to read: the distances were not worked from the POH (14 CFR 91.103(b)).
fn table(aircraft: &Value, key: &str) -> bool {
    let listed = |t: &Value, k| t.get(k).and_then(Value::as_array).is_some_and(|a| !a.is_empty());
    aircraft.get(key).is_some_and(|t| listed(t, "weights_lb") && listed(t, "tables"))
}

/// `gonogo_runway_findings`: `{planned, briefed, aircraft, checks}` -- the
/// nav log in, the briefing in, the airplane's profile (its takeoff and
/// landing tables) and the runway checks, each with its field's `ident` --
/// answered with VerdictInput's `runways`.
pub fn call(name: &str, v: &Value) -> R<String> {
    if name != NAME {
        return Err(format!("the engine has no rule called {name:?}"));
    }
    let planned = truth(v, "planned");
    let briefed = truth(v, "briefed");
    let aircraft = v.get("aircraft").unwrap_or(&Value::Null);
    let checks: Vec<(String, &Value)> = match v.get("checks") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items
            .iter()
            .map(|c| {
                c.get("ident").and_then(Value::as_str).map(|i| (i.to_owned(), c)).ok_or(format!("{NAME}: a check's \"ident\" is missing"))
            })
            .collect::<R<_>>()?,
        Some(_) => return Err(format!("{NAME}: \"checks\" is not a list")),
    };
    let worked = |c: &Value| c.get("distances").and_then(Value::as_array).is_some_and(|ds| !ds.is_empty());
    let lists: [(&str, Vec<String>); 7] = [
        ("short", fields(&checks, |c| any_distance(c, "over"))),
        ("crosswind", fields(&checks, |c| truth(c, "crosswind_over"))),
        ("beyond", fields(&checks, |c| any_distance(c, "beyond"))),
        ("tailwind", fields(&checks, |c| c.get("headwind_kt").and_then(Value::as_f64).is_some_and(|h| h < 0.0))),
        ("close", fields(&checks, |c| any_distance(c, "close"))),
        ("unchecked", fields(&checks, |c| truth(c, "unchecked") || any_distance(c, "unknown"))),
        ("standard_day", fields(&checks, |c| truth(c, "temp_assumed") && worked(c))),
    ];
    let mut out = String::from("{\"pending\":");
    out.push_str(if !planned || !briefed { "true" } else { "false" });
    // Worked where the airplane has both tables to read, or while the nav
    // log is awaited (pending says so then).
    out.push_str(",\"worked\":");
    out.push_str(if !planned || (table(aircraft, "takeoff") && table(aircraft, "landing")) { "true" } else { "false" });
    for (key, idents) in &lists {
        out.push_str(",\"");
        out.push_str(key);
        out.push_str("\":");
        super::strings(&mut out, idents);
    }
    out.push('}');
    Ok(out)
}
