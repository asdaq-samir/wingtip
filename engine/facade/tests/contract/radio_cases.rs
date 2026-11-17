use super::*;

/// The radio: ATIS, clearances, readbacks and the ATC copilot.
pub(super) fn cases(c: &mut Checker) {
    for case in fixture("atis.json")["cases"].as_array().unwrap() {
        c.ask("read_atis", json!({ "text": case["heard"] }));
    }

    let clearances = fixture("clearances.json");
    for case in clearances["read"].as_array().unwrap() {
        c.ask("read_clearance", json!({ "text": case["heard"] }));
    }
    for case in clearances["numbers"].as_array().unwrap() {
        let tokens = c.ask("tokens", json!({ "text": case["heard"] }));
        c.ask("place_words", json!({ "tokens": tokens }));
        c.ask("direct_of", json!({ "text": case["heard"] }));
    }
    for case in clearances["routes"].as_array().unwrap() {
        c.ask("cleared_route", json!({ "text": case["heard"], "found": case["found"], "planned": case["planned"] }));
    }

    let heard = fixture("heardCalls.json");
    for case in heard["cases"].as_array().unwrap() {
        c.ask("our_call", json!({ "text": case["heard"], "tail": heard["tail"] }));
        c.ask("direct_of", json!({ "text": case["heard"] }));
    }
    c.ask("call_pattern", json!({ "tail": heard["tail"] }));

    for case in fixture("departureWindow.json")["cases"].as_array().unwrap() {
        c.ask("departure_window", case["input"].clone());
    }

    let readbacks = fixture("readbacks.json");
    for case in readbacks["cases"].as_array().unwrap() {
        c.ask("readback_check", json!({ "cleared": readbacks["cleared"], "said": case["said"] }));
    }
    for case in readbacks["flightLevel"]["cases"].as_array().unwrap() {
        c.ask("readback_check", json!({ "cleared": readbacks["flightLevel"]["cleared"], "said": case["said"] }));
    }

    let atc = fixture("atcCalls.json");
    for case in atc["calls"].as_array().unwrap() {
        c.ask("atc_call", json!({ "text": case["heard"], "tail": atc["tail"] }));
    }
    for case in atc["prior"].as_array().unwrap() {
        c.ask(
            "atc_call",
            json!({ "text": case["heard"], "tail": atc["tail"], "prior": { "text": case["prior"], "ago_s": case["ago_s"] } }),
        );
    }
    for case in atc["readbacks"].as_array().unwrap() {
        c.ask("readback_check", json!({ "cleared": case["cleared"], "said": case["said"], "tail": atc["tail"] }));
    }
}
