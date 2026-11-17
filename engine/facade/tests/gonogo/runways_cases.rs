use super::minimums_cases::wind;
use super::*;

// --- runways ----------------------------------------------------------------

pub(super) fn c172() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/aircraft/c172.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

pub(super) fn floats(v: &Value) -> Vec<f64> {
    v.as_array().unwrap().iter().map(|x| x.as_f64().unwrap()).collect()
}

pub(super) fn grid(v: &Value) -> Vec<Vec<f64>> {
    v.as_array().unwrap().iter().map(floats).collect()
}

pub(super) fn table(v: &Value) -> ShortField {
    let tables = v["tables"].as_array().unwrap();
    ShortField {
        pressure_altitudes_ft: floats(&v["pressure_altitudes_ft"]),
        temperatures_c: floats(&v["temperatures_c"]),
        weights_lb: floats(&v["weights_lb"]),
        ground_roll_ft: tables.iter().map(|t| grid(&t["ground_roll_ft"])).collect(),
        total_50ft_ft: tables.iter().map(|t| grid(&t["total_50ft_ft"])).collect(),
        grass_ground_roll_pct: v["grass_ground_roll_pct"].as_f64().unwrap(),
        headwind_kt_per_10pct: v["headwind_kt_per_10pct"].as_f64(),
        tailwind_kt_per_10pct: v["tailwind_kt_per_10pct"].as_f64(),
        tailwind_max_kt: v["tailwind_max_kt"].as_f64(),
    }
}

pub(super) fn airplane() -> Airplane {
    let p = c172();
    Airplane {
        takeoff: Some(table(&p["takeoff"])),
        landing: Some(table(&p["landing"])),
        demonstrated_kt: p["crosswind"]["demonstrated_kt"].as_f64(),
    }
}

pub(super) fn loading() -> Loading {
    let l = &c172()["loading"];
    Loading {
        max_ramp_lb: l["max_ramp_lb"].as_f64().unwrap(),
        max_takeoff_lb: l["max_takeoff_lb"].as_f64().unwrap(),
        max_landing_lb: l["max_landing_lb"].as_f64().unwrap(),
        sample_empty_weight_lb: l["sample_empty_weight_lb"].as_f64().unwrap(),
        sample_empty_moment_lb_in: l["sample_empty_moment_lb_in"].as_f64().unwrap(),
        stations: l["stations"]
            .as_array()
            .unwrap()
            .iter()
            .map(|st| Station {
                name: st["name"].as_str().unwrap().into(),
                arm_in: st["arm_in"].as_f64().unwrap(),
                max_lb: st["max_lb"].as_f64(),
            })
            .collect(),
        baggage_combined_max_lb: l["baggage_combined_max_lb"].as_f64(),
        fuel_arm_in: l["fuel_arm_in"].as_f64().unwrap(),
        fuel_max_gal: l["fuel_max_gal"].as_f64().unwrap(),
        fuel_lb_per_gal: l["fuel_lb_per_gal"].as_f64().unwrap_or(6.0),
        start_taxi_fuel_lb: l["start_taxi_fuel_lb"].as_f64().unwrap_or(0.0),
        envelope: l["envelope"].as_array().unwrap().iter().map(|p| (p[0].as_f64().unwrap(), p[1].as_f64().unwrap())).collect(),
    }
}

pub(super) fn load(arm: f64, stations: &[f64], fuel_gal: f64) -> Load {
    Load { empty_weight_lb: 1642.0, empty_arm_in: arm, stations_lb: stations.iter().map(|x| Some(*x)).collect(), fuel_gal }
}

#[test]
fn the_pohs_own_sample_loading_weighs_2550_lb_at_takeoff_within_the_envelope() {
    // Figure 6-5's sample: empty 1,642 lb at 62.6 (thousand lb-in), 30 gal,
    // 340 lb in front, 340 behind, 56 lb of baggage in area 1.
    let b = weight_balance::balance(&loading(), &load(62600.0 / 1642.0, &[340.0, 340.0, 56.0, 0.0], 30.0), Some(0.0));
    assert_eq!(b.takeoff.weight_lb, 2550.0);
    let expected = (62600.0 + 180.0 * 48.0 + 340.0 * 37.0 + 340.0 * 73.0 + 56.0 * 95.0 - 8.0 * 48.0) / 2550.0;
    assert!(near(b.takeoff.arm_in, expected, 1e-6));
    assert!(b.problems.is_empty());
}

#[test]
fn over_its_weight_and_the_baggage_over_its_own() {
    let b = weight_balance::balance(&loading(), &load(38.1, &[170.0, 400.0, 120.0, 50.0], 53.0), Some(10.0));
    assert!(b.problems.contains(&s("The takeoff weight, 2,692 lb, is 142 lb over its most")));
    assert!(b.problems.contains(&s("The baggage, 170 lb in all, is over its 120 lb")));
}

#[test]
fn the_envelope_is_the_pohs() {
    let envelope = loading().envelope;
    assert!(weight_balance::in_envelope(&envelope, 36.0, 1900.0));
    assert!(!weight_balance::in_envelope(&envelope, 36.0, 2500.0));
    assert!(!weight_balance::in_envelope(&envelope, 47.5, 2000.0));
}

#[test]
fn the_default_load_is_the_sample_airplane_and_a_pilot() {
    let d = weight_balance::default_load(&loading(), 40.0);
    assert_eq!(
        d,
        Load {
            empty_weight_lb: 1642.0,
            empty_arm_in: 38.12,
            stations_lb: vec![Some(170.0), Some(0.0), Some(0.0), Some(0.0)],
            fuel_gal: 40.0
        }
    );
}

#[test]
fn the_table_at_sea_level_and_15_c_half_way_between_its_10_and_20() {
    let d = runways::short_field(&airplane().takeoff.unwrap(), 0.0, 15.0, 2550.0, 0.0, false);
    assert_eq!((d.ground_roll_ft, d.total_ft, d.caveats.len()), (960.0, 1635.0, 0));
}

#[test]
fn on_grass_the_ground_rolls_15_pct_more() {
    let grass = runways::short_field(&airplane().takeoff.unwrap(), 0.0, 10.0, 2550.0, 0.0, true);
    assert_eq!((grass.ground_roll_ft, grass.total_ft), (1065.0, 1715.0));
}

#[test]
fn between_its_weights_and_its_one_landing_table_at_any_weight() {
    let a = airplane();
    assert_eq!(runways::short_field(a.takeoff.as_ref().unwrap(), 0.0, 0.0, 2475.0, 0.0, false).ground_roll_ft, 805.0);
    let landing = runways::short_field(a.landing.as_ref().unwrap(), 2000.0, 20.0, 2200.0, 0.0, false);
    assert_eq!((landing.ground_roll_ft, landing.total_ft), (630.0, 1420.0));
}

#[test]
fn density_altitude_is_the_pressure_altitude_on_a_standard_day_and_higher_the_hotter_it_is() {
    assert!(near(runways::density_altitude_ft(0.0, 15.0), 0.0, 1e-6));
    assert!(near(runways::density_altitude_ft(5000.0, 5.094), 5000.0, 5.0));
    let hot = runways::density_altitude_ft(5000.0, 25.0);
    assert!(7200.0 < hot && hot < 7400.0);
    assert!(runways::density_altitude_ft(2000.0, -10.0) < 2000.0);
}

#[test]
fn a_fields_air_off_the_altimeter_and_a_standard_days_temperature_where_none_is_reported() {
    let (pa, t) = runways::field_air(900.0, Some(29.42), Some(25.0));
    assert!(near(pa, 1400.0, 1e-9));
    assert_eq!(t, 25.0);
    let (pa, t) = runways::field_air(900.0, None, None);
    assert_eq!(pa, 900.0);
    assert!(near(t, 13.2, 0.05));
}

#[test]
fn takes_turf_grass_dirt_and_gravel_as_soft_and_asphalt_not() {
    let soft = |surface: &str| runways::soft_surface(Some(&Runway { surface: Some(s(surface)), ..Default::default() }));
    assert!(["TURF", "GRS", "grass", "DIRT", "GRAVEL-G"].iter().all(|x| soft(x)));
    assert!(!soft("ASPH-G"));
    assert!(!runways::soft_surface(None));
    assert_eq!(runways::runway_number("09"), "9");
    assert_eq!(runways::runway_number("00"), "0");
    assert_eq!(runways::runway_number("36L"), "36L");
}

pub(super) fn runway(length: f64, headwind: f64, crosswind: f64) -> Runway {
    Runway {
        surface: Some(s("ASP")),
        length_ft: Some(length),
        closed: false,
        ends: vec![],
        wind: Some(wind("27", headwind, crosswind, None)),
    }
}

pub(super) fn ends(a: &str, ha: f64, b: &str, hb: f64) -> Vec<End> {
    [(a, ha), (b, hb)].map(|(e, h)| End { ident: s(e), heading_true_deg: Some(h), ..End::default() }).to_vec()
}

pub(super) fn fields(c81: Vec<Runway>, kdlh: Vec<Runway>, c81_metar: Option<Report>) -> Vec<Field> {
    vec![
        Field { ident: s("C81"), elevation_ft: Some(900.0), metar: c81_metar, runways: c81 },
        Field { ident: s("KDLH"), elevation_ft: Some(1400.0), metar: None, runways: kdlh },
    ]
}

pub(super) fn standard() -> Vec<Field> {
    let hot = Report { temp_c: Some(30.0), altimeter_in_hg: Some(29.92), ..Default::default() };
    fields(
        vec![runway(1500.0, 2.0, 18.0)],
        vec![runway(9000.0, 10.0, 3.0), Runway { closed: true, ..runway(12000.0, 0.0, 0.0) }],
        Some(hot),
    )
}

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
