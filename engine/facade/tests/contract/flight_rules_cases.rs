use super::*;

/// Lost communications, traffic, flight rules, data cycles and the planner's rules.
pub(super) fn cases(c: &mut Checker) {
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
        c.ask(
            "wind_triangle",
            json!({ "tc": case["tc"], "tas": case["tas"], "wind_from_deg": case["windFrom"], "wind_kt": case["windKt"] }),
        );
    }
    for case in rules["densityAltitude"].as_array().unwrap() {
        c.ask("gonogo_density_altitude", json!({ "pressure_alt_ft": case["pressureAltitudeFt"], "temp_c": case["oatC"] }));
    }
    for case in rules["declination"].as_array().unwrap() {
        c.ask("magnetic_variation", json!({ "lat": case["lat"], "lon": case["lon"], "date": "2026-07-01" }));
    }
    for case in fixture("dataCycles.json")["cases"].as_array().unwrap() {
        c.ask("data_cycle", json!({ "kind": case["kind"], "effective": case["effective"], "on": case["on"] }));
    }
    for case in rules["weatherInForce"].as_array().unwrap() {
        let at = |k: &str| case.get(k).cloned().unwrap_or(Value::Null);
        c.ask(
            "weather_in_force",
            json!({ "product": case["product"], "now": case["now"], "observed": at("observed"),
            "last_routine": at("lastRoutine"), "valid_from": at("validFrom"), "valid_to": at("validTo") }),
        );
        c.ask(
            "weather_expires_at",
            json!({ "product": case["product"], "observed": at("observed"),
            "last_routine": at("lastRoutine"), "valid_to": at("validTo") }),
        );
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
        c.ask(
            "gonogo_hazard_window",
            json!({ "enter": case["enter"], "leave": case["leave"], "valid_from": case["valid_from"], "valid_to": case["valid_to"] }),
        );
    }
    for case in planner["ceiling"].as_array().unwrap() {
        c.ask("ceiling_ft", json!({ "layers": case["layers"], "vert_vis_ft": case["vert_vis_ft"] }));
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
}
