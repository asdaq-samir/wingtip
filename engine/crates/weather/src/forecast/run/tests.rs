use super::checks::{under_mine, under_vfr};
use super::*;
use crate::json;

fn sample(t: f64, lon: f64, alt: f64, row: usize) -> Sample {
    Sample { t, lat: 45.0, lon, alt_ft: Some(alt), row, modelled: Vec::new(), winds: Vec::new() }
}

fn met(ceiling: Option<f64>, vis: Option<f64>, ground: Option<f64>) -> Met {
    Met { ceiling_ft: ceiling, visibility_sm: vis, ground_ft: ground, ..Met::default() }
}

fn values(text: &str) -> Vec<Value> {
    json::parse(text).unwrap().as_array().unwrap().to_vec()
}

fn input<'a>(track: Vec<Sample>, tafs: &'a [Value], areas: (&'a [Value], &'a [Value], &'a [Value])) -> Input<'a> {
    Input {
        track,
        fields: Vec::new(),
        tafs,
        sigmets: areas.0,
        gairmets: areas.1,
        outlooks: areas.2,
        vfr: true,
        minimums: Minimums::default(),
    }
}

// 14 CFR 91.155(a)'s table: 3 statute miles below 10,000 ft MSL, 5 at or
// above; a visibility of exactly the minimum is not under it.
#[test]
fn visibility_against_the_table_either_side_of_10000_ft() {
    assert!(under_vfr(&met(None, Some(3.0), None), Some(9500.0)).is_empty());
    assert_eq!(under_vfr(&met(None, Some(2.75), None), Some(9500.0)), vec!["visibility 2.75 sm, under 3 sm"]);
    assert_eq!(under_vfr(&met(None, Some(4.0), None), Some(10_000.0)), vec!["visibility 4 sm, under 5 sm"]);
    assert!(under_vfr(&met(None, Some(5.0), None), Some(10_000.0)).is_empty());
}

// 91.155(c): no VFR beneath a ceiling lower than 1,000 ft (held along the
// whole route, the safer reading); 1,000 ft itself is not lower.
#[test]
fn ceiling_against_the_surface_area_floor() {
    assert!(under_vfr(&met(Some(1000.0), Some(10.0), None), None).is_empty());
    assert_eq!(under_vfr(&met(Some(900.0), Some(10.0), None), None), vec!["ceiling 900 ft, under 1,000 ft"]);
    let unknown = Met { ceiling_unknown: true, visibility_sm: Some(10.0), ..Met::default() };
    assert_eq!(under_vfr(&unknown, None), vec!["a ceiling of unknown height"]);
}

// 91.155(a): 500 ft below the clouds under 10,000 ft MSL, 1,000 ft at or
// above. A 3,000 ft ceiling over a 1,000 ft field is a 4,000 ft MSL base:
// 3,500 ft is just clear, 3,600 ft is not.
#[test]
fn distance_below_the_clouds() {
    let m = met(Some(3000.0), Some(10.0), Some(1000.0));
    assert!(under_vfr(&m, Some(3500.0)).is_empty());
    assert_eq!(under_vfr(&m, Some(3600.0)), vec!["cloud base 4,000 ft MSL, less than 500 ft above 3,600 ft"]);
    let high = met(Some(10_000.0), Some(10.0), Some(1000.0));
    assert!(under_vfr(&high, Some(10_000.0)).is_empty());
    assert_eq!(under_vfr(&high, Some(10_500.0)).len(), 1);
}

#[test]
fn the_pilots_own_minimums() {
    let mine = Minimums { ceiling_ft: Some(2000.0), visibility_sm: Some(5.0) };
    assert!(under_mine(&met(Some(2000.0), Some(5.0), None), &mine).is_empty());
    assert_eq!(under_mine(&met(Some(1500.0), Some(4.0), None), &mine).len(), 2);
    assert!(under_mine(&met(Some(500.0), Some(1.0), None), &Minimums::default()).is_empty());
}

// The TAF read is the one in force when the airplane gets there: VFR at
// the first sample, IFR from 1 h on (an FM group).
const TAF: &str = r#"[{"icaoId":"KAAA","lat":45.0,"lon":-93.0,"elevation_ft":900,"fcsts":[
    {"timeFrom":0,"timeTo":3600,"change":"","ceiling_ft":null,"ceiling_unknown":false,"visibility_sm":6},
    {"timeFrom":3600,"timeTo":7200,"change":"FM","ceiling_ft":800,"ceiling_unknown":false,"visibility_sm":2}]}]"#;

#[test]
fn the_forecast_for_when_the_airplane_gets_there() {
    let tafs = values(TAF);
    let track = vec![sample(600.0, -93.0, 3500.0, 1), sample(1800.0, -93.0, 3500.0, 1), sample(4000.0, -93.0, 3500.0, 2)];
    let r = run(&input(track, &tafs, (&[], &[], &[])));
    let cats: Vec<_> = r.samples.iter().map(|s| s.met.category).collect();
    assert_eq!(cats, vec![Some("VFR"), Some("VFR"), Some("IFR")]);
    assert_eq!(r.legs.iter().map(|l| (l.row, l.category)).collect::<Vec<_>>(), vec![(1, Some("VFR")), (2, Some("IFR"))]);
    // One alert as the run goes under, cited.
    let vfr: Vec<_> = r.alerts.iter().filter(|a| a.kind == Kind::VfrMinimums).collect();
    assert_eq!(vfr.len(), 1);
    assert_eq!(vfr[0].t, 4000.0);
    assert!(vfr[0].words.starts_with("At 0106Z"));
    assert!(vfr[0].source.starts_with("14 CFR 91.155; TAF KAAA"));
}

#[test]
fn ifr_flight_is_not_held_to_vfr_minimums() {
    let tafs = values(TAF);
    let mut i = input(vec![sample(4000.0, -93.0, 3500.0, 1)], &tafs, (&[], &[], &[]));
    i.vfr = false;
    assert!(run(&i).alerts.is_empty());
}

// The worse of the TAF and the Gridded LAMP's hour, the TAF where they
// agree; a model hour more than half an hour off is not read.
#[test]
fn the_worse_of_taf_and_model() {
    let tafs = values(TAF);
    let mut s = sample(600.0, -93.0, 3500.0, 1);
    s.modelled = vec![Modelled { valid: 0.0, ceiling_ft: Some(700.0), visibility_sm: Some(5.0) }];
    let r = run(&input(vec![s.clone()], &tafs, (&[], &[], &[])));
    assert_eq!(r.samples[0].met.category, Some("IFR"));
    assert_eq!(r.samples[0].met.source, Some(Source::Modelled { valid: 0.0 }));
    s.modelled[0].valid = 3600.0;
    let r = run(&input(vec![s], &tafs, (&[], &[], &[])));
    assert_eq!(r.samples[0].met.source, Some(Source::Taf { ident: "KAAA".into(), nm: 0.0 }));
}

#[test]
fn winds_from_the_period_covering_the_time() {
    let mut s = sample(5000.0, -93.0, 6000.0, 1);
    let levels = |d: f64| vec![(3000.0, Some(d), 10.0), (9000.0, Some(d), 30.0)];
    s.winds =
        vec![WindPeriod { from: 0.0, to: 3600.0, levels: levels(180.0) }, WindPeriod { from: 3600.0, to: 7200.0, levels: levels(270.0) }];
    let w = met::wind_at(&s).unwrap();
    assert_eq!((w.dir_true_deg, w.speed_kt), (270.0, 20.0));
    s.t = 9000.0;
    assert_eq!(met::wind_at(&s), None);
}

// A SIGMET is told once as the run enters it, only while in force and at
// its altitudes; a G-AIRMET snapshot 90 minutes either side of its time.
#[test]
fn advisory_areas_entered_while_in_force() {
    let ring = r#"[[44.0,-92.5],[46.0,-92.5],[46.0,-91.5],[44.0,-91.5]]"#;
    let sigmets = values(&format!(
        r#"[{{"hazard":"CONVECTIVE","type":"SIGMET","valid_from":1000,"valid_to":5000,"altitude_low_ft":null,"altitude_high_ft":null,"coords":{ring}}},
             {{"hazard":"ICE","type":"SIGMET","valid_from":0,"valid_to":9000,"altitude_low_ft":8000,"altitude_high_ft":12000,"coords":{ring}}}]"#
    ));
    let gairmets = values(&format!(r#"[{{"hazard":"Turbulence","valid":10800,"coords":{ring}}}]"#));
    let outlooks = values(&format!(r#"[{{"label":"SLGT","valid_from":0,"valid_to":86400,"coords":{ring}}}]"#));
    let track = vec![sample(2000.0, -93.0, 3500.0, 1), sample(3000.0, -92.0, 3500.0, 1), sample(4000.0, -92.0, 3500.0, 1)];
    let r = run(&input(track, &[], (&sigmets, &gairmets, &outlooks)));
    let kinds: Vec<_> = r.alerts.iter().map(|a| (a.t, a.kind)).collect();
    assert_eq!(kinds, vec![(3000.0, Kind::Sigmet), (3000.0, Kind::Outlook)]);
    assert_eq!(r.areas.len(), 2);
    assert!(r.alerts[0].words.contains("Convective SIGMET"));
    assert!(r.alerts[1].words.contains("slight risk"));
    // The G-AIRMET at 3 h covers 1.5 h to 4.5 h.
    let track = vec![sample(5500.0, -93.0, 3500.0, 1), sample(5600.0, -92.0, 3500.0, 1)];
    let r = run(&input(track, &[], (&[], &gairmets, &[])));
    assert_eq!(r.alerts.len(), 1);
    assert_eq!(r.alerts[0].source, "AWC G-AIRMET for 0300Z");
}

// A landing's TAF over an hour either side of the time it is in (91.169(a)(2)'s window).
#[test]
fn a_landings_forecast_at_its_time() {
    let tafs = values(TAF);
    let mut i = input(vec![sample(0.0, -93.0, 900.0, 0)], &tafs, (&[], &[], &[]));
    i.fields = vec![Field { ident: "AAA".into(), role: Role::Destination, t: 3000.0, lat: 45.0, lon: -93.0 }];
    let r = run(&i);
    assert_eq!(r.fields[0].met.category, Some("IFR"));
    assert!(r.alerts.iter().any(|a| a.kind == Kind::VfrMinimums && a.words.starts_with("AAA at 0050Z (destination)")));
}

#[test]
fn zulu_times() {
    assert_eq!(zulu(0.0), "0000Z");
    assert_eq!(zulu(86_400.0 + 14.0 * 3600.0 + 20.0 * 60.0), "1420Z");
}
