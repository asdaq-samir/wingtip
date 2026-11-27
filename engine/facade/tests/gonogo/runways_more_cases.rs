use super::minimums_cases::wind;
use super::runways_cases::{airplane, ends, fields, runway, standard};
use super::*;

#[test]
fn takes_off_from_the_departure_and_lands_at_the_destination_on_the_runway_the_wind_favours() {
    let checks = runways::runway_checks(&airplane(), true, &standard(), Some(2550.0), Some(2400.0), None);
    let (start, end) = (&checks[0], &checks[1]);
    assert_eq!(start.role, "Departure");
    assert_eq!(start.distances.iter().map(|d| d.kind).collect::<Vec<_>>(), ["takeoff"]);
    assert_eq!(end.distances.iter().map(|d| d.kind).collect::<Vec<_>>(), ["landing"]);
    // A closed runway is not one to land on, however long.
    assert_eq!(end.runway, Some(0));
    assert!(!end.reported);
}

#[test]
fn says_a_runway_too_short_and_a_crosswind_past_the_172s_demonstrated_15_kt() {
    let checks = runways::runway_checks(&airplane(), true, &standard(), Some(2550.0), Some(2400.0), None);
    let (start, end) = (&checks[0], &checks[1]);
    assert!(start.distances[0].over);
    assert_eq!(start.crosswind_kt, 18.0);
    assert!(start.crosswind_over);
    assert!(start.density_alt_ft > start.pressure_alt_ft);
    assert!(!end.distances[0].over);
    assert!(!end.crosswind_over);
}

pub(super) fn picked_field() -> Vec<Field> {
    let mut f = standard();
    f[1].runways = vec![
        Runway { ends: ends("09", 0.0, "27", 180.0), ..runway(9000.0, 10.0, 3.0) },
        Runway { ends: ends("18", 0.0, "36", 180.0), wind: Some(wind("36", 8.0, 0.0, None)), ..runway(1200.0, 8.0, 0.0) },
    ];
    f
}

#[test]
fn checks_the_runway_the_pilot_picked_whatever_the_wind_with_the_wind_on_the_end_picked() {
    let a = airplane();
    let into = &runways::runway_checks(&a, true, &picked_field(), Some(2550.0), Some(2400.0), None)[1];
    assert_eq!((into.end.as_deref(), into.picked, into.distances[0].over), (Some("27"), false, false));
    let picks = Picks { pattern: vec![(s("KDLH"), s("18"))], takeoff: vec![] };
    let flown = &runways::runway_checks(&a, true, &picked_field(), Some(2550.0), Some(2400.0), Some(&picks))[1];
    // 18 is the far end of the wind's 36: its headwind is a tailwind.
    assert_eq!((flown.end.as_deref(), flown.picked, flown.headwind_kt, flown.runway), (Some("18"), true, -8.0, Some(1)));
    assert!(flown.distances[0].over);
}

#[test]
fn is_not_worked_out_without_the_pohs_tables() {
    let no_takeoff = Airplane { takeoff: None, ..airplane() };
    assert!(runways::runway_checks(&no_takeoff, true, &standard(), Some(2550.0), Some(2400.0), None).is_empty());
    assert!(runways::runway_checks(&airplane(), false, &standard(), Some(2550.0), Some(2400.0), None).is_empty());
}

#[test]
fn a_variable_wind_with_no_runway_component_is_all_crosswind_gusts_included() {
    // runwayCheck.ts (AIM 7-1-28): a VRB wind gives the runways no
    // components, and all of it, gusts included, may be across -- past the
    // 172's demonstrated 15 kt, the Runways caution. The Python gave 0.
    let vrb = Report {
        temp_c: Some(15.0),
        altimeter_in_hg: Some(29.92),
        wind_dir_true_deg: None,
        wind_speed_kt: Some(12.0),
        wind_gust_kt: Some(22.0),
        wind_variable_deg: None,
    };
    let calm_runway = Runway { wind: None, ..runway(5000.0, 0.0, 0.0) };
    let f = fields(vec![calm_runway.clone()], vec![runway(9000.0, 10.0, 3.0)], Some(vrb));
    let start = &runways::runway_checks(&airplane(), true, &f, Some(2550.0), Some(2400.0), None)[0];
    assert_eq!((start.crosswind_kt, start.crosswind_over, start.headwind_kt), (22.0, true, 0.0));
    // A wind with a direction, which gives the runways components, or none
    // at all, is not.
    let steady = Report { wind_dir_true_deg: Some(270.0), ..vrb };
    let f = fields(vec![calm_runway.clone()], vec![], Some(steady));
    assert_eq!(runways::runway_checks(&airplane(), true, &f, Some(2550.0), Some(2400.0), None)[0].crosswind_kt, 0.0);
    let calm = Report { wind_speed_kt: Some(0.0), wind_gust_kt: None, ..vrb };
    let f = fields(vec![calm_runway], vec![], Some(calm));
    assert_eq!(runways::runway_checks(&airplane(), true, &f, Some(2550.0), Some(2400.0), None)[0].crosswind_kt, 0.0);
}

pub(super) fn flown_runway(pairs: &[(&str, f64)], length: f64, w: Option<RunwayWind>, closed: bool) -> Runway {
    Runway {
        surface: Some(s("ASP")),
        length_ft: Some(length),
        closed,
        ends: pairs.iter().map(|(i, h)| End { ident: s(i), heading_true_deg: Some(*h), ..End::default() }).collect(),
        wind: w,
    }
}

pub(super) fn field() -> Vec<Runway> {
    vec![
        flown_runway(&[("09", 90.0), ("27", 270.0)], 6000.0, Some(wind("27", 12.0, 1.0, None)), false),
        flown_runway(&[("18", 180.0), ("36", 360.0)], 2400.0, Some(wind("36", 0.0, -12.0, None)), false),
    ]
}

#[test]
fn runway_flown_the_pilots_pick_where_they_made_one_even_off_the_wind() {
    assert_eq!(runways::runway_flown(&field(), Some("36")), Some((1, 1, true)));
}

#[test]
fn runway_flown_else_the_runway_most_nearly_into_the_wind() {
    assert_eq!(runways::runway_flown(&field(), None), Some((0, 1, true)));
    assert_eq!(runways::runway_flown(&field(), Some("NONE")).map(|f| (f.0, f.1)), Some((0, 1)));
}

#[test]
fn a_pick_on_a_closed_runway_or_one_the_field_doesnt_have_falls_back_to_the_winds() {
    let closed = vec![field().remove(0), flown_runway(&[("18", 180.0), ("36", 360.0)], 2400.0, None, true)];
    assert_eq!(runways::runway_flown(&closed, Some("36")).map(|f| (f.0, f.1)), Some((0, 1)));
    assert_eq!(runways::runway_flown(&field(), Some("4")).map(|f| (f.0, f.1)), Some((0, 1)));
}

pub(super) fn picks() -> Picks {
    Picks { pattern: vec![(s("C81"), s("24")), (s("UES"), s("10")), (s("KDLH"), s("NONE"))], takeoff: vec![(s("UES"), s("28"))] }
}

#[test]
fn picked_end_the_departures_runway_out_and_every_fields_runway_in_from_pattern_a_stops_runway_out_from_takeoff() {
    let p = picks();
    assert_eq!(runways::picked_end(Some(&p), "C81", true, true), Some("24"));
    assert_eq!(runways::picked_end(Some(&p), "UES", false, false), Some("10"));
    assert_eq!(runways::picked_end(Some(&p), "UES", true, false), Some("28"));
}

#[test]
fn picked_end_by_the_fields_icao_or_faa_ident_alike_none_for_no_pick_or_the_pilots_none() {
    let p = picks();
    assert_eq!(runways::picked_end(Some(&p), "KUES", false, false), Some("10"));
    assert_eq!(runways::picked_end(Some(&p), "KDLH", false, false), None);
    assert_eq!(runways::picked_end(Some(&p), "KMSN", false, false), None);
    assert_eq!(runways::picked_end(None, "C81", true, true), None);
}

#[test]
fn a_pick_is_matched_to_its_field_as_lib_procedures_same_field_matches() {
    // Trimmed, upper-cased, and a K taken off only before three letters or
    // figures. The Python took the K off before upper-casing and without
    // trimming, so "kues" and " KUES " missed, and took it off "K-1A".
    let p = Picks { pattern: vec![(s(" kues "), s("10")), (s("K-1A"), s("5"))], takeoff: vec![] };
    assert_eq!(runways::picked_end(Some(&p), "UES", false, false), Some("10"));
    assert_eq!(runways::picked_end(Some(&p), "kues", false, false), Some("10"));
    assert_eq!(runways::picked_end(Some(&p), "-1A", false, false), None);
    assert_eq!(runways::picked_end(Some(&p), "K-1A", false, false), Some("5"));
    assert_eq!(runways::bare_ident(" kdlh"), "DLH");
    assert_eq!(runways::bare_ident("KX1"), "KX1");
}
