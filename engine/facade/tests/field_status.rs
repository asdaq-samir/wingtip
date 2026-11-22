//! The closed-fields rule (decision 0043) asked by name, as every host asks
//! it: `field_status` over NASR APT_BASE.csv's ARPT_STATUS. The rule's own
//! cases are field.rs's (wingtip_flight); these hold the answer the hosts
//! read, `{"open", "closed"}`, since a map, a list or a landing site that
//! read the JSON wrongly would offer a closed field as an open one.

use serde_json::{json, Value};
use wingtip_engine::call::call;

fn ask(input: &Value) -> Value {
    let text = call("field_status", &input.to_string()).unwrap_or_else(|e| panic!("field_status: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("field_status answered {text}: {e}"))
}

#[test]
fn only_nasrs_o_is_open_and_every_other_code_is_labelled_closed() {
    // NASR APT_BASE ARPT_STATUS: "O" operational, "CI" closed indefinitely,
    // "CP" closed permanently; any other code, a blank one too, is not said
    // to be operational, so closed (decision 0043, the safer side).
    for (status, open, closed) in [
        (json!("O"), true, Value::Null),
        (json!(" o "), true, Value::Null),
        (json!("CI"), false, json!("Closed indefinitely")),
        (json!("CP"), false, json!("Closed permanently")),
        (json!(""), false, json!("Closed")),
        (json!("X"), false, json!("Closed")),
    ] {
        assert_eq!(ask(&json!({ "status": status.clone() })), json!({ "open": open, "closed": closed }), "{status}");
    }
}

#[test]
fn no_nasr_record_is_left_to_the_host_and_a_wrong_type_is_refused() {
    // No ARPT_STATUS at all (no NASR row): not judged, so neither hidden
    // nor labelled (field.rs, Status::Unknown).
    assert_eq!(ask(&json!({ "status": null })), json!({ "open": true, "closed": null }));
    assert_eq!(ask(&json!({})), json!({ "open": true, "closed": null }));
    // A number is no NASR code: refused, never read as open.
    assert!(call("field_status", r#"{"status":1}"#).is_err());
}
