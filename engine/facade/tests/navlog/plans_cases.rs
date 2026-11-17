use super::*;

// --- The four plans (test_altitude_plans.py) ---------------------------

pub(super) fn profile() -> Value {
    json!({"cruise_tas_kt": 100.0, "fuel_burn_gph": 8.0, "climb_rate_fpm_sea_level": 800.0, "climb_tas_kt": 70.0, "service_ceiling_ft": 14000.0,
        "cruise_power_pct": 65.0, "climb_fuel_burn_gph": 10.4})
}

/// A standard day's climb for `profile()`, worked by hand: the rate falls
/// from 800 fpm by 700 over the 14,000 ft ceiling, 0.05 fpm a foot, so the
/// minutes are 20 ln(rate at the bottom / rate at the top).
pub(super) fn climb_min(from: f64, to: f64) -> f64 {
    20.0 * ((800.0 - 0.05 * from) / (800.0 - 0.05 * to)).ln()
}

/// A straight north-east course: three fixes, two legs, each about 60 nm.
pub(super) fn fixes() -> Vec<Value> {
    vec![
        json!({"name": "AAA", "category": "departure", "lat": 40.0, "lon": -90.0}),
        json!({"name": "Lake", "category": "lake", "lat": 40.7, "lon": -89.1}),
        json!({"name": "BBB", "category": "destination", "lat": 41.4, "lon": -88.2}),
    ]
}

pub(super) fn segments(per_leg: &[&[f64]]) -> Value {
    Value::Array(per_leg.iter().map(|c| json!({"from_nm": 0.0, "to_nm": 60.0, "floor_ft": 2000.0, "candidates_ft": c})).collect())
}

/// The same wind on every leg by altitude (none where not given), a
/// standard day's temperature and no variation.
pub(super) fn air(fixes: &[Value], per_leg: &[&[f64]], winds: &[(f64, f64)], warm_c: Option<f64>) -> Value {
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

pub(super) fn plans(per_leg: &[&[f64]], winds: &[(f64, f64)], p: Value, elevation: Option<f64>) -> Value {
    let fx = fixes();
    ask(
        "navlog_plans",
        json!({"fixes": fx, "segments": segments(per_leg), "profile": p, "departure_elevation_ft": elevation, "air": air(&fx, per_leg, winds, None)}),
    )
}

pub(super) fn steps(plans: &Value, kind: &str) -> Vec<f64> {
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
        "service_ceiling_ft": 14000.0, "climb_fuel_burn_gph": 14.0, "cruise_power_pct": 65.0});
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

pub(super) fn cruise_leg(distance: f64, altitude: f64) -> Value {
    json!({"distance_nm": distance, "altitude_ft": altitude, "groundspeed_kt": 100.0, "ete_min": distance / 100.0 * 60.0,
        "fuel_gal": distance / 100.0 * 8.0, "wind": null, "tas_kt": 100.0, "fuel_burn_gph": 8.0, "oat_c": null})
}

pub(super) fn course_leg(distance: f64, altitude: f64) -> Value {
    let mut leg = cruise_leg(distance, altitude);
    leg["true_course_deg"] = json!(45.0);
    leg["climb_min"] = json!(0.0);
    leg["toc"] = Value::Null;
    leg
}

pub(super) fn climbs(legs: Value, start: Option<f64>, p: Value) -> Value {
    ask("navlog_with_climbs", json!({"legs": legs, "start_altitude_ft": start, "profile": p}))
}

#[test]
fn a_climb_burns_the_airplanes_own_climb_fuel_flow() {
    let own = json!({"cruise_tas_kt": 100.0, "fuel_burn_gph": 8.0, "climb_rate_fpm_sea_level": 800.0, "climb_tas_kt": 70.0,
        "service_ceiling_ft": 14000.0, "climb_fuel_burn_gph": 14.0, "cruise_power_pct": 65.0});
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
