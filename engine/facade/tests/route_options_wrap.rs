//! Route options across the antimeridian (the aviation audit's AV-11):
//! Adak (PADK, 51.88 N 176.65 W) to Shemya (PASY, 52.71 N 174.11 E) is
//! about 370 nm west across 180 degrees, not round the world.

#![cfg(feature = "route-options")]

use serde_json::{json, Value};
use wingtip_engine::call::call;

fn ask(name: &str, input: &Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

#[test]
fn adak_to_shemya_is_framed_and_flown_across_the_antimeridian() {
    let mut input = json!({
        "dep": {"ident": "PADK", "lat": 51.878, "lon": -176.646}, "dest": {"ident": "PASY", "lat": 52.712, "lon": 174.114},
        "profile": {"cruise_tas_kt": 120.0, "fuel_burn_gph": 10.0, "usable_fuel_gal": 50.0, "taxi_fuel_gal": 1.0, "service_ceiling_ft": 13000.0},
        "depart_s": 1793000000, "now_s": 1793000000, "night": false, "tafs": [], "metars": [], "sigmets": [], "gairmets": [],
        "sua": [], "tfrs": [], "winds": [], "fields": [], "fixes": []
    });
    let frame = ask("route_options_frame", &input);
    // The box is a few degrees wide, west of the departure past -180.
    let (w, e) = (frame["bbox"][1].as_f64().unwrap(), frame["bbox"][3].as_f64().unwrap());
    assert!(e - w < 25.0, "{frame}");
    assert!(w < -180.0 && e > -176.646, "{frame}");
    let per = frame["per_cell"].as_u64().unwrap();
    let samples = frame["rows"].as_u64().unwrap() * per * frame["cols"].as_u64().unwrap() * per;
    input["terrain_ft"] = Value::Array(vec![Value::from(0); samples as usize]);
    let answer = ask("route_options", &input);
    let way = &answer["options"][0];
    // About 370 nm, not the 13,000 the long way round would be.
    let nm = way["distance_nm"].as_f64().unwrap();
    assert!((340.0..420.0).contains(&nm), "{nm}");
    // Every longitude handed back is between -180 and 180.
    for p in way["path"].as_array().unwrap() {
        let lon = p[1].as_f64().unwrap();
        assert!((-180.0..=180.0).contains(&lon), "{lon}");
    }
    let last = way["path"].as_array().unwrap().last().unwrap()[1].as_f64().unwrap();
    assert!((last - 174.114).abs() < 1e-3, "{last}");
}
