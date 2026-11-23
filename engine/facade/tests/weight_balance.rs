//! The weight and balance asked by name (`gonogo_balance`,
//! `gonogo_default_load`; the POH's section 6, 14 CFR 91.9(a)) against a
//! made-up POH-style loading, not any real airplane's (the owner: no
//! assumed airplane), held to apps/web/src/lib/fixtures/weightBalance.json:
//! within every limit, forward of a sloping forward limit and aft of the
//! aft one at takeoff and at landing, over each weight and the baggage's,
//! and the fuel weighed by its grade's standard weight (avgas 6, Jet A 6.8
//! lb a gallon, FAA-H-8083-25 chapter 10) where the handbook gives none.

mod common;

use common::{fixture, holds_cases};

#[test]
fn the_balance_as_the_fixture_says() {
    holds_cases("gonogo_balance", fixture("weightBalance.json")["gonogo_balance"].as_array().unwrap());
}

#[test]
fn the_default_load_as_the_fixture_says() {
    holds_cases("gonogo_default_load", fixture("weightBalance.json")["gonogo_default_load"].as_array().unwrap());
}

#[test]
fn a_fuel_grade_not_known_is_refused() {
    let mut input = fixture("weightBalance.json")["gonogo_balance"][0]["input"].clone();
    input["loading"]["fuel_grade"] = "kerosene".into();
    assert!(wingtip_engine::call::call("gonogo_balance", &input.to_string()).is_err());
}
