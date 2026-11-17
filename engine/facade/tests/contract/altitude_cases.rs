use super::*;

/// The altitude rules, the debrief, the approaches and the nav log.
pub(super) fn cases(c: &mut Checker) {
    // The altitude rules (crate::altitude), on the shared fixture and a
    // small route of the planner's select_cruise_altitude.
    let altitude = fixture("altitude.json");
    for case in altitude["legal"].as_array().unwrap() {
        c.ask("legal_cruising_altitudes", case["input"].clone());
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
    let (dep, mid, dest) = (json!([45.0, -90.0]), json!([45.5, -89.85]), json!([46.0, -90.0]));
    let floors = c.ask("vfr_floors", json!({
        "start": dep, "end": dest, "breaks_nm": [0.0, 30.0, 60.0],
        "ground": { "along_nm": [0.0, 15.0, 30.0, 45.0, 60.0], "high_ft": [900, 1000, 1100, 1000, 900], "low_ft": [800, 900, 1000, 900, 800], "congested": [false, false, true, false, false] },
        "obstacles": [{ "lat": 45.25, "lon": -90.01, "amsl_ft": 2049, "type": "TOWER", "congested": false }],
    }));
    c.ask(
        "ifr_floors",
        json!({ "legs": [{ "a": dep, "b": mid, "ground_ft": 1150 }], "obstacles": [{ "lat": 45.25, "lon": -89.95, "amsl_ft": 2049 }] }),
    );
    c.ask("select_cruise_altitude", json!({
        "start": dep, "end": dest, "fixes": [dep, mid, dest], "breaks_nm": [0.0, 30.0, 60.0],
        "floors": floors, "airspace_ceilings_ft": [null, 3000], "service_ceilings_ft": [14000, 14000],
        "variation_deg": 0, "leg_variations_deg": [0, 0],
        "stations": [{ "icaoId": "KXYZ", "lat": 45.5, "lon": -90.0, "ceiling_ft": 2200, "elevation_ft": 900 }],
        "min_ceiling_ft": 2200, "special_use": [], "freezing": { "ft": 4000, "at_or_below": false }, "hazards": [], "weather_unavailable": [],
    }));
    // The names that replaced wingtip_native's own functions (#482 phase 0).
    c.ask("groundspeed_kt", json!({ "true_course_deg": 360, "wind_from_deg": 270, "wind_kt": 20, "tas_kt": 110, "wca_deg": -10.5 }));
    c.ask("hold_entry", json!({ "arrival_deg": 150, "inbound_deg": 360 }));
    c.ask("hold_entry", json!({ "arrival_deg": 150, "inbound_deg": 360, "turns": "left" }));
    c.ask("magnetic_variation", json!({ "lat": 46.84, "lon": -92.19, "year": 2026.5 }));
    let debriefed = call(
        "debrief_marked",
        &json!({ "debrief": {
        "legs": [{ "from": "A", "to": "B", "worst_alt_ft": 150, "worst_off_nm": 1.2 }],
        "passes": [{ "name": "B", "category": "destination", "due_min": 18, "passed_min": 21 }],
        "patterns": [{ "ident": "B", "alt_ft": 1800, "pattern_ft": 1700 }],
        "notes": [],
    } })
        .to_string(),
    )
    .unwrap();
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
            let at: Vec<Value> = options
                .as_array()
                .unwrap()
                .iter()
                .map(|a| json!({ "altitude_ft": a, "wind": { "wind_dir_true_deg": 270, "wind_speed_kt": 15 }, "oat_c": null }))
                .collect();
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
    c.ask(
        "navlog_fuel_plan",
        json!({ "total_fuel_gal": totals["fuel_gal"], "profile": profile, "night": null, "rules": "ifr", "alternate_gal": 2.5 }),
    );
    let one = c.ask(
        "navlog_legs",
        json!({ "fixes": [fixes[0], fixes[1]], "altitude_ft": air[0]["at"][0]["altitude_ft"], "profile": profile, "air": [air[0]] }),
    );
    c.ask("navlog_leg", json!({ "start": fixes[0], "end": fixes[1], "altitude_ft": 5500, "profile": profile, "wind": null, "oat_c": 10, "variation_deg": -3.0 }));
    c.ask(
        "navlog_alternate_leg",
        json!({ "dest": { "ident": "KRFD", "lat": 42.195, "lon": -89.097 }, "alternate": { "ident": "KDKB", "lat": 41.934, "lon": -88.706 },
        "altitude_ft": 3500, "profile": profile, "air": null }),
    );
    c.ask("navlog_hold", json!({ "leg": one[0], "before": one[0], "hold": { "fix": "KUGN", "inbound": 90, "right": true, "leg_min": 1, "leg_nm": null, "turns": 2, "minutes": null },
        "fix": fixes[0], "variation_deg": -3.0, "at_end": false }));
    let options: Vec<Value> = made["plans"]
        .as_object()
        .unwrap()
        .iter()
        .map(|(k, p)| {
            let mut p = p.clone();
            p["kind"] = json!(k);
            p
        })
        .collect();
    c.ask("navlog_join_plans", json!({ "by_hop": [options.clone(), options], "lengths": [40, 60] }));
    c.ask("navlog_join_figures", json!({ "by_hop": [made["by_altitude"], []], "lengths": [40, 60] }));
    let approach = json!([{ "ident": "ANDOE", "lat": 42.25, "lon": -89.1, "min_ft": 3000, "max_ft": null, "missed": false }]);
    c.ask("navlog_approach_end", json!({ "fixes": approach, "cruise_ft": 5500, "field": { "lat": 42.195, "lon": -89.097 } }));
    c.ask("navlog_approach_end", json!({ "fixes": approach, "cruise_ft": 2500, "field": { "lat": 42.195, "lon": -89.097 } }));
    c.ask("performance_cruise", json!({ "profile": profile, "altitude_ft": 8500, "oat_c": 2 }));
    c.ask("performance_climb", json!({ "profile": profile, "from_ft": 800, "to_ft": 5500, "isa_dev_c": 5 }));
}
