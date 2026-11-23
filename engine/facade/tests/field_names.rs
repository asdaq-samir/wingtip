//! The names a field may be filed under, asked by name as every host asks
//! it (`field_names`), against the shared fixture: FAA JO 7350.9GG 4-1's K
//! for the contiguous states, and NASR APT_BASE.csv's ICAO_ID where the
//! prefix is no rule (Alaska, Hawaii, Puerto Rico, the Virgin Islands).
//! Juneau by JNU alone is never given a P guess (it is PAJN).

use serde_json::{json, Value};
use wingtip_engine::call::call;

#[test]
fn a_fields_names_are_the_shared_fixtures() {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/fieldNames.json");
    let fixture: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let input = json!({ "ident": case["ident"], "icao_id": case["icao_id"] });
        let text = call("field_names", &input.to_string()).unwrap_or_else(|e| panic!("field_names: {e}"));
        let names: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(names, case["names"], "{input}");
    }
}

#[test]
fn a_number_for_an_ident_is_refused() {
    assert!(call("field_names", r#"{"ident":1}"#).is_err());
}
