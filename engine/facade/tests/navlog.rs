//! The nav log (wingtip_route::navlog), asked by name as the planner asks
//! it, held to the planner's own tests from before the move
//! (services/planner/tests_wingtip/test_navlog.py, test_altitude_plans.py)
//! and to the recorded routes the planner's golden test replays
//! (services/planner/tests_wingtip/golden/*.json): the same fixes, legal
//! altitudes, airplane and air, the same plans and legs.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;
use wingtip_engine::flight::isa_temp_c;

fn ask(name: &str, input: Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name} answered {text}: {e}"))
}

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("not a number: {v}"))
}

fn close(a: f64, b: f64, tol: f64) -> bool {
    (a - b).abs() <= tol
}

// --- A leg in its own air (test_navlog.py) -----------------------------

fn leg_with_wind(wind_dir: f64, wind_kt: f64, oat_c: Option<f64>) -> Value {
    let a = json!({"name": "A", "category": "departure", "lat": 45.0, "lon": -90.0});
    // Due east, 090.
    let b = json!({"name": "B", "category": "destination", "lat": 45.0, "lon": -89.0});
    let air = json!([{"variation_deg": 0.0, "at": [{"altitude_ft": 6000.0,
        "wind": {"wind_dir_true_deg": wind_dir, "wind_speed_kt": wind_kt}, "oat_c": oat_c}]}]);
    ask(
        "navlog_legs",
        json!({"fixes": [a, b], "altitude_ft": 6000.0, "profile": {"cruise_tas_kt": 100.0, "fuel_burn_gph": 8.5}, "air": air}),
    )[0]
    .clone()
}

/// One leg between two points with the variation given, still air.
fn leg_with_variation(a: (f64, f64), b: (f64, f64), variation_deg: f64) -> Value {
    let fix = |name: &str, (lat, lon): (f64, f64)| json!({"name": name, "category": "waypoint", "lat": lat, "lon": lon});
    let air = json!([{"variation_deg": variation_deg, "at": [{"altitude_ft": 6000.0, "wind": null, "oat_c": null}]}]);
    ask(
        "navlog_legs",
        json!({"fixes": [fix("A", a), fix("B", b)], "altitude_ft": 6000.0,
        "profile": {"cruise_tas_kt": 100.0, "fuel_burn_gph": 8.5}, "air": air}),
    )[0]
    .clone()
}

#[test]
fn the_magnetic_course_is_the_true_course_less_east_variation() {
    // FAA-H-8083-25C ch. 16: "east is least, west is best". A course due
    // east, 090 true: 3 degrees east makes it 087 magnetic, 3 west 093.
    let east = leg_with_variation((45.0, -90.0), (45.0, -89.0), 3.0);
    let tc = f(&east["true_course_deg"]);
    assert!(close(f(&east["magnetic_course_deg"]), tc - 3.0, 1e-9), "{east}");
    let west = leg_with_variation((45.0, -90.0), (45.0, -89.0), -3.0);
    assert!(close(f(&west["magnetic_course_deg"]), tc + 3.0, 1e-9), "{west}");
    // Through north it wraps: 000 true with 4 east is 356 magnetic.
    let north = leg_with_variation((44.0, -90.0), (45.0, -90.0), 4.0);
    assert!(close(f(&north["magnetic_course_deg"]), 356.0, 1e-6), "{north}");
    // In still air the course and the heading are one.
    assert!(close(f(&north["magnetic_course_deg"]), f(&north["magnetic_heading_deg"]), 1e-9));
}

#[test]
fn a_crosswind_stronger_than_tas_is_unflyable() {
    // 150 kt from 190 on an eastbound course for a 100 kt airplane: no
    // heading holds the course.
    let leg = leg_with_wind(190.0, 150.0, None);
    assert!(leg["ete_min"].is_null() && leg["groundspeed_kt"].is_null() && leg["fuel_gal"].is_null(), "{leg}");
}

#[test]
fn an_unflyable_headwind_has_no_ground_speed_either() {
    let leg = leg_with_wind(90.0, 120.0, None);
    assert!(leg["ete_min"].is_null() && leg["groundspeed_kt"].is_null() && leg["fuel_gal"].is_null(), "{leg}");
}

#[test]
fn a_strong_but_holdable_crosswind_still_flies() {
    let leg = leg_with_wind(180.0, 60.0, None);
    assert!(!leg["ete_min"].is_null() && f(&leg["groundspeed_kt"]) > 0.0);
}

#[test]
fn a_leg_flies_the_airplanes_figures_in_its_own_air() {
    let standard = leg_with_wind(270.0, 20.0, None);
    assert!(close(f(&standard["tas_kt"]), 100.0, 1e-9) && close(f(&standard["fuel_burn_gph"]), 8.5, 1e-9));
    assert_eq!(f(&standard["density_altitude_ft"]), 6000.0);
    assert!(standard["oat_c"].is_null());
    assert!(close(f(&standard["groundspeed_kt"]), 120.0, 0.01));
    assert_eq!(standard["from"], "A");
    assert_eq!(standard["to"], "B");

    let warm = leg_with_wind(270.0, 20.0, Some(18.0));
    assert!(f(&warm["density_altitude_ft"]) > 7500.0 && f(&warm["tas_kt"]) > 101.0);
    assert!(close(f(&warm["groundspeed_kt"]), f(&warm["tas_kt"]) + 20.0, 0.01));
    assert!(close(f(&warm["fuel_gal"]), f(&warm["ete_min"]) / 60.0 * f(&warm["fuel_burn_gph"]), 1e-9));
}

#[test]
fn under_ifr_the_reserve_is_45_minutes_by_day_and_by_night() {
    // 14 CFR 91.167(a)(3), where VFR's is 30 by day (91.151(a)(1)) and 45
    // at night (91.151(a)(2)).
    let p = json!({"fuel_burn_gph": 8.0, "taxi_fuel_gal": 1.4});
    assert_eq!(f(&ask("navlog_fuel_plan", json!({"total_fuel_gal": 20.0, "profile": p, "night": false}))["reserve_min"]), 30.0);
    assert_eq!(f(&ask("navlog_fuel_plan", json!({"total_fuel_gal": 20.0, "profile": p, "night": true}))["reserve_min"]), 45.0);
    let day = ask("navlog_fuel_plan", json!({"total_fuel_gal": 20.0, "profile": p, "night": false, "rules": "ifr"}));
    assert_eq!((f(&day["reserve_min"]), f(&day["reserve_gal"]), day["rules"].as_str()), (45.0, 6.0, Some("ifr")));
    assert_eq!(
        f(&ask("navlog_fuel_plan", json!({"total_fuel_gal": 20.0, "profile": p, "night": null, "rules": "ifr"}))["reserve_min"]),
        45.0
    );
    // The alternate's fuel is flown before the reserve (91.167(a)(2)).
    let alt = ask("navlog_fuel_plan", json!({"total_fuel_gal": 20.0, "profile": p, "rules": "ifr", "alternate_gal": 3.0}));
    assert_eq!(f(&alt["fuel_required_gal"]), 30.4);
    assert!(ask("navlog_fuel_plan", json!({"total_fuel_gal": null, "profile": p}))["fuel_required_gal"].is_null());
}

#[test]
fn the_totals_are_none_while_a_leg_is_unflyable() {
    let legs = json!([
        {"distance_nm": 10.0, "ete_min": 6.0, "fuel_gal": 0.8, "wind": null},
        {"distance_nm": 20.0, "ete_min": null, "fuel_gal": null, "wind": {"wind_dir_true_deg": 90, "wind_speed_kt": 120}, "procedure": {"more_nm": 4.0}},
    ]);
    let t = ask("navlog_totals", json!({"legs": legs}));
    assert_eq!((f(&t["distance_nm"]), f(&t["procedure_nm"])), (34.0, 4.0));
    assert!(t["ete_min"].is_null() && t["fuel_gal"].is_null());
    assert_eq!((f(&t["unflyable_legs"]), f(&t["legs_without_wind"])), (1.0, 1.0));
}

#[test]
fn the_alternate_leg_falls_back_to_still_air() {
    let dest = json!({"ident": "KDLH", "lat": 46.8421, "lon": -92.1936});
    let alternate = json!({"ident": "KHIB", "lat": 47.3866, "lon": -92.8390});
    let p = json!({"cruise_tas_kt": 110.0, "fuel_burn_gph": 8.5});
    let still =
        ask("navlog_alternate_leg", json!({"dest": dest, "alternate": alternate, "altitude_ft": 6500.0, "profile": p, "air": null}));
    assert_eq!(still["still_air"], json!(true));
    assert_eq!(still["ident"], "KHIB");
    let minutes = f(&still["distance_nm"]) / 110.0 * 60.0;
    assert!(close(f(&still["ete_min"]), minutes, 0.1));
    let flown = ask(
        "navlog_alternate_leg",
        json!({"dest": dest, "alternate": alternate, "altitude_ft": 6500.0, "profile": p,
        "air": {"variation_deg": -1.0, "wind": {"wind_dir_true_deg": 270.0, "wind_speed_kt": 20.0}, "oat_c": null}}),
    );
    assert_eq!(flown["still_air"], json!(false));
    assert!(f(&flown["ete_min"]) != f(&still["ete_min"]));
}

// --- The four plans (test_altitude_plans.py) ---------------------------

fn profile() -> Value {
    json!({"cruise_tas_kt": 100.0, "fuel_burn_gph": 8.0, "climb_rate_fpm_sea_level": 800.0, "climb_tas_kt": 70.0, "service_ceiling_ft": 14000.0})
}

/// A standard day's climb for `profile()`, worked by hand: the rate falls
/// from 800 fpm by 700 over the 14,000 ft ceiling, 0.05 fpm a foot, so the
/// minutes are 20 ln(rate at the bottom / rate at the top).
fn climb_min(from: f64, to: f64) -> f64 {
    20.0 * ((800.0 - 0.05 * from) / (800.0 - 0.05 * to)).ln()
}

/// A straight north-east course: three fixes, two legs, each about 60 nm.
fn fixes() -> Vec<Value> {
    vec![
        json!({"name": "AAA", "category": "departure", "lat": 40.0, "lon": -90.0}),
        json!({"name": "Lake", "category": "lake", "lat": 40.7, "lon": -89.1}),
        json!({"name": "BBB", "category": "destination", "lat": 41.4, "lon": -88.2}),
    ]
}

fn segments(per_leg: &[&[f64]]) -> Value {
    Value::Array(per_leg.iter().map(|c| json!({"from_nm": 0.0, "to_nm": 60.0, "floor_ft": 2000.0, "candidates_ft": c})).collect())
}

/// The same wind on every leg by altitude (none where not given), a
/// standard day's temperature and no variation.
fn air(fixes: &[Value], per_leg: &[&[f64]], winds: &[(f64, f64)], warm_c: Option<f64>) -> Value {
    Value::Array(
        per_leg
            .iter()
            .take(fixes.len() - 1)
            .map(|c| {
                let at: Vec<Value> = c
                    .iter()
                    .map(|a| {
                        let wind =
                            winds.iter().find(|(ft, _)| ft == a).map(|(_, kt)| json!({"wind_dir_true_deg": 225.0, "wind_speed_kt": kt}));
                        json!({"altitude_ft": a, "wind": wind, "oat_c": warm_c.map(|d| isa_temp_c(*a) + d)})
                    })
                    .collect();
                json!({"variation_deg": 0.0, "at": at})
            })
            .collect(),
    )
}

fn plans(per_leg: &[&[f64]], winds: &[(f64, f64)], p: Value, elevation: Option<f64>) -> Value {
    let fx = fixes();
    ask(
        "navlog_plans",
        json!({"fixes": fx, "segments": segments(per_leg), "profile": p, "departure_elevation_ft": elevation, "air": air(&fx, per_leg, winds, None)}),
    )
}

fn steps(plans: &Value, kind: &str) -> Vec<f64> {
    plans["plans"][kind]["steps"].as_array().unwrap().iter().map(|s| f(&s["altitude_ft"])).collect()
}

#[test]
fn fastest_climbs_for_a_tailwind_and_lowest_stays_low() {
    // Calm at 3,500, a 30 kt tailwind straight up the course at 5,500 and
    // 7,500: climbing pays, and lowest ignores it.
    let all: &[f64] = &[3500.0, 5500.0, 7500.0];
    let p = plans(&[all, all], &[(3500.0, 0.0), (5500.0, 30.0), (7500.0, 30.0)], profile(), None);
    assert_eq!(steps(&p, "lowest"), [3500.0]);
    assert_eq!(steps(&p, "highest"), [7500.0]);
    assert_eq!(steps(&p, "fastest"), [5500.0]);
    assert!(f(&p["plans"]["fastest"]["ete_min"]) < f(&p["plans"]["lowest"]["ete_min"]));
    assert!(close(f(&p["plans"]["fastest"]["tailwind_kt"]), 30.0, 0.5));
    assert_eq!(p["plans"]["lowest"]["steps"][0]["from"], "AAA");
    assert_eq!(p["plans"]["lowest"]["steps"][0]["to"], "BBB");
}

#[test]
fn economical_climbs_for_a_tailwind_only_when_it_pays_for_the_climbs_fuel() {
    let own = json!({"cruise_tas_kt": 100.0, "fuel_burn_gph": 8.0, "climb_rate_fpm_sea_level": 800.0, "climb_tas_kt": 70.0,
        "service_ceiling_ft": 14000.0, "climb_fuel_burn_gph": 14.0});
    let both: &[f64] = &[3500.0, 9500.0];
    let p = plans(&[both, both], &[(3500.0, 0.0), (9500.0, 4.0)], own, Some(500.0));
    assert_eq!(steps(&p, "fastest"), [9500.0]);
    assert_eq!(steps(&p, "economical"), [3500.0]);
    assert!(f(&p["plans"]["economical"]["fuel_gal"]) < f(&p["plans"]["fastest"]["fuel_gal"]));
    assert!(f(&p["plans"]["fastest"]["ete_min"]) < f(&p["plans"]["economical"]["ete_min"]));
}

#[test]
fn a_strong_tailwind_pays_for_the_climbs_fuel_too() {
    let both: &[f64] = &[3500.0, 9500.0];
    let p = plans(&[both, both], &[(3500.0, 0.0), (9500.0, 30.0)], profile(), Some(500.0));
    assert_eq!(steps(&p, "economical"), [9500.0]);
}

fn cruise_leg(distance: f64, altitude: f64) -> Value {
    json!({"distance_nm": distance, "altitude_ft": altitude, "groundspeed_kt": 100.0, "ete_min": distance / 100.0 * 60.0,
        "fuel_gal": distance / 100.0 * 8.0, "wind": null, "tas_kt": 100.0, "fuel_burn_gph": 8.0, "oat_c": null})
}

fn course_leg(distance: f64, altitude: f64) -> Value {
    let mut leg = cruise_leg(distance, altitude);
    leg["true_course_deg"] = json!(45.0);
    leg["climb_min"] = json!(0.0);
    leg["toc"] = Value::Null;
    leg
}

fn climbs(legs: Value, start: Option<f64>, p: Value) -> Value {
    ask("navlog_with_climbs", json!({"legs": legs, "start_altitude_ft": start, "profile": p}))
}

#[test]
fn a_climb_burns_the_airplanes_own_climb_fuel_flow() {
    let own = json!({"cruise_tas_kt": 100.0, "fuel_burn_gph": 8.0, "climb_rate_fpm_sea_level": 800.0, "climb_tas_kt": 70.0,
        "service_ceiling_ft": 14000.0, "climb_fuel_burn_gph": 14.0});
    let legs = climbs(json!([cruise_leg(60.0, 3500.0)]), Some(500.0), own.clone());
    let climb = ask("performance_climb", json!({"profile": own, "from_ft": 500.0, "to_ft": 3500.0}));
    let cruise_min = (60.0 - 70.0 * f(&climb["minutes"]) / 60.0) / 100.0 * 60.0;
    assert!(close(f(&legs[0]["fuel_gal"]), f(&climb["gallons"]) + cruise_min / 60.0 * 8.0, 1e-6));
}

#[test]
fn the_climb_from_the_field_is_flown_on_the_first_leg() {
    // 3,000 ft from the field is 4.3 minutes, at 70 kt over the ground:
    // 5 nm of the first 60 nm leg climbing, the rest at cruise.
    let legs = climbs(json!([cruise_leg(60.0, 3500.0), cruise_leg(60.0, 3500.0)]), Some(500.0), profile());
    let m = climb_min(500.0, 3500.0);
    assert!(close(f(&legs[0]["climb_min"]), (m * 10.0).round() / 10.0, 1e-9));
    assert!(close(f(&legs[0]["ete_min"]), m + (60.0 - 70.0 * m / 60.0) / 100.0 * 60.0, 0.01));
    assert!(f(&legs[0]["fuel_gal"]) > 4.8);
    assert_eq!(f(&legs[1]["climb_min"]), 0.0);
    assert!(close(f(&legs[1]["ete_min"]), 36.0, 1e-9));
    // And says where it tops out: 5 nm in.
    assert!(close(f(&legs[0]["toc"]["along_nm"]), (70.0 * m / 60.0 * 10.0).round() / 10.0, 1e-9));
    assert_eq!(f(&legs[0]["toc"]["altitude_ft"]), 3500.0);
    assert!(legs[1]["toc"].is_null());
}

#[test]
fn a_step_up_mid_route_is_climbed_on_the_leg_that_steps() {
    let legs = climbs(json!([cruise_leg(60.0, 3500.0), cruise_leg(60.0, 5500.0)]), None, profile());
    assert_eq!(f(&legs[0]["climb_min"]), 0.0);
    assert!(close(f(&legs[1]["climb_min"]), climb_min(3500.0, 5500.0), 0.05));
}

#[test]
fn a_climb_longer_than_a_leg_carries_into_the_next() {
    // 9,000 ft from the field is seventeen minutes; a 10 nm first leg at
    // 70 kt takes 8.6 of them, the rest lands on the second leg.
    let legs = climbs(json!([cruise_leg(10.0, 9500.0), cruise_leg(60.0, 9500.0)]), Some(500.0), profile());
    assert!(close(f(&legs[0]["climb_min"]), 8.6, 0.05));
    assert!(close(f(&legs[1]["climb_min"]), climb_min(500.0, 9500.0) - 60.0 / 7.0, 0.05));
    assert!(legs[0]["toc"].is_null());
    assert!(close(f(&legs[1]["toc"]["along_nm"]), 70.0 * (climb_min(500.0, 9500.0) - 60.0 / 7.0) / 60.0, 0.1));
}

#[test]
fn a_climb_into_warm_air_costs_more() {
    // The same climb, to a leg 15 degC warmer than a standard day: the
    // density altitude is higher all the way up, so the climb is slower.
    let fx = fixes();
    let one: &[f64] = &[7500.0];
    let leg = |warm: Option<f64>| {
        ask(
            "navlog_legs",
            json!({"fixes": [fx[0], fx[1]], "altitude_ft": 7500.0, "profile": profile(), "air": air(&fx[..2], &[one], &[], warm)}),
        )[0]
        .clone()
    };
    let (cool, warm) = (leg(None), leg(Some(15.0)));
    assert!(f(&warm["density_altitude_ft"]) > f(&cool["density_altitude_ft"]) + 1500.0);
    let climbed = |l: &Value| f(&climbs(json!([l]), Some(500.0), profile())[0]["climb_min"]);
    assert!(climbed(&warm) > climbed(&cool));
}

#[test]
fn a_shelf_over_the_first_leg_makes_the_plans_step() {
    let p = plans(&[&[3500.0], &[3500.0, 5500.0]], &[(3500.0, 0.0), (5500.0, 25.0)], profile(), None);
    assert_eq!(steps(&p, "lowest"), [3500.0]);
    let highest = &p["plans"]["highest"]["steps"];
    assert_eq!(
        (highest[0]["from"].as_str(), highest[0]["to"].as_str(), f(&highest[0]["altitude_ft"])),
        (Some("AAA"), Some("Lake"), 3500.0)
    );
    assert_eq!(
        (highest[1]["from"].as_str(), highest[1]["to"].as_str(), f(&highest[1]["altitude_ft"])),
        (Some("Lake"), Some("BBB"), 5500.0)
    );
    assert_eq!(steps(&p, "fastest"), [3500.0, 5500.0]);
    assert_eq!(f(&p["plans"]["fastest"]["legs"][1]["altitude_ft"]), 5500.0);
    assert!(f(&p["plans"]["fastest"]["climb_penalty_min"]) > f(&p["plans"]["lowest"]["climb_penalty_min"]));
}

#[test]
fn a_plan_says_whether_it_needs_oxygen() {
    // The second leg's only legal altitudes are above 12,500 ft (14 CFR
    // 91.211), so every plan goes there and says so.
    let p = plans(&[&[3500.0, 13500.0], &[13500.0, 15500.0]], &[], profile(), None);
    assert!(["lowest", "highest", "fastest", "economical"].iter().all(|k| p["plans"][k]["needs_oxygen"] == json!(true)));
    let low: &[f64] = &[3500.0, 5500.0];
    let p = plans(&[low, low], &[], profile(), None);
    assert!(["lowest", "highest", "fastest", "economical"].iter().all(|k| p["plans"][k]["needs_oxygen"] == json!(false)));
    // The candidates the planner looks the air up at are those.
    let c = ask(
        "navlog_candidates",
        json!({"segments": segments(&[&[3500.0, 13500.0], &[13500.0, 15500.0]]), "legs": 2, "profile": profile()}),
    );
    assert_eq!(c, json!([[3500.0], [13500.0, 15500.0]]));
}

#[test]
fn a_leg_with_no_legal_altitude_means_no_plan() {
    let p = plans(&[&[3500.0], &[]], &[], profile(), None);
    assert_eq!(p, json!({"plans": {}, "by_altitude": []}));
    let c = ask("navlog_candidates", json!({"segments": segments(&[&[3500.0], &[]]), "legs": 2, "profile": profile()}));
    assert!(c.is_null());
}

#[test]
fn a_plan_whose_legs_with_a_wind_have_no_length_has_no_tailwind() {
    let fx = fixes();
    let same = vec![fx[0].clone(), fx[0].clone()];
    let one: &[f64] = &[3500.0];
    let p = ask(
        "navlog_plans",
        json!({"fixes": same, "segments": segments(&[one]), "profile": profile(), "air": air(&same, &[one], &[(3500.0, 10.0)], None)}),
    );
    assert!(p["plans"]["lowest"]["tailwind_kt"].is_null());
}

#[test]
fn the_route_flown_at_each_altitude_any_leg_may_fly_is_given_for_the_wheel() {
    let p = plans(&[&[3500.0, 5500.0], &[3500.0]], &[(3500.0, 0.0), (5500.0, 30.0)], profile(), None);
    let figures = p["by_altitude"].as_array().unwrap();
    assert_eq!(figures.iter().map(|x| f(&x["altitude_ft"])).collect::<Vec<_>>(), [3500.0, 5500.0]);
    assert_eq!(figures[0]["everywhere"], json!(true));
    assert_eq!(figures[1]["everywhere"], json!(false));
    assert_eq!((&figures[0]["ete_min"], &figures[0]["fuel_gal"]), (&p["plans"]["lowest"]["ete_min"], &p["plans"]["lowest"]["fuel_gal"]));
    assert!(f(&figures[1]["tailwind_kt"]) > f(&figures[0]["tailwind_kt"]));
    // And the legs of an altitude picked on the wheel, every leg legal.
    let fx = fixes();
    let per_leg: &[&[f64]] = &[&[3500.0, 5500.0], &[3500.0]];
    let legs = ask(
        "navlog_legs_at",
        json!({"fixes": fx, "segments": segments(per_leg), "profile": profile(), "air": air(&fx, per_leg, &[(3500.0, 0.0), (5500.0, 30.0)], None), "target_ft": 5500.0}),
    );
    assert_eq!((f(&legs[0]["altitude_ft"]), f(&legs[1]["altitude_ft"])), (5500.0, 3500.0));
}

// --- Descents (test_altitude_plans.py) ----------------------------------

fn descents(legs: Value, fixes: &[Value], end_ft: Option<f64>, before_nm: Option<f64>, fix: Option<&str>) -> Value {
    ask(
        "navlog_with_descents",
        json!({"legs": legs, "fixes": fixes, "end_altitude_ft": end_ft, "end_before_nm": before_nm, "end_fix": fix}),
    )
}

#[test]
fn the_descent_to_the_pattern_starts_three_miles_out_for_every_thousand_feet() {
    // 5,500 down to a 1,500 ft pattern is 4,000 ft: 12 nm out, at 100 kt
    // 556 fpm -- 550 to the nearest 50 (AIM 2-1-2's ~3 degree path).
    let cruise = json!([course_leg(60.0, 5500.0), course_leg(60.0, 5500.0)]);
    let legs = descents(cruise.clone(), &fixes(), Some(1500.0), Some(0.0), None);
    assert!(legs[0]["tod"].is_null());
    let tod = &legs[1]["tod"];
    assert_eq!((f(&tod["along_nm"]), f(&tod["to_ft"]), &tod["pattern"], f(&tod["fpm"])), (48.0, 1500.0, &json!(true), 550.0));
    assert!(close(f(&tod["ete_min"]), 28.8, 1e-9) && f(&tod["lat"]) > 40.7);
    for i in 0..2 {
        assert_eq!(legs[i]["ete_min"], cruise[i]["ete_min"]);
    }
}

#[test]
fn a_step_down_is_a_descent_to_the_lower_level_by_its_fix() {
    let legs = descents(json!([course_leg(60.0, 5500.0), course_leg(60.0, 3500.0)]), &fixes(), None, Some(0.0), None);
    assert_eq!((f(&legs[0]["tod"]["along_nm"]), f(&legs[0]["tod"]["to_ft"])), (54.0, 3500.0));
    assert_eq!(legs[0]["tod"]["pattern"], json!(false));
    assert!(legs[1]["tod"].is_null());
}

#[test]
fn a_descent_to_an_approach_levels_at_its_fix_short_of_the_field() {
    // 5,500 down to an initial approach fix crossed at 3,000, 15 nm out:
    // 2,500 ft is 7.5 nm, so 22.5 nm before the field, on the last leg.
    let legs = descents(json!([course_leg(60.0, 5500.0), course_leg(60.0, 5500.0)]), &fixes(), Some(3000.0), Some(15.0), Some("ANDOE"));
    let tod = &legs[1]["tod"];
    assert_eq!((f(&tod["along_nm"]), f(&tod["to_ft"]), tod["fix"].as_str(), &tod["pattern"]), (37.5, 3000.0, Some("ANDOE"), &json!(false)));
    assert_eq!(f(&tod["fpm"]), (2500.0_f64 / (7.5 / 100.0 * 60.0) / 50.0).round() * 50.0);
}

#[test]
fn a_fix_further_out_than_the_last_leg_moves_the_descent_onto_the_leg_before() {
    let legs = descents(json!([course_leg(60.0, 5500.0), course_leg(60.0, 5500.0)]), &fixes(), Some(3000.0), Some(70.0), Some("ANDOE"));
    assert!(legs[1]["tod"].is_null());
    assert_eq!(f(&legs[0]["tod"]["along_nm"]), 42.5);
    assert_eq!(legs[0]["tod"]["fix"], "ANDOE");
}

#[test]
fn a_cruise_under_the_fixs_altitude_has_no_descent_to_it() {
    let legs = descents(json!([course_leg(60.0, 2500.0)]), &fixes()[..2], Some(3000.0), Some(10.0), Some("ANDOE"));
    assert!(legs[0]["tod"].is_null());
}

#[test]
fn a_flight_too_short_for_three_to_one_starts_down_at_the_top_of_its_climb() {
    // 10 nm: the climb to 4,500 takes 5 of them, and 3,000 ft down at three
    // to one would take 9.
    let climbed = climbs(json!([course_leg(10.0, 4500.0)]), Some(500.0), profile());
    let tod = descents(climbed.clone(), &fixes()[..2], Some(1500.0), Some(0.0), None)[0]["tod"].clone();
    assert_eq!(tod["along_nm"], climbed[0]["toc"]["along_nm"]);
    assert!(f(&tod["fpm"]) > 550.0);
}

#[test]
fn an_approach_ends_the_descent_at_its_first_fix_under_the_cruise() {
    // The initial approach fix at 3,000 under a 5,500 cruise; cruising at
    // 2,500, the next fix lower (the final approach fix's 2,300); the
    // missed approach's never.
    let fixes = json!([
        {"ident": "ANDOE", "lat": 46.89, "lon": -92.19, "min_ft": 3000, "max_ft": null, "missed": false},
        {"ident": "FAFIX", "lat": 46.86, "lon": -92.19, "min_ft": null, "max_ft": 2300, "missed": false},
        {"ident": "MISSD", "lat": 46.74, "lon": -92.19, "min_ft": 1500, "max_ft": null, "missed": true},
    ]);
    let field = json!({"lat": 46.8421, "lon": -92.1936});
    let high = ask("navlog_approach_end", json!({"fixes": fixes, "cruise_ft": 5500, "field": field}));
    assert_eq!((f(&high["end_altitude_ft"]), high["end_fix"].as_str()), (3000.0, Some("ANDOE")));
    assert!(close(f(&high["end_before_nm"]), 2.87, 0.05), "{high}");
    let low = ask("navlog_approach_end", json!({"fixes": fixes, "cruise_ft": 2500, "field": field}));
    assert_eq!((f(&low["end_altitude_ft"]), low["end_fix"].as_str()), (2300.0, Some("FAFIX")));
    assert!(ask("navlog_approach_end", json!({"fixes": fixes, "cruise_ft": 2000, "field": field})).is_null());
}

// --- Holds -----------------------------------------------------------------

#[test]
fn a_hold_adds_its_minutes_and_fuel_to_the_leg() {
    let mut leg = course_leg(60.0, 5500.0);
    leg["magnetic_variation_deg"] = json!(0.0);
    let hold = json!({"fix": "KMSN", "inbound": 270, "right": true, "leg_min": 1, "leg_nm": null, "turns": 2, "minutes": null});
    let held = ask(
        "navlog_hold",
        json!({"leg": leg, "before": leg, "hold": hold, "fix": {"lat": 43.0, "lon": -89.0}, "variation_deg": 0.0, "at_end": false}),
    );
    // Two laps of a timed hold: 2 x (two 1-minute legs and two minutes
    // of standard-rate turns), FAA-H-8083-15B ch. 7.
    assert_eq!(f(&held["hold"]["minutes"]), 8.0);
    assert_eq!(f(&held["ete_min"]), 44.0);
    assert!(close(f(&held["fuel_gal"]), 4.8 + 8.0 / 60.0 * 8.0, 0.01));
    // Arriving on 045 to an inbound 270 with right turns, 135 degrees
    // round: the teardrop's sector (AIM 5-3-8 j.3).
    assert_eq!(held["hold"]["entry"], "teardrop");
    let path = held["hold"]["path"].as_array().unwrap();
    assert_eq!(path.first(), path.last());
}

// --- The recorded routes (services/planner/tests_wingtip/golden) ------------

fn key(parts: &[f64]) -> String {
    parts.iter().map(|p| format!("{p:.5}")).collect::<Vec<_>>().join(",")
}

/// A figure rounded to tenths as the recording did, within a tenth: the
/// pow and sin the two sides call are each platform's libm's.
fn tenths(got: &Value, want: &Value, what: &str) {
    match (got.as_f64(), want.as_f64()) {
        (None, None) => {}
        (Some(g), Some(w)) => assert!((g - w).abs() <= 0.1 + 1e-9, "{what}: {g} where {w} was recorded"),
        _ => panic!("{what}: {got} where {want} was recorded"),
    }
}

#[test]
fn a_recorded_route_plans_as_it_did() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../services/planner/tests_wingtip/golden");
    let mut seen = 0;
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        seen += 1;
        let recorded: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        let given = &recorded["given"];
        let lookups = &recorded["lookups"];
        let fx = given["fixes"].as_array().unwrap();
        let candidates =
            ask("navlog_candidates", json!({"segments": given["segments"], "legs": fx.len() - 1, "profile": given["profile"]}));
        // The air the planner looked up for it, at each leg's midpoint.
        let air: Vec<Value> = fx
            .windows(2)
            .zip(candidates.as_array().unwrap())
            .map(|(pair, options)| {
                let (lat, lon) = ((f(&pair[0]["lat"]) + f(&pair[1]["lat"])) / 2.0, (f(&pair[0]["lon"]) + f(&pair[1]["lon"])) / 2.0);
                let at: Vec<Value> = options
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|a| {
                        let k = key(&[lat, lon, f(a)]);
                        json!({"altitude_ft": a, "wind": lookups["winds"][&k], "oat_c": lookups["temperatures"][&k]})
                    })
                    .collect();
                json!({"variation_deg": lookups["variations"][key(&[lat, lon])], "at": at})
            })
            .collect();
        let made = ask(
            "navlog_plans",
            json!({"fixes": fx, "segments": given["segments"], "profile": given["profile"],
            "departure_elevation_ft": given["departure_elevation_ft"], "air": air}),
        );
        let expected = &recorded["expected"];
        let name = path.file_stem().unwrap().to_string_lossy().to_string();
        for (kind, want) in expected["plans"].as_object().unwrap() {
            let plan = &made["plans"][kind];
            let got_steps: Vec<Value> = plan["steps"].as_array().unwrap().iter().map(|s| s["altitude_ft"].clone()).collect();
            let want_steps: Vec<f64> = want["steps"].as_array().unwrap().iter().map(f).collect();
            assert_eq!(got_steps.iter().map(f).collect::<Vec<_>>(), want_steps, "{name} {kind} steps");
            tenths(&plan["ete_min"], &want["ete_min"], &format!("{name} {kind} ete"));
            tenths(&plan["fuel_gal"], &want["fuel_gal"], &format!("{name} {kind} fuel"));
        }
        let choice = expected["choice"].as_str().unwrap();
        let legs = descents(made["plans"][choice]["legs"].clone(), fx, given["pattern_ft"].as_f64(), None, None);
        let want_legs = expected["legs"].as_array().unwrap();
        assert_eq!(legs.as_array().unwrap().len(), want_legs.len(), "{name} legs");
        for (i, (leg, want)) in legs.as_array().unwrap().iter().zip(want_legs).enumerate() {
            let what = |k: &str| format!("{name} leg {i} {k}");
            assert_eq!(f(&leg["altitude_ft"]), f(&want["altitude_ft"]), "{}", what("altitude"));
            for k in ["distance_nm", "magnetic_heading_deg", "groundspeed_kt", "ete_min", "fuel_gal", "climb_min"] {
                tenths(&leg[k], &want[k], &what(k));
            }
            tenths(&leg["toc"]["along_nm"], &want["toc_nm"], &what("toc"));
            tenths(&leg["tod"]["along_nm"], &want["tod_nm"], &what("tod"));
            match (leg["tod"]["fpm"].as_f64(), want["tod_fpm"].as_f64()) {
                (None, None) => {}
                (Some(g), Some(w)) => assert!((g - w).abs() <= 50.0, "{}: {g} fpm where {w}", what("tod fpm")),
                _ => panic!("{}", what("tod fpm")),
            }
        }
    }
    assert!(seen >= 2, "the recorded routes were not found");
}

// --- No airplane (the owner, 2026-11-09: "don't assume") ----------------

#[test]
fn with_no_airplane_a_leg_is_its_course_miles_and_air_and_nothing_an_airplane_makes() {
    let fx = fixes();
    let one: &[f64] = &[5500.0];
    let legs = ask(
        "navlog_legs",
        json!({"fixes": [fx[0], fx[1]], "altitude_ft": 5500.0, "profile": null,
        "air": air(&fx[..2], &[one], &[(5500.0, 20.0)], None)}),
    );
    let leg = &legs[0];
    // The same course and miles an airplane's leg has.
    let flown = &ask(
        "navlog_legs",
        json!({"fixes": [fx[0], fx[1]], "altitude_ft": 5500.0, "profile": profile(),
        "air": air(&fx[..2], &[one], &[(5500.0, 20.0)], None)}),
    )[0];
    for kept in ["true_course_deg", "distance_nm", "altitude_ft", "magnetic_course_deg", "magnetic_variation_deg", "wind", "oat_c"] {
        assert_eq!(leg[kept], flown[kept], "{kept}");
    }
    for none in [
        "wca_deg", "true_heading_deg", "magnetic_heading_deg", "groundspeed_kt", "ete_min", "fuel_gal", "tas_kt", "fuel_burn_gph",
        "power_pct", "density_altitude_ft",
    ] {
        assert!(leg[none].is_null(), "{none}: {leg}");
    }
    // Not unflyable: its time is not known, as the totals' are not.
    let t = ask("navlog_totals", json!({"legs": legs}));
    assert_eq!((t["unflyable_legs"].as_f64(), t["ete_min"].is_null(), t["fuel_gal"].is_null()), (Some(0.0), true, true));
    assert!(close(f(&t["distance_nm"]), (f(&leg["distance_nm"]) * 10.0).round() / 10.0, 1e-9));
    // No climbs to place.
    assert_eq!(ask("navlog_with_climbs", json!({"legs": legs, "start_altitude_ft": 700.0, "profile": null})), legs);
}

#[test]
fn with_no_airplane_the_plans_are_the_lowest_and_highest_alone() {
    let per_leg: &[&[f64]] = &[&[4500.0, 6500.0, 8500.0], &[4500.0, 6500.0, 8500.0]];
    let made = plans(per_leg, &[(8500.0, 40.0)], Value::Null, Some(700.0));
    let mut kinds: Vec<&String> = made["plans"].as_object().unwrap().keys().collect();
    wingtip_engine::sort::StableSort::stable_sort(&mut kinds[..]);
    assert_eq!(kinds, ["highest", "lowest"]);
    assert_eq!(steps(&made, "lowest"), [4500.0]);
    assert_eq!(steps(&made, "highest"), [8500.0]);
    for kind in ["lowest", "highest"] {
        let p = &made["plans"][kind];
        assert!(p["ete_min"].is_null() && p["fuel_gal"].is_null() && p["climb_penalty_min"].is_null() && p["tailwind_kt"].is_null(), "{p}");
        assert_eq!(p["unflyable_legs"].as_f64(), Some(0.0));
    }
    // The wheel keeps every altitude, with no time or fuel at any.
    let wheel = made["by_altitude"].as_array().unwrap();
    assert_eq!(wheel.len(), 3);
    assert!(wheel.iter().all(|w| w["ete_min"].is_null() && w["fuel_gal"].is_null() && w["everywhere"] == json!(true)));
    // Two hops' plans joined as the two kinds there are.
    let options: Vec<Value> = ["lowest", "highest"]
        .iter()
        .map(|k| {
            let mut o = made["plans"][*k].clone();
            o["kind"] = json!(k);
            o
        })
        .collect();
    let joined = ask("navlog_join_plans", json!({"by_hop": [options, options], "lengths": [60.0, 60.0]}));
    assert_eq!(joined.as_array().unwrap().len(), 2);
    assert!(joined[0]["climb_penalty_min"].is_null() && joined[0]["ete_min"].is_null());
}

#[test]
fn with_no_airplane_the_fuel_plan_is_the_reserves_minutes_alone() {
    // 14 CFR 91.151(a): 30 minutes by day, 45 at night; 91.167(a)(3): 45
    // under IFR. The gallons are an airplane's.
    for (night, rules, minutes) in [(false, "vfr", 30.0), (true, "vfr", 45.0), (false, "ifr", 45.0)] {
        let plan = ask("navlog_fuel_plan", json!({"total_fuel_gal": null, "profile": null, "night": night, "rules": rules}));
        assert_eq!(plan["reserve_min"].as_f64(), Some(minutes));
        for none in ["reserve_gal", "taxi_gal", "fuel_required_gal", "usable_fuel_gal", "fuel_margin_gal"] {
            assert!(plan[none].is_null(), "{none}: {plan}");
        }
    }
    let leg = ask(
        "navlog_alternate_leg",
        json!({"dest": {"ident": "KDLH", "lat": 46.84, "lon": -92.19},
        "alternate": {"ident": "KHIB", "lat": 47.39, "lon": -92.84}, "altitude_ft": 6000.0, "profile": null}),
    );
    assert!(f(&leg["distance_nm"]) > 40.0 && leg["ete_min"].is_null() && leg["fuel_gal"].is_null(), "{leg}");
}
