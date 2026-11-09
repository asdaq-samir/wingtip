//! The ATC copilot's rules (radio's atc) against the shared fixture
//! (apps/web/src/lib/fixtures/atcCalls.json), asked by name as the apps
//! ask them: who said each transmission, its items in the order said, and
//! a readback checked against it -- so the phone in the air answers as the
//! page does.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/atcCalls.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ask(name: &str, input: Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

#[test]
fn a_call_is_read_into_its_items_and_its_speaker() {
    let f = fixture();
    for case in f["calls"].as_array().unwrap() {
        let answer = ask("atc_call", json!({ "text": case["heard"], "tail": f["tail"] }));
        assert_eq!(answer["who"], case["who"], "{}", case["name"]);
        assert_eq!(answer["items"], case["items"], "{}", case["name"]);
    }
}

#[test]
fn a_readback_with_no_call_sign_follows_our_call() {
    let f = fixture();
    for case in f["prior"].as_array().unwrap() {
        let answer = ask("atc_call", json!({ "text": case["heard"], "tail": f["tail"], "prior": { "text": case["prior"], "ago_s": case["ago_s"] } }));
        assert_eq!(answer["who"], case["who"], "{}", case["name"]);
    }
}

#[test]
fn with_no_tail_nothing_is_ours() {
    let f = fixture();
    for case in f["calls"].as_array().unwrap() {
        let answer = ask("atc_call", json!({ "text": case["heard"] }));
        assert_eq!(answer["who"], "other", "{}", case["name"]);
        assert_eq!(answer["items"], case["items"], "{}", case["name"]);
    }
}

#[test]
fn a_readback_is_checked_item_by_item() {
    let f = fixture();
    for case in f["readbacks"].as_array().unwrap() {
        let answer = ask("readback_check", json!({ "cleared": case["cleared"], "said": case["said"], "tail": f["tail"] }));
        assert_eq!(answer["items"], case["items"], "{}", case["name"]);
        assert_eq!(answer["words"], case["words"], "{}", case["name"]);
    }
}

#[test]
fn without_a_tail_the_call_sign_is_not_asked() {
    // The Map's microphone reads a clearance back with no airplane picked:
    // the call sign is then nothing to miss (lib/readback's earlier use).
    let cleared = "turn left heading two seven zero, descend and maintain three thousand";
    let answer = ask("readback_check", json!({ "cleared": cleared, "said": "left heading two seven zero, three thousand" }));
    assert_eq!(answer["items"], json!([]));
}

#[test]
fn figures_out_of_their_range_are_not_read() {
    // A heading of 0 or past 360 (AIM 4-2-10's three figures, north 360), a
    // runway past 36 (AIM 2-3-3) and an altimeter of 1x.xx were misheard.
    let answer = ask("atc_call", json!({ "text": "fly heading four zero zero, altimeter one niner niner two, cleared to land runway four two" }));
    assert_eq!(answer["items"], json!([]));
    let answer = ask("atc_call", json!({ "text": "fly heading three six zero" }));
    assert_eq!(answer["items"], json!([{ "kind": "heading", "deg": 360, "turn": null, "by_deg": null }]));
}
