//! `handbook_read_check`: a handbook's performance and weight and balance
//! figures as read off a photographed page (POH sections 5 and 6), each
//! put in the app's units and checked (handbook_checks.rs), as items the
//! pilot confirms one by one.
//!
//! The answer is `{"items", "handbook", "profile"}`:
//! - `items`: each table row, or each group of figures read together (the
//!   climb, the glide, the empty weight, the envelope, the fuel), with its
//!   figures as read and in the app's units, and its flags. A figure's
//!   `path` is where it is in the read (`cruise.2.tas`), so the app edits
//!   the read and asks again.
//! - `handbook`: every figure in the app's units (knots, feet, pounds,
//!   inches, gallons), for the airplane's record.
//! - `profile`: the airplane form's figures from them: the cruise row at
//!   the cruise reference altitude (flight::CRUISE_REFERENCE_FT, the
//!   altitude the form's cruise figures are given at, on a standard day)
//!   and the power nearest 65%, the climb's burn and the usable fuel.
//!
//! The app asks again with only the items the pilot confirmed, and saves
//! that answer's `handbook` and `profile`: nothing unconfirmed is kept.

use super::envelope::Corner;
use super::handbook_checks::{self as checks, Cruise, Distance};
use super::out::{array, check as check_flag, figure, flags_json, wrong, Flag, Level, Obj};
use super::units::Units;
use crate::json::Value;
use wingtip_flight::flight::CRUISE_REFERENCE_FT;

type R<T> = Result<T, String>;
const NAME: &str = "handbook_read_check";

/// The power a profile's cruise is picked at where the table has several:
/// the 65% many handbooks plan their range at.
const PLANNING_POWER_PCT: f64 = 65.0;
/// How far from the cruise reference altitude a row may be and still give
/// the profile's cruise.
const REFERENCE_SLACK_FT: f64 = 1_000.0;

fn num(v: &Value, key: &str) -> R<Option<f64>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{NAME}: \"{key}\" is not a number")),
    }
}

fn text<'a>(v: &'a Value, key: &str) -> R<Option<&'a str>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s)),
        Some(_) => Err(format!("{NAME}: \"{key}\" is not a string")),
    }
}

fn rows<'a>(v: &'a Value, key: &str) -> R<&'a [Value]> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(a)) => Ok(a),
        Some(_) => Err(format!("{NAME}: \"{key}\" is not an array")),
    }
}

fn group<'a>(v: &'a Value, key: &str) -> &'a Value {
    static NULL: Value = Value::Null;
    v.get(key).unwrap_or(&NULL)
}

/// A figure: where it is in the read, what it is, as read and in the
/// app's units.
struct Fig {
    path: String,
    label: &'static str,
    value: f64,
    unit: &'static str,
    app_value: f64,
    app_unit: &'static str,
}

fn fig(path: String, label: &'static str, value: f64, unit: &'static str, app_value: f64, app_unit: &'static str) -> Fig {
    Fig { path, label, value, unit, app_value, app_unit }
}

struct Item {
    key: String,
    group: &'static str,
    title: String,
    figures: Vec<Fig>,
    flags: Vec<Flag>,
}

fn item_json(i: &Item) -> String {
    let figures = array(i.figures.iter().map(|f| Obj::new().text("path", Some(&f.path)).text("label", Some(f.label))
        .num("value", f.value).text("unit", Some(f.unit)).num("app_value", f.app_value).text("app_unit", Some(f.app_unit)).done()));
    Obj::new().text("key", Some(&i.key)).text("group", Some(i.group)).text("title", Some(&i.title))
        .raw("figures", &figures).raw("flags", &flags_json(&i.flags)).done()
}

fn missing(item: &mut Item, what: &str) {
    item.flags.push(wrong(format!("No {what} was read.")));
}

/// The read's cruise rows, in the app's units, with their items; a row
/// without its altitude, speed or burn is an item flagged and no row.
fn cruise(v: &Value, u: &Units, items: &mut Vec<Item>) -> R<Vec<(usize, Cruise)>> {
    let kind = text(v, "cruise_speed_kind")?.unwrap_or("tas");
    let mut kept = Vec::new();
    for (i, r) in rows(v, "cruise")?.iter().enumerate() {
        let (alt, power, rpm, tas, burn) = (num(r, "altitude_ft")?, num(r, "power_pct")?, num(r, "rpm")?, num(r, "tas")?, num(r, "burn")?);
        let p = |k: &str| format!("cruise.{i}.{k}");
        let mut item = Item { key: format!("cruise.{i}"), group: "cruise", figures: Vec::new(), flags: Vec::new(),
            title: match (alt, power, rpm) {
                (Some(a), Some(pc), _) => format!("{} ft, {}%", figure(a), figure(pc)),
                (Some(a), None, Some(n)) => format!("{} ft, {} rpm", figure(a), figure(n)),
                (Some(a), None, None) => format!("{} ft", figure(a)),
                _ => "Cruise".into(),
            } };
        if let Some(a) = alt { item.figures.push(fig(p("altitude_ft"), "Pressure altitude", a, "ft", a, "ft")); }
        if let Some(x) = power { item.figures.push(fig(p("power_pct"), "Power", x, "%", x, "%")); }
        if let Some(x) = rpm { item.figures.push(fig(p("rpm"), "RPM", x, "rpm", x, "rpm")); }
        if let Some(x) = tas { item.figures.push(fig(p("tas"), "True airspeed", x, u.speed, u.kt(x), "kt")); }
        if let Some(x) = burn { item.figures.push(fig(p("burn"), "Fuel burn", x, u.burn, u.gph(x), "gph")); }
        if u.burn == "pph" {
            item.flags.push(check_flag("The burn reads in pounds an hour, taken as avgas at 6 lb a gallon.".into()));
        }
        match (alt, tas, burn) {
            (Some(a), Some(t), Some(b)) => kept.push((items.len(), Cruise { altitude_ft: a, power_pct: power, rpm, tas_kt: u.kt(t), burn_gph: u.gph(b) })),
            _ => missing(&mut item, "altitude, true airspeed or fuel burn"),
        }
        items.push(item);
    }
    let flags = checks::cruise(&kept.iter().map(|(_, c)| c.clone()).collect::<Vec<_>>(), kind);
    for ((at, _), f) in kept.iter().zip(flags) {
        items[*at].flags.extend(f);
    }
    Ok(kept)
}

fn distances(v: &Value, key: &'static str, title: &str, u: &Units, items: &mut Vec<Item>) -> R<Vec<Distance>> {
    let mut kept = Vec::new();
    for (i, r) in rows(v, key)?.iter().enumerate() {
        let (alt, temp, roll, over) = (num(r, "pressure_altitude_ft")?, num(r, "temp_c")?, num(r, "ground_roll")?, num(r, "over_50ft")?);
        let p = |k: &str| format!("{key}.{i}.{k}");
        let mut item = Item { key: format!("{key}.{i}"), group: key, figures: Vec::new(), flags: Vec::new(), title: match (alt, temp) {
            (Some(a), Some(t)) => format!("{title} at {} ft, {} °C", figure(a), figure(t)),
            _ => title.into(),
        } };
        if let Some(a) = alt { item.figures.push(fig(p("pressure_altitude_ft"), "Pressure altitude", a, "ft", a, "ft")); }
        if let Some(t) = temp { item.figures.push(fig(p("temp_c"), "Temperature", t, "°C", t, "°C")); }
        if let Some(x) = roll { item.figures.push(fig(p("ground_roll"), "Ground roll", x, u.distance, u.ft(x), "ft")); }
        if let Some(x) = over { item.figures.push(fig(p("over_50ft"), "Over a 50 ft obstacle", x, u.distance, u.ft(x), "ft")); }
        match (alt, temp, roll, over) {
            (Some(a), Some(t), Some(g), Some(o)) => {
                kept.push((items.len(), Distance { pressure_altitude_ft: a, temp_c: t, ground_roll_ft: u.ft(g), over_50ft_ft: u.ft(o) }));
            }
            _ => missing(&mut item, "altitude, temperature, ground roll or distance over 50 ft"),
        }
        items.push(item);
    }
    let flags = checks::distances(&kept.iter().map(|(_, d)| d.clone()).collect::<Vec<_>>());
    for ((at, _), f) in kept.iter().zip(flags) {
        items[*at].flags.extend(f);
    }
    Ok(kept.into_iter().map(|(_, d)| d).collect())
}

fn pick_profile<'a>(cruise: &'a [(usize, Cruise)], items: &[Item]) -> Option<(usize, &'a Cruise)> {
    let clean = |at: &usize| !items[*at].flags.iter().any(|f| f.level == Level::Wrong);
    let near = cruise.iter().filter(|(at, c)| clean(at) && (c.altitude_ft - CRUISE_REFERENCE_FT).abs() <= REFERENCE_SLACK_FT);
    let best = near.min_by(|(_, a), (_, b)| {
        let key = |c: &Cruise| ((c.altitude_ft - CRUISE_REFERENCE_FT).abs(), (c.power_pct.unwrap_or(PLANNING_POWER_PCT) - PLANNING_POWER_PCT).abs());
        key(a).partial_cmp(&key(b)).unwrap_or(std::cmp::Ordering::Equal)
    });
    best.map(|(at, c)| (*at, c))
}

/// The rule: the read in, `{"items", "handbook", "profile"}` out.
pub fn check(v: &Value) -> R<String> {
    let u = Units::read(text(v, "speed_unit")?, text(v, "distance_unit")?, text(v, "weight_unit")?, text(v, "arm_unit")?,
        text(v, "fuel_unit")?, text(v, "burn_unit")?)?;
    let mut items = Vec::new();
    let cruise = cruise(v, &u, &mut items)?;

    let c = group(v, "climb");
    let (vy, rate, cburn) = (num(c, "speed")?.map(|x| u.kt(x)), num(c, "rate_fpm")?, num(c, "burn")?.map(|x| u.gph(x)));
    if vy.is_some() || rate.is_some() || cburn.is_some() {
        let mut figures = Vec::new();
        if let Some(x) = num(c, "speed")? { figures.push(fig("climb.speed".into(), "Climb speed (Vy)", x, u.speed, u.kt(x), "KIAS")); }
        if let Some(x) = rate { figures.push(fig("climb.rate_fpm".into(), "Rate of climb", x, "fpm", x, "fpm")); }
        if let Some(x) = num(c, "burn")? { figures.push(fig("climb.burn".into(), "Climb fuel burn", x, u.burn, u.gph(x), "gph")); }
        items.push(Item { key: "climb".into(), group: "climb", title: "Climb".into(), figures, flags: checks::climb(vy, rate, cburn) });
    }

    let g = group(v, "glide");
    let (glide_kias, ratio) = (num(g, "speed")?.map(|x| u.kt(x)), num(g, "ratio")?);
    if glide_kias.is_some() || ratio.is_some() {
        let mut figures = Vec::new();
        if let Some(x) = num(g, "speed")? { figures.push(fig("glide.speed".into(), "Best glide speed", x, u.speed, u.kt(x), "KIAS")); }
        if let Some(x) = ratio { figures.push(fig("glide.ratio".into(), "Glide ratio", x, "to 1", x, "to 1")); }
        items.push(Item { key: "glide".into(), group: "glide", title: "Glide".into(), figures, flags: checks::glide(glide_kias, ratio) });
    }

    let takeoff = distances(v, "takeoff", "Takeoff", &u, &mut items)?;
    let landing = distances(v, "landing", "Landing", &u, &mut items)?;

    let e = group(v, "empty");
    let (ew, ea) = (num(e, "weight")?.map(|x| u.lb(x)), num(e, "arm")?.map(|x| u.inch(x)));
    let mtow = num(v, "max_takeoff_weight")?.map(|x| u.lb(x));
    if ew.is_some() || ea.is_some() {
        let mut figures = Vec::new();
        if let Some(x) = num(e, "weight")? { figures.push(fig("empty.weight".into(), "Empty weight", x, u.weight, u.lb(x), "lb")); }
        if let Some(x) = num(e, "arm")? { figures.push(fig("empty.arm".into(), "Arm", x, u.arm, u.inch(x), "in")); }
        let moment = num(e, "moment")?;
        if let Some(m) = moment { figures.push(fig("empty.moment".into(), "Moment", m, "as read", m, "as read")); }
        // The moment is checked in the page's own units: weight × arm as
        // read, over the divisor it is printed in (often 1,000).
        let divisor = num(e, "moment_divisor")?.filter(|d| *d > 0.0).unwrap_or(1.0);
        let as_read = match (num(e, "weight")?, num(e, "arm")?, moment) {
            (Some(w), Some(a), Some(m)) => Some((w, a, m, divisor)),
            _ => None,
        };
        let flags = checks::empty(ew, ea, as_read);
        items.push(Item { key: "empty".into(), group: "empty", title: "Empty weight".into(), figures, flags });
    }
    if let Some(m) = mtow {
        let x = num(v, "max_takeoff_weight")?.unwrap_or(m);
        items.push(Item { key: "weight".into(), group: "weight", title: "Maximum takeoff weight".into(),
            figures: vec![fig("max_takeoff_weight".into(), "Maximum takeoff weight", x, u.weight, m, "lb")], flags: checks::max_weight(m, ew) });
    }

    let mut corners: Vec<Corner> = Vec::new();
    let envelope_rows = rows(v, "envelope")?;
    if !envelope_rows.is_empty() {
        let mut figures = Vec::new();
        for (i, p) in envelope_rows.iter().enumerate() {
            let (arm, weight) = (num(p, "arm")?, num(p, "weight")?);
            if let (Some(a), Some(w)) = (arm, weight) {
                figures.push(fig(format!("envelope.{i}.arm"), "Arm", a, u.arm, u.inch(a), "in"));
                figures.push(fig(format!("envelope.{i}.weight"), "Weight", w, u.weight, u.lb(w), "lb"));
                corners.push((u.inch(a), u.lb(w)));
            }
        }
        items.push(Item { key: "envelope".into(), group: "envelope", title: "CG envelope".into(), figures, flags: checks::envelope(&corners, mtow) });
    }

    let picked = pick_profile(&cruise, &items);
    let f = group(v, "fuel");
    let (total, usable) = (num(f, "total")?.map(|x| u.gal(x)), num(f, "usable")?.map(|x| u.gal(x)));
    if total.is_some() || usable.is_some() {
        let mut figures = Vec::new();
        if let Some(x) = num(f, "total")? { figures.push(fig("fuel.total".into(), "Total fuel", x, u.fuel, u.gal(x), "gal")); }
        if let Some(x) = num(f, "usable")? { figures.push(fig("fuel.usable".into(), "Usable fuel", x, u.fuel, u.gal(x), "gal")); }
        items.push(Item { key: "fuel".into(), group: "fuel", title: "Fuel".into(), figures, flags: checks::fuel(total, usable, picked.map(|(_, c)| c.burn_gph)) });
    }

    let row = |c: &Cruise| Obj::new().num("altitude_ft", c.altitude_ft).opt("power_pct", c.power_pct).opt("rpm", c.rpm)
        .num("tas_kt", c.tas_kt).num("burn_gph", c.burn_gph).done();
    let dist = |d: &Distance| Obj::new().num("pressure_altitude_ft", d.pressure_altitude_ft).num("temp_c", d.temp_c)
        .num("ground_roll_ft", d.ground_roll_ft).num("over_50ft_ft", d.over_50ft_ft).done();
    let handbook = Obj::new()
        .raw("cruise", &array(cruise.iter().map(|(_, c)| row(c))))
        .opt("climb_speed_kias", vy).opt("climb_rate_fpm", rate).opt("climb_burn_gph", cburn)
        .opt("glide_speed_kias", glide_kias).opt("glide_ratio", ratio)
        .raw("takeoff", &array(takeoff.iter().map(dist))).raw("landing", &array(landing.iter().map(dist)))
        .opt("empty_weight_lb", ew).opt("empty_arm_in", ea).opt("max_takeoff_weight_lb", mtow)
        .raw("envelope", &array(super::envelope::closed(&corners).iter().map(|(a, w)| Obj::new().num("arm_in", *a).num("weight_lb", *w).done())))
        .opt("fuel_total_gal", total).opt("usable_fuel_gal", usable)
        .done();
    let profile = Obj::new()
        .opt("cruise_tas_kt", picked.map(|(_, c)| c.tas_kt)).opt("fuel_burn_gph", picked.map(|(_, c)| c.burn_gph))
        .opt("cruise_power_pct", picked.and_then(|(_, c)| c.power_pct).filter(|p| (40.0..=100.0).contains(p)))
        .text("cruise_from", picked.map(|(at, _)| items[at].key.as_str()))
        .opt("climb_fuel_burn_gph", cburn).opt("usable_fuel_gal", usable)
        .done();
    Ok(Obj::new().raw("items", &array(items.iter().map(item_json))).raw("handbook", &handbook).raw("profile", &profile).done())
}
