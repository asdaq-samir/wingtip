use super::*;

fn advisory(source: &str, name: &str, from_nm: f64) -> Advisory {
    Advisory {
        source: source.into(),
        name: Some(name.into()),
        when: Some("during".into()),
        valid_to: Some("2026-11-21T18:00:00Z".into()),
        from_nm: Some(from_nm),
        legs: vec![0.0, 1.0],
        ..Advisory::default()
    }
}

#[test]
fn nothing_on_the_route_is_no_rows() {
    assert_eq!(adverse_rows(&[]), (vec![], 0));
}

#[test]
fn a_tfr_crossed_comes_first_then_the_sigmets_then_the_g_airmets() {
    let tfr = Advisory {
        source: "TFR".into(),
        name: Some("6/4116 Madison".into()),
        crosses: true,
        enter: Some("2026-11-21T14:40:00Z".into()),
        from_nm: Some(80.0),
        ..Advisory::default()
    };
    let all = [
        advisory("G-AIRMET", "IFR", 10.0),
        advisory("Convective SIGMET", "Convective", 40.0),
        tfr,
        advisory("SIGMET", "Turbulence", 5.0),
    ];
    let (rows, more) = adverse_rows(&all);
    let titles: Vec<&str> = rows.iter().map(|r| r.title.as_str()).collect();
    assert_eq!(titles, ["TFR 6/4116 Madison", "Convective SIGMET", "SIGMET: Turbulence"]);
    assert_eq!(more, 1);
    assert_eq!((rows[0].finding, rows[0].tab, rows[0].time_kind), ("stop", "preflight", Some("at")));
    assert_eq!((rows[2].section, rows[2].time_kind), ("Adverse Conditions", Some("until")));
}

#[test]
fn of_a_kind_the_one_met_first_along_the_route_first() {
    let (rows, _) = adverse_rows(&[advisory("G-AIRMET", "Icing, moderate", 90.0), advisory("G-AIRMET", "IFR", 12.0)]);
    assert_eq!(rows[0].title, "G-AIRMET: IFR");
    assert_eq!(rows[0].finding, "caution");
}

#[test]
fn a_tfr_only_near_a_routine_pirep_and_a_hazard_after_the_flight_are_left_to_their_pages() {
    let near = Advisory { source: "TFR".into(), crosses: false, ..Advisory::default() };
    let routine = Advisory { source: "PIREP".into(), ..Advisory::default() };
    let after = Advisory { when: Some("after".into()), ..advisory("SIGMET", "Icing", 3.0) };
    assert_eq!(adverse_rows(&[near, routine, after]), (vec![], 0));
}

#[test]
fn an_urgent_pirep_is_a_caution_with_its_time() {
    let uua = Advisory {
        source: "PIREP".into(),
        name: Some("Turbulence severe".into()),
        urgent: true,
        issued: Some("2026-11-21T13:05:00Z".into()),
        ..Advisory::default()
    };
    let (rows, _) = adverse_rows(&[uua]);
    assert_eq!(rows[0].title, "Urgent pilot report: Turbulence severe");
    assert_eq!((rows[0].finding, rows[0].time_kind), ("caution", Some("reported")));
}

#[test]
fn answers_json_by_name() {
    let v = crate::json::parse(
        r#"{"advisories":[{"source":"CWA","name":"Thunderstorms","when":null,"enter":null,"valid_to":null,"issued":null,"from_nm":null,"legs":[2],"crosses":false,"urgent":false}]}"#,
    )
    .unwrap();
    assert_eq!(
        call("gonogo_adverse_rows", &v).unwrap(),
        r#"{"rows":[{"source":"CWA","title":"Center weather advisory: Thunderstorms","finding":"caution","tab":"enroute","section":"Adverse Conditions","time_kind":null,"time":null,"legs":[2]}],"more":0}"#
    );
}
