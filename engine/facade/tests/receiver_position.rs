//! Own ship from each supported receiver, by name, against the shared
//! fixture (apps/web/src/lib/fixtures/gdl90-receivers.json), as the phones
//! ask it: the datagram read (`receiver_read`), then whose fix own ship is
//! (`receiver_position`) with no device fix, a Wi-Fi iPad's case; then the
//! hand back to the device's fix once the receiver's is three seconds old.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/gdl90-receivers.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ask(name: &str, input: Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

fn bytes(hex: &str) -> Vec<u8> {
    (0..hex.len()).step_by(2).map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap()).collect()
}

fn read(sample: &Value, at: f64) -> Value {
    let data = BASE64.encode(bytes(sample["hex"].as_str().unwrap()));
    ask("receiver_read", json!({ "data": data, "at": at, "picture": null }))
}

#[test]
fn each_receiver_gives_own_ship_by_the_rules() {
    let f = fixture();
    let at = f["at"].as_f64().unwrap();
    for sample in f["receivers"].as_array().unwrap() {
        let who = sample["receiver"].as_str().unwrap();
        let want = &sample["expect"];
        let picture = read(sample, at);
        assert_eq!(picture["receiver"]["name"], want["name"], "{who}: name");
        let p = ask("receiver_position", json!({ "ownship": picture["ownship"], "receiver": picture["receiver"], "at": at }));
        assert_eq!(p["source"], want["source"], "{who}: source");
        assert_eq!(p["receiver"], want["receiver"], "{who}: receiver");
        for k in ["altitude_ft", "ellipsoid_ft", "accuracy_m"] {
            if let Some(v) = want.get(k) {
                assert_eq!(p["fix"][k].as_f64(), v.as_f64(), "{who}: {k}");
            }
        }
    }
}

#[test]
fn a_phone_takes_its_own_back_when_the_receiver_goes_quiet() {
    let f = fixture();
    let at = f["at"].as_f64().unwrap();
    let sentry = &f["receivers"].as_array().unwrap().iter().find(|s| s["receiver"] == "sentry").unwrap().clone();
    let picture = read(sentry, at);
    // A phone's fix of 65 m against the Sentry's 10 m: the Sentry's.
    let device = json!({ "accuracy_m": 65, "at": at });
    let now = ask(
        "receiver_position",
        json!({ "ownship": picture["ownship"], "receiver": picture["receiver"], "device": device, "was": "device", "at": at }),
    );
    assert_eq!(now["source"], "receiver");
    // Four seconds on, nothing more heard; the phone's fix a second old.
    let quiet = ask("receiver_read", json!({ "at": at + 4.0, "picture": picture }));
    let device = json!({ "accuracy_m": 65, "at": at + 3.0 });
    let then = ask(
        "receiver_position",
        json!({ "ownship": quiet["ownship"], "receiver": quiet["receiver"], "device": device, "was": "receiver", "at": at + 4.0 }),
    );
    assert_eq!((then["source"].as_str(), then["receiver"].as_str()), (Some("device"), Some("stale")));
    assert_eq!(then["fix"], Value::Null);
}
