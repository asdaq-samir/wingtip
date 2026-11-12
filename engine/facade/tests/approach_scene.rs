//! A field's way in for the 3D map (crate::approach::scene), asked by name
//! as every host asks, for KOSH runway 36 with its ILS and RNAV (GPS)
//! approaches as the planner draws them from the CIFP of 29 Oct 2026 (the
//! shared fixture apps/web/src/lib/fixtures/approachKosh.json), held to
//! the plates' own figures: ILS or LOC RWY 36, Amdt 7D, GS 2,610 at POBER
//! and TCH 53 over the threshold at 808; RNAV (GPS) RWY 36, the vertical
//! path at 1,467 over JUMVO as the CIFP codes it ("V", ARINC 424-18 5.29).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/approachKosh.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

/// KOSH's runway 18/36 as the planner's /api/airport gives it: 8,002 ft,
/// the ends at their CIFP thresholds (36's the fixture's RW36), headings
/// true.
fn input(drawing: Value) -> Value {
    json!({
        "lat": 43.984,
        "lon": -88.557,
        "elevation_ft": 808.0,
        "pattern_ft": 1808.0,
        "runways": [{
            "length_ft": 8002,
            "runway_ends": [
                { "ident": "36", "lat": 43.963839, "lon": -88.556717, "heading_true_deg": 0.4 },
                { "ident": "18", "lat": 43.985763, "lon": -88.556461, "heading_true_deg": 180.4 }
            ]
        }],
        "drawing": drawing
    })
}

fn scene(v: &Value) -> Value {
    let text = call("approach_scene", &v.to_string()).unwrap_or_else(|e| panic!("approach_scene: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("answered {text}: {e}"))
}

fn nm(a: &Value, lat: f64, lon: f64) -> f64 {
    let (la, lo) = (a[0].as_f64().unwrap(), a[1].as_f64().unwrap());
    let dy = (la - lat) * 60.0;
    let dx = (lo - lon) * 60.0 * lat.to_radians().cos();
    dy.hypot(dx)
}

#[test]
fn the_ils_glidepath_crosses_pober_at_its_glide_slope_altitude() {
    let a = scene(&input(fixture()["drawings"]["I36"].clone()));
    // Its runway's glidepath alone, the CIFP's: 3.00 degrees over the
    // threshold at 808 + 53.
    let g = a["glidepaths"].as_array().unwrap();
    assert_eq!(g.len(), 1);
    assert_eq!(g[0]["end"], "36");
    assert_eq!(g[0]["source"], "cifp");
    assert_eq!(g[0]["deg"], 3.0);
    assert_eq!(g[0]["tch_ft"], 53.0);
    assert_eq!(g[0]["cross_ft"], 861.0);
    // Out to POBER, the FAF, 5.4 nm, where the plate's GS is 2,610.
    let top = g[0]["points"].as_array().unwrap().last().unwrap().clone();
    assert!(nm(&top, 43.873792, -88.557889) < 0.05, "{top}");
    let ft = top[2].as_f64().unwrap();
    assert!((ft - 2610.0).abs() <= 30.0, "{ft}");
    // The centreline of 36 to POBER; 18's its 5 nm.
    let c = a["centrelines"].as_array().unwrap();
    let c36 = c.iter().find(|c| c["end"] == "36").unwrap();
    assert!(nm(&c36["points"][1], 43.873792, -88.557889) < 0.05);
    let c18 = c.iter().find(|c| c["end"] == "18").unwrap();
    assert!((nm(&c18["points"][1], 43.985763, -88.556461) - 5.0).abs() < 0.05);
    // The path: CFBSM at 2,700, then down the glidepath to the threshold.
    let path = a["path"].as_array().unwrap();
    assert_eq!(path[0][2], 2700.0);
    assert_eq!(path.last().unwrap()[2], 861.0);
}

#[test]
fn the_rnav_path_crosses_jumvo_on_its_coded_vertical_path() {
    let a = scene(&input(fixture()["drawings"]["R36"].clone()));
    let path = a["path"].as_array().unwrap();
    // DOCEN at 2,800 first; JUMVO, the step-down fix, on the path the
    // CIFP codes at 1,467 there.
    assert_eq!(path[0][2], 2800.0);
    let jumvo = path.iter().find(|p| nm(p, 43.932172, -88.557131) < 0.05).expect("JUMVO on the path");
    assert!((jumvo[2].as_f64().unwrap() - 1467.0).abs() <= 20.0, "{jumvo}");
}

#[test]
fn with_no_approach_each_end_has_the_standard_glidepath_and_the_ring_its_tpa() {
    let a = scene(&input(Value::Null));
    assert_eq!(a["path"], Value::Null);
    let g = a["glidepaths"].as_array().unwrap();
    assert_eq!(g.len(), 2);
    for path in g {
        // 3.00 degrees over the threshold at 40 ft (FAA Order 8260.3G
        // 2-6-3, Table 10-1-1), from the field's 808.
        assert_eq!(path["source"], "standard");
        assert_eq!(path["deg"], 3.0);
        assert_eq!(path["cross_ft"], 848.0);
        // 5 nm out: 848 + 5 x 318.4, and a few feet for the earth's curve.
        let top = path["points"].as_array().unwrap().last().unwrap()[2].as_f64().unwrap();
        assert!((top - 2440.0).abs() < 15.0, "{top}");
    }
    // The ring at 1,808, half of 8,002 ft (0.658 nm) and the downwind's
    // three-quarters of a statute mile (0.652 nm) out.
    assert_eq!(a["ring"]["ft"], 1808.0);
    let r = a["ring"]["radius_nm"].as_f64().unwrap();
    assert!((r - 1.31).abs() < 0.01, "{r}");
}
