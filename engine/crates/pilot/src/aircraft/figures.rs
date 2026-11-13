//! An airplane's figures, each with where it comes from, and what a figure
//! needs that the airplane does not have.
//!
//! The owner (2026-11-09): nothing assumes a Cessna 172, and a figure
//! that is missing is asked for where it is needed, never filled from
//! another airplane. So an airplane is its type's book figures (a stock
//! profile, where its type has one), the figures its pilot confirmed off a
//! photographed handbook page, and the figures its pilot typed, in that
//! order of weight; a figure none of them has is missing, and
//! `airplane_needs` names it so the app can ask for it.

use crate::json::{self, Value};

type R<T> = Result<T, String>;

/// One figure: its name (the gateway record's and the planner's query's,
/// snake case), where it sits in a profile, and its handbook page's name
/// (HandbookFigures), where a photographed page can carry it.
struct Figure {
    key: &'static str,
    path: &'static [&'static str],
    handbook: Option<&'static str>,
}

/// Every figure an airplane's profile shows and its pilot may set. The
/// basic empty weight and moment have no book figure: a stock profile's
/// are its handbook's sample airplane's, and a weight and balance is
/// worked from the airplane's own weight and balance record (FAA-H-8083-1B,
/// the Aircraft Weight and Balance Handbook), so they are the pilot's alone.
const FIGURES: &[Figure] = &[
    Figure { key: "cruise_tas_kt", path: &["cruise_tas_kt"], handbook: Some("cruiseTasKt") },
    Figure { key: "fuel_burn_gph", path: &["fuel_burn_gph"], handbook: Some("fuelBurnGph") },
    Figure { key: "cruise_power_pct", path: &["cruise_power_pct"], handbook: Some("cruisePowerPct") },
    Figure { key: "usable_fuel_gal", path: &["usable_fuel_gal"], handbook: Some("usableFuelGal") },
    Figure { key: "climb_tas_kt", path: &["climb_tas_kt"], handbook: Some("climbTasKt") },
    Figure { key: "climb_fuel_burn_gph", path: &["climb_fuel_burn_gph"], handbook: None },
    Figure { key: "climb_rate_fpm", path: &["climb_rate_fpm_sea_level"], handbook: None },
    Figure { key: "descent_ias_kt", path: &["descent_ias_kt"], handbook: None },
    Figure { key: "descent_fuel_burn_gph", path: &["descent_fuel_burn_gph"], handbook: None },
    Figure { key: "service_ceiling_ft", path: &["service_ceiling_ft"], handbook: Some("serviceCeilingFt") },
    Figure { key: "taxi_fuel_gal", path: &["taxi_fuel_gal"], handbook: None },
    Figure { key: "glide_ratio", path: &["glide", "ratio"], handbook: None },
    Figure { key: "empty_weight_lb", path: &["empty_weight_lb"], handbook: None },
    Figure { key: "empty_moment_lb_in", path: &["empty_moment_lb_in"], handbook: None },
];

/// The member at `path` of `v`, as a number; None where it is missing,
/// null or not a number.
fn at(v: Option<&Value>, path: &[&str]) -> Option<f64> {
    let mut here = v?;
    for key in path {
        here = here.get(key)?;
    }
    here.as_f64()
}

/// The object member `key` of `v`; None where missing or null, an error
/// where it is something else.
fn opt_object<'a>(name: &str, v: &'a Value, key: &str) -> R<Option<&'a Value>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(o @ Value::Object(_)) => Ok(Some(o)),
        Some(_) => Err(format!("{name}: \"{key}\" is not an object")),
    }
}

/// `profile` with the number at `path` set to `value`, making the objects
/// on the way where missing.
fn set(profile: &mut Value, path: &[&str], value: f64) {
    let Value::Object(members) = profile else { return };
    let (first, rest) = (path[0], &path[1..]);
    let i = match members.iter().position(|(k, _)| k == first) {
        Some(i) => i,
        None => {
            members.push((first.to_owned(), Value::Object(Vec::new())));
            members.len() - 1
        }
    };
    if rest.is_empty() {
        members[i].1 = Value::Number(value);
    } else {
        if !matches!(members[i].1, Value::Object(_)) {
            members[i].1 = Value::Object(Vec::new());
        }
        set(&mut members[i].1, rest, value);
    }
}

/// Where one figure comes from and its value: the pilot's own where they
/// gave one that differs from the book's (one they left as the book's is
/// still the book's), else the handbook page's likewise, else the book's.
fn pick(book: Option<f64>, handbook: Option<f64>, own: Option<f64>) -> (Option<f64>, Option<&'static str>) {
    let differs = |x: f64| book.is_none_or(|b| (b - x).abs() > 1e-9);
    match (own, handbook, book) {
        (Some(o), _, _) if differs(o) => (Some(o), Some("pilot")),
        (_, Some(h), _) if differs(h) => (Some(h), Some("handbook")),
        (_, _, Some(b)) => (Some(b), Some("book")),
        _ => (None, None),
    }
}

/// `airplane_figures`: `{"figures": [{"key", "value", "source", "book"}],
/// "profile"}` from `{"book", "handbook", "own"}`. `profile` is the book's
/// with the picked figures over it, what every other rule takes as the
/// airplane; null with none of the three (no airplane).
fn figures(name: &str, v: &Value) -> R<String> {
    let book = opt_object(name, v, "book")?;
    let handbook = opt_object(name, v, "handbook")?;
    let own = opt_object(name, v, "own")?;
    let mut profile = match book {
        Some(b) => Some(b.clone()),
        None if handbook.is_some() || own.is_some() => Some(Value::Object(Vec::new())),
        None => None,
    };
    let mut out = String::from("{\"figures\":[");
    for (i, f) in FIGURES.iter().enumerate() {
        let book_value = at(book, f.path);
        let handbook_value = f.handbook.and_then(|k| at(handbook, &[k, "value"]));
        let (value, source) = pick(book_value, handbook_value, at(own, &[f.key]));
        if let (Some(p), Some(x)) = (profile.as_mut(), value) {
            set(p, f.path, x);
        }
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"key\":");
        json::string(&mut out, f.key);
        out.push_str(",\"value\":");
        json::opt_number(&mut out, value);
        out.push_str(",\"source\":");
        json::opt_string(&mut out, source);
        out.push_str(",\"book\":");
        json::opt_number(&mut out, book_value);
        out.push('}');
    }
    out.push_str("],\"profile\":");
    match &profile {
        Some(p) => json::value(&mut out, p),
        None => out.push_str("null"),
    }
    out.push('}');
    Ok(out)
}

/// What each figure a screen shows needs of the airplane, by the inputs'
/// names: the legs' times and fuel their cruise speed and burn; the fuel
/// totals also the start, taxi and takeoff allowance (the POH's Section 5
/// note beside its climb chart; 14 CFR 91.151's reserve is on top); the glide its
/// still-air glide ratio (the POH's Section 3); the climb its speed, its
/// sea-level rate and its ceiling (the rate falls to 100 fpm there:
/// FAA-H-8083-25C ch. 11, p. 11-9, "The service ceiling is the altitude at
/// which the aircraft is unable to climb at a rate greater than 100 feet
/// per minute"); the descent its indicated speed and fuel flow (the POH's
/// section 5 descent figures; FAA-H-8083-25C ch. 16 flies each phase at its
/// own); a
/// weight and balance its loading envelope and its own empty weight and
/// moment (FAA-H-8083-1B; 14 CFR 91.9, the AFM's limits); takeoff and
/// landing their charts (the POH's Section 5).
const NEEDS: &[(&str, &[&str])] = &[
    ("legs", &["cruise_tas_kt", "fuel_burn_gph"]),
    ("fuel_totals", &["cruise_tas_kt", "fuel_burn_gph", "taxi_fuel_gal"]),
    ("glide", &["glide_ratio"]),
    ("climb", &["climb_tas_kt", "climb_rate_fpm", "service_ceiling_ft"]),
    ("descent", &["descent_ias_kt", "descent_fuel_burn_gph"]),
    ("weight_balance", &["loading", "empty_weight_lb", "empty_moment_lb_in"]),
    ("takeoff_landing", &["takeoff", "landing"]),
];

/// Whether `profile` has the input `key`: a figure by its path, or a
/// table (loading, takeoff, landing) as an object.
fn has(profile: &Value, key: &str) -> bool {
    match FIGURES.iter().find(|f| f.key == key) {
        Some(f) => at(Some(profile), f.path).is_some(),
        None => matches!(profile.get(key), Some(Value::Object(_))),
    }
}

/// `airplane_needs`: `{"missing": [...]}` from `{"profile", "figure"}`:
/// the inputs `figure` needs that `profile` lacks, in order; ["airplane"]
/// with no airplane, whose figures are all missing.
fn needs(name: &str, v: &Value) -> R<String> {
    let figure = v.get("figure").and_then(Value::as_str).ok_or_else(|| format!("{name}: \"figure\" is missing"))?;
    let wants = NEEDS.iter().find(|(f, _)| *f == figure).ok_or_else(|| format!("{name}: no figure is called {figure:?}"))?.1;
    let missing: Vec<&str> = match opt_object(name, v, "profile")? {
        None => vec!["airplane"],
        Some(p) => wants.iter().copied().filter(|k| !has(p, k)).collect(),
    };
    let mut out = String::from("{\"missing\":[");
    for (i, k) in missing.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(&mut out, k);
    }
    out.push_str("]}");
    Ok(out)
}

/// The rule `name` worked on `v`.
pub fn call(name: &str, v: &Value) -> R<String> {
    match name {
        "airplane_figures" => figures(name, v),
        "airplane_needs" => needs(name, v),
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}
