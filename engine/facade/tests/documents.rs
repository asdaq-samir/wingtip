//! A photographed page's figures checked (wingtip_pilot::documents), held
//! to the shared fixtures (apps/web/src/lib/fixtures/documents.json) the
//! web's tests read too: each flag where the case expects it, none where
//! it expects none, the figures in the app's units and the profile picked.

use serde_json::Value;
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/documents.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ask(name: &str, input: &Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

fn close(a: &Value, b: &Value) -> bool {
    match (a.as_f64(), b.as_f64()) {
        (Some(x), Some(y)) => (x - y).abs() <= 0.06,
        _ => a == b,
    }
}

fn has(flags: &Value, level: &str, words: &str) -> bool {
    flags.as_array().unwrap().iter().any(|f| f["level"] == level && f["says"].as_str().unwrap().contains(words))
}

#[test]
fn handbook_pages() {
    for case in fixture()["handbook"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let answer = ask("handbook_read_check", &case["input"]);
        let items = answer["items"].as_array().unwrap();
        let item = |key: &str| items.iter().find(|i| i["key"] == key).unwrap_or_else(|| panic!("{name}: no item {key}"));
        for f in case["flags"].as_array().unwrap() {
            let (key, level, words) = (f[0].as_str().unwrap(), f[1].as_str().unwrap(), f[2].as_str().unwrap());
            assert!(has(&item(key)["flags"], level, words), "{name}: {key} has no {level} flag saying \"{words}\": {}", item(key)["flags"]);
        }
        if case["only"] == true {
            for i in items {
                assert!(i["flags"].as_array().unwrap().is_empty(), "{name}: {} has flags {}", i["key"], i["flags"]);
            }
        }
        for (path, want) in case["app"].as_object().into_iter().flatten() {
            let got = items.iter().flat_map(|i| i["figures"].as_array().unwrap()).find(|f| f["path"] == *path)
                .unwrap_or_else(|| panic!("{name}: no figure {path}"));
            assert!(close(&got["app_value"], want), "{name}: {path} is {} in the app's units, not {want}", got["app_value"]);
        }
        for (k, want) in case["profile"].as_object().unwrap() {
            assert!(close(&answer["profile"][k], want), "{name}: the profile's {k} is {}, not {want}", answer["profile"][k]);
        }
        if let Some(n) = case["envelope_corners"].as_u64() {
            assert_eq!(answer["handbook"]["envelope"].as_array().unwrap().len() as u64, n, "{name}: the envelope closed");
        }
    }
}

#[test]
fn logbook_pages() {
    for case in fixture()["logbook"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let answer = ask("logbook_read_check", &case["input"]);
        let rows = answer["rows"].as_array().unwrap();
        let expected = case["flags"].as_array().unwrap();
        for f in expected {
            let (row, field, level, words) = (f[0].as_u64().unwrap() as usize, f[1].as_str().unwrap(), f[2].as_str().unwrap(), f[3].as_str().unwrap());
            let flags = &rows[row]["flags"];
            assert!(flags.as_array().unwrap().iter().any(|x| x["field"] == field && x["level"] == level && x["says"].as_str().unwrap().contains(words)),
                "{name}: row {row} has no {level} flag on {field} saying \"{words}\": {flags}");
        }
        if expected.is_empty() {
            for r in rows {
                assert!(r["flags"].as_array().unwrap().is_empty(), "{name}: {}", r["flags"]);
            }
        }
        let page = case["page_flags"].as_array().unwrap();
        assert_eq!(answer["flags"].as_array().unwrap().len(), page.len(), "{name}: the page's flags {}", answer["flags"]);
        for f in page {
            assert!(answer["flags"].as_array().unwrap().iter().any(|x| x["field"] == f[0] && x["level"] == f[1] && x["says"].as_str().unwrap().contains(f[2].as_str().unwrap())),
                "{name}: no page flag {f}: {}", answer["flags"]);
        }
        for (row, want) in case["entries"].as_array().unwrap().iter().enumerate() {
            for (k, v) in want.as_object().unwrap() {
                assert!(close(&rows[row]["entry"][k], v), "{name}: row {row}'s {k} is {}, not {v}", rows[row]["entry"][k]);
            }
        }
    }
}
