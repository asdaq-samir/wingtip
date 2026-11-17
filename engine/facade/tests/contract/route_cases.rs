use super::*;

/// Route options, the instruments in flight, cautions and what is ahead.
pub(super) fn cases(c: &mut Checker) {
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
    let stops = c.ask(
        "fuel_stops",
        json!({ "start": [0.0, 0.0], "end": [0.0, 10.0], "fuel_per_nm": 0.1, "min_per_nm": 0.6,
        "usable_gal": 40.0, "taxi_gal": 1.0, "reserve_gal": 5.0, "fields": fields }),
    );
    assert_eq!(stops["stops"][0]["ident"], "ONLINE");
    let along = c.ask(
        "fields_along",
        json!({ "flights": [{ "departure": "A", "start": [0.0, 0.0], "end": [0.0, 10.0] }],
        "skip": ["A"], "fields": fields }),
    );
    assert_eq!(along[0]["fuel_types"], json!(["100LL", "A"]));
    let shelves = json!([{ "floor_ft_msl": 0, "ceiling_ft_msl": 10000,
        "rings": [[[0.4, -0.1], [0.4, 0.1], [0.6, 0.1], [0.6, -0.1]]] }]);
    assert_eq!(
        c.ask("class_b_entered", json!({ "start": [0.0, 0.0], "end": [1.0, 0.0], "altitude_ft": 4500, "shelves": shelves })),
        json!(true)
    );
    let ways = c.ask(
        "class_b_detours",
        json!({ "start": [0.0, 0.0], "end": [1.0, 0.0], "below_ft": 4500, "shelves": shelves,
        "fixes": [{ "ident": "VPNEAR", "lat": 0.5, "lon": -0.2, "vfr": true, "kind": "VFR waypoint" }] }),
    );
    assert_eq!(ways[0]["ident"], "VPNEAR");
    // The instruments in flight and own ship on an airport diagram (#218),
    // on a route from Duluth east and north.
    let line = json!([[46.84, -92.19], [46.84, -91.5], [47.2, -91.5]]);
    let points = json!([{ "name": "KDLH", "lat": 46.84, "lon": -92.19 }, { "name": "TURN", "lat": 46.84, "lon": -91.5 },
        { "name": "KTWM", "lat": 47.2, "lon": -91.5 }]);
    let flying = c.ask(
        "in_flight",
        json!({ "fix": { "lat": 46.85, "lon": -91.8, "track_deg": 92, "speed_kt": 115 }, "line": line,
        "points": points, "legs": [{ "distance_nm": 28.3, "fuel_gal": 3.1 }, { "distance_nm": 21.6, "fuel_gal": 2.2 }],
        "fuel_start_gal": 40, "now_s": 1_793_620_000 }),
    );
    assert_eq!(flying["next"]["name"], json!("TURN"));
    c.ask("in_flight", json!({ "fix": { "lat": 46.85, "lon": -91.8 }, "line": [], "points": [] }));
    c.ask(
        "vertical_speed",
        json!({ "samples": [{ "t_s": 0, "altitude_ft": 3000 }, { "t_s": 5, "altitude_ft": 3040 }, { "t_s": 10, "altitude_ft": 3080 }] }),
    );
    c.ask("glide_ring", json!({ "lat": 46.85, "lon": -91.8, "altitude_ft": 5500, "speed_kt": 115, "terrain_ft": 1400, "field_ft": 1428 }));
    c.ask("glide_ring", json!({ "lat": 46.85, "lon": -91.8, "speed_kt": 115 }));
    c.ask("diagram_labels", json!({ "text": "46°51'N 46°50'N 92°13'W ELEV 1428" }));
    let graticule = c.ask(
        "diagram_graticule",
        json!({ "labels": [
        { "text": "46°51'N", "x": 69.3, "y": 77.2 }, { "text": "46°50'N", "x": 296.6, "y": 76.6 },
        { "text": "92°13'W", "x": 363.8, "y": 486.0 }, { "text": "92°12'W", "x": 362.7, "y": 328.2 }] }),
    );
    c.ask("diagram_point", json!({ "graticule": graticule, "lat": 46.84, "lon": -92.2, "width": 387.36, "height": 594 }));
    c.ask("diagram_graticule", json!({ "labels": [] }));

    // A pilot's own altitude's cautions and the IFR alternate (#482 phase 1).
    let cautions = fixture("cautions.json");
    for case in cautions["own_altitude"].as_array().unwrap() {
        c.ask(
            "own_altitude_caution",
            json!({ "selection": case["selection"], "legs": case["legs"], "between": case["between"], "profile": case.get("profile") }),
        );
    }
    for case in cautions["floor"].as_array().unwrap() {
        c.ask("floor_caution", json!({ "segment": case["segment"], "altitude_ft": case["altitude_ft"] }));
    }
    c.ask("prohibited_caution", json!({ "selection": cautions["prohibited"][0]["selection"] }));
    for case in cautions["alternate_destination"].as_array().unwrap() {
        c.ask(
            "ifr_alternate_destination",
            json!({ "ident": case["ident"], "approaches": case["approaches"], "forecast": case["forecast"] }),
        );
    }
    let mut checks = Vec::new();
    for case in cautions["alternate_check"].as_array().unwrap() {
        let mut check =
            c.ask("ifr_alternate_check", json!({ "ident": case["ident"], "approaches": case["approaches"], "forecast": case["forecast"] }));
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
    given["swath_ground_ft"] =
        json!(frame["lats"].as_array().unwrap().iter().map(|r| vec![800.0; r.as_array().unwrap().len()]).collect::<Vec<_>>());
    given["obstacles"] = json!([{ "lat": 42.0, "lon": -87.98, "amsl_ft": 2700, "type": "TOWER" }]);
    c.ask("alerts_ahead", given);
    c.ask(
        "congested_points",
        json!({ "areas": [[[[[-90.0, 45.0], [-89.98, 45.0], [-89.98, 45.01], [-90.0, 45.01], [-90.0, 45.0]]]]],
        "points": [[45.005, -89.99], [46.0, -89.0]], "candidates": [[0], []] }),
    );
}
