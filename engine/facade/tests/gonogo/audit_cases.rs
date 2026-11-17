use super::runways_cases::{airplane, runway, standard};
use super::verdict_cases::{finding, quiet};
use super::*;

// --- what the runway check does not know (the aviation audit, 2026-11-06) --

#[test]
fn a_field_with_no_elevation_is_not_checked_rather_than_taken_as_sea_level() {
    // 14 CFR 91.103(b): the distances at the field. Taken as sea level a
    // high field's come out short; with no elevation they are not worked
    // out, and the check says why.
    let mut f = standard();
    f[0].elevation_ft = None;
    f[0].runways = vec![runway(9000.0, 0.0, 0.0)];
    let checks = runways::runway_checks(&airplane(), true, &f, Some(2550.0), Some(2400.0), None);
    let start = &checks[0];
    assert!(start.distances.is_empty());
    assert_eq!((start.unchecked, start.pressure_alt_ft, start.density_alt_ft), (Some(runways::NO_ELEVATION), None, None));
    // The temperature reported is still said.
    assert_eq!(start.temp_c, Some(30.0));
    // The destination, whose elevation is known, is checked as before.
    assert_eq!((checks[1].unchecked, checks[1].distances.len()), (None, 1));
    // The other side: with an elevation it is worked out, and the higher
    // the field the longer the takeoff -- what sea level would hide.
    f[0].elevation_ft = Some(0.0);
    let low = runways::runway_checks(&airplane(), true, &f, Some(2550.0), Some(2400.0), None)[0].distances[0].distances.total_ft;
    f[0].elevation_ft = Some(5000.0);
    let high = &runways::runway_checks(&airplane(), true, &f, Some(2550.0), Some(2400.0), None)[0];
    assert_eq!(high.unchecked, None);
    assert!(high.distances[0].distances.total_ft > low * 1.5, "{} against {low}", high.distances[0].distances.total_ft);
    let json = runways::checks_json(&runways::runway_checks(&airplane(), true, &standard(), Some(2550.0), Some(2400.0), None));
    assert!(json.contains("\"unchecked\":null") && json.contains("\"unknown\":false,\"beyond\":"));
}

#[test]
fn an_airplane_over_the_heaviest_table_or_a_field_past_the_highest_is_a_caveat_and_beyond() {
    let t = airplane().takeoff.unwrap();
    // At the heaviest table's weight, nothing to say; a pound over, said.
    assert!(runways::short_field(&t, 0.0, 15.0, 2550.0, 0.0, false).caveats.is_empty());
    let heavy = runways::short_field(&t, 0.0, 15.0, 2551.0, 0.0, false);
    assert_eq!(heavy.caveats, ["the airplane is heavier than the table's heaviest weight"]);
    assert!(heavy.beyond());
    // The table goes to 8,000 ft pressure altitude.
    assert!(!runways::short_field(&t, 8000.0, 15.0, 2550.0, 0.0, false).beyond());
    assert!(runways::short_field(&t, 8001.0, 15.0, 2550.0, 0.0, false).beyond());
    // In the check, the end is marked beyond.
    let mut f = standard();
    f[0].runways = vec![runway(9000.0, 0.0, 0.0)];
    let heavy = &runways::runway_checks(&airplane(), true, &f, Some(2700.0), Some(2400.0), None)[0].distances[0];
    assert!(heavy.beyond && !heavy.over);
    let within = &runways::runway_checks(&airplane(), true, &f, Some(2550.0), Some(2400.0), None)[0].distances[0];
    assert!(!within.beyond);
}

#[test]
fn a_runway_of_no_known_length_is_unknown_never_within() {
    let mut f = standard();
    f[0].runways = vec![Runway { length_ft: None, ..runway(0.0, 0.0, 0.0) }];
    let d = &runways::runway_checks(&airplane(), true, &f, Some(2550.0), Some(2400.0), None)[0].distances[0];
    assert!(d.unknown && !d.over);
    f[0].runways = vec![runway(9000.0, 0.0, 0.0)];
    assert!(!runways::runway_checks(&airplane(), true, &f, Some(2550.0), Some(2400.0), None)[0].distances[0].unknown);
}

#[test]
fn the_runways_finding_is_a_caution_past_the_tables_and_unknown_where_not_checked() {
    let mut v = quiet();
    v.runways.beyond = strings(&["KLXV"]);
    let item = finding(&v, "runways");
    assert_eq!((item.finding.as_str(), item.detail.as_str()), ("caution", "Past the POH's tables at KLXV: its distances will be longer"));
    v.runways.crosswind = strings(&["C81"]);
    assert_eq!(
        finding(&v, "runways").detail,
        "Crosswind past the POH's demonstrated at C81; Past the POH's tables at KLXV: its distances will be longer"
    );
    let mut v = quiet();
    v.runways.unchecked = strings(&["C81"]);
    let item = finding(&v, "runways");
    assert_eq!(
        (item.finding.as_str(), item.detail.as_str()),
        ("unknown", "Not checked at C81: runway length or field elevation not known")
    );
    // A short runway is still the stop it was.
    v.runways.short = strings(&["KDLH"]);
    assert_eq!(finding(&v, "runways").finding, "stop");
    // And with none of them, within.
    assert_eq!(finding(&quiet(), "runways").detail, "Takeoff and landing within each runway");
}

pub(super) fn verdict_call(input: Value) -> Vec<Value> {
    let out = wingtip_engine::call::call("gonogo_verdict_items", &input.to_string()).unwrap();
    serde_json::from_str::<Value>(&out).unwrap().as_array().unwrap().clone()
}

pub(super) fn found(items: &[Value], key: &str) -> (String, String) {
    let i = items.iter().find(|i| i["key"] == key).unwrap();
    (i["finding"].as_str().unwrap().to_owned(), i["detail"].as_str().unwrap().to_owned())
}

/// The quiet day as the web and the planner send it, every list there.
pub(super) fn sent() -> Value {
    serde_json::json!({
        "weather": {"pending": false, "failed": null, "vfr_not_recommended": [], "under_minimums": [], "icing": null, "hazards": [],
                    "unchecked": [], "worst": null},
        "airspace": {"pending": false, "unchecked": false, "in_force": [], "near": 0, "special_use": []},
        "altitude": {"pending": false, "problem": null, "cautions": [], "flown": "FL055"},
        "fuel": {"pending": false, "margin_gal": 12.4, "required_gal": 27.6, "reserve_min": 30, "ifr": false},
        "runways": {"pending": false, "worked": true, "short": [], "crosswind": []},
        "balance": {"pending": false, "worked": true, "problems": [], "takeoff": null},
        "risk": {"level": "low", "line": "Low"},
    })
}

#[test]
fn a_section_sent_empty_is_unknown_as_the_fuel_is_never_clear() {
    // As the shells send it, every row is ok.
    let items = verdict_call(sent());
    assert!(items.iter().all(|i| i["finding"] == "ok"), "{items:?}");
    for key in ["weather", "airspace", "altitude", "runways"] {
        let mut v = sent();
        v[key] = serde_json::json!({});
        let items = verdict_call(v);
        // The runways' says why in its own words: nothing worked out.
        let (finding, detail) = found(&items, key);
        assert_eq!(finding, "unknown", "{key}");
        assert!(detail.starts_with("Not worked out"), "{key}: {detail}");
    }
    // Still waiting is still pending, not unknown.
    let mut v = sent();
    v["weather"] = serde_json::json!({"pending": true});
    assert_eq!(found(&verdict_call(v), "weather").0, "pending");
    // The fuel, as before: no margin, unknown.
    let mut v = sent();
    v["fuel"] = serde_json::json!({});
    assert_eq!(found(&verdict_call(v), "fuel").0, "unknown");
}
