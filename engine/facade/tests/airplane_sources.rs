//! An airplane's figures with their sources, and the inputs a figure
//! needs that the airplane lacks (airplane_figures, airplane_needs): the
//! pilot's own over the handbook page's over the type's book, a missing
//! one named so the app can ask for it, never another airplane's filled
//! in (the owner, 2026-11-09).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn ask(name: &str, input: Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name} answered {text}: {e}"))
}

fn c172() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/aircraft/c172.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn figure<'a>(answer: &'a Value, key: &str) -> &'a Value {
    answer["figures"].as_array().unwrap().iter().find(|f| f["key"] == key).unwrap_or_else(|| panic!("no {key}"))
}

#[test]
fn the_pilots_figure_overrides_the_books_and_says_so() {
    let a = ask("airplane_figures", json!({"book": c172(), "own": {"cruise_tas_kt": 105.0, "fuel_burn_gph": 8.5}}));
    assert_eq!(figure(&a, "cruise_tas_kt")["value"], 105.0);
    assert_eq!(figure(&a, "cruise_tas_kt")["source"], "pilot");
    assert_eq!(figure(&a, "cruise_tas_kt")["book"], 110.0);
    // A figure left as the book's is still the book's.
    assert_eq!(figure(&a, "fuel_burn_gph")["source"], "book");
    assert_eq!(a["profile"]["cruise_tas_kt"], 105.0);
    // Its glide is the 172S's book figure, kept in the profile's own shape.
    assert_eq!(figure(&a, "glide_ratio")["source"], "book");
    assert_eq!(a["profile"]["glide"]["best_glide_kias"].as_f64(), c172()["glide"]["best_glide_kias"].as_f64());
}

#[test]
fn the_handbook_page_sits_between_the_book_and_the_pilot() {
    let page = json!({"serviceCeilingFt": {"value": 12000.0, "words": "Service ceiling 12,000 ft"}});
    let a = ask("airplane_figures", json!({"book": c172(), "handbook": page}));
    assert_eq!(figure(&a, "service_ceiling_ft")["source"], "handbook");
    let a = ask("airplane_figures", json!({"book": c172(), "handbook": page, "own": {"service_ceiling_ft": 11000.0}}));
    assert_eq!(figure(&a, "service_ceiling_ft")["value"], 11000.0);
    assert_eq!(figure(&a, "service_ceiling_ft")["source"], "pilot");
}

#[test]
fn an_airplane_of_no_stock_type_has_only_its_own_figures() {
    let a = ask("airplane_figures", json!({"own": {"cruise_tas_kt": 120.0, "fuel_burn_gph": 9.0, "glide_ratio": 8.5}}));
    assert_eq!(figure(&a, "glide_ratio")["source"], "pilot");
    assert_eq!(a["profile"]["glide"]["ratio"], 8.5);
    assert_eq!(figure(&a, "taxi_fuel_gal")["value"], Value::Null);
    assert_eq!(figure(&a, "taxi_fuel_gal")["source"], Value::Null);
    // No book empty weight even for a stock type: the sample is not this airplane.
    let b = ask("airplane_figures", json!({"book": c172()}));
    assert_eq!(figure(&b, "empty_weight_lb")["value"], Value::Null);
}

#[test]
fn no_airplane_has_no_profile_and_needs_one() {
    assert_eq!(ask("airplane_figures", json!({}))["profile"], Value::Null);
    assert_eq!(ask("airplane_needs", json!({"profile": null, "figure": "glide"}))["missing"], json!(["airplane"]));
}

#[test]
fn a_figure_names_what_it_lacks() {
    let own = ask("airplane_figures", json!({"own": {"cruise_tas_kt": 120.0, "fuel_burn_gph": 9.0}}))["profile"].clone();
    assert_eq!(ask("airplane_needs", json!({"profile": own, "figure": "legs"}))["missing"], json!([]));
    assert_eq!(ask("airplane_needs", json!({"profile": own, "figure": "fuel_totals"}))["missing"], json!(["taxi_fuel_gal"]));
    assert_eq!(ask("airplane_needs", json!({"profile": own, "figure": "glide"}))["missing"], json!(["glide_ratio"]));
    assert_eq!(
        ask("airplane_needs", json!({"profile": own, "figure": "climb"}))["missing"],
        json!(["climb_tas_kt", "climb_rate_fpm", "service_ceiling_ft"])
    );
    // The 172S has its book's loading but not this airplane's empty weight.
    assert_eq!(
        ask("airplane_needs", json!({"profile": c172(), "figure": "weight_balance"}))["missing"],
        json!(["empty_weight_lb", "empty_moment_lb_in"])
    );
    assert_eq!(ask("airplane_needs", json!({"profile": c172(), "figure": "takeoff_landing"}))["missing"], json!([]));
}
