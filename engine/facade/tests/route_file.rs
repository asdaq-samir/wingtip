//! A route file read by name, as the web asks it before a pilot uses one
//! (route_file_read): the shared fixture's .fpl and GPX routes and the
//! files that are neither, answered as the hosts read them. The rule's own
//! cases are route_file.rs's (wingtip_route).

use serde_json::Value;
use wingtip_engine::call::call;

#[test]
fn the_shared_route_files_answer_as_the_fixture_says() {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/routeFile.json");
    let fixture: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let input = serde_json::json!({ "text": case["text"] });
        let text = call("route_file_read", &input.to_string()).unwrap_or_else(|e| panic!("route_file_read: {e}"));
        let answer: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(answer, case["answer"], "{}", case["name"]);
    }
}

#[test]
fn a_text_that_is_not_a_string_is_refused() {
    assert!(call("route_file_read", r#"{"text":1}"#).is_err());
}
