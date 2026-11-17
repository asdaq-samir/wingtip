use super::*;

// --- In flight (#218) ---------------------------------------------------------

#[test]
fn in_flight_counts_down_to_the_next_waypoint_and_the_destination() {
    // East along 45 N for a degree, then north half a degree.
    let line = json!([[45.0, -93.0], [45.0, -92.0], [45.5, -92.0]]);
    let points = json!([{ "name": "A", "lat": 45.0, "lon": -93.0 }, { "name": "B", "lat": 45.0, "lon": -92.0 },
        { "name": "C", "lat": 45.5, "lon": -92.0 }]);
    let at = |lat: f64, lon: f64, kt: f64| {
        ask(
            "in_flight",
            json!({ "fix": { "lat": lat, "lon": lon, "track_deg": 90, "speed_kt": kt },
        "line": line, "points": points, "legs": [{ "distance_nm": 42.4, "fuel_gal": 4 }, { "distance_nm": 30, "fuel_gal": 3 }],
        "fuel_start_gal": 40, "now_s": 1_793_620_000 }),
        )
    };
    let mid = at(45.0, -92.5, 120.0);
    assert_eq!(mid["on_route"], json!(true));
    assert_eq!(mid["next"]["name"], json!("B"));
    let to_b = distance_nm(45.0, -92.5, 45.0, -92.0);
    assert!(close(n(&mid["next"]["distance_nm"]), to_b, 1e-9));
    assert!(close(n(&mid["next"]["ete_min"]), to_b / 120.0 * 60.0, 1e-9));
    assert!(close(n(&mid["next"]["eta_s"]), 1_793_620_000.0 + to_b / 120.0 * 3600.0, 1e-6));
    assert!(close(n(&mid["destination"]["distance_nm"]), to_b + 30.0, 0.1));
    assert!(close(n(&mid["burnt_gal"]), 2.0, 0.05));
    assert_eq!(mid["off_side"], Value::Null);
    // Past B, the next is C; off the line by 4 nm it is not on the route.
    let late = at(45.2, -92.0, 120.0);
    assert_eq!(late["next"]["name"], json!("C"));
    assert_eq!(at(45.07, -92.5, 120.0)["on_route"], json!(false));
    assert_eq!(at(45.07, -92.5, 120.0)["off_side"], json!("left"));
    // Taxiing: no times.
    assert_eq!(at(45.0, -92.99, 10.0)["next"]["ete_min"], Value::Null);
}

#[test]
fn the_vertical_speed_and_the_glide_ring() {
    let samples: Vec<Value> = (0..=10).map(|t| json!({ "t_s": t, "altitude_ft": 4000 - 10 * t })).collect();
    assert!(close(n(&ask("vertical_speed", json!({ "samples": samples }))), -600.0, 1e-9));
    let ring = ask(
        "glide_ring",
        json!({ "lat": 45, "lon": -93, "altitude_ft": 4800, "speed_kt": 100, "terrain_ft": 800, "field_ft": 500, "glide_ratio": 9 }),
    );
    assert!(close(n(&ring["range_nm"]), 4.0 * 9000.0 / FT_PER_NM, 1e-9));
    assert_eq!(n(&ring["ground_ft"]), 800.0);
    assert_eq!(ring["ring"].as_array().unwrap().len(), 73);
    assert_eq!(
        ask("glide_ring", json!({ "lat": 45, "lon": -93, "altitude_ft": 4800, "speed_kt": 20, "terrain_ft": 800, "glide_ratio": 9 })),
        Value::Null
    );
    assert_eq!(ask("glide_ring", json!({ "lat": 45, "lon": -93, "altitude_ft": 4800, "speed_kt": 100, "terrain_ft": 800 })), Value::Null);
}

#[test]
fn own_ship_is_placed_on_kdlhs_diagram_by_its_labels() {
    // KDLH's diagram (d-TPP 2612, 00125AD.PDF) is drawn with north to the
    // page's left: its latitudes along the top, its longitudes down the
    // right, where PDFKit finds them (points from the top left).
    let labels = ask("diagram_labels", json!({ "text": "AIRPORT DIAGRAM 92°13'W 46°51'N 46°50'N 92°12'W 92°11'W DULUTH" }));
    assert_eq!(labels, json!(["92°13'W", "46°51'N", "46°50'N", "92°12'W", "92°11'W"]));
    let g = ask(
        "diagram_graticule",
        json!({ "labels": [
        { "text": "92°13'W", "x": 363.85, "y": 485.90 }, { "text": "46°51'N", "x": 69.35, "y": 77.21 },
        { "text": "46°50'N", "x": 296.60, "y": 76.58 }, { "text": "92°12'W", "x": 362.69, "y": 328.17 },
        { "text": "92°11'W", "x": 361.89, "y": 170.52 }] }),
    );
    assert_eq!(g["lat_on_x"], json!(true));
    assert_eq!(n(&g["north_deg"]), 270.0);
    let at = ask("diagram_point", json!({ "graticule": g, "lat": 46.8417, "lon": -92.1936, "width": 387.36, "height": 594 }));
    assert_eq!(at["on_page"], json!(true));
    // Half way between the two latitude labels' x, a quarter minute of
    // longitude east of 92°12'W.
    assert!(close(n(&at["x"]), (69.35 + 296.60) / 2.0, 2.0), "{at}");
    assert!(n(&at["y"]) < 328.17 && n(&at["y"]) > 170.52, "{at}");
}

// --- The nav log's rows, as the web's navLogRows builds them ----------------

pub(super) fn airport(ident: &str, lat: f64, elevation: f64) -> Value {
    json!({ "ident": ident, "name": ident, "lat": lat, "lon": -88, "elevation_ft": elevation, "kind": "airport" })
}

/// The piece of `leg` from one point on it to the next.
pub(super) fn piece(leg: &Value, from: (f64, f64, f64), to: (f64, Option<f64>, Option<f64>)) -> Value {
    let mut p = leg.clone();
    p["distance_nm"] = json!(f64::max(0.0, to.0 - from.0));
    p["ete_min"] = json!(to.1.map(|m| f64::max(0.0, m - from.1)));
    p["fuel_gal"] = json!(to.2.map(|g| f64::max(0.0, g - from.2)));
    p
}

/// The rows of a route with no checkpoints: the departure, each stop and
/// the destination, each leg's tops of climb and descent rows of their own.
pub(super) fn nav_log_rows(fields: &[Value], legs: &[Value]) -> Value {
    let mut rows = vec![json!({ "kind": "departure", "key": "departure", "airport": fields[0], "minutesFlown": 0 })];
    for (k, field) in fields.iter().enumerate().skip(1) {
        let kind = if k == fields.len() - 1 { "destination" } else { "stop" };
        let Some(leg) = legs.get(k - 1) else {
            rows.push(json!({ "kind": kind, "airport": field }));
            continue;
        };
        let mut points: Vec<(&str, &Value)> = Vec::new();
        for kind in ["toc", "tod"] {
            if leg[kind].is_object() {
                points.push((kind, &leg[kind]));
            }
        }
        wingtip_engine::sort::StableSort::stable_sort_by(&mut points[..], |a, b| n(&a.1["along_nm"]).total_cmp(&n(&b.1["along_nm"])));
        let mut from = (0.0, 0.0, 0.0);
        for (kind, point) in &points {
            let mut part = piece(leg, from, (n(&point["along_nm"]), point["ete_min"].as_f64(), point["fuel_gal"].as_f64()));
            if *kind == "toc" {
                part["tas_kt"] = point["tas_kt"].clone();
                part["groundspeed_kt"] = point["groundspeed_kt"].clone();
            }
            rows.push(json!({ "kind": kind, "point": point, "leg": leg, "part": part }));
            from = (n(&point["along_nm"]), n(&point["ete_min"]), point["fuel_gal"].as_f64().unwrap_or(0.0));
        }
        let mut row = json!({ "kind": kind, "airport": field, "leg": leg });
        if !points.is_empty() {
            row["part"] = piece(leg, from, (n(&leg["distance_nm"]), leg["ete_min"].as_f64(), leg["fuel_gal"].as_f64()));
        }
        rows.push(row);
    }
    Value::Array(rows)
}

/// One 60 nm leg north at 100 kt over the ground, 36 minutes and 5
/// gallons, climbing for its first 8 nm and down at 3:1 from 48 nm.
pub(super) fn leg() -> Value {
    json!({
        "distance_nm": 60, "ete_min": 36, "fuel_gal": 5, "fuel_burn_gph": 8, "altitude_ft": 5500, "climb_min": 6, "groundspeed_kt": 100,
        "tas_kt": 110, "true_course_deg": 0,
        "toc": { "along_nm": 8, "ete_min": 6, "fuel_gal": 1, "altitude_ft": 5500, "lat": 42.13, "lon": -88, "tas_kt": 70, "groundspeed_kt": 75 },
        "tod": { "along_nm": 48, "ete_min": 28.8, "fuel_gal": 4, "altitude_ft": 5500, "to_ft": 1500, "pattern": true, "fpm": 550, "lat": 42.8, "lon": -88 },
    })
}

pub(super) fn c81_kdlh(legs: &[Value]) -> Value {
    nav_log_rows(&[airport("C81", 42.0, 800.0), airport("KDLH", 43.0, 500.0)], legs)
}

// --- The plan from the side --------------------------------------------------

#[test]
fn the_plan_descends_to_the_pattern_by_its_45_degree_entry_ac_90_66c_11_3() {
    let mut l = leg();
    l["toc"]["lat"] = json!(42.1);
    let p = ask("plan_profile", json!({ "rows": c81_kdlh(&[l]) }));
    assert_eq!(
        norm(&p["points"]),
        norm(&json!([
            { "along_nm": 0, "plan_ft": 800 }, { "along_nm": 8, "plan_ft": 5500 }, { "along_nm": 48, "plan_ft": 5500 },
            { "along_nm": 58.27640462279747, "plan_ft": 1500 }, { "along_nm": 60, "plan_ft": 500 }, // statute mile 1,609.344 / 1,852 nm
        ]))
    );
    assert_eq!(p["marks"].as_array().unwrap().iter().map(|m| m["kind"].as_str().unwrap()).collect::<Vec<_>>(), ["TOC", "TOD"]);
    assert_eq!(p["length_nm"], json!(60.0));
}

#[test]
fn the_plan_descends_to_an_approachs_first_fix_by_its_distance_out_then_to_the_field() {
    // ANDOE crossed at 3,000 ft 15 nm out: 2,500 ft at three to one is 7.5
    // nm, so down from 37.5 and level at 45.
    let mut l = leg();
    l["tod"] = json!({ "along_nm": 37.5, "ete_min": 22.5, "fuel_gal": 3, "altitude_ft": 5500, "to_ft": 3000, "pattern": false, "fix": "ANDOE", "fpm": 550, "lat": 42.6, "lon": -88 });
    let p = ask("plan_profile", json!({ "rows": c81_kdlh(&[l]) }));
    let along: Vec<(f64, f64)> =
        p["points"].as_array().unwrap().iter().map(|q| ((n(&q["along_nm"]) * 10.0).round() / 10.0, n(&q["plan_ft"]))).collect();
    assert_eq!(along, [(0.0, 800.0), (8.0, 5500.0), (37.5, 5500.0), (45.0, 3000.0), (60.0, 500.0)]);
}
