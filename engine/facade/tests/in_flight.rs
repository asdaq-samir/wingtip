//! A flight under way past a fuel stop (`in_flight`'s hop, leg and
//! hop_burnt_gal) against the shared fixture
//! apps/web/src/lib/fixtures/inFlight.json, which the phones' strips read
//! their fuel by: the hop flown and the burn since it began, so the
//! strip's fuel past a stop is that hop's, not the first tank's.

use serde_json::Value;
use std::path::PathBuf;
use wingtip_engine::call::call;

#[test]
fn the_hop_and_its_burn_past_a_fuel_stop_are_the_fixtures() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/inFlight.json");
    let fixture: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let mut input = fixture["route"].clone();
        for (key, value) in case["input"].as_object().unwrap() {
            input[key] = value.clone();
        }
        let got: Value = serde_json::from_str(&call("in_flight", &input.to_string()).unwrap()).unwrap();
        let name = case["name"].as_str().unwrap();
        for (key, want) in case["answer"].as_object().unwrap() {
            // Gallons to within 0.01; the hop and the leg exactly.
            if key.ends_with("_gal") {
                let (g, w) = (got[key].as_f64().unwrap_or_else(|| panic!("{name}: {key} is {}", got[key])), want.as_f64().unwrap());
                assert!((g - w).abs() < 0.01, "{name}: {key} {g}, the fixture {w}");
            } else {
                assert_eq!(&got[key], want, "{name}: {key}");
            }
        }
    }
}
