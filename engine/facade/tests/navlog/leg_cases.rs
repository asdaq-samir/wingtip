use super::*;

// --- A leg in its own air (test_navlog.py) -----------------------------

pub(super) fn leg_with_wind(wind_dir: f64, wind_kt: f64, oat_c: Option<f64>) -> Value {
    let a = json!({"name": "A", "category": "departure", "lat": 45.0, "lon": -90.0});
    // Due east, 090.
    let b = json!({"name": "B", "category": "destination", "lat": 45.0, "lon": -89.0});
    let air = json!([{"variation_deg": 0.0, "at": [{"altitude_ft": 6000.0,
        "wind": {"wind_dir_true_deg": wind_dir, "wind_speed_kt": wind_kt}, "oat_c": oat_c}]}]);
    ask(
        "navlog_legs",
        json!({"fixes": [a, b], "altitude_ft": 6000.0, "profile": {"cruise_tas_kt": 100.0, "fuel_burn_gph": 8.5, "cruise_power_pct": 65.0}, "air": air}),
    )[0]
    .clone()
}

/// One leg between two points with the variation given, still air.
pub(super) fn leg_with_variation(a: (f64, f64), b: (f64, f64), variation_deg: f64) -> Value {
    let fix = |name: &str, (lat, lon): (f64, f64)| json!({"name": name, "category": "waypoint", "lat": lat, "lon": lon});
    let air = json!([{"variation_deg": variation_deg, "at": [{"altitude_ft": 6000.0, "wind": null, "oat_c": null}]}]);
    ask(
        "navlog_legs",
        json!({"fixes": [fix("A", a), fix("B", b)], "altitude_ft": 6000.0,
        "profile": {"cruise_tas_kt": 100.0, "fuel_burn_gph": 8.5, "cruise_power_pct": 65.0}, "air": air}),
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
