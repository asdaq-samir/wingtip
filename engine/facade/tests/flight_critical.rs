//! What must never break in the air: the engine held to worked examples
//! straight from the FAA's own texts (apps/web/src/lib/fixtures/
//! flightCritical.json, each case with its source: the nav log's wind
//! triangle, groundspeed, heading and fuel from FAA-H-8083-25C ch. 16;
//! cruising altitudes, 14 CFR 91.159 and 91.179; fuel reserves, 91.151 and
//! 91.167; VFR weather minimums, 91.155; hold entries, AIM 5-3-8; glide
//! reach at a ratio, FAA-H-8083-3C ch. 3; the IFR alternate, 91.169;
//! oxygen, 91.211; endurance; lost comms, 91.185; pressure and density
//! altitude, FAA-H-8083-25C ch. 11), and to the shared fixtures that
//! already carry the same rules (altitude.json's cruising altitudes,
//! holds.json's leg timing). CI's "Flight-critical" job runs this file on
//! every change, and the phones run the same cases through their bridges.
//!
//! The expected figures are the sources', never the code's: a figure the
//! source reads off a plotter or an E6B carries the source's rounding as
//! its tolerance (`within`), and every other is exact.

mod common;

use common::same;
use serde_json::Value;
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture(name: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures").join(name);
    serde_json::from_str(&std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))).unwrap()
}

fn ask(name: &str, input: &Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name} answered {text}: {e}"))
}

/// Where `got` is not `want`: a number within its tolerance (`within`, by
/// member name, "" for a bare answer; exact where not given), an object by
/// the members `want` names (the rest of the answer is not the source's to
/// settle), anything else as JSON compares it.
fn difference(got: &Value, want: &Value, within: &Value, key: &str) -> Option<String> {
    match (got, want) {
        (Value::Number(g), Value::Number(w)) => {
            let (g, w) = (g.as_f64().unwrap(), w.as_f64().unwrap());
            let tol = within.get(key).and_then(Value::as_f64).unwrap_or(0.0);
            ((g - w).abs() > tol + 1e-9).then(|| format!("{key}: {g} is not {w} (within {tol})"))
        }
        (Value::Object(g), Value::Object(w)) => w.iter().find_map(|(k, v)| match g.get(k) {
            None => Some(format!("{k}: missing")),
            Some(x) => difference(x, v, within, k).map(|d| if key.is_empty() { d } else { format!("{key}.{d}") }),
        }),
        _ => (!same(got, want)).then(|| format!("{key}: {got} is not {want}")),
    }
}

#[test]
fn every_worked_example_holds() {
    let cases = fixture("flightCritical.json")["cases"].as_array().unwrap().clone();
    assert!(cases.len() >= 30, "the golden set lost cases: {}", cases.len());
    let mut failed = Vec::new();
    for c in &cases {
        let (name, rule) = (c["name"].as_str().unwrap(), c["rule"].as_str().unwrap());
        assert!(c["source"].as_str().is_some_and(|s| !s.is_empty()), "{name}: no source");
        let got = ask(rule, &c["input"]);
        if let Some(d) = difference(&got, &c["want"], c.get("within").unwrap_or(&Value::Null), "") {
            failed.push(format!("{name} ({rule}): {d}\n  got: {got}"));
        }
    }
    assert!(failed.is_empty(), "{}", failed.join("\n"));
}

#[test]
fn every_rule_the_golden_set_names_is_covered() {
    // The set is the one place these rules' worked examples live; a rule
    // dropped from it would leave the job green and the rule untested.
    let cases = fixture("flightCritical.json")["cases"].as_array().unwrap().clone();
    for rule in [
        "wind_triangle", "navlog_leg", "legal_cruising_altitudes", "reserve_min", "vfr_minimums", "hold_entry", "glide_range",
        "ifr_alternate_destination", "taf_window", "own_altitude_caution", "below_vfr_minimums", "navlog_fuel_plan",
        "pressure_altitude_ft", "gonogo_density_altitude", "endurance", "lost_comms",
    ] {
        assert!(cases.iter().any(|c| c["rule"] == rule), "no worked example for {rule}");
    }
}

#[test]
fn the_shared_cruising_altitudes_hold() {
    // altitude.json's cases, the planner's own from before the move: 91.159
    // under VFR, 91.179 under IFR (to FL410 via JO 7110.65 TBL 4-5-1).
    for c in fixture("altitude.json")["legal"].as_array().unwrap() {
        let got = ask("legal_cruising_altitudes", &c["input"]);
        let first = c["first"].as_array().unwrap();
        let got: Vec<Value> = got.as_array().unwrap().iter().take(first.len()).cloned().collect();
        assert!(same(&Value::Array(got.clone()), &Value::Array(first.clone())), "{}: {got:?}", c["input"]);
    }
}

#[test]
fn the_shared_hold_leg_timing_holds() {
    // holds.json: AIM 5-3-8 j.5, "At or below 14,000 feet MSL: 1 minute.
    // Above 14,000 feet MSL: 1 1/2 minutes."
    for c in fixture("holds.json")["legMinutes"].as_array().unwrap() {
        let got = ask("holding_leg_minutes", &serde_json::json!({"altitude_ft": c["altitudeFt"]}));
        assert!(same(&got, &c["minutes"]), "{c}: {got}");
    }
}
