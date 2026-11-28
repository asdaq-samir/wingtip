//! Regulation boundaries the coverage audit (2026-11-21) found unpinned,
//! each asked by name from both sides, the expected answers the rule's own
//! words (eCFR, current on 2026-11-21):
//!
//! - 91.159(a): VFR cruising altitudes "below 18,000 feet MSL", so 17,500
//!   ft is the highest eastbound (odd thousands plus 500) and 16,500 ft the
//!   highest westbound;
//! - 91.215(b)(2): the Mode C veil, "within 30 nautical miles" of an
//!   appendix D, section 1 airport;
//! - 91.215(b)(5)(i) and 91.155(a): in Class E with no veil, nothing asked
//!   below 10,000 ft MSL and the transponder at it, 3 sm below and 5 sm at;
//! - 61.57(a): passengers "within the preceding 90 days": the 90th day
//!   after the third landing still current, the 91st lapsed.
//!
//! 91.169(c)'s alternate visibility at 1.9 and 2.0 sm is in cautions.json's
//! alternate_check cases (cautions.rs).

mod common;

use common::assert_same;
use serde_json::{json, Value};
use wingtip_engine::call::call;

fn ask(name: &str, input: Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name} answered {text}: {e}"))
}

#[test]
fn vfr_cruising_altitudes_stop_below_18000_ft_msl() {
    let legal = |course: f64| {
        ask("legal_cruising_altitudes", json!({ "floor_ft": 3000, "ceiling_ft": 20000, "magnetic_course_deg": course, "rules": "vfr" }))
    };
    // Eastbound (0 to 179 degrees magnetic): odd thousands plus 500.
    assert_same(&legal(90.0), &json!([3500, 5500, 7500, 9500, 11500, 13500, 15500, 17500]), "eastbound");
    // Westbound (180 to 359): even thousands plus 500; 18,500 is Class A.
    assert_same(&legal(270.0), &json!([4500, 6500, 8500, 10500, 12500, 14500, 16500]), "westbound");
    // The wheel's altitudes end at 17,500 as well, and none from 17,600.
    let wheel = ask("vfr_altitudes", json!({ "from_ft": 17000 }));
    assert_same(&wheel, &json!([17000, 17500]), "the wheel's top");
    assert_same(&ask("vfr_altitudes", json!({ "from_ft": 17600 })), &json!([]), "none at 18,000");
    // 17,999 ft may be planned under VFR; 18,000 ft is Class A (71.33).
    assert_eq!(ask("altitude_allowed", json!({ "ft": 17999, "ifr": false })), json!(true));
    assert_eq!(ask("altitude_allowed", json!({ "ft": 18000, "ifr": false })), json!(false));
}

#[test]
fn the_mode_c_veil_is_30_nm_from_its_airport() {
    // Chicago O'Hare's reference point; due north 29.9 and 30.2 minutes
    // of latitude, about 29.9 and 30.2 nm on the WGS 84 meridian there.
    let ord = json!([{ "ident": "ORD", "name": "Chicago O'Hare", "lat": 41.9786, "lon": -87.9048 }]);
    let at = |minutes: f64| ask("mode_c_veil", json!({ "lat": 41.9786 + minutes / 60.0, "lon": -87.9048, "airports": ord }));
    assert_same(&at(29.9), &json!({ "ident": "ORD", "name": "Chicago O'Hare", "distance_nm": 29.9 }), "inside");
    assert_eq!(at(30.2), Value::Null, "outside");
}

#[test]
fn class_e_below_and_at_10000_ft_msl_with_no_veil() {
    let column = |in_veil: bool| {
        ask(
            "airspace_column",
            json!({ "ground_ft": 500, "volumes": [{ "class": "E", "floor_ft": 700, "floor_ref": "AGL", "ceiling_ft": 18000 }], "in_veil": in_veil }),
        )
    };
    let bands = column(false);
    let bands = bands.as_array().unwrap();
    let below = bands.iter().find(|b| b["ceiling_ft"] == json!(10000.0)).expect("a band up to 10,000 ft MSL");
    let at = bands.iter().find(|b| b["floor_ft"] == json!(10000.0)).expect("a band from 10,000 ft MSL");
    assert_eq!(below["class"], "E");
    assert_eq!(at["class"], "E");
    // 91.215(b)(5)(i): at and above 10,000 ft MSL, more than 2,500 ft above
    // the surface; below it, with no veil and no Class B or C, nothing.
    assert_eq!(below["equipment"], Value::Null, "{below}");
    assert_eq!(at["equipment"], json!("A transponder with altitude reporting and ADS-B Out (91.215, 91.225)."));
    // 91.155(a): Class E's 3 sm below 10,000 ft MSL, 5 sm at and above.
    assert_same(&below["minimums"]["day"]["visibility_sm"], &json!(3), "below");
    assert_same(&at["minimums"]["day"]["visibility_sm"], &json!(5), "at");
    // In the veil, the band below asks for the transponder too (91.215(b)(2)).
    let veiled = column(true);
    let below = veiled.as_array().unwrap().iter().find(|b| b["ceiling_ft"] == json!(10000.0)).unwrap();
    assert!(below["equipment"].as_str().is_some_and(|e| e.contains("30 nm Mode C veil")), "{below}");
}

#[test]
fn passengers_on_the_90th_day_after_the_third_landing_and_not_the_91st() {
    // Three landings on 10 August 2026: the 90th day after is 8 November.
    let entries = json!([{ "flownOn": "2026-08-10", "totalHours": 1.0, "nightHours": 0, "crossCountryHours": 0, "dayLandings": 3, "nightLandings": 0, "category": "Airplane", "class": "Single-engine land", "tailwheel": false }]);
    let day_passengers = |today: &str| {
        let plan = ask("proficiency_plan", json!({ "today": today, "entries": entries }));
        plan["due"].as_array().unwrap().iter().find(|d| d["key"] == "day_passengers").cloned().expect("passengers by day")
    };
    let on_90th = day_passengers("2026-11-08");
    assert_eq!(on_90th["until"], "2026-11-08");
    assert_ne!(on_90th["status"], "lapsed", "{on_90th}");
    let on_91st = day_passengers("2026-11-09");
    assert_eq!(on_91st["status"], "lapsed", "{on_91st}");
}
