use super::*;

/// The pilot's records, the filing form, altitudes and holds.
pub(super) fn cases(c: &mut Checker) {
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
        c.ask(
            "pilot_currency",
            json!({ "entries": case["entries"], "today": case["today"], "flight_review_on": at("flightReviewOn"),
            "medical_expires_on": at("medicalExpiresOn"), "ipc_on": at("ipcOn"), "flying": at("flying") }),
        );
    }
    for case in currency["experience"].as_array().unwrap() {
        c.ask("pilot_experience", json!({ "entries": case["entries"], "today": case["today"] }));
    }
    let track = fixture("logbookTrack.json");
    c.ask("logbook_track_places", json!({ "points": track["points"] }));
    c.ask(
        "logbook_from_track",
        json!({ "points": track["points"], "fields": track["fields"], "drawings": track["drawings"],
        "picked": track["picked"], "aircraft": track["aircraft"], "aircraft_type": track["aircraft_type"],
        "utc_offset_min": track["utc_offset_min"] }),
    );

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
    // The FAA airmen registry's check of the instructor signing, each
    // verdict of the shared fixture held to its answer too.
    for case in fixture("instructorVerification.json")["cases"].as_array().unwrap() {
        let got = c.ask("instructor_verification", case["input"].clone());
        let want = (&case["verified"], &case["reason"], &case["registry_id"]);
        assert_eq!((&got["verified"], &got["reason"], &got["registry_id"]), want, "{}", case["name"]);
    }
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
}
