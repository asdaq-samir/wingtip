//! A pilot's proficiency plan (wingtip_pilot::coach, `proficiency_plan`)
//! held to the shared fixture pilots (apps/web/src/lib/fixtures/coach.json)
//! the planner's test reads too: what is due and when, what the debriefs
//! show and the sessions in order, each at its field -- asked through the
//! one way in, `call`, as every host asks.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture(name: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures").join(name);
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn plan(ask: &Value) -> Value {
    serde_json::from_str(&call("proficiency_plan", &ask.to_string()).unwrap_or_else(|e| panic!("{e}"))).unwrap()
}

#[test]
fn the_fixture_pilots_plans() {
    for pilot in fixture("coach.json")["pilots"].as_array().unwrap() {
        let name = pilot["name"].as_str().unwrap();
        let got = plan(&pilot["ask"]);
        let want = &pilot["expected"];
        let due = got["due"].as_array().unwrap();
        for (key, w) in want["due"].as_object().unwrap() {
            let d = due.iter().find(|d| d["key"] == key.as_str()).unwrap_or_else(|| panic!("{name}: no {key} in {due:?}"));
            assert_eq!(d["status"], w[0], "{name}: {key}'s status");
            assert_eq!(d["until"], w[1], "{name}: {key}'s last day");
        }
        assert_eq!(due.len(), want["due"].as_object().unwrap().len(), "{name}: no other currency");
        let reminders: Vec<&Value> = got["reminders"].as_array().unwrap().iter().map(|r| &r["key"]).collect();
        assert_eq!(json!(reminders), want["reminders"], "{name}: reminders");
        let weak = got["weak_areas"].as_array().unwrap();
        assert_eq!(weak.len(), want["weak_areas"].as_object().unwrap().len(), "{name}: weak areas {weak:?}");
        for (key, count) in want["weak_areas"].as_object().unwrap() {
            let w = weak.iter().find(|w| w["key"] == key.as_str()).unwrap_or_else(|| panic!("{name}: no {key}"));
            assert_eq!(w["evidence"].as_array().unwrap().len() as u64, count.as_u64().unwrap(), "{name}: {key}'s evidence");
        }
        let sessions: Vec<Value> = got["sessions"].as_array().unwrap().iter().map(|s| json!([s["key"], s["place"]["ident"]])).collect();
        assert_eq!(json!(sessions), want["sessions"], "{name}: sessions");
        // Every id a session cites is one the plan gives, so words citing
        // them can be checked against it.
        let ids: Vec<String> = got["evidence"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["id"].as_str().unwrap().to_owned())
            .chain(due.iter().map(|d| d["id"].as_str().unwrap().to_owned()))
            .collect();
        for s in got["sessions"].as_array().unwrap() {
            for why in s["why"].as_array().unwrap() {
                assert!(ids.iter().any(|i| why == i.as_str()), "{name}: {why} cited by {} is in the plan", s["id"]);
            }
        }
    }
}

#[test]
fn an_unstable_approach_is_one_off_under_500_ft_above_the_field() {
    // AC 61-98D 2.1.4: stabilized "by 500 feet above airport elevation".
    let ask = |alt: f64| {
        json!({ "today": "2026-11-09", "entries": [], "debriefs": [{ "kind": "approach", "flown_on": "2026-11-01", "place": "KMSN",
            "elevation_ft": 887, "profile": [{ "to_go_nm": 1.0, "alt_ft": alt, "off": true }] }] })
    };
    // 499 ft above the field: unstable; 500 ft: at the gate, not under it.
    let under = plan(&ask(887.0 + 499.0));
    assert_eq!(under["weak_areas"][0]["key"], "unstable_approach");
    assert!(under["evidence"][0]["text"].as_str().unwrap().contains("499 ft above the field"));
    assert_eq!(plan(&ask(887.0 + 500.0))["weak_areas"], json!([]));
}

#[test]
fn an_approachs_evidence_names_the_procedure_flown_and_a_flights_none() {
    // Two approaches into one field read alike by the field alone; the
    // chart's name for each ("ILS Y RWY 08") says which.
    let got = plan(&json!({ "today": "2026-11-09", "entries": [], "debriefs": [
        { "kind": "approach", "flown_on": "2026-11-01", "place": "KMSN", "procedure": "ILS Y RWY 08",
          "elevation_ft": 887, "profile": [{ "to_go_nm": 1.0, "alt_ft": 1200.0, "off": true }] },
        { "kind": "flight", "flown_on": "2026-10-20", "place": "KMSN-KJVL",
          "patterns": [{ "ident": "KJVL", "off_ft": -300.0, "ok": false }] }] }));
    let evidence = got["evidence"].as_array().unwrap();
    assert_eq!((&evidence[0]["place"], &evidence[0]["procedure"]), (&json!("KMSN"), &json!("ILS Y RWY 08")));
    assert_eq!((&evidence[1]["place"], &evidence[1]["procedure"]), (&json!("KMSN-KJVL"), &Value::Null));
}

#[test]
fn a_session_says_wings_may_count_and_never_that_it_does() {
    let avery = &fixture("coach.json")["pilots"][0]["ask"];
    let got = plan(avery);
    let unstable = got["sessions"].as_array().unwrap().iter().find(|s| s["key"] == "unstable_approach").unwrap();
    assert_eq!(unstable["wings"]["area"], "Takeoffs and landings");
    assert!(unstable["wings"]["note"].as_str().unwrap().starts_with("May count"));
    assert_eq!(unstable["place"]["approach"], "ILS OR LOC RWY 36");
    // The reminder says the day and how far off, with its rule.
    assert_eq!(got["reminders"][1]["text"], "Passengers at night: current until 18 Nov 2026, in 9 days (14 CFR 61.57(b)).");
}

#[test]
fn an_instrument_pilot_lapsed_flies_the_tasks_and_past_the_grace_needs_a_check() {
    let ask = |on: &str| {
        json!({ "today": "2026-11-09", "ratings": ["instrument"], "entries": [
        { "flownOn": on, "approaches": 6, "holding": true, "tracking": true }] })
    };
    let instrument = |got: &Value| got["due"].as_array().unwrap().iter().find(|d| d["key"] == "instrument").unwrap().clone();
    // Flown in January 2026: current February to July (61.57(c)(1)), then
    // six calendar months in which the tasks alone restore it.
    let grace = plan(&ask("2026-01-10"));
    assert_eq!(instrument(&grace)["status"], "lapsed");
    assert_eq!(instrument(&grace)["until"], "2026-07-31");
    assert!(instrument(&grace)["detail"].as_str().unwrap().contains("restore it until 31 Jan 2027"));
    assert_eq!(grace["sessions"][0]["key"], "instrument");
    assert!(grace["sessions"][0]["practise"].as_str().unwrap().starts_with("6 approaches, holding"));
    // Flown in October 2025: current to April 2026, the grace over at the
    // end of October; only a proficiency check now (61.57(d)).
    let past = plan(&ask("2025-10-10"));
    assert_eq!(instrument(&past)["until"], "2026-04-30");
    assert!(instrument(&past)["detail"].as_str().unwrap().contains("Only an instrument proficiency check"));
    assert_eq!(past["sessions"][0]["key"], "ipc");
}

#[test]
fn a_bad_day_is_refused() {
    assert!(call("proficiency_plan", r#"{"today":"2026-13-01","entries":[]}"#).is_err());
    assert!(
        call("proficiency_plan", r#"{"today":"2026-11-09","entries":[],"debriefs":[{"kind":"loop","flown_on":"2026-11-01"}]}"#).is_err()
    );
}
