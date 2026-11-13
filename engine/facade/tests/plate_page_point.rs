//! plate_page_point held to the shared fixture the web reads too
//! (apps/web/src/lib/fixtures/platePagePoint.json): a position on KRFD ILS
//! RWY 07's page by its own georeference, the FAA's points where its
//! viewport puts them.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/platePagePoint.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

#[test]
fn each_case_falls_on_the_page_as_the_fixture_says() {
    let f = fixture();
    for case in f["cases"].as_array().unwrap() {
        let mut input = case["input"].clone();
        input["georeference"] = f["georeference"].clone();
        let answer: Value = serde_json::from_str(&call("plate_page_point", &input.to_string()).unwrap()).unwrap();
        let want = &case["expected"];
        if want.is_null() {
            assert!(answer.is_null(), "{}: {answer}", case["why"]);
            continue;
        }
        // A ten-thousandth of the page is 0.04 to 0.06 points, a quarter of
        // a pixel of the full screen page (5 to a point).
        for key in ["x", "y"] {
            let (got, w) = (answer[key].as_f64().unwrap(), want[key].as_f64().unwrap());
            assert!((got - w).abs() < 1e-4, "{key} of {}: {answer}", case["why"]);
        }
        match want["rotation_deg"].as_f64() {
            None => assert_eq!(answer["rotation_deg"], json!(null), "{}", case["why"]),
            Some(w) => assert!((answer["rotation_deg"].as_f64().unwrap() - w).abs() < 0.01, "{}: {answer}", case["why"]),
        }
    }
}

#[test]
fn a_georeference_without_its_affine_is_refused_in_words() {
    let mut g = fixture()["georeference"].clone();
    g["to_page"] = json!([1, 2, 3]);
    let err = call("plate_page_point", &json!({ "lat": 42.0, "lon": -89.0, "georeference": g }).to_string()).unwrap_err();
    assert!(err.contains("to_page"), "{err}");
}
