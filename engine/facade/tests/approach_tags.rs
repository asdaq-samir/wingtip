//! The tags an approach's fixes carry on the map (crate::approach::tags),
//! asked by name as every host asks, for KOSH's ILS, LOC and RNAV (GPS)
//! RWY 36 as the planner draws them from the CIFP of 29 Oct 2026, read from
//! the shared fixture apps/web/src/lib/fixtures/approachKosh.json, and held
//! to the plate (ILS or LOC RWY 36, Amdt 7D) and to the answers the
//! fixture keeps for the web's and the phones' tests.
//! `WRITE_FIXTURE=1 cargo test -p wingtip-engine --test approach_tags`
//! writes those answers after a change to the rule.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/approachKosh.json")
}

fn fixture() -> Value {
    serde_json::from_str(&std::fs::read_to_string(path()).unwrap()).unwrap()
}

fn tags(drawing: &Value) -> Value {
    let input = json!({ "drawing": drawing });
    let text = call("approach_fix_tags", &input.to_string()).unwrap_or_else(|e| panic!("approach_fix_tags: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("answered {text}: {e}"))
}

fn tag<'a>(answer: &'a Value, ident: &str) -> &'a Value {
    answer["tags"].as_array().unwrap().iter().find(|t| t["ident"] == ident).unwrap_or_else(|| panic!("no tag for {ident}"))
}

#[test]
fn kosh_ils_36_is_tagged_as_its_plate_says() {
    let f = fixture();
    let a = tags(&f["drawings"]["I36:OSH"]);
    // POBER, the IAF from OSH and the FAF: at or above 2,700, and the glide
    // slope at 2,610 there, the CIFP's own ("H", ARINC 424-18 5.29).
    let pober = tag(&a, "POBER");
    assert_eq!(pober["roles"], json!(["IAF", "FAF"]));
    assert_eq!(pober["altitude"], json!({ "sense": "at_or_above", "min_ft": 2700.0, "max_ft": null }));
    assert_eq!(pober["vertical"], json!({ "kind": "glideslope", "ft": 2610.0, "deg": 3.0, "source": "cifp" }));
    // CFBSM, the final approach course fix: at or above 2,700 ("J").
    let cfbsm = tag(&a, "CFBSM");
    assert_eq!(cfbsm["altitude"]["sense"], "at_or_above");
    assert_eq!(cfbsm["altitude"]["min_ft"], 2700.0);
    assert_eq!(cfbsm["vertical"], Value::Null);
    // RW36, the MAP: no DA, the TCH and TDZE (808.5 in NASR, 809 printed).
    let rw36 = tag(&a, "RW36");
    assert_eq!(rw36["altitude"], Value::Null);
    assert_eq!(rw36["runway"], json!({ "threshold_ft": 808.0, "tch_ft": 53.0, "tdze_ft": 809.0 }));
    // LEWKO, the missed approach's hold at 3,000.
    let lewko = tag(&a, "LEWKO");
    assert_eq!(lewko["missed"], true);
    assert_eq!(lewko["altitude"], json!({ "sense": "at_or_above", "min_ft": 3000.0, "max_ft": null }));
    assert_eq!(lewko["runway"], Value::Null);
    // The final approach segment, POBER to RW36.
    assert_eq!(a["final"]["from"], "POBER");
    assert_eq!(a["final"]["to"], "RW36");
}

#[test]
fn a_localizer_has_no_glide_slope_and_an_lpv_its_glidepath_worked_out() {
    let f = fixture();
    let loc = tags(&f["drawings"]["L36"]);
    assert_eq!(tag(&loc, "POBER")["vertical"], Value::Null);
    // RNAV (GPS) RWY 36: LPV and LNAV/VNAV authorised, its FAF WIVLI at or
    // above 2,500, where the CIFP codes no glidepath altitude: 3.00° from
    // 808 + 53 ft at RW36, 5.15 nm out, by Order 8260.3G formula 2-6-4,
    // about the FAF's own 2,500 as an RNAV FAF is placed.
    let rnav = tags(&f["drawings"]["R36"]);
    let wivli = tag(&rnav, "WIVLI");
    assert_eq!(wivli["vertical"]["kind"], "glidepath");
    assert_eq!(wivli["vertical"]["source"], "computed");
    let ft = wivli["vertical"]["ft"].as_f64().unwrap();
    assert!((ft - 2500.0).abs() <= 2.0, "{ft}");
    // A step-down fix carries its own limit and no glidepath tag.
    assert_eq!(tag(&rnav, "JUMVO")["altitude"]["min_ft"], 1460.0);
    assert_eq!(tag(&rnav, "JUMVO")["vertical"], Value::Null);
}

#[test]
fn the_fixtures_answers_are_the_engines() {
    let mut f = fixture();
    let names: Vec<String> = f["drawings"].as_object().unwrap().keys().cloned().collect();
    let answers: serde_json::Map<String, Value> = names.iter().map(|k| (k.clone(), tags(&f["drawings"][k]))).collect();
    if std::env::var_os("WRITE_FIXTURE").is_some() {
        f["tags"] = Value::Object(answers);
        std::fs::write(path(), serde_json::to_string_pretty(&f).unwrap() + "\n").unwrap();
        return;
    }
    for k in &names {
        assert_eq!(f["tags"][k], answers[k], "{k}");
    }
}

#[test]
fn a_procedure_with_no_facts_is_tagged_by_its_limits_alone() {
    let a = tags(&json!({
        "id": "V09", "kind": "approach", "glidepath_deg": 3.0,
        "fixes": [{ "ident": "ABC", "lat": 44.0, "lon": -88.0, "roles": ["FAF"], "min_ft": 2000, "max_ft": 2000 }]
    }));
    assert_eq!(a["tags"][0]["altitude"]["sense"], "at");
    assert_eq!(a["tags"][0]["vertical"], Value::Null);
    assert_eq!(a["final"], Value::Null);
}
