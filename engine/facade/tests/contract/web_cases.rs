use super::*;

/// The web's rules moved into the engine, planning, forecasts, the copilot and documents.
pub(super) fn cases(c: &mut Checker) {
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
    c.ask("checklist_phases", json!({ "kind": "normal" }));
    c.ask("checklist_phases", json!({ "kind": "emergency" }));
    // A procedure's legs drawn (paths.rs), as the planner asks them.
    c.ask("procedure_arc", json!({ "center": [34.0, -118.0], "start": [34.08, -118.0], "end": [34.0, -117.9], "turn": "R" }));
    c.ask("procedure_hold", json!({ "fix": [34.2, -118.36], "inbound_deg": 80, "turn": "L", "leg_nm": 2 }));
    c.ask("procedure_turn", json!({ "fix": [33.2, -92.8], "inbound_deg": 220, "pt_course_deg": 355 }));
    c.ask("procedure_hold_leg_nm", json!({ "minutes": null, "distance_nm": 4 }));

    // Night, the checkpoints and 91.155's basic minimums (planning.json).
    let planning = fixture("planning.json");
    for case in planning["on_the_way"].as_array().unwrap() {
        c.ask(
            "night_on_the_way",
            json!({ "start": case["start"], "end": case["end"], "depart_s": case["depart_s"], "minutes": case["minutes"] }),
        );
    }
    c.ask(
        "passenger_night_on_the_way",
        json!({ "start": [61.22, -149.9], "end": [60.57, -151.25], "depart_s": 1782118800, "minutes": 40 }),
    );
    // 91.209(a)'s lights: from sunset, before 1.1's night (sun.rs).
    c.ask("lights_on_the_way", json!({ "start": [41.88, -87.63], "end": [41.88, -87.63], "depart_s": 1774050600, "minutes": 30 }));
    c.ask(
        "lights_on_the_way",
        json!({ "start": [61.22, -149.9], "end": [60.57, -151.25], "depart_s": 1782079200, "minutes": 40, "alaska_visibility_sm": 2.5 }),
    );
    c.ask(
        "night_at_either_end",
        json!({ "start": [41.88, -87.63], "depart_s": 1790096400, "end": [41.88, -87.63], "arrive_s": 1790100000 }),
    );
    c.ask(
        "checkpoints_select",
        json!({ "candidates": [{ "along_track_nm": 0, "predicted_score": 3.0 }, { "along_track_nm": 30, "predicted_score": null }],
        "min_spacing_nm": 10, "min_score": null, "length_nm": 40 }),
    );
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

    // A photographed page's figures checked (documents.json).
    let documents = fixture("documents.json");
    for case in documents["handbook"].as_array().unwrap() {
        c.ask("handbook_read_check", case["input"].clone());
    }
    for case in documents["logbook"].as_array().unwrap() {
        c.ask("logbook_read_check", case["input"].clone());
    }
}
