//! The engine's figures held to independent worked examples: the FAA's own
//! handbooks, knowledge-test supplement and AIM, each case's expected
//! figure, tolerance and page written down from the source and never from
//! the code (apps/web/src/lib/fixtures/reference). Each case is asked of
//! the contract by name, JSON in and out, as the web and the phones ask
//! it, so they can be held to the same fixtures later. A case's `expect`
//! is a list of checks on the answer at a dotted `path` ("" the whole
//! answer): `value` within `tolerance` (the source's own rounding),
//! `at_least`, `equals`, a list's `length`, or a string of the list that
//! `contains` a phrase.

mod common;

use common::cases::{check, holds};
use serde_json::Value;

#[test]
fn the_standard_atmosphere_is_the_handbooks() {
    // Pressure altitude off FAA-H-8083-25C Figure 11-22's table and the
    // supplement's Figure 8, Figure 11-2's temperatures and pressures, and
    // Sample Problem 1's density altitude.
    holds("reference/atmosphere.json");
}

#[test]
fn the_wind_triangle_and_a_runways_wind_are_the_handbooks() {
    holds("reference/wind.json");
}

#[test]
fn time_distance_fuel_and_endurance_are_the_handbooks() {
    holds("reference/timeFuel.json");
}

#[test]
fn weight_and_balance_is_the_handbooks() {
    holds("reference/weightBalance.json");
}

#[test]
fn a_holds_entry_and_leg_are_the_aims() {
    holds("reference/holding.json");
}

#[test]
fn a_check_fails_where_the_figure_is_not_met() {
    // The checker itself, so a set cannot pass by checking nothing.
    let answer: Value = serde_json::json!({"gs": 88.3, "problems": ["The landing weight, 3,027 lb, is 77 lb over its most"]});
    let near = |value: f64, tolerance: f64| serde_json::json!({"path": "gs", "value": value, "tolerance": tolerance});
    assert_eq!(check(&answer, &near(88.0, 1.0)), None);
    assert!(check(&answer, &near(90.0, 1.0)).is_some());
    assert!(check(&answer, &serde_json::json!({"path": "gs", "at_least": 89})).is_some());
    assert_eq!(check(&answer, &serde_json::json!({"path": "problems", "length": 1})), None);
    assert_eq!(check(&answer, &serde_json::json!({"path": "problems", "contains": "77 lb over"})), None);
    assert!(check(&answer, &serde_json::json!({"path": "problems", "equals": []})).is_some());
    assert!(check(&answer, &serde_json::json!({"path": "missing", "value": 0, "tolerance": 0})).is_some());
    assert!(check(&answer, &serde_json::json!({"path": "gs"})).is_some());
}
