use super::*;

fn fcsts(text: &str) -> Vec<Value> {
    json::parse(text).unwrap().as_array().unwrap().to_vec()
}

#[test]
fn a_tempo_counts_in_the_worst() {
    let f = fcsts(
        r#"[{"timeFrom":0,"timeTo":100,"change":"","ceiling_ft":4000,"ceiling_unknown":false,"visibility_sm":6},
                     {"timeFrom":20,"timeTo":40,"change":"TEMPO","ceiling_ft":null,"ceiling_unknown":false,"visibility_sm":0.5}]"#,
    );
    let w = worst_in_window(&f, 25.0, 30.0).unwrap();
    assert_eq!((w.ceiling_ft, w.visibility_sm), (Some(4000.0), Some(0.5)));
    assert_eq!(worst_in_window(&f, 200.0, 300.0), None);
}

#[test]
fn a_becmg_lasts_past_its_window() {
    let f = fcsts(
        r#"[{"timeFrom":0,"timeTo":100,"change":"","ceiling_ft":4000,"visibility_sm":6},
                     {"timeFrom":10,"timeTo":20,"change":"BECMG","ceiling_ft":800,"visibility_sm":6}]"#,
    );
    assert_eq!(worst_in_window(&f, 50.0, 60.0).unwrap().ceiling_ft, Some(800.0));
}

#[test]
fn the_reasons_vfr_is_not_recommended() {
    let metars = json::parse(r#"{"KAAA":{"flight_category":"IFR"},"KBBB":{"ceiling_unknown":true}}"#).unwrap();
    let forecast = json::parse(r#"{"min_ceiling_ft":800,"min_visibility_sm":2.5,"ceiling_unknown_at":["KCCC"]}"#).unwrap();
    assert_eq!(
        vfr_not_recommended_reasons(&["KAAA", "KBBB"], &metars, &forecast, 1000.0, 3.0),
        vec![
            "KAAA currently reporting IFR", "KBBB currently reporting a ceiling of unknown height",
            "forecast ceiling as low as 800 ft along the route", "forecast ceiling of unknown height at KCCC",
            "forecast visibility as low as 2.5 sm along the route",
        ]
    );
    assert_eq!(feet(12500.0), "12,500");
}

#[test]
fn pireps_are_told_in_route_order_urgent_first() {
    let r = fcsts(
        r#"[{"observed":1000,"lat":0.0,"lon":0.5,"altitude_ft":5000,"urgent":false},
                     {"observed":1000,"lat":0.0,"lon":0.2,"altitude_ft":5000,"urgent":true},
                     {"observed":1000,"lat":0.0,"lon":0.3,"altitude_ft":25000,"urgent":false},
                     {"observed":-9000,"lat":0.0,"lon":0.3,"altitude_ft":5000,"urgent":false}]"#,
    );
    let got = json::parse(&pireps_along_route(&r, &[(0.0, 0.0), (0.0, 1.0)], 30.0, 1000.0)).unwrap();
    let along: Vec<f64> = got.as_array().unwrap().iter().map(|p| num(p, "along_track_nm").unwrap()).collect();
    assert_eq!(along.len(), 2);
    assert!(along[0] < along[1] || got.as_array().unwrap()[0].get("urgent") == Some(&Value::Bool(true)));
    assert!(got.as_array().unwrap()[0].get("observed").is_none());
}
