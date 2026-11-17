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
