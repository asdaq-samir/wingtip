use super::*;

// On the equator a degree of longitude is about 60 nm, so the fields
// are where their longitudes say along a course due east from 0,0;
// 10 gal/h at 100 kt, a tenth of a gallon and 0.6 min a mile.
const START: Point = (0.0, 0.0);
const END: Point = (0.0, 10.0);
const FIG: Figures =
    Figures { fuel_per_nm: 0.1, min_per_nm: 0.6, usable_gal: 40.0, start_gal: 40.0, taxi_gal: 1.0, reserve_gal: 5.0, alternate_gal: 0.0, ground_min: 30.0 };

fn fields(rows: &[(&str, f64, f64)]) -> Vec<Field> {
    rows.iter()
        .map(|&(ident, lat, lon)| Field {
            ident: ident.into(),
            faa_ident: ident.into(),
            name: format!("{ident} FIELD"),
            city: "SOMEWHERE".into(),
            lat,
            lon,
            elevation_ft: Some(500.0),
            fuel_types: "100LL".into(),
            runway_ft: if ident == "SHORT" { 1800.0 } else { 5000.0 },
        })
        .collect()
}

fn idents(stops: &[FuelStop]) -> Vec<&str> {
    stops.iter().map(|s| s.field.ident.as_str()).collect()
}

#[test]
fn no_stop_where_the_tanks_hold_the_flight() {
    let (s, c) = suggest(START, (0.0, 3.0), &FIG, &fields(&[("MID", 0.0, 1.5)]), &[]);
    assert!(s.is_empty() && c.is_empty());
}

#[test]
fn one_stop_on_the_line_before_one_off_it() {
    let (s, c) = suggest(START, END, &FIG, &fields(&[("ONLINE", 0.0, 5.0), ("OFFLINE", 0.3, 5.0)]), &[]);
    assert_eq!(idents(&s), vec!["ONLINE"]);
    assert_eq!(idents(&c), vec!["OFFLINE"]);
    assert!(s[0].added_nm.abs() <= 0.1);
    // 300 nm at 0.1 gal a mile and the taxi allowance from 40 gal.
    assert!((s[0].lands_with_gal - 9.0).abs() <= 0.3);
}

#[test]
fn of_two_as_quick_the_nearer_the_line_then_the_one_with_more_fuel() {
    let (s, _) = suggest(START, END, &FIG, &fields(&[("EARLY", 0.0, 4.5), ("MIDDLE", 0.0, 5.0)]), &[]);
    assert_eq!(idents(&s), vec!["MIDDLE"]);
    let (s, c) = suggest(START, END, &FIG, &fields(&[("EARLY", 0.0, 4.5), ("MIDDLE", 0.07, 5.0)]), &[]);
    assert_eq!(idents(&s), vec!["EARLY"]);
    assert_eq!(idents(&c), vec!["MIDDLE"]);
}

#[test]
fn every_landing_keeps_the_reserve_and_a_long_trip_gets_every_stop() {
    // The tanks reach 340 nm (40 - 1 - 5 gal at 0.1 a mile).
    assert!(suggest(START, END, &FIG, &fields(&[("FAR", 0.0, 6.0)]), &[]).0.is_empty());
    let (s, _) = suggest(START, (0.0, 15.0), &FIG, &fields(&[("A", 0.0, 5.0), ("B", 0.0, 10.0)]), &[]);
    assert_eq!(idents(&s), vec!["A", "B"]);
    assert!((s[1].from_nm - 600.0).abs() <= 2.0);
    assert!(s.iter().all(|x| x.lands_with_gal >= FIG.reserve_gal));
    let four: Vec<(String, f64, f64)> = (1..5).map(|k| (format!("S{k}"), 0.0, 5.0 * k as f64)).collect();
    let rows: Vec<(&str, f64, f64)> = four.iter().map(|(i, a, b)| (i.as_str(), *a, *b)).collect();
    let (s, _) = suggest(START, (0.0, 25.0), &FIG, &fields(&rows), &[]);
    assert_eq!(idents(&s), vec!["S1", "S2", "S3", "S4"]);
}

#[test]
fn a_short_runway_and_the_routes_own_fields_are_never_offered() {
    let (s, c) = suggest(START, END, &FIG, &fields(&[("SHORT", 0.0, 5.0), ("MINE", 0.0, 4.5), ("OK", 0.0, 5.5)]), &["MINE".into()]);
    let all: Vec<&str> = idents(&s).into_iter().chain(idents(&c)).collect();
    assert_eq!(all, vec!["OK"]);
}

#[test]
fn the_fields_along_each_flight_in_route_order() {
    let flights = vec![("A".to_owned(), START, (0.0, 5.0)), ("MID".to_owned(), (0.0, 5.0), END)];
    let found = along(
        &flights,
        &["A".into(), "MID".into(), "B".into()],
        &fields(&[
            ("LATE", 0.0, 4.0),
            ("EARLY", 0.0, 1.0),
            ("SECOND", 0.1, 7.0),
            ("OFF", 3.0, 2.0),
            ("MID", 0.0, 5.0),
            ("SHORT", 0.0, 3.0),
        ]),
    );
    let got: Vec<(&str, usize, &str)> = found.iter().map(|a| (a.field.ident.as_str(), a.flight, a.departure.as_str())).collect();
    assert_eq!(got, vec![("EARLY", 0, "A"), ("LATE", 0, "A"), ("SECOND", 1, "MID")]);
    assert!((found[0].from_nm - 60.0).abs() <= 1.0);
}

#[test]
fn less_fuel_at_the_start_lands_sooner() {
    // 480 nm. Full, 340 nm the first stretch: MIDDLE, 300 nm out, its
    // landings keeping the more fuel. With 25 gal on board at engine start
    // the first stretch reaches 190 nm: the stop is EARLY, 150 nm out,
    // landing with 25 - 1 - 15 = 9 gal, the tanks filled there for the 330.
    let (end, fields) = ((0.0, 8.0), fields(&[("EARLY", 0.0, 2.5), ("MIDDLE", 0.0, 5.0)]));
    assert_eq!(idents(&suggest(START, end, &FIG, &fields, &[]).0), vec!["MIDDLE"]);
    let (s, _) = suggest(START, end, &Figures { start_gal: 25.0, ..FIG }, &fields, &[]);
    assert_eq!(idents(&s), vec!["EARLY"]);
    assert!((s[0].lands_with_gal - 9.0).abs() <= 0.3);
}

#[test]
fn under_ifr_the_last_stretch_keeps_the_alternates_fuel() {
    // 14 CFR 91.167(a)(2): to the destination, on to the alternate and the
    // reserve after. 320 nm direct, 40 - 1 - 32 = 7 gal on landing: over
    // the 5 gal reserve, no stop; with 3 gal on to the alternate it needs 8,
    // and a stop is offered where none was (the aviation audit, F7.1).
    let end = (0.0, 320.0 / 60.0);
    let rows = fields(&[("MID", 0.0, end.1 / 2.0)]);
    assert!(suggest(START, end, &FIG, &rows, &[]).0.is_empty());
    let (s, _) = suggest(START, end, &Figures { alternate_gal: 3.0, ..FIG }, &rows, &[]);
    assert_eq!(idents(&s), vec!["MID"]);
    // A stop whose stretch on into the destination cannot keep it too is
    // not one: 330 nm from MID leaves 40 - 1 - 33 = 6, under 5 + 3.
    let far = (0.0, (160.0 + 330.0) / 60.0);
    let rows = fields(&[("MID", 0.0, 160.0 / 60.0)]);
    assert_eq!(idents(&suggest(START, far, &FIG, &rows, &[]).0), vec!["MID"]);
    assert!(suggest(START, far, &Figures { alternate_gal: 3.0, ..FIG }, &rows, &[]).0.is_empty());
}
