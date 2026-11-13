//! A leg and a run of them, their totals and the fuel plan: the planner's
//! wingtip.navlog assemble_leg, leg_between, legs, totals and fuel_plan,
//! and wingtip.planning.alternate_leg.

use super::{number, object, opt_number, py_round, py_sum, Air, LegAir, Obj, Profile, R};
use crate::geo::{bearing_deg, distance_nm, py_mod};
use crate::json::Value;
use wingtip_flight::flight;

/// One nav-log leg between two (lat, lon) points at `altitude_ft`, in the
/// air the planner looked up at its midpoint: the true course and distance
/// (a great circle on wingtip.geo's sphere), the airplane's cruise in the
/// leg's air (wingtip_flight::performance: its figures are at a reference
/// altitude on a standard day, and the forecast temperature makes the
/// density altitude they are flown at), the wind triangle (PHAK ch. 16),
/// the magnetic course and heading (the true one less the variation, east
/// positive: "east is least, west is best", FAA-H-8083-25C ch. 16) and the time and
/// fuel.
///
/// With no wind (no winds-aloft station near), the correction is none and
/// the ground speed the TAS: a no-wind estimate, not a calm, and the leg's
/// `wind` says so with null. A crosswind stronger than the TAS holds no
/// heading: the ground speed is none, where the clamped correction and the
/// wind's tail part made an impossible leg look flyable. A ground speed of
/// none or less leaves the time and fuel infinite (`leg_between` makes
/// them null).
///
/// With no airplane (`profile` None): the leg's course, miles, altitude,
/// air and magnetic course -- none of which an airplane changes -- and
/// every figure that needs one (the wind correction and headings, which
/// are worked at its true airspeed, the ground speed, time, fuel and its
/// cruise figures) null, never a stock airplane's. The owner (2026-11-09):
/// "If no airplane is entered, only show the distance and the things you
/// can without airplane profile, don't assume."
pub fn assemble_leg(
    start: (f64, f64), end: (f64, f64), altitude_ft: f64, profile: Option<&Profile>, air: &Air, variation_deg: f64,
) -> R<Obj> {
    let true_course_deg = bearing_deg(start.0, start.1, end.0, end.1);
    let leg_distance_nm = distance_nm(start.0, start.1, end.0, end.1);
    let Some(profile) = profile else {
        let mut leg = Obj::default();
        leg.set_num("true_course_deg", true_course_deg);
        leg.set_num("distance_nm", leg_distance_nm);
        leg.set_num("altitude_ft", altitude_ft);
        leg.set("wind", air.wind.clone());
        for field in ["wca_deg", "true_heading_deg"] {
            leg.set(field, Value::Null);
        }
        leg.set_num("magnetic_variation_deg", variation_deg);
        leg.set("magnetic_heading_deg", Value::Null);
        leg.set_num("magnetic_course_deg", py_mod(true_course_deg - variation_deg, 360.0));
        for field in ["groundspeed_kt", "ete_min", "fuel_gal", "tas_kt", "fuel_burn_gph", "power_pct"] {
            leg.set(field, Value::Null);
        }
        leg.set_opt("oat_c", air.oat_c);
        leg.set("density_altitude_ft", Value::Null);
        return Ok(leg);
    };
    let cruise = profile.airplane.cruise(altitude_ft, air.oat_c);
    let tas_kt = cruise.tas_kt;
    let (wca_deg, gs_kt) = wind_triangle(true_course_deg, wind_of(&air.wind)?, tas_kt);
    let true_heading_deg = py_mod(true_course_deg + wca_deg, 360.0);
    let magnetic_heading_deg = py_mod(true_heading_deg - variation_deg, 360.0);
    // The course over the ground as the compass reads it: the figure a
    // pilot sets on the course selector, and the map's Route Leg sheet
    // shows (ForeFlight's "Course 346°M").
    let magnetic_course_deg = py_mod(true_course_deg - variation_deg, 360.0);
    let ete_min = if gs_kt > 0.0 { (leg_distance_nm / gs_kt) * 60.0 } else { f64::INFINITY };
    let fuel_gal = (ete_min / 60.0) * cruise.fuel_burn_gph;
    let mut leg = Obj::default();
    leg.set_num("true_course_deg", true_course_deg);
    leg.set_num("distance_nm", leg_distance_nm);
    leg.set_num("altitude_ft", altitude_ft);
    leg.set("wind", air.wind.clone());
    leg.set_num("wca_deg", wca_deg);
    leg.set_num("true_heading_deg", true_heading_deg);
    leg.set_num("magnetic_variation_deg", variation_deg);
    leg.set_num("magnetic_heading_deg", magnetic_heading_deg);
    leg.set_num("magnetic_course_deg", magnetic_course_deg);
    // Kept as they are until leg_between decides flyability.
    leg.set("groundspeed_kt", Value::Number(gs_kt));
    leg.set("ete_min", Value::Number(ete_min));
    leg.set("fuel_gal", Value::Number(fuel_gal));
    leg.set_num("tas_kt", tas_kt);
    leg.set_num("fuel_burn_gph", cruise.fuel_burn_gph);
    leg.set_num("power_pct", cruise.power_pct);
    leg.set_opt("oat_c", air.oat_c);
    leg.set_num("density_altitude_ft", cruise.density_altitude_ft.round_ties_even());
    Ok(leg)
}

/// The wind triangle at `tas_kt` along `true_course_deg` in `wind` (from,
/// degrees true, and knots; FAA-H-8083-25C, PHAK ch. 16, "Wind triangle"):
/// the wind correction angle and the ground speed. No wind (None) is no
/// correction and the ground speed the TAS; a crosswind stronger than the
/// TAS holds no heading, and the ground speed is none (0). The cruise's
/// triangle (assemble_leg) and the climb's (with_climbs, altitude_change,
/// at the climb speed in the same wind) are all this one.
pub(crate) fn wind_triangle(true_course_deg: f64, wind: Option<(f64, f64)>, tas_kt: f64) -> (f64, f64) {
    let Some((from, kt)) = wind else { return (0.0, tas_kt) };
    let wca = flight::wind_correction_deg(true_course_deg, from, kt, tas_kt);
    let crosswind_kt = kt * (from - true_course_deg).to_radians().sin();
    let gs = if crosswind_kt.abs() > tas_kt { 0.0 } else { flight::groundspeed_kt(true_course_deg, from, kt, tas_kt, wca) };
    (wca, gs)
}

/// A leg's `wind` as the triangle takes it: (from, kt), None for null.
pub(crate) fn wind_of(wind: &Value) -> R<Option<(f64, f64)>> {
    match wind {
        Value::Null => Ok(None),
        w => {
            let o = Obj::read("navlog", w)?;
            Ok(Some((o.num("wind_dir_true_deg")?, o.num("wind_speed_kt")?)))
        }
    }
}

/// A fix's (lat, lon) and the name a leg calls it by: its name, else its
/// category.
pub(crate) fn fix_of(name: &str, v: &Value) -> R<((f64, f64), String)> {
    let o = Obj::read(name, v)?;
    let at = (o.num("lat").map_err(|e| format!("{name}: a fix's {e}"))?, o.num("lon").map_err(|e| format!("{name}: a fix's {e}"))?);
    let called = o.text("name").filter(|n| !n.is_empty()).or_else(|| o.text("category")).unwrap_or("").to_owned();
    Ok((at, called))
}

/// `assemble_leg` between two fixes, named after them on "from" and "to".
/// Flyable or not, decided once: a leg whose time is not a number (no
/// ground speed) has no ground speed, time or fuel at all -- null, which
/// JSON can carry where the infinity it was could not.
pub fn leg_between(name: &str, a: &Value, b: &Value, altitude_ft: f64, profile: Option<&Profile>, air: &Air, variation_deg: f64) -> R<Obj> {
    let ((start, from), (end, to)) = (fix_of(name, a)?, fix_of(name, b)?);
    let mut leg = assemble_leg(start, end, altitude_ft, profile, air, variation_deg)?;
    leg.set("from", Value::String(from));
    leg.set("to", Value::String(to));
    if profile.is_none() {
        return Ok(leg);
    }
    for field in ["ete_min", "fuel_gal", "groundspeed_kt"] {
        if !leg.opt(field)?.is_some_and(f64::is_finite) {
            leg.set(field, Value::Null);
        }
    }
    if !leg.has("ete_min") {
        leg.set("groundspeed_kt", Value::Null);
        leg.set("fuel_gal", Value::Null);
    }
    Ok(leg)
}

/// One leg between each consecutive pair of fixes, all at `altitude_ft`,
/// each in its own air at that altitude.
pub fn legs(name: &str, fixes: &[Value], altitude_ft: f64, profile: Option<&Profile>, air: &[LegAir]) -> R<Vec<Obj>> {
    if air.len() + 1 != fixes.len() {
        return Err(format!(
            "{name}: {} fixes make {} legs, and the air is given for {}",
            fixes.len(),
            fixes.len().saturating_sub(1),
            air.len()
        ));
    }
    fixes
        .windows(2)
        .zip(air)
        .enumerate()
        .map(|(i, (pair, leg_air))| {
            leg_between(name, &pair[0], &pair[1], altitude_ft, profile, leg_air.at(name, i, altitude_ft)?, leg_air.variation_deg)
        })
        .collect()
}

/// A leg's procedure's miles more (the planner's with_procedures), none
/// where it is flown by none.
fn more_nm(leg: &Obj) -> f64 {
    match leg.get("procedure") {
        Some(p @ Value::Object(_)) => p.get("more_nm").and_then(Value::as_f64).unwrap_or(0.0),
        _ => 0.0,
    }
}

/// The legs' totals: the miles (a leg flown by procedures the longer by
/// their path's miles more, as its time and fuel are), the time and fuel
/// -- null rather than a wrong number while any leg is unflyable, as
/// summing the flyable ones would understate the trip -- and how many legs
/// are unflyable or had no winds aloft (a no-wind estimate, not a calm).
/// A leg with no airplane (its `tas_kt` null) is not unflyable: its time
/// and fuel are unknown, as the totals' are then.
pub fn totals(legs: &[Obj]) -> R<Value> {
    let total = |field: &str| -> R<Value> {
        let values: Vec<f64> = legs.iter().map(|l| l.opt(field)).collect::<R<Vec<_>>>()?.into_iter().flatten().collect();
        Ok(if values.len() == legs.len() { number(py_round(py_sum(values), 1)) } else { Value::Null })
    };
    let distances = legs.iter().map(|l| Ok(l.num("distance_nm")? + more_nm(l))).collect::<R<Vec<f64>>>()?;
    Ok(object(vec![
        ("distance_nm", number(py_round(py_sum(distances), 1))),
        ("procedure_nm", number(py_round(py_sum(legs.iter().map(more_nm)), 1))),
        ("ete_min", total("ete_min")?),
        ("fuel_gal", total("fuel_gal")?),
        ("unflyable_legs", number(legs.iter().filter(|l| l.get("tas_kt") != Some(&Value::Null) && !l.has("ete_min")).count() as f64)),
        ("legs_without_wind", number(legs.iter().filter(|l| !l.has("wind")).count() as f64)),
    ]))
}

/// The fuel the flight needs against the tanks: the start, taxi and
/// takeoff allowance, the legs' own total (`total_fuel_gal`, None while a
/// leg is unflyable), the fuel on to an IFR alternate where one is filed
/// (14 CFR 91.167(a)(2)) and the reserve at the profile's cruise burn --
/// 30 minutes by day and 45 at night under VFR (91.151(a)), 45 under IFR
/// day or night (91.167(a)(3)) -- and the margin against the usable fuel
/// where the profile gives it. `night` None is a flight with no departure
/// time: night cannot be ruled out, so the night's 45 minutes
/// (91.151(a)(2), "At night, to fly after that for at least 45 minutes"),
/// the larger, and `night` stays null for the apps to say "night reserve
/// assumed". With no airplane (`profile`
/// None) the reserve's minutes alone, which are the rules' (91.151,
/// 91.167): its gallons, the taxi allowance, the fuel required and the
/// margin are an airplane's, and null. The start, taxi and takeoff
/// allowance is the profile's own (`taxi_fuel_gal`, its POH's); a profile
/// without one has `taxi_gal` null and its fuel required leaves the
/// allowance out, which the apps say beside it -- no stock airplane's
/// figure fills the gap (the owner, 2026-11-09).
pub fn fuel_plan(total_fuel_gal: Option<f64>, profile: Option<&Profile>, night: Option<bool>, rules: &str, alternate_gal: f64) -> Value {
    let reserve_min = flight::reserve_min(rules == "ifr", night.unwrap_or(true));
    let reserve_gal = profile.map(|p| py_round(reserve_min / 60.0 * p.airplane.fuel_burn_gph, 2));
    let taxi_gal = profile.and_then(|p| p.taxi_fuel_gal);
    let required = match (total_fuel_gal, reserve_gal) {
        (Some(t), Some(reserve)) => Some(py_round(t + taxi_gal.unwrap_or(0.0) + alternate_gal + reserve, 1)),
        _ => None,
    };
    let usable = profile.and_then(|p| p.usable_fuel_gal);
    let margin = match (required, usable) {
        (Some(r), Some(u)) => Some(py_round(u - r, 1)),
        _ => None,
    };
    object(vec![
        ("reserve_min", number(reserve_min)),
        ("reserve_gal", opt_number(reserve_gal)),
        ("taxi_gal", opt_number(taxi_gal)),
        ("fuel_required_gal", opt_number(required)),
        ("usable_fuel_gal", opt_number(usable)),
        ("fuel_margin_gal", opt_number(margin)),
        ("night", night.map(Value::Bool).unwrap_or(Value::Null)),
        ("rules", Value::String(rules.to_owned())),
    ])
}

/// The leg from the destination on to the IFR alternate, for 14 CFR
/// 91.167(a)(2)'s fuel: flown at the route's last altitude in its own air,
/// or in still air at the cruise figures where the winds could not be read
/// (`air` None) or the leg cannot be flown in them, which it says
/// (`still_air`). With no airplane (`profile` None), its miles and
/// altitude, the time and fuel null.
pub fn alternate_leg(
    name: &str, dest: &Value, alternate: &Value, altitude_ft: f64, profile: Option<&Profile>, air: Option<(&Air, f64)>,
) -> R<Value> {
    let ident = |v: &Value| -> R<String> {
        Ok(Obj::read(name, v)?.text("ident").ok_or_else(|| format!("{name}: an airport's \"ident\" is missing"))?.to_owned())
    };
    let named = |v: &Value| -> R<Value> {
        let o = Obj::read(name, v)?;
        Ok(object(vec![("name", Value::String(ident(v)?)), ("lat", number(o.num("lat")?)), ("lon", number(o.num("lon")?))]))
    };
    let (a, b) = (named(dest)?, named(alternate)?);
    let Some(profile) = profile else {
        let ((start, _), (end, _)) = (fix_of(name, &a)?, fix_of(name, &b)?);
        return Ok(object(vec![
            ("ident", Value::String(ident(alternate)?)),
            ("distance_nm", number(py_round(distance_nm(start.0, start.1, end.0, end.1), 1))),
            ("ete_min", Value::Null),
            ("fuel_gal", Value::Null),
            ("altitude_ft", number(altitude_ft)),
            ("still_air", Value::Bool(false)),
        ]));
    };
    let flown = match air {
        Some((air, variation)) => Some(leg_between(name, &a, &b, altitude_ft, Some(profile), air, variation)?),
        None => None,
    };
    let (distance, ete, fuel, still_air) = match flown {
        Some(leg) if leg.has("ete_min") => (leg.num("distance_nm")?, leg.num("ete_min")?, leg.num("fuel_gal")?, false),
        _ => {
            let ((start, _), (end, _)) = (fix_of(name, &a)?, fix_of(name, &b)?);
            let distance = distance_nm(start.0, start.1, end.0, end.1);
            let minutes = distance / profile.airplane.cruise_tas_kt * 60.0;
            (distance, minutes, minutes / 60.0 * profile.airplane.fuel_burn_gph, true)
        }
    };
    Ok(object(vec![
        ("ident", Value::String(ident(alternate)?)),
        ("distance_nm", number(py_round(distance, 1))),
        ("ete_min", number(py_round(ete, 1))),
        ("fuel_gal", number(py_round(fuel, 2))),
        ("altitude_ft", number(altitude_ft)),
        ("still_air", Value::Bool(still_air)),
    ]))
}

/// The wind along the legs, knots, positive helping: weighed by distance
/// over the legs that had one, none where none did (a hop of no length
/// had nothing to divide by).
pub fn tailwind_kt(legs: &[Obj]) -> R<Option<f64>> {
    let with_wind: Vec<&Obj> = legs.iter().filter(|l| l.has("wind") && l.has("groundspeed_kt")).collect();
    let wind_nm = py_sum(with_wind.iter().map(|l| l.num("distance_nm")).collect::<R<Vec<_>>>()?);
    if wind_nm <= 0.0 {
        return Ok(None);
    }
    let weighed =
        with_wind.iter().map(|l| Ok((l.num("groundspeed_kt")? - l.num("tas_kt")?) * l.num("distance_nm")?)).collect::<R<Vec<f64>>>()?;
    Ok(Some(py_round(py_sum(weighed) / wind_nm, 1)))
}
