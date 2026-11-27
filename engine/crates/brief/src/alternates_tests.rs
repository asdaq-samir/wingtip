//! The IFR alternate's rules (alternates.rs), against 14 CFR 91.169.

use super::*;

#[test]
fn the_destinations_window_is_an_hour_either_side_and_an_alternates_its_eta() {
    assert_eq!(window(10_000.0, true), (6_400.0, 13_600.0));
    assert_eq!(window(10_000.0, false), (10_000.0, 10_000.0));
    let v = json::parse(r#"{"eta":7200,"for":"destination"}"#).unwrap();
    assert_eq!(call("ifr_alternate_window", &v).unwrap(), r#"{"start":3600.0,"end":10800.0}"#);
    assert!(call("ifr_alternate_window", &json::parse(r#"{"eta":1}"#).unwrap()).is_err());
}

#[test]
fn visibilities_are_written_as_python_wrote_them() {
    assert_eq!(g(2.5), "2.5");
    assert_eq!(g(10.0), "10");
    assert_eq!(g(0.25), "0.25");
    assert_eq!(g(1.0 / 3.0), "0.333333");
}

#[test]
fn a_tempo_under_1_2_3_asks_for_an_alternate() {
    let procs = Approaches { any: true, precision: true, alternate_minimums_url: None };
    let f = Forecast { ceiling_ft: Some(1500.0), ceiling_unknown: false, visibility_sm: Some(6.0), covers: true, raw: None };
    let d = destination("KDST", &procs, Some(&f));
    assert_eq!(d.get("required"), Some(&Value::Bool(true)));
}

#[test]
fn precision_is_ils_gls_and_par_by_the_aim() {
    // AIM 5-4-5 a.7(a): "PAR, ILS, and GLS are precision approaches";
    // (b): "LDA with glidepath, LNAV/VNAV and LPV are APV approaches".
    for name in ["ILS OR LOC RWY 27", "ILS RWY 4R (SA CAT I)", "ILS Z RWY 9", "GLS RWY 4R", "PAR RWY 32", "ils rwy 9"] {
        assert!(precision_approach(name), "{name}");
    }
    for name in ["LOC RWY 27", "RNAV (GPS) RWY 9", "LDA/GLIDESLOPE RWY 19", "VOR RWY 3", "ILSX", "LOC BC RWY 9", "NDB OR GPS RWY 6"] {
        assert!(!precision_approach(name), "{name}");
    }
}

fn check(precision: bool, ceiling_ft: f64, visibility_sm: f64, closed: Option<&str>) -> Value {
    let procs = Approaches { any: true, precision, alternate_minimums_url: None };
    let f = Forecast { ceiling_ft: Some(ceiling_ft), ceiling_unknown: false, visibility_sm: Some(visibility_sm), covers: true, raw: None };
    alternate("KALT", &procs, Some(&f), Use::default(), closed)
}

#[test]
fn the_standard_minimums_hold_on_both_sides_of_each_figure() {
    // 91.169(c)(1)(i)(A): precision 600 ft and 2 sm; (B): nonprecision 800 and 2.
    let good = |v: &Value| v.get("good").cloned();
    assert_eq!(good(&check(true, 600.0, 2.0, None)), Some(Value::Bool(true)));
    assert_eq!(good(&check(true, 599.0, 2.0, None)), Some(Value::Bool(false)));
    assert_eq!(good(&check(false, 800.0, 2.0, None)), Some(Value::Bool(true)));
    assert_eq!(good(&check(false, 799.0, 2.0, None)), Some(Value::Bool(false)));
    assert_eq!(good(&check(true, 3000.0, 1.75, None)), Some(Value::Bool(false)));
}

#[test]
fn a_closed_field_is_never_an_alternate_nor_offered_as_one() {
    // Decision 0043: NASR's CI or CP is never offered as an open field.
    let closed = check(true, 3000.0, 6.0, Some("Closed indefinitely"));
    assert_eq!(closed.get("good"), Some(&Value::Bool(false)));
    assert_eq!(closed.get("closed"), Some(&Value::Bool(true)));
    let open = check(true, 3000.0, 6.0, None);
    assert_eq!(ranked(&[closed, open.clone()], 5), Value::Array(vec![open]));
    let v = json::parse(r#"{"ident":"KALT","status":"CP","approaches":{"names":["ILS RWY 9"]},"forecast":{"ceiling_ft":3000,"visibility_sm":6,"covers":true}}"#).unwrap();
    let answer = json::parse(&call("ifr_alternate_check", &v).unwrap()).unwrap();
    assert_eq!(answer.get("closed"), Some(&Value::Bool(true)));
}
