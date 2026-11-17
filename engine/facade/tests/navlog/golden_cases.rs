use super::descents_cases::descents;
use super::plans_cases::{air, fixes, plans, profile, steps};
use super::*;

// --- The recorded routes (services/planner/tests_wingtip/golden) ------------

pub(super) fn key(parts: &[f64]) -> String {
    parts.iter().map(|p| format!("{p:.5}")).collect::<Vec<_>>().join(",")
}

/// A figure rounded to tenths as the recording did, within a tenth: the
/// pow and sin the two sides call are each platform's libm's.
pub(super) fn tenths(got: &Value, want: &Value, what: &str) {
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
