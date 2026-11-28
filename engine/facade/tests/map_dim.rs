//! map_dim_words held to the Dimmer's shared cases
//! (apps/web/src/lib/fixtures/mapDim.json's `paper` and `words`, the one
//! copy of that maths the web and both phones ask): the chart's white under
//! the Dimmer and the Contrast, the words' share of light floored under the
//! night's own contrast, and a night warning's light against the paper's.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/mapDim.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn ask(night: bool, brightness: f64, contrast: f64) -> Value {
    let input = json!({ "night": night, "brightness": brightness, "contrast": contrast });
    serde_json::from_str(&call("map_dim_words", &input.to_string()).unwrap()).unwrap()
}

#[test]
fn the_paper_under_the_dimmer_and_the_contrast() {
    for c in fixture()["paper"]["cases"].as_array().unwrap() {
        let got = ask(true, c["brightness"].as_f64().unwrap(), c["contrast"].as_f64().unwrap())["paper"].as_f64().unwrap();
        assert!((got - c["paper"].as_f64().unwrap()).abs() < 1e-6, "{c}: {got}");
    }
}

#[test]
fn the_words_share_of_light_floored_under_the_nights_contrast() {
    for c in fixture()["words"]["cases"].as_array().unwrap() {
        let got = ask(c["night"].as_bool().unwrap(), c["brightness"].as_f64().unwrap(), c["contrast"].as_f64().unwrap());
        assert_eq!(got["words"].as_f64(), c["share"].as_f64(), "{c}");
    }
}

#[test]
fn a_night_warning_under_the_papers_light_and_whole_by_day() {
    // 0.85 times the paper at the night's default Dimmer and contrast
    // (0.537356, the fixture's first paper case), in hundredths.
    assert_eq!(ask(true, 0.5, 0.13)["warning"].as_f64(), Some(0.46));
    assert_eq!(ask(false, 0.5, 0.13)["warning"].as_f64(), Some(1.0));
    assert_eq!(ask(false, 0.5, 0.13)["words"].as_f64(), Some(0.0));
}
