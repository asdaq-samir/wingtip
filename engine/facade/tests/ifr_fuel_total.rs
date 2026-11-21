//! 14 CFR 91.167(a) as one total, asked by name (`navlog_fuel_plan`): "(1)
//! Complete the flight to the first airport of intended landing; (2) ...
//! fly from that airport to the alternate airport; and (3) Fly after that
//! for 45 minutes at normal cruising speed" (eCFR, current on
//! 2026-11-21), with the airplane's own start and taxi allowance. Its own
//! file, beside the fuel files claude/fuel-engine owns (fuel_stop.rs,
//! strip.rs, tanks_leaving), which it does not touch. A hand-worked made-up
//! airplane: 10 gal an hour at cruise, 1 gal to start and taxi, 40 usable.

mod common;

use common::assert_same;
use serde_json::{json, Value};
use wingtip_engine::call::call;

fn plan(input: Value) -> Value {
    serde_json::from_str(&call("navlog_fuel_plan", &input.to_string()).unwrap_or_else(|e| panic!("{e}"))).unwrap()
}

fn airplane(usable: f64) -> Value {
    json!({ "fuel_burn_gph": 10.0, "taxi_fuel_gal": 1.0, "usable_fuel_gal": usable })
}

#[test]
fn ifr_is_the_trip_the_alternate_and_45_minutes_more() {
    // 20 gal to the destination, 4 on to the alternate, 45 min at 10 gal
    // an hour 7.5: 1 + 20 + 4 + 7.5 = 32.5 gal, 7.5 to spare of 40.
    let ifr = plan(json!({ "total_fuel_gal": 20.0, "profile": airplane(40.0), "night": false, "rules": "ifr", "alternate_gal": 4.0 }));
    assert_same(&ifr["reserve_min"], &json!(45), "91.167(a)(3)");
    assert_same(&ifr["reserve_gal"], &json!(7.5), "45 min at 10 gal an hour");
    assert_same(&ifr["fuel_required_gal"], &json!(32.5), "the total");
    assert_same(&ifr["fuel_margin_gal"], &json!(7.5), "the margin");
    // The 45 minutes are the same at night under IFR.
    let night = plan(json!({ "total_fuel_gal": 20.0, "profile": airplane(40.0), "night": true, "rules": "ifr", "alternate_gal": 4.0 }));
    assert_same(&night["fuel_required_gal"], &json!(32.5), "at night");
    // VFR by day, no alternate: 30 minutes (91.151(a)(1)), 1 + 20 + 5.
    let vfr = plan(json!({ "total_fuel_gal": 20.0, "profile": airplane(40.0), "night": false, "rules": "vfr" }));
    assert_same(&vfr["fuel_required_gal"], &json!(26), "VFR by day");
}

#[test]
fn exactly_enough_is_no_margin_and_a_tenth_less_is_short() {
    let at = |usable: f64| {
        plan(json!({ "total_fuel_gal": 20.0, "profile": airplane(usable), "night": false, "rules": "ifr", "alternate_gal": 4.0 }))
            ["fuel_margin_gal"]
            .clone()
    };
    assert_same(&at(32.5), &json!(0), "exactly the total");
    assert_same(&at(32.4), &json!(-0.1), "a tenth short");
}
