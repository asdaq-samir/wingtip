//! A portable receiver's GDL 90 stream read by name, against the shared
//! fixture (apps/web/src/lib/fixtures/gdl90.json), as the phones ask it:
//! each datagram handed over with the last picture, then the traffic, a
//! field's reports and the NEXRAD drawn from it.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::OnceLock;
use wingtip_engine::call::call;

fn read(path: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").join(path);
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn fixture() -> Value {
    read("apps/web/src/lib/fixtures/gdl90.json")
}

/// The contract (engine/contract/engine.schema.json) as a validator of
/// `{name: {"input", "answer"}}`, as tests/contract.rs holds the other
/// fixtures' answers to it.
fn contract() -> &'static jsonschema::Validator {
    static V: OnceLock<jsonschema::Validator> = OnceLock::new();
    V.get_or_init(|| {
        let mut schema = read("engine/contract/engine.schema.json");
        schema["required"] = json!([]);
        jsonschema::draft7::new(&schema).unwrap()
    })
}

/// The rule asked, its input and answer held to the contract.
fn ask(name: &str, input: Value) -> Value {
    let answer: Value = serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap();
    let asked = json!({ name: { "input": input, "answer": answer } });
    let errors: Vec<String> = contract().iter_errors(&asked).map(|e| format!("{e} at {}", e.instance_path())).collect();
    assert!(errors.is_empty(), "{name}: not of the contract's shape:\n{}", errors.join("\n"));
    answer
}

fn bytes(hex: &str) -> Vec<u8> {
    (0..hex.len()).step_by(2).map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap()).collect()
}

/// The picture after each datagram, read in turn.
fn pictures(f: &Value) -> Vec<Value> {
    let mut picture = Value::Null;
    let mut out = Vec::new();
    for d in f["datagrams"].as_array().unwrap() {
        let data = BASE64.encode(bytes(d["hex"].as_str().unwrap()));
        picture = ask("receiver_read", json!({ "data": data, "at": d["at"], "picture": picture }));
        out.push(picture.clone());
    }
    out
}

fn holds(have: &Value, want: &Value) {
    for (k, v) in want.as_object().unwrap() {
        match (&have[k], v) {
            (Value::Number(a), Value::Number(b)) => {
                assert!((a.as_f64().unwrap() - b.as_f64().unwrap()).abs() < 1e-6, "{k}: {a} against {b}")
            }
            (a, b) => assert_eq!(a, b, "{k}"),
        }
    }
}

#[test]
fn the_stream_reads_into_the_receiver_own_ship_and_traffic() {
    let f = fixture();
    let p = pictures(&f);
    let want = &f["afterFirst"];
    let r = &p[0]["receiver"];
    assert_eq!(r["name"], want["name"]);
    assert_eq!((&r["msl"], &r["gps"], &r["live"]), (&want["msl"], &want["gps"], &want["live"]));
    assert_eq!(r["summary"], want["summary"]);
    assert_eq!(p[0]["targets"].as_array().unwrap().len() as u64, want["targets"].as_u64().unwrap());
    holds(&p[0]["ownship"], &want["ownship"]);
    holds(&p[0]["targets"][0], &want["target"]);

    let want = &f["afterSecond"];
    assert_eq!(p[1]["texts"].as_array().unwrap().len() as u64, want["texts"].as_u64().unwrap());
    assert_eq!(p[1]["nexrad"].as_array().unwrap().len() as u64, want["nexrad"].as_u64().unwrap());
    assert_eq!(p[1]["receiver"]["bad_frames"].as_f64(), want["bad_frames"].as_f64());
    assert!((p[1]["receiver"]["station_lat"].as_f64().unwrap() - want["station"][0].as_f64().unwrap()).abs() < 1e-4);
    assert!((p[1]["receiver"]["station_lon"].as_f64().unwrap() - want["station"][1].as_f64().unwrap()).abs() < 1e-4);
    // The damaged frame dropped, the traffic still the one target.
    assert_eq!(p[1]["targets"].as_array().unwrap().len(), 1);
}

#[test]
fn the_views_over_the_picture() {
    let f = fixture();
    let picture = pictures(&f).pop().unwrap();
    let at = f["datagrams"][1]["at"].clone();

    let t = &f["traffic"];
    let drawn = ask("receiver_traffic", json!({ "picture": picture, "internet": t["internet"], "own_ft": t["own_ft"], "at": at }));
    let drawn = drawn.as_array().unwrap();
    let want = t["expect"].as_array().unwrap();
    assert_eq!(drawn.len(), want.len(), "{drawn:?}");
    for (have, want) in drawn.iter().zip(want) {
        holds(have, want);
    }

    let r = &f["reports"];
    let reports = ask("receiver_reports", json!({ "picture": picture, "ident": r["ident"] }));
    assert_eq!(reports["metar"]["text"], r["metar"]);
    assert_eq!(reports["taf"]["text"], r["taf"]);
    assert_eq!(ask("receiver_reports", json!({ "picture": picture, "ident": "MDW" }))["metar"], Value::Null);

    let n = &f["nexrad"];
    let drawn = ask("receiver_nexrad", json!({ "picture": picture }));
    assert_eq!(drawn["time"], n["time"]);
    for level in drawn["levels"].as_array().unwrap() {
        let want = n["rectsByLevel"][level["level"].as_u64().unwrap().to_string()].as_u64().unwrap_or(0);
        assert_eq!(level["rects"].as_array().unwrap().len() as u64, want, "level {}", level["level"]);
    }
}

#[test]
fn what_is_not_heard_goes() {
    let f = fixture();
    let picture = pictures(&f).pop().unwrap();
    let later = f["datagrams"][1]["at"].as_f64().unwrap() + f["later"]["after_s"].as_f64().unwrap();
    let p = ask("receiver_read", json!({ "data": "", "at": later, "picture": picture }));
    assert_eq!(p["receiver"]["live"], f["later"]["live"]);
    assert_eq!(p["receiver"]["summary"], f["later"]["summary"]);
    assert_eq!(p["targets"].as_array().unwrap().len() as u64, f["later"]["targets"].as_u64().unwrap());
    // The weather is kept: a METAR for two hours, the NEXRAD ten minutes.
    assert_eq!(p["texts"].as_array().unwrap().len(), 3);
    assert_eq!(p["nexrad"].as_array().unwrap().len(), 1);
    let gone = ask("receiver_read", json!({ "at": later + 601.0, "picture": p }));
    assert_eq!(gone["nexrad"].as_array().unwrap().len(), 0);
    assert!(call("receiver_read", "{}").is_err());
    assert!(call("receiver_read", r#"{"at": 1, "data": "!!"}"#).is_err());
}
