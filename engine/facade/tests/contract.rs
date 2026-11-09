//! The engine against its contract (engine/contract/engine.schema.json),
//! the one statement of every call's input and answer that the web's types
//! (apps/web/src/lib/engine/contract.ts) are generated from: every name the
//! engine dispatches has its entry there and no other does, and the answers
//! to the shared fixtures (apps/web/src/lib/fixtures), asked as the hosts ask,
//! are of the shapes it gives. A member renamed in Rust then fails here,
//! not on the phone.

mod common;

use serde_json::{json, Map, Value};
use std::collections::BTreeSet;
use std::path::PathBuf;
use wingtip_engine::call::call;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read_json(path: &str) -> Value {
    serde_json::from_str(&std::fs::read_to_string(root().join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap()
}

fn contract() -> Value {
    read_json("engine/contract/engine.schema.json")
}

fn fixture(name: &str) -> Value {
    read_json(&format!("apps/web/src/lib/fixtures/{name}"))
}

fn schema_names() -> BTreeSet<String> {
    contract()["properties"].as_object().unwrap().keys().cloned().collect()
}

/// The names in a module's `NAMES` list.
fn names_const(src: &str) -> BTreeSet<String> {
    let start = src.find("pub const NAMES").expect("a NAMES list");
    // Past the type's `[&str; n]`, from the `=` to the list's end.
    let open = start + src[start..].find('=').unwrap();
    let list = &src[open..open + src[open..].find("];").unwrap()];
    quoted(list)
}

/// The string literals in `text`.
fn quoted(text: &str) -> BTreeSet<String> {
    text.split('"').skip(1).step_by(2).map(str::to_owned).collect()
}

/// The names a dispatching `fn` matches on: its arms that are only string
/// literals, alone or joined by `|`, before `=>` (or running on to the
/// next line, as call.rs lists the runway rules).
fn arms(src: &str, start: &str) -> BTreeSet<String> {
    let at = src.find(start).unwrap_or_else(|| panic!("no {start:?}"));
    let body = &src[at..at + src[at..].find("\n}\n").unwrap()];
    let mut out = BTreeSet::new();
    for line in body.lines() {
        let pattern = line.split("=>").next().unwrap().trim().trim_start_matches('|').trim();
        let pieces: Vec<&str> = pattern.split('|').map(str::trim).filter(|p| !p.is_empty()).collect();
        let literal = |p: &&str| p.len() > 2 && p.starts_with('"') && p.ends_with('"') && p[1..p.len() - 1].chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
        if !pieces.is_empty() && pieces.iter().all(literal) {
            out.extend(pieces.iter().map(|p| p[1..p.len() - 1].to_owned()));
        }
    }
    out
}

/// Every name the engine answers, read from its source, not its doc: the
/// arms of call.rs's `call`, of motion's and the Go / No-Go's (which have no
/// list), and the NAMES of the modules call.rs asks by them.
fn code_names() -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    names.extend(arms(include_str!("../src/call.rs"), "pub fn call("));
    names.extend(arms(include_str!("../../crates/route/src/motion/mod.rs"), "pub fn call("));
    names.extend(arms(include_str!("../../crates/brief/src/gonogo/calls.rs"), "pub fn call("));
    for src in [
        include_str!("../../crates/wording/src/wording/mod.rs"),
        include_str!("../../crates/airspace/src/drills.rs"),
        include_str!("../../crates/airspace/src/ahead.rs"),
        include_str!("../../crates/pilot/src/pilot/records.rs"),
        include_str!("../../crates/pilot/src/pilot/kinds.rs"),
        include_str!("../../crates/brief/src/passengers.rs"),
        include_str!("../../crates/procedures/src/paths.rs"),
        include_str!("../../crates/weather/src/forecast/calls.rs"),
        include_str!("../../crates/weather/src/rvr.rs"),
        include_str!("../../crates/altitude/src/altitude/calls.rs"),
        include_str!("../../crates/brief/src/alternates.rs"),
        include_str!("../../crates/brief/src/fields/calls.rs"),
        include_str!("../../crates/radio/src/mayday.rs"),
        include_str!("../../crates/radio/src/atc.rs"),
        include_str!("../../crates/brief/src/icing_forecast.rs"),
        include_str!("../../crates/pilot/src/aircraft/calls.rs"),
        include_str!("../../crates/route/src/approach/calls.rs"),
        include_str!("../../crates/route/src/route/answers.rs"),
        include_str!("../../crates/route/src/navlog/calls.rs"),
        include_str!("../../crates/route/src/route/options.rs"),
        include_str!("../../crates/inflight/src/lib.rs"),
    ] {
        names.extend(names_const(src));
    }
    names
}

#[test]
fn every_name_dispatched_is_in_the_contract_and_no_other() {
    let code = code_names();
    let schema = schema_names();
    let missing: Vec<_> = code.difference(&schema).collect();
    let extra: Vec<_> = schema.difference(&code).collect();
    assert!(missing.is_empty(), "the engine answers these, and the contract has no entry for them: {missing:?}");
    assert!(extra.is_empty(), "the contract has these, and the engine dispatches no such name: {extra:?}");
    // The reading of the source finds real names: each is one the engine
    // knows (asked with nothing, it may refuse the input, never the name).
    for name in &code {
        if let Err(e) = call(name, "{}") {
            assert!(!e.contains("has no rule called"), "{name}: {e}");
        }
    }
    let required: BTreeSet<String> = contract()["required"].as_array().unwrap().iter().map(|n| n.as_str().unwrap().to_owned()).collect();
    assert_eq!(required, schema, "every name is required in the contract");
}

/// The contract with no name required, so one call at a time is checked
/// against it: `{name: {"input", "answer"}}`.
struct Checker {
    validator: jsonschema::Validator,
    checked: BTreeSet<String>,
}

impl Checker {
    fn new() -> Self {
        let mut schema = contract();
        schema["required"] = json!([]);
        Checker { validator: jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema"), checked: BTreeSet::new() }
    }

    /// The rule `name` asked `input`, the input and the answer held to the
    /// contract; the answer.
    fn ask(&mut self, name: &str, input: Value) -> Value {
        let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
        let answer: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name} answered {text}: {e}"));
        let mut asked = Map::new();
        asked.insert(name.to_owned(), json!({ "input": input, "answer": answer }));
        let asked = Value::Object(asked);
        let errors: Vec<String> = self.validator.iter_errors(&asked).map(|e| format!("{} at {}", e, e.instance_path)).collect();
        assert!(errors.is_empty(), "{name}: not of the contract's shape:\n{}\ninput {input}\nanswer {answer}", errors.join("\n"));
        self.checked.insert(name.to_owned());
        answer
    }
}

#[test]
fn the_shared_fixtures_answers_are_of_the_contracts_shapes() {
    let mut c = Checker::new();

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
        c.ask("atc_call", json!({ "text": case["heard"], "tail": atc["tail"], "prior": { "text": case["prior"], "ago_s": case["ago_s"] } }));
    }
    for case in atc["readbacks"].as_array().unwrap() {
        c.ask("readback_check", json!({ "cleared": case["cleared"], "said": case["said"], "tail": atc["tail"] }));
    }

    for case in fixture("checklist.json")["cases"].as_array().unwrap() {
        let read = c.ask("checklist_read", json!({ "text": case["text"] }));
        c.ask("checklist_write", json!({ "checklist": read }));
        c.ask("checklist_write", json!({ "checklist": case["checklist"] }));
    }

    let logbook = fixture("logbookCsv.json");
    for case in logbook["export"].as_array().unwrap() {
        c.ask("logbook_csv_write", json!({ "entries": case["entries"] }));
        c.ask("csv_rows", json!({ "text": case["csv"] }));
    }
    for case in logbook["import"].as_array().unwrap() {
        c.ask("logbook_csv_read", json!({ "text": case["text"] }));
    }

    let currency = fixture("currency.json");
    for case in currency["currency"].as_array().unwrap() {
        let at = |k: &str| case.get(k).cloned().unwrap_or(Value::Null);
        c.ask("pilot_currency", json!({ "entries": case["entries"], "today": case["today"], "flight_review_on": at("flightReviewOn"),
            "medical_expires_on": at("medicalExpiresOn"), "ipc_on": at("ipcOn") }));
    }
    for case in currency["experience"].as_array().unwrap() {
        c.ask("pilot_experience", json!({ "entries": case["entries"], "today": case["today"] }));
    }

    c.ask("drill_decks", json!({}));
    let altitudes = fixture("altitudes.json");
    for case in altitudes["minimums"].as_array().unwrap() {
        c.ask("vfr_minimums", json!({ "class": case["class"], "altitude_ft": case["altitude_ft"], "agl_ft": case.get("agl_ft") }));
    }
    for case in altitudes["limits"].as_array().unwrap() {
        c.ask("altitude_limits", json!({ "ifr": case["ifr"] }));
    }
    for case in altitudes["allowed"].as_array().unwrap() {
        c.ask("altitude_allowed", json!({ "ft": case["ft"], "ifr": case["ifr"] }));
        c.ask("altitude_said", json!({ "ft": case["ft"] }));
        c.ask("filed_level", json!({ "ft": case["ft"] }));
    }
    c.ask("vfr_altitudes", json!({ "from_ft": altitudes["wheel"]["from_ft"] }));
    let filing = fixture("filingForm.json");
    for case in filing["cruisingSpeed"].as_array().unwrap() {
        c.ask("filed_speed", json!({ "tas_kt": case["tasKt"] }));
    }
    for case in filing["hhmm"].as_array().unwrap() {
        c.ask("filed_duration", json!({ "minutes": case["minutes"] }));
    }
    for case in filing["route"].as_array().unwrap() {
        c.ask("filed_route", json!({ "stops": case["stops"], "airways": case["airways"] }));
    }
    c.ask("filed_zzzz", json!({ "ident": "C81" }));
    for case in filing["endurance"].as_array().unwrap() {
        c.ask("filed_endurance", json!({ "fuel_gal": case["fuelGal"], "burn_gph": case["burnGph"] }));
    }
    for case in filing["dateOfFlight"].as_array().unwrap() {
        c.ask("filed_dof", json!({ "depart": case["depart"], "today": case["today"] }));
    }
    for case in filing["rnav"].as_array().unwrap() {
        c.ask("filed_rnav", json!({ "airways": case["airways"] }));
    }
    let records = fixture("records.json");
    for case in records["endorsements"].as_array().unwrap() {
        c.ask("endorsement_records", case["input"].clone());
    }
    for case in records["inspections"].as_array().unwrap() {
        c.ask("inspections_due", case["input"].clone());
    }
    c.ask("planning_figures", json!({}));
    for case in records["vorLimits"].as_array().unwrap() {
        c.ask("vor_check_limit_deg", json!({ "kind": case["kind"] }));
    }
    for case in records["workings"].as_array().unwrap() {
        c.ask("workings_right", json!({ "key": case["key"], "typed": case["typed"], "answer": case["answer"] }));
    }
    for case in records["fills"].as_array().unwrap() {
        c.ask("endorsement_fill", case["input"].clone());
    }
    c.ask("endorsement_kinds", json!({}));
    for case in fixture("routePosition.json")["cases"].as_array().unwrap() {
        c.ask("route_position", case["input"].clone());
    }
    c.ask("filed_wake", json!({ "max_takeoff_lb": 2550 }));

    let holds = fixture("holds.json");
    for case in holds["parse"].as_array().unwrap() {
        let read = c.ask("hold_read", json!({ "text": case["text"] }));
        c.ask("holds_read", json!({ "text": case["text"] }));
        if !read.is_null() {
            c.ask("hold_write", json!({ "hold": read }));
            c.ask("hold_figures", json!({ "hold": read, "tas_kt": 100 }));
        }
    }
    for case in holds["legMinutes"].as_array().unwrap() {
        c.ask("holding_leg_minutes", json!({ "altitude_ft": case["altitudeFt"] }));
    }

    for case in fixture("lostComms.json")["leaveLimit"].as_array().unwrap() {
        c.ask(
            "lost_comms",
            json!({
                "segments": [{ "name": "V97", "minimum_ft": 4000 }, { "name": "V82", "minimum_ft": 6000 }],
                "assigned_ft": 5000,
                "expected_ft": 7000,
                "expected_from": 1,
                "approach_fix": case["approachFix"],
                "efc": case["efc"],
                "eta": case["eta"],
            }),
        );
    }

    for case in fixture("traffic.json")["cases"].as_array().unwrap() {
        c.ask("traffic_marks", json!({ "own_ft": case["ownFt"], "planes": [case["plane"]] }));
    }

    let rules = fixture("flightRules.json");
    for case in rules["windTriangle"].as_array().unwrap() {
        c.ask("wind_triangle", json!({ "tc": case["tc"], "tas": case["tas"], "wind_from_deg": case["windFrom"], "wind_kt": case["windKt"] }));
    }
    for case in rules["densityAltitude"].as_array().unwrap() {
        c.ask("gonogo_density_altitude", json!({ "pressure_alt_ft": case["pressureAltitudeFt"], "temp_c": case["oatC"] }));
    }
    for case in rules["pressureAltitude"].as_array().unwrap() {
        c.ask("gonogo_field_air", json!({ "elevation_ft": case["elevationFt"], "altimeter_in_hg": case["altimeterInHg"], "temp_c": 15 }));
    }
    for case in rules["declination"].as_array().unwrap() {
        c.ask("magnetic_variation", json!({ "lat": case["lat"], "lon": case["lon"], "date": "2026-07-01" }));
    }
    for case in fixture("dataCycles.json")["cases"].as_array().unwrap() {
        c.ask("data_cycle", json!({ "kind": case["kind"], "effective": case["effective"], "on": case["on"] }));
    }
    for case in rules["weatherInForce"].as_array().unwrap() {
        let at = |k: &str| case.get(k).cloned().unwrap_or(Value::Null);
        c.ask("weather_in_force", json!({ "product": case["product"], "now": case["now"], "observed": at("observed"),
            "last_routine": at("lastRoutine"), "valid_from": at("validFrom"), "valid_to": at("validTo") }));
        c.ask("weather_expires_at", json!({ "product": case["product"], "observed": at("observed"),
            "last_routine": at("lastRoutine"), "valid_to": at("validTo") }));
    }
    for case in fixture("dataCycles.json")["cases"].as_array().unwrap() {
        c.ask("data_cycle", json!({ "kind": case["kind"], "effective": case["effective"], "on": case["on"] }));
    }

    // The planner's rules moved in (#482 phase 0).
    let planner = fixture("plannerRules.json");
    for case in planner["airspaceColumn"].as_array().unwrap() {
        c.ask("airspace_column", json!({ "ground_ft": case["ground_ft"], "volumes": case["volumes"], "in_veil": case["in_veil"] }));
    }
    for case in planner["modeCVeil"].as_array().unwrap() {
        c.ask("mode_c_veil", json!({ "lat": case["lat"], "lon": case["lon"], "airports": case["airports"] }));
    }
    for case in planner["notamsFns"].as_array().unwrap() {
        c.ask("notams_fns", json!({ "text": case["text"] }));
    }
    for case in planner["hazardWindow"].as_array().unwrap() {
        c.ask("gonogo_hazard_window", json!({ "enter": case["enter"], "leave": case["leave"], "valid_from": case["valid_from"], "valid_to": case["valid_to"] }));
    }
    for case in planner["ceiling"].as_array().unwrap() {
        c.ask("ceiling_ft", json!({ "layers": case["layers"], "vert_vis_ft": case["vert_vis_ft"] }));
        c.ask("sky_ceiling", json!({ "layers": case["layers"], "vert_vis_ft": case["vert_vis_ft"] }));
    }
    c.ask("sky_ceiling", json!({ "layers": [{ "cover": "OVC", "base_ft": null }], "vert_vis_ft": null }));
    c.ask("report_flight_category", json!({ "ceiling_ft": null, "ceiling_unknown": true, "visibility_sm": 10 }));
    for case in planner["reportCategory"].as_array().unwrap() {
        c.ask("report_flight_category", json!({ "ceiling_ft": case["ceiling_ft"], "visibility_sm": case["visibility_sm"] }));
    }
    for case in planner["words"].as_array().unwrap() {
        let n = &case["n"];
        c.ask("words_num", json!({ "n": n }));
        c.ask("words_alt_ft", json!({ "ft": n }));
        c.ask("words_flight_level", json!({ "ft": n }));
        c.ask("words_ceiling_and_visibility", json!({ "ceiling_ft": n, "visibility_sm": 3 }));
        if !n.is_null() {
            c.ask("words_one", json!({ "n": n }));
            c.ask("words_to_fixed", json!({ "n": n, "digits": 2 }));
            c.ask("words_grouped", json!({ "n": n }));
        }
    }
    c.ask("notam_text", json!({ "text": "!ORD 10/709 ORD RWY 04L/22R CLSD EXC TAX 2610191016-2610201100EST" }));
    c.ask("notam_text", json!({ "text": "not a notam" }));
    c.ask("metar_read", json!({ "raw": "METAR KDLH 021355Z 27012G20KT 10SM BKN008 OVC015 M02/M05 A2992" }));
    c.ask("metar_read", json!({ "raw": "nothing" }));
    c.ask("taf_read", json!({ "raw": "TAF KDLH 021130Z 0212/0312 27012KT P6SM BKN030", "near": 1_793_000_000 }));
    c.ask("vfr_basic_minimums", json!({}));
    c.ask("reserve_min", json!({ "ifr": false, "night": true }));
    c.ask("isa_temp_c", json!({ "altitude_ft": 4500 }));
    c.ask("density_ratio", json!({ "altitude_ft": 4500, "oat_c": 25 }));
    c.ask("density_altitude_ft", json!({ "sigma": 0.85 }));
    c.ask("pressure_altitude_ft", json!({ "elevation_ft": 1200, "altimeter_inhg": 30.12 }));
    c.ask("is_eastbound", json!({ "magnetic_course_deg": 95 }));
    c.ask("lowest_vfr_cruising_altitude", json!({ "floor_ft": 3200, "magnetic_course_deg": 270 }));
    c.ask("distance_nm", json!({ "lat1": 46.84, "lon1": -92.19, "lat2": 38.75, "lon2": -90.37 }));
    c.ask("region_of", json!({ "lat": 41.9, "lon": -87.9 }));
    c.ask("descent_ft_per_nm", json!({}));
    // The altitude rules (crate::altitude), on the shared fixture and a
    // small route of the planner's select_cruise_altitude.
    let altitude = fixture("altitude.json");
    for case in altitude["legal"].as_array().unwrap() {
        c.ask("legal_cruising_altitudes", case["input"].clone());
    }
    for case in altitude["tight"].as_array().unwrap() {
        c.ask("tight_cruising_altitude", case["input"].clone());
    }
    for case in altitude["anyway"].as_array().unwrap() {
        c.ask("altitude_anyway", json!({ "selection": case["selection"] }));
    }
    for case in altitude["noAltitude"].as_array().unwrap() {
        c.ask("no_altitude", case["input"].clone());
    }
    c.ask("highest_under_clouds_ft", json!({ "cloud_base_ft": 6000 }));
    c.ask("cloud_clearance_at_ft", json!({ "altitude_ft": 10500 }));
    c.ask("altitude_wheel", json!({ "legal_ft": [4500, 6500], "flown_ft": 3300 }));
    c.ask("ifr_obstacle_radius_nm", json!({}));
    c.ask("airway_floor_ft", json!({ "mea_ft": null, "gnss_mea_ft": 4000 }));
    c.ask("mountainous_at", json!({ "lat": 39.74, "lon": -105.0 }));
    c.ask("altitude_blocked", json!({ "altitude_ft": 4500, "areas": [{ "type": "P", "floor_ft": 0, "ceiling_ft": 18000, "ceiling_ref": "MSL" }] }));
    let (dep, mid, dest) = (json!([45.0, -90.0]), json!([45.5, -89.85]), json!([46.0, -90.0]));
    let floors = c.ask("vfr_floors", json!({
        "start": dep, "end": dest, "breaks_nm": [0.0, 30.0, 60.0],
        "ground": { "along_nm": [0.0, 15.0, 30.0, 45.0, 60.0], "high_ft": [900, 1000, 1100, 1000, 900], "low_ft": [800, 900, 1000, 900, 800], "congested": [false, false, true, false, false] },
        "obstacles": [{ "lat": 45.25, "lon": -90.01, "amsl_ft": 2049, "type": "TOWER", "congested": false }],
    }));
    c.ask("ifr_floors", json!({ "legs": [{ "a": dep, "b": mid, "ground_ft": 1150 }], "obstacles": [{ "lat": 45.25, "lon": -89.95, "amsl_ft": 2049 }] }));
    c.ask("select_cruise_altitude", json!({
        "start": dep, "end": dest, "fixes": [dep, mid, dest], "breaks_nm": [0.0, 30.0, 60.0],
        "floors": floors, "airspace_ceilings_ft": [null, 3000], "service_ceilings_ft": [14000, 14000],
        "variation_deg": 0, "leg_variations_deg": [0, 0],
        "stations": [{ "icaoId": "KXYZ", "lat": 45.5, "lon": -90.0, "ceiling_ft": 2200, "elevation_ft": 900 }],
        "min_ceiling_ft": 2200, "special_use": [], "freezing": { "ft": 4000, "at_or_below": false }, "hazards": [], "weather_unavailable": [],
    }));
    // The names that replaced wingtip_native's own functions (#482 phase 0).
    c.ask("wind_correction_deg", json!({ "true_course_deg": 360, "wind_from_deg": 270, "wind_kt": 20, "tas_kt": 110 }));
    c.ask("groundspeed_kt", json!({ "true_course_deg": 360, "wind_from_deg": 270, "wind_kt": 20, "tas_kt": 110, "wca_deg": -10.5 }));
    c.ask("hold_entry", json!({ "arrival_deg": 150, "inbound_deg": 360 }));
    c.ask("hold_entry", json!({ "arrival_deg": 150, "inbound_deg": 360, "turns": "left" }));
    c.ask("magnetic_variation", json!({ "lat": 46.84, "lon": -92.19, "year": 2026.5 }));
    let debriefed = call("debrief_marked", &json!({ "debrief": {
        "legs": [{ "from": "A", "to": "B", "worst_alt_ft": 150, "worst_off_nm": 1.2 }],
        "passes": [{ "name": "B", "category": "destination", "due_min": 18, "passed_min": 21 }],
        "patterns": [{ "ident": "B", "alt_ft": 1800, "pattern_ft": 1700 }],
        "notes": [],
    } }).to_string()).unwrap();
    let debriefed: Value = serde_json::from_str(&debriefed).unwrap();
    // PA.VI.A's tolerances: 200 ft held, a pattern within 100 ft (PA.III.B.S5).
    assert_eq!(debriefed["debrief"]["legs"][0]["ok"], json!(true));
    assert_eq!(debriefed["debrief"]["patterns"][0]["ok"], json!(true));
    assert_eq!(debriefed["tolerances"]["altitude_ft"], json!(200.0));
    c.ask("debrief_marked", json!({ "debrief": { "legs": [], "passes": [], "patterns": [] } }));

    // The approaches at KBUR, as the planner's /api/procedure draws them.
    let kbur = fixture("approachKbur.json");
    for (id, drawing) in kbur.as_object().unwrap() {
        c.ask("approach_guidance", json!({ "id": drawing["id"] }));
        c.ask("approach_profile", json!({ "drawing": drawing }));
        c.ask("approach_brief", json!({ "drawing": drawing, "vref_kt": 65, "vso_kt": 48 }));
        c.ask("approach_coaching", json!({ "drawing": drawing, "gs_kt": 90 }));
        c.ask("approach_quiz", json!({ "drawing": drawing, "gs_kt": 90 }));
        c.ask("approach_missed_words", json!({ "legs": drawing["missed_legs"] }));
        c.ask("approach_minimums_kind", json!({ "name": drawing["name"] }));
        let path = c.ask("approach_lesson_path", json!({ "drawing": drawing }));
        assert!(path.is_array(), "{id}");
    }

    // The nav log (#482 phase 4), on the first recorded route the
    // planner's golden test replays (services/planner/tests_wingtip/golden).
    let golden = read_json("services/planner/tests_wingtip/golden/KUGN-KRFD.json");
    let given = &golden["given"];
    let fixes = given["fixes"].as_array().unwrap();
    let profile = &given["profile"];
    let candidates = c.ask("navlog_candidates", json!({ "segments": given["segments"], "legs": fixes.len() - 1, "profile": profile }));
    let air: Vec<Value> = candidates
        .as_array()
        .unwrap()
        .iter()
        .map(|options| {
            let at: Vec<Value> = options.as_array().unwrap().iter().map(|a| json!({ "altitude_ft": a, "wind": { "wind_dir_true_deg": 270, "wind_speed_kt": 15 }, "oat_c": null })).collect();
            json!({ "variation_deg": -3.0, "at": at })
        })
        .collect();
    let plans_in = json!({ "fixes": fixes, "segments": given["segments"], "profile": profile, "departure_elevation_ft": given["departure_elevation_ft"], "air": air });
    let made = c.ask("navlog_plans", plans_in.clone());
    let target = made["by_altitude"][0]["altitude_ft"].clone();
    let mut at_in = plans_in.clone();
    at_in["target_ft"] = target;
    c.ask("navlog_legs_at", at_in);
    let legs = made["plans"]["fastest"]["legs"].clone();
    c.ask("navlog_with_descents", json!({ "legs": legs, "fixes": fixes, "end_altitude_ft": given["pattern_ft"] }));
    c.ask("navlog_with_climbs", json!({ "legs": legs, "start_altitude_ft": 800, "profile": profile }));
    let totals = c.ask("navlog_totals", json!({ "legs": legs }));
    c.ask("navlog_fuel_plan", json!({ "total_fuel_gal": totals["fuel_gal"], "profile": profile, "night": null, "rules": "ifr", "alternate_gal": 2.5 }));
    let one = c.ask("navlog_legs", json!({ "fixes": [fixes[0], fixes[1]], "altitude_ft": air[0]["at"][0]["altitude_ft"], "profile": profile, "air": [air[0]] }));
    c.ask("navlog_leg", json!({ "start": fixes[0], "end": fixes[1], "altitude_ft": 5500, "profile": profile, "wind": null, "oat_c": 10, "variation_deg": -3.0 }));
    c.ask("navlog_alternate_leg", json!({ "dest": { "ident": "KRFD", "lat": 42.195, "lon": -89.097 }, "alternate": { "ident": "KDKB", "lat": 41.934, "lon": -88.706 },
        "altitude_ft": 3500, "profile": profile, "air": null }));
    c.ask("navlog_hold", json!({ "leg": one[0], "before": one[0], "hold": { "fix": "KUGN", "inbound": 90, "right": true, "leg_min": 1, "leg_nm": null, "turns": 2, "minutes": null },
        "fix": fixes[0], "variation_deg": -3.0, "at_end": false }));
    c.ask("navlog_racetrack", json!({ "fix": fixes[0], "inbound_true_deg": 87, "tas_kt": 110, "leg_nm": 2 }));
    let options: Vec<Value> = made["plans"].as_object().unwrap().iter().map(|(k, p)| { let mut p = p.clone(); p["kind"] = json!(k); p }).collect();
    c.ask("navlog_join_plans", json!({ "by_hop": [options.clone(), options], "lengths": [40, 60] }));
    c.ask("navlog_join_figures", json!({ "by_hop": [made["by_altitude"], []], "lengths": [40, 60] }));
    let approach = json!([{ "ident": "ANDOE", "lat": 42.25, "lon": -89.1, "min_ft": 3000, "max_ft": null, "missed": false }]);
    c.ask("navlog_approach_end", json!({ "fixes": approach, "cruise_ft": 5500, "field": { "lat": 42.195, "lon": -89.097 } }));
    c.ask("navlog_approach_end", json!({ "fixes": approach, "cruise_ft": 2500, "field": { "lat": 42.195, "lon": -89.097 } }));
    c.ask("performance_cruise", json!({ "profile": profile, "altitude_ft": 8500, "oat_c": 2 }));
    c.ask("performance_climb", json!({ "profile": profile, "from_ft": 800, "to_ft": 5500, "isa_dev_c": 5 }));
    // Route options, its frame, the way round high ground and a point
    // named off a fix.
    let routes = fixture("routeOptions.json");
    for (name, case) in routes.as_object().unwrap() {
        if name.starts_with('_') {
            continue;
        }
        c.ask("route_options_frame", case["input"].clone());
        c.ask("route_options", case["input"].clone());
    }
    let terrain = json!({ "start": [0.0, 0.0], "end": [0.0, 3.0], "ceiling_ft": 10950 });
    let frame = c.ask("terrain_way_frame", terrain.clone());
    let samples = frame["rows"].as_u64().unwrap() * frame["cols"].as_u64().unwrap() * 25;
    let mut round = terrain.clone();
    round["terrain_ft"] = json!(vec![500; samples as usize]);
    round["fields"] = json!([{ "ident": "A", "name": "A FIELD", "lat": 0.0, "lon": 1.5 }]);
    c.ask("terrain_way_round", round);
    let fixes = json!([{ "ident": "ABC", "lat": 0.0, "lon": 0.0, "navaid": true, "kind": "VOR", "mag_var": 0.0 }]);
    c.ask("frd_near", json!({ "lat": 0.0, "lon": 0.5, "now_s": 1793000000, "fixes": fixes }));
    c.ask("frd_near", json!({ "lat": 10.0, "lon": 10.0, "now_s": 1793000000, "fixes": fixes }));
    let fields = json!([
        { "ident": "ONLINE", "faa_ident": "ONLINE", "name": "ONLINE FIELD", "city": "SOMEWHERE", "lat": 0.0, "lon": 5.0,
          "elevation_ft": 500.0, "fuel_types": "100LL,A", "runway_ft": 5000 },
        { "ident": "OFFLINE", "name": "OFFLINE FIELD", "lat": 0.3, "lon": 5.0, "elevation_ft": null, "fuel_types": "100LL",
          "runway_ft": 5000 },
    ]);
    let stops = c.ask("fuel_stops", json!({ "start": [0.0, 0.0], "end": [0.0, 10.0], "fuel_per_nm": 0.1, "min_per_nm": 0.6,
        "usable_gal": 40.0, "taxi_gal": 1.0, "reserve_gal": 5.0, "fields": fields }));
    assert_eq!(stops["stops"][0]["ident"], "ONLINE");
    let along = c.ask("fields_along", json!({ "flights": [{ "departure": "A", "start": [0.0, 0.0], "end": [0.0, 10.0] }],
        "skip": ["A"], "fields": fields }));
    assert_eq!(along[0]["fuel_types"], json!(["100LL", "A"]));
    let shelves = json!([{ "floor_ft_msl": 0, "ceiling_ft_msl": 10000,
        "rings": [[[0.4, -0.1], [0.4, 0.1], [0.6, 0.1], [0.6, -0.1]]] }]);
    assert_eq!(c.ask("class_b_entered", json!({ "start": [0.0, 0.0], "end": [1.0, 0.0], "altitude_ft": 4500, "shelves": shelves })), json!(true));
    let ways = c.ask("class_b_detours", json!({ "start": [0.0, 0.0], "end": [1.0, 0.0], "below_ft": 4500, "shelves": shelves,
        "fixes": [{ "ident": "VPNEAR", "lat": 0.5, "lon": -0.2, "vfr": true, "kind": "VFR waypoint" }] }));
    assert_eq!(ways[0]["ident"], "VPNEAR");
    // The instruments in flight and own ship on an airport diagram (#218),
    // on a route from Duluth east and north.
    let line = json!([[46.84, -92.19], [46.84, -91.5], [47.2, -91.5]]);
    let points = json!([{ "name": "KDLH", "lat": 46.84, "lon": -92.19 }, { "name": "TURN", "lat": 46.84, "lon": -91.5 },
        { "name": "KTWM", "lat": 47.2, "lon": -91.5 }]);
    let flying = c.ask("in_flight", json!({ "fix": { "lat": 46.85, "lon": -91.8, "track_deg": 92, "speed_kt": 115 }, "line": line,
        "points": points, "legs": [{ "distance_nm": 28.3, "fuel_gal": 3.1 }, { "distance_nm": 21.6, "fuel_gal": 2.2 }],
        "fuel_start_gal": 40, "now_s": 1_793_620_000 }));
    assert_eq!(flying["next"]["name"], json!("TURN"));
    c.ask("in_flight", json!({ "fix": { "lat": 46.85, "lon": -91.8 }, "line": [], "points": [] }));
    c.ask("vertical_speed", json!({ "samples": [{ "t_s": 0, "altitude_ft": 3000 }, { "t_s": 5, "altitude_ft": 3040 }, { "t_s": 10, "altitude_ft": 3080 }] }));
    c.ask("glide_ring", json!({ "lat": 46.85, "lon": -91.8, "altitude_ft": 5500, "speed_kt": 115, "terrain_ft": 1400, "field_ft": 1428 }));
    c.ask("glide_ring", json!({ "lat": 46.85, "lon": -91.8, "speed_kt": 115 }));
    c.ask("diagram_labels", json!({ "text": "46°51'N 46°50'N 92°13'W ELEV 1428" }));
    let graticule = c.ask("diagram_graticule", json!({ "labels": [
        { "text": "46°51'N", "x": 69.3, "y": 77.2 }, { "text": "46°50'N", "x": 296.6, "y": 76.6 },
        { "text": "92°13'W", "x": 363.8, "y": 486.0 }, { "text": "92°12'W", "x": 362.7, "y": 328.2 }] }));
    c.ask("diagram_point", json!({ "graticule": graticule, "lat": 46.84, "lon": -92.2, "width": 387.36, "height": 594 }));
    c.ask("diagram_graticule", json!({ "labels": [] }));

    // A pilot's own altitude's cautions and the IFR alternate (#482 phase 1).
    let cautions = fixture("cautions.json");
    for case in cautions["own_altitude"].as_array().unwrap() {
        c.ask("own_altitude_caution", json!({ "selection": case["selection"], "legs": case["legs"], "between": case["between"], "profile": case.get("profile") }));
    }
    for case in cautions["floor"].as_array().unwrap() {
        c.ask("floor_caution", json!({ "segment": case["segment"], "altitude_ft": case["altitude_ft"] }));
    }
    c.ask("oxygen_caution", json!({ "highest_ft": 15500, "profile": null }));
    c.ask("prohibited_caution", json!({ "selection": cautions["prohibited"][0]["selection"] }));
    for case in cautions["alternate_destination"].as_array().unwrap() {
        c.ask("ifr_alternate_destination", json!({ "ident": case["ident"], "approaches": case["approaches"], "forecast": case["forecast"] }));
    }
    let mut checks = Vec::new();
    for case in cautions["alternate_check"].as_array().unwrap() {
        let mut check = c.ask("ifr_alternate_check", json!({ "ident": case["ident"], "approaches": case["approaches"], "forecast": case["forecast"] }));
        check["distance_nm"] = json!(10.0);
        checks.push(check);
    }
    c.ask("ifr_alternates_ranked", json!({ "checks": checks, "limit": 5 }));
    // What is ahead of own ship (ahead.rs) and 91.119(b)'s congested areas.
    let own = json!({ "lat": 42.0, "lon": -88.0, "track_deg": 90.0, "gs_kt": 120.0, "alt_ft": 3000.0, "vs_fpm": 0.0 });
    let frame = c.ask("ahead_frame", own.clone());
    let mut given = own.clone();
    given["now"] = json!(1791655200);
    given["ground_ft"] = json!(800);
    given["airspace"] = json!([{ "name": "ROCKFORD CLASS C", "class": "C", "floor_ft": 0, "ceiling_ft": 5000,
        "polygons": [[[[-87.9, 41.97], [-87.8, 41.97], [-87.8, 42.03], [-87.9, 42.03], [-87.9, 41.97]]]] }]);
    given["special_use"] = json!([]);
    given["tfrs"] = json!([]);
    given["near_field"] = Value::Null;
    given["swath_ground_ft"] = json!(frame["lats"].as_array().unwrap().iter().map(|r| vec![800.0; r.as_array().unwrap().len()]).collect::<Vec<_>>());
    given["obstacles"] = json!([{ "lat": 42.0, "lon": -87.98, "amsl_ft": 2700, "type": "TOWER" }]);
    c.ask("alerts_ahead", given);
    c.ask("congested_points", json!({ "areas": [[[[[-90.0, 45.0], [-89.98, 45.0], [-89.98, 45.01], [-90.0, 45.01], [-90.0, 45.0]]]]],
        "points": [[45.005, -89.99], [46.0, -89.0]], "candidates": [[0], []] }));
    // The web's rules moved into the engine (webRules.json): a field's TAF,
    // the radio calls and a student's solo endorsement.
    let web = fixture("webRules.json");
    for case in web["fieldTaf"].as_array().unwrap() {
        c.ask("field_taf", case["input"].clone());
    }
    for case in web["callSign"].as_array().unwrap() {
        c.ask("radio_call_sign", json!({ "make": case["make"], "tail": case["tail"] }));
    }
    for case in web["placeName"].as_array().unwrap() {
        c.ask("radio_place_name", json!({ "name": case["name"], "ident": case["ident"] }));
    }
    c.ask("radio_script", web["radioScript"]["input"].clone());
    for case in web["soloStanding"].as_array().unwrap() {
        c.ask("solo_standing", json!({ "until": case["until"], "today": case["today"] }));
    }
    c.ask("passenger_briefing", json!({}));
    c.ask("solo_xc_determinations", json!({}));
    for case in web["diagramFix"].as_array().unwrap() {
        c.ask("diagram_fix_usable", json!({ "age_s": case["age_s"], "accuracy_m": case["accuracy_m"] }));
    }
    for case in web["terrainViewBands"].as_array().unwrap() {
        c.ask("terrain_view_bands", json!({ "altitude_ft": case["altitude_ft"] }));
    }
    c.ask("traffic_reach", json!({}));
    c.ask("checklist_phases", json!({ "kind": "normal" }));
    c.ask("checklist_phases", json!({ "kind": "emergency" }));
    // A procedure's legs drawn (paths.rs), as the planner asks them.
    c.ask("procedure_arc", json!({ "center": [34.0, -118.0], "start": [34.08, -118.0], "end": [34.0, -117.9], "turn": "R" }));
    c.ask("procedure_hold", json!({ "fix": [34.2, -118.36], "inbound_deg": 80, "turn": "L", "leg_nm": 2 }));
    c.ask("procedure_turn", json!({ "fix": [33.2, -92.8], "inbound_deg": 220, "pt_course_deg": 355 }));
    c.ask("procedure_climb_nm", json!({ "altitude_ft": 3000, "known_ft": 2600 }));
    c.ask("procedure_hold_leg_nm", json!({ "minutes": null, "distance_nm": 4 }));

    // Night, the checkpoints and 91.155's basic minimums (planning.json).
    let planning = fixture("planning.json");
    for case in planning["twilight"].as_array().unwrap() {
        c.ask("civil_twilight", json!({ "lat": case["lat"], "lon": case["lon"], "day_s": case["day_s"] }));
    }
    for case in planning["night"].as_array().unwrap() {
        c.ask("is_night", json!({ "lat": case["lat"], "lon": case["lon"], "at_s": case["at_s"] }));
    }
    for case in planning["on_the_way"].as_array().unwrap() {
        c.ask("night_on_the_way", json!({ "start": case["start"], "end": case["end"], "depart_s": case["depart_s"], "minutes": case["minutes"] }));
    }
    for case in planning["passenger_night"].as_array().unwrap() {
        c.ask("passenger_night", json!({ "lat": case["lat"], "lon": case["lon"], "at_s": case["at_s"] }));
    }
    c.ask("passenger_night_on_the_way", json!({ "start": [61.22, -149.9], "end": [60.57, -151.25], "depart_s": 1782118800, "minutes": 40 }));
    c.ask("night_at_either_end", json!({ "start": [41.88, -87.63], "depart_s": 1790096400, "end": [41.88, -87.63], "arrive_s": 1790100000 }));
    c.ask("checkpoints_select", json!({ "candidates": [{ "along_track_nm": 0, "predicted_score": 3.0 }, { "along_track_nm": 30, "predicted_score": null }],
        "min_spacing_nm": 10, "min_score": null, "length_nm": 40 }));
    c.ask("below_vfr_minimums", json!({ "ceiling_ft": 900, "visibility_sm": null }));
    c.ask("service_ceiling_on_the_day", json!({ "book_ft": 13500, "profile": [[3000, 10], [6000, 4]] }));

    // Forecast icing on an IFR route (icingForecast.json, #216).
    let icing = fixture("icingForecast.json");
    for case in icing["routes"].as_array().unwrap() {
        c.ask("icing_forecast_route", json!({ "levels_ft": icing["levels_ft"], "legs": case["legs"] }));
    }

    // The in-flight copilot (copilot.json).
    let copilot = fixture("copilot.json");
    for case in copilot["cases"].as_array().unwrap() {
        c.ask("copilot_watch", common::copilot_input(&copilot["base"], case));
    }

    // The emergency assistant (emergency.json).
    let emergency = fixture("emergency.json");
    let glide = emergency["lakeGeneva"]["input"].clone();
    c.ask("best_fields", glide.clone());
    let mut diversion = glide;
    diversion["mode"] = json!("diversion");
    diversion["airplane"] = Value::Null;
    c.ask("best_fields", diversion);
    c.ask("mayday_call", emergency["mayday"]["input"].clone());
    c.ask("mayday_call", json!({}));
    for case in emergency["sections"].as_array().unwrap() {
        c.ask("checklist_section", json!({ "titles": case["titles"], "want": case["want"] }));
    }

    // Every fixture above was asked, and these are the names it reaches:
    // a name dropped from it fails here rather than going unchecked.
    assert!(c.checked.len() >= 30, "only {} names were checked: {:?}", c.checked.len(), c.checked);
}
