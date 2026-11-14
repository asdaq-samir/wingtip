//! The runway a landing has (the web audit's WEB-1): past a displaced
//! threshold, or the declared landing distance available, never the whole
//! length; a takeoff has all of it. AIM 2-3-3: "The portion of runway
//! behind a displaced threshold is available for takeoffs in either
//! direction and landings from the opposite direction"; AC 150/5300-13B's
//! declared distances give the LDA.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;
use wingtip_engine::gonogo::runways::{available_ft, End, Runway};

fn ask(name: &str, input: Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

fn c172() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/aircraft/c172.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn fit(kind: &str, length_ft: f64, end: Value) -> Value {
    ask(
        "runway_end_fit",
        json!({
            "aircraft": c172(),
            "runway": {"length_ft": length_ft, "surface": "ASP", "closed": false,
                       "runway_ends": [{"ident": "27", "heading_true_deg": 270, "displaced_threshold_ft": 600}]},
            "end": end, "wind": null, "elevation_ft": 900, "altimeter_in_hg": 29.92, "temp_c": 15, "weight_lb": 2550, "kind": kind,
        }),
    )
}

#[test]
fn the_landing_distance_available_is_the_lda_else_past_the_displaced_threshold_else_the_length() {
    let end = |displaced: Option<f64>, lda: Option<f64>| End { displaced_threshold_ft: displaced, lda_ft: lda, ..End::default() };
    let runway = Runway { length_ft: Some(3000.0), ..Runway::default() };
    assert_eq!(available_ft(&runway, None), Some(3000.0));
    assert_eq!(available_ft(&runway, Some(&end(None, None))), Some(3000.0));
    assert_eq!(available_ft(&runway, Some(&end(Some(600.0), None))), Some(2400.0));
    assert_eq!(available_ft(&runway, Some(&end(Some(600.0), Some(2200.0)))), Some(2200.0));
    assert_eq!(available_ft(&Runway::default(), Some(&end(None, Some(2200.0)))), Some(2200.0));
    assert_eq!(available_ft(&Runway::default(), Some(&end(Some(600.0), None))), None);
}

#[test]
fn a_landing_short_of_the_runway_past_its_displaced_threshold_is_short_and_a_takeoff_is_not() {
    // The 172's landing over a 50 ft obstacle here, then a runway 100 ft
    // longer than that whose landing end's threshold is displaced 600 ft.
    let needed = fit("landing", 10000.0, json!({"ident": "27", "heading_true_deg": 270}))["needed_ft"].as_f64().unwrap();
    let length = needed + 100.0;
    let landing = fit("landing", length, json!({"ident": "27", "heading_true_deg": 270}));
    assert_eq!((landing["short"].clone(), landing["length_ft"].as_f64()), (json!(true), Some(length - 600.0)));
    // The end's own figures, sent with it, are read too.
    let given = fit("landing", length, json!({"heading_true_deg": 270, "lda_ft": length - 50.0}));
    assert_eq!(given["length_ft"].as_f64(), Some(length - 50.0));
    // A takeoff may use the displaced pavement: the whole length.
    let takeoff = fit("takeoff", length, json!({"ident": "27", "heading_true_deg": 270}));
    assert_eq!(takeoff["length_ft"].as_f64(), Some(length));
}

#[test]
fn nasrs_combined_and_gravel_surfaces_are_soft_and_not_paved() {
    use wingtip_engine::gonogo::runways::soft_surface;
    let r = |s: &str| Runway { surface: Some(s.into()), ..Runway::default() };
    // NASR APT_RWY SURFACE_TYPE_CODE: GRVL (389 runways), a combined
    // ASPH-TURF; ASPH and CONC alone are paved and not soft.
    for soft in ["GRVL", "ASPH-TURF", "TURF", "DIRT", "Grass"] {
        assert!(soft_surface(Some(&r(soft))), "{soft}");
    }
    for hard in ["ASPH", "CONC", "ASPH-G", "CONC-F"] {
        assert!(!soft_surface(Some(&r(hard))), "{hard}");
    }
    // The most used runway is the paved one: ASPH-TURF counts as unpaved.
    let runways = json!([
        {"surface": "ASPH-TURF", "length_ft": 5000, "closed": false, "runway_ends": [{"ident": "09", "heading_true_deg": 90}]},
        {"surface": "ASPH", "length_ft": 3000, "closed": false, "runway_ends": [{"ident": "18", "heading_true_deg": 180}]}
    ]);
    let flown = ask("gonogo_runway_in_use", json!({"runways": runways}));
    assert_eq!(flown["runway"], json!(1), "{flown}");
}

#[test]
fn chicago_executives_runway_12_30_as_nasr_gives_it() {
    // NASR APT_RWY_END for PWK 12/30, 4,415 ft: end 12 displaced 295 ft
    // with 3,785 ft of LDA, end 30 displaced 432 ft with 3,725 ft.
    let runway = Runway { length_ft: Some(4415.0), ..Runway::default() };
    let end = |d: f64, lda: Option<f64>| End { displaced_threshold_ft: Some(d), lda_ft: lda, ..End::default() };
    assert_eq!(available_ft(&runway, Some(&end(295.0, Some(3785.0)))), Some(3785.0));
    assert_eq!(available_ft(&runway, Some(&end(432.0, Some(3725.0)))), Some(3725.0));
    // Without the declared LDA, the length past the threshold.
    assert_eq!(available_ft(&runway, Some(&end(295.0, None))), Some(4120.0));
    assert_eq!(available_ft(&runway, None), Some(4415.0));
}
