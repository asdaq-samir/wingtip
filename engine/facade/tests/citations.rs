//! A rule's citation cut into the library's links (wingtip_wording's
//! cite), asked by name through `call` as every host asks it, held to the
//! shared cases the web's tests read too
//! (apps/web/src/lib/fixtures/citations.json).

use wingtip_engine::call::call;

#[test]
fn the_shared_cases() {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/citations.json");
    let fixture: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let input = serde_json::json!({ "text": case["text"] }).to_string();
        let got: serde_json::Value = serde_json::from_str(&call("citations", &input).unwrap()).unwrap();
        assert_eq!(got["pieces"], case["want"], "{}", case["about"]);
    }
}

#[test]
fn no_text_is_no_pieces_and_a_number_is_refused() {
    assert_eq!(call("citations", "{}").unwrap(), r#"{"pieces":[]}"#);
    assert!(call("citations", r#"{"text": 3}"#).is_err());
}
