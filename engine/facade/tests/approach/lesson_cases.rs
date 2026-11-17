use super::*;

// --- what it has to go on

#[test]
fn a_track_with_no_altitudes_is_debriefed_on_its_course_alone() {
    let d = debrief(&drawing("I08-Y"), &fly(&final_of(&drawing("I08-Y")), Fly { after: 60, ..Default::default() }), None);
    assert_eq!(d["has_altitude"], false);
    assert!(texts(&d).iter().any(|t| t == "The track has no altitudes: the course alone is debriefed"));
    assert!(d["crossings"].as_array().unwrap().iter().all(|c| c["alt_ft"].is_null() && c["under_ft"].is_null()));
    assert_eq!(d["outcome"]["kind"], "unknown");
    assert_eq!(d["profile"]["track"], json!([]));
}

pub(super) fn with_transition(vectors: &Value, drawings: &[Value], points: &[Value]) -> Option<String> {
    let best = ask(
        "approach_transition",
        json!({"faf_at": vectors["faf_at"], "passed": vectors["way_in"]["passed"], "drawings": drawings, "points": points}),
    );
    let chosen = if best.is_null() { vectors } else { &best };
    chosen["transition"].as_str().map(str::to_owned)
}

#[test]
fn the_transition_flown_is_found_and_the_vectors_where_none_was() {
    let ils = on_ils();
    let via_lax = fly(
        &way_in(&drawing("I08-Y:LAX")),
        Fly {
            alt: Some(Box::new(move |t| if t > 11.0 { 4600.0 } else { ils(t) })),
            after: 60,
            after_alt: Some(missed_after(5.0)),
            ..Default::default()
        },
    );
    let vectors = find(&[drawing("I08-Y")], &via_lax, None)[0].clone();
    assert!(vectors["transition"].is_null());
    assert_eq!(with_transition(&vectors, &[drawing("I08-Y:LAX")], &via_lax).as_deref(), Some("LAX"));
    let straight_in = ils_track(60, 5.0);
    let from_vectors = find(&[drawing("I08-Y")], &straight_in, None)[0].clone();
    assert_eq!(with_transition(&from_vectors, &[drawing("I08-Y:LAX")], &straight_in), None);
}

#[test]
fn two_attempts_are_two_approaches() {
    let once = ils_track(60, 5.0);
    let again: Vec<Value> = once
        .iter()
        .map(|p| {
            let mut p = p.clone();
            p["t"] = json!(p["t"].as_f64().unwrap() + 20.0 * 60_000.0);
            p
        })
        .collect();
    // The way back round, far off the final, between them.
    let last_t = once.last().unwrap()["t"].as_f64().unwrap();
    let between: Vec<Value> = (0..30)
        .map(|k| json!({"t": last_t + (k as f64 + 1.0) * 30_000.0, "lat": 34.4, "lon": -118.5 + k as f64 * 0.001, "alt_ft": 3000}))
        .collect();
    let all: Vec<Value> = once.into_iter().chain(between).chain(again).collect();
    assert_eq!(find(&[drawing("I08-Y")], &all, None).len(), 2);
}

#[test]
fn bad_asks_are_errors_not_panics() {
    assert!(call("approach_debrief", "{}").is_err());
    assert!(call("approach_debrief", r#"{"drawing": 3, "points": []}"#).is_err());
    let d = drawing("I08-Y");
    let attempt = json!({"drawing": d, "points": [{"t": 0, "lat": 34.2, "lon": -118.5}], "attempt": {"faf": 5, "from": 0, "to": 9}});
    assert!(call("approach_debrief", &attempt.to_string()).is_err());
    assert_eq!(ask("approach_debrief", json!({"drawing": d, "points": []})), Value::Null);
    assert_eq!(ask("approach_find", json!({"drawings": [d], "points": []})), json!([]));
    assert!(call("approach_minimums", r#"{"findings": [{"tone": "loud", "text": "x"}], "outcome": "missed"}"#).is_err());
}

// --- the lesson (approachLesson.test.ts): KDLH's ILS 09 via DLH as the
// CIFP of 29 Oct 2026 codes it, its places rounded, and a bare VOR.

pub(super) fn kdlh() -> Value {
    json!({
        "airport": "KDLH", "kind": "approach", "id": "I09", "name": "ILS RWY 09", "transition": "DLH", "cycle": "261029", "stale": false,
        "glidepath_deg": 3, "final_course_deg": 93,
        "lines": [
            {"role": "transition", "name": "DLH", "points": [[46.80, -92.20], [46.84, -92.36]]},
            {"role": "final", "name": null, "points": [[46.84, -92.36], [46.84, -92.33], [46.84, -92.30], [46.842, -92.21]]},
            {"role": "missed", "name": null, "points": [[46.842, -92.21], [46.843, -92.17], [47.0, -92.1]]},
        ],
        "holds": [
            {"fix": "DL", "turn": "R", "inbound_deg": 92, "missed": false, "kind": "hold", "points": [[46.84, -92.36], [46.83, -92.40], [46.84, -92.36]]},
            {"fix": "CHERL", "turn": "R", "inbound_deg": 196, "missed": true, "kind": "hold", "points": [[47.0, -92.1], [47.02, -92.12], [47.0, -92.1]]},
        ],
        "fixes": [
            {"ident": "DLH", "lat": 46.80, "lon": -92.20, "roles": [], "min_ft": null, "max_ft": null, "missed": false},
            {"ident": "DL", "lat": 46.84, "lon": -92.36, "roles": ["IAF", "hold"], "min_ft": 3300, "max_ft": null, "missed": false},
            {"ident": "CFBSJ", "lat": 46.84, "lon": -92.33, "roles": ["FACF"], "min_ft": 3300, "max_ft": null, "missed": false},
            {"ident": "PYKLA", "lat": 46.84, "lon": -92.30, "roles": ["FAF"], "min_ft": 3300, "max_ft": null, "missed": false, "vertical_angle_deg": 3},
            {"ident": "RW09", "lat": 46.842, "lon": -92.21, "roles": ["MAP"], "min_ft": null, "max_ft": null, "missed": false, "vertical_angle_deg": 3},
            {"ident": "CHERL", "lat": 47.0, "lon": -92.1, "roles": ["hold"], "min_ft": 4500, "max_ft": null, "missed": true},
        ],
        "missed_legs": [
            {"path": "CA", "fix": null, "course_deg": 93, "turn": null, "min_ft": 3000, "max_ft": null},
            {"path": "VI", "fix": null, "course_deg": 320, "turn": "L", "min_ft": null, "max_ft": null},
            {"path": "CF", "fix": "CHERL", "course_deg": 17, "turn": null, "min_ft": 4500, "max_ft": null},
            {"path": "HM", "fix": "CHERL", "course_deg": 197, "turn": "R", "min_ft": 4500, "max_ft": null},
        ],
    })
}

pub(super) fn bare() -> Value {
    json!({
        "airport": "KXYZ", "kind": "approach", "id": "V27", "name": "VOR RWY 27", "transition": null, "cycle": "261029", "stale": false, "missed_legs": [],
        "lines": [{"role": "final", "name": null, "points": [[45, -93], [45, -93.1], [45, -93.2], [45, -93.25]]}],
        "holds": [],
        "fixes": [
            {"ident": "AAAAA", "lat": 45, "lon": -93, "roles": ["FAF"], "min_ft": 2500, "max_ft": null, "missed": false},
            {"ident": "BBBBB", "lat": 45, "lon": -93.1, "roles": [], "min_ft": 1900, "max_ft": null, "missed": false},
            {"ident": "CCCCC", "lat": 45, "lon": -93.2, "roles": [], "min_ft": 1520, "max_ft": null, "missed": false},
            {"ident": "RW27", "lat": 45, "lon": -93.25, "roles": ["MAP"], "min_ft": null, "max_ft": null, "missed": false},
        ],
    })
}

pub(super) fn radio() -> Value {
    json!([
        {"type": "ATIS", "description": "ATIS", "frequency_mhz": 124.1},
        {"type": "APP", "description": "MINNEAPOLIS APP", "frequency_mhz": 125.0},
        {"type": "TWR", "description": "DULUTH TWR", "frequency_mhz": 118.3},
        {"type": "GND", "description": "GND", "frequency_mhz": 121.9},
    ])
}

pub(super) fn fpm(gs: f64, angle: f64) -> f64 {
    ask("approach_descent_fpm", json!({"gs_kt": gs, "angle_deg": angle})).as_f64().unwrap()
}

#[test]
fn descent_rate_is_the_faas_table() {
    // The TPP's Rate of Descent Table, 3.0°: 318 at 60 kt, 478 at 90, 637 at 120.
    assert!((fpm(60.0, 3.0) - 318.0).abs() < 0.5);
    assert!((fpm(90.0, 3.0) - 478.0).abs() < 0.5);
    assert!((fpm(120.0, 3.0) - 637.0).abs() < 0.5);
    // About ground speed x 5.3 on 3.00°.
    assert!((fpm(100.0, 3.0) / 100.0 - 5.3).abs() < 0.05);
    // Steeper is faster: 3.5° at 90 kt, 557.
    assert!((fpm(90.0, 3.5) - 557.0).abs() < 0.5);
}

#[test]
fn approach_category_is_97_3s() {
    let cat = |vref: Value, vso: Value| ask("approach_category", json!({"vref_kt": vref, "vso_kt": vso}));
    assert_eq!(cat(json!(90.9), Value::Null), json!("A"));
    assert_eq!(cat(json!(91), Value::Null), json!("B"));
    assert_eq!(cat(json!(120.9), Value::Null), json!("B"));
    assert_eq!(cat(json!(121), Value::Null), json!("C"));
    assert_eq!(cat(json!(141), Value::Null), json!("D"));
    assert_eq!(cat(json!(166), Value::Null), json!("E"));
    // 1.3 x 60 = 78, A; 1.3 x 70 = 91, B. VREF first where both are known.
    assert_eq!(cat(Value::Null, json!(60)), json!("A"));
    assert_eq!(cat(Value::Null, json!(70)), json!("B"));
    assert_eq!(cat(json!(85), json!(70)), json!("A"));
    assert_eq!(cat(Value::Null, Value::Null), Value::Null);
    assert_eq!(cat(json!(0), json!(70)), Value::Null);
}

pub(super) fn brief(input: Value) -> Vec<Value> {
    ask("approach_brief", input).as_array().unwrap().clone()
}

pub(super) fn by_key(items: &[Value], key: &str) -> Value {
    items.iter().find(|i| i["key"] == key).unwrap().clone()
}

#[test]
fn the_brief_goes_as_a_briefing_does() {
    let b = brief(json!({"drawing": kdlh(), "frequencies": radio()}));
    let keys: Vec<&str> = b.iter().map(|i| i["key"].as_str().unwrap()).collect();
    assert_eq!(keys, ["approach", "frequencies", "course", "fix:DLH", "fix:DL", "fix:CFBSJ", "fix:PYKLA", "minimums", "map", "missed"]);
    assert_eq!(by_key(&b, "fix:DL")["title"], "Initial Approach Fix");
    assert_eq!(by_key(&b, "fix:CFBSJ")["title"], "Intermediate Fix");
    assert_eq!(by_key(&b, "fix:PYKLA")["title"], "Final Approach Fix");
    let faf = by_key(&b, "fix:PYKLA")["lines"].clone();
    assert!(faf.as_array().unwrap().contains(&json!("Cross at or above 3,300 ft")));
    assert!(faf.as_array().unwrap().contains(&json!("Descend on the 3.00° path from here")));
    assert_eq!(by_key(&b, "frequencies")["lines"], json!(["ATIS 124.1", "Approach 125.0", "Tower 118.3"]));
    assert_eq!(by_key(&b, "course")["lines"], json!(["093° magnetic", "Glidepath 3.00°"]));
    // The minimums are never the coded data's: the plate's.
    assert_eq!(by_key(&b, "minimums")["lines"], json!(["DA: see the plate"]));
    assert_eq!(by_key(&b, "map")["lines"][0], "At the decision altitude on the glidepath");
    assert!(by_key(&b, "missed")["lines"][0].as_str().unwrap().starts_with("Climb to 3,000 on course 093°"));
    // Each shows its fix or its part on the map.
    assert_eq!(by_key(&b, "fix:DL")["focus"], json!({"fix": "DL", "segment": null}));
    assert_eq!(by_key(&b, "missed")["focus"], json!({"fix": null, "segment": "missed"}));
}
