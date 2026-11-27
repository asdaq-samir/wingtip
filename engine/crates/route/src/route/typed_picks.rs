//! `route_typed_picks`: the SIDs and STARs typed among a route's points
//! (route_typed's `procedures`, each with the point before and after it)
//! found among its fields' published procedures, one copy for the web's
//! route box (lib/procedures) and the phones' Type Route (TypedRoute on
//! each), which each matched them themselves (round 4's engine audit).
//!
//! As a filed route or a clearance writes them (AIM 5-2-9, a SID flown out
//! of the departure; AIM 5-4-1, a STAR into the destination): a name is
//! first a departure from the route's departure, its transition the point
//! typed after it where the procedure publishes that transition; else an
//! arrival into the destination, by the point typed before it; else
//! missed, which the app says. A transition not published is no
//! transition (the common route), never a guess. A later name of the same
//! field and kind replaces the earlier, as a field flies one of each.

use crate::json::{self, Value};

type R<T> = Result<T, String>;

/// A field's procedures as the planner lists them, the members read here.
struct Listed<'a> {
    ident: &'a str,
    procedures: &'a [Value],
}

struct Pick<'a> {
    ident: &'a str,
    id: &'a str,
    kind: &'static str,
    name: &'a str,
    transition: Option<&'a str>,
}

fn listed<'a>(name: &str, v: &'a Value, key: &str) -> R<Option<Listed<'a>>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(f) => Ok(Some(Listed {
            ident: f.get("ident").and_then(Value::as_str).ok_or_else(|| format!("{name}: {key}'s \"ident\" is missing"))?,
            procedures: f
                .get("procedures")
                .and_then(Value::as_array)
                .ok_or_else(|| format!("{name}: {key}'s \"procedures\" are missing"))?,
        })),
    }
}

fn text<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

/// The procedure `typed` names at a field as `kind`, joined at `join`.
fn found<'a>(field: Option<&Listed<'a>>, kind: &'static str, typed: &'a str, join: Option<&str>) -> Option<Pick<'a>> {
    let field = field?;
    let p = field.procedures.iter().find(|p| text(p, "kind") == Some(kind) && text(p, "id") == Some(typed))?;
    let transitions = p.get("transitions").and_then(Value::as_array).unwrap_or_default();
    let transition = transitions.iter().filter_map(Value::as_str).find(|t| join == Some(*t));
    Some(Pick { ident: field.ident, id: text(p, "id")?, kind, name: text(p, "name").unwrap_or(typed), transition })
}

pub fn answer(name: &str, v: &Value) -> R<String> {
    let typed = v.get("procedures").and_then(Value::as_array).ok_or_else(|| format!("{name}: \"procedures\" are missing"))?;
    let (departure, arrival) = (listed(name, v, "departure")?, listed(name, v, "arrival")?);
    let mut picks: Vec<Pick> = Vec::new();
    let mut missed: Vec<&str> = Vec::new();
    for t in typed {
        let n = text(t, "name").ok_or_else(|| format!("{name}: a procedure's \"name\" is missing"))?;
        let hit = found(departure.as_ref(), "departure", n, text(t, "after"))
            .or_else(|| found(arrival.as_ref(), "arrival", n, text(t, "before")));
        match hit {
            Some(p) => {
                picks.retain(|q| !(q.ident == p.ident && q.kind == p.kind));
                picks.push(p);
            }
            None => missed.push(n),
        }
    }
    let mut out = String::from("{\"picks\":[");
    for (i, p) in picks.iter().enumerate() {
        out.push_str(if i == 0 { "{\"ident\":" } else { ",{\"ident\":" });
        json::string(&mut out, p.ident);
        out.push_str(",\"id\":");
        json::string(&mut out, p.id);
        out.push_str(&format!(",\"kind\":\"{}\",\"name\":", p.kind));
        json::string(&mut out, p.name);
        out.push_str(",\"transition\":");
        json::opt_string(&mut out, p.transition);
        out.push('}');
    }
    out.push_str("],\"missed\":[");
    for (i, m) in missed.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(&mut out, m);
    }
    out.push_str("]}");
    Ok(out)
}
