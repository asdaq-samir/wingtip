//! wingtip.performance's own tests (services/planner/tests_wingtip/
//! test_performance.py), moved with it.
use super::*;

fn c172() -> Airplane {
    Airplane {
        service_ceiling_ft: 13500.0,
        climb_rate_fpm_sea_level: Some(730.0),
        cruise_tas_kt: 110.0,
        fuel_burn_gph: 8.5,
        cruise_power_pct: Some(65.0),
        climb_tas_kt: Some(74.0),
        climb_fuel_burn_gph: Some(11.0),
        ..Default::default()
    }
}

fn standard_sigma(ft: f64) -> f64 {
    density_ratio(ft, isa_temp_c(ft))
}

fn close(a: f64, b: f64, tol: f64) -> bool {
    (a - b).abs() <= tol
}

#[test]
fn a_standard_days_density_altitude_is_the_altitude() {
    for ft in [0.0, 5000.0, 12500.0] {
        assert!(close(density_altitude_ft(standard_sigma(ft)), ft, 0.5));
    }
    // The standard atmosphere's own table: 0.7860 at 8,000 ft.
    assert!(close(standard_sigma(8000.0), 0.7860, 0.0005));
}

#[test]
fn warm_air_is_about_120_ft_of_density_altitude_a_degree() {
    let sigma = density_ratio(5000.0, isa_temp_c(5000.0) + 15.0);
    let more = density_altitude_ft(sigma) - 5000.0;
    assert!(close(more, 1800.0, 180.0), "{more}");
}

#[test]
fn the_profiles_figures_are_its_cruise_at_the_reference_altitude() {
    let c = c172().cruise(REFERENCE_ALTITUDE_FT, None);
    assert!(close(c.tas_kt, 110.0, 1e-9) && close(c.fuel_burn_gph, 8.5, 1e-9) && c.power_pct == Some(65.0));
}

#[test]
fn at_the_same_power_thinner_air_is_faster_and_burns_the_same() {
    let (low, high) = (c172().cruise(2500.0, None), c172().cruise(8500.0, None));
    let want = (standard_sigma(2500.0) / standard_sigma(8500.0)).powf(1.0 / 3.0);
    assert!(close(high.tas_kt / low.tas_kt, want, 1e-9));
    assert!(high.tas_kt > 112.0 && 107.0 > low.tas_kt);
    assert!(close(high.fuel_burn_gph, 8.5, 1e-9) && close(low.fuel_burn_gph, 8.5, 1e-9));
    let warm = c172().cruise(4500.0, Some(isa_temp_c(4500.0) + 15.0));
    assert!(warm.tas_kt > c172().cruise(4500.0, None).tas_kt);
    assert!(close(warm.density_altitude_ft, 6220.0, 50.0));
}

#[test]
fn above_its_full_throttle_height_the_engine_makes_less_and_burns_less() {
    // 75% is full throttle at about 8,000 ft on a standard day.
    let archer = Airplane { cruise_tas_kt: 125.0, fuel_burn_gph: 9.5, cruise_power_pct: Some(75.0), ..c172() };
    let (at_7000, at_10500) = (archer.cruise(7000.0, None), archer.cruise(10500.0, None));
    let pct = at_10500.power_pct.unwrap();
    assert!(close(at_7000.power_pct.unwrap(), 75.0, 1e-9));
    assert!(close(pct, (1.132 * standard_sigma(10500.0) - 0.132) * 100.0, 1e-9));
    assert!(pct < 70.0);
    assert!(close(at_10500.fuel_burn_gph, 9.5 * pct / 75.0, 1e-9));
}

#[test]
fn the_climb_falls_to_100_fpm_at_the_service_ceiling() {
    assert_eq!(climb_rate_fpm(730.0, 13500.0, 0.0), 730.0);
    assert!(close(climb_rate_fpm(730.0, 13500.0, 13500.0), 100.0, 1e-9));
    assert_eq!(climb_rate_fpm(730.0, 13500.0, 30000.0), MIN_CLIMB_RATE_FPM);
}

#[test]
fn a_climbs_minutes_are_the_straight_lines_integral() {
    let b: f64 = 630.0 / 13500.0;
    let climber = Climber::new(&c172());
    let climb = climber.climb(1000.0, 8000.0, 0.0);
    let want = ((730.0 - b * 1000.0) / (730.0 - b * 8000.0)).ln() / b;
    assert!(((climb.minutes - want) / want).abs() < 1e-3);
    assert!(climb.minutes / 60.0 * 8.5 < climb.gallons && climb.gallons < climb.minutes / 60.0 * 11.0);
    assert_eq!(climber.climb(8000.0, 1000.0, 0.0), Climb::default());
}

#[test]
fn a_warm_days_climb_is_slower() {
    let climber = Climber::new(&c172());
    assert!(climber.climb(1000.0, 8000.0, 15.0).minutes > climber.climb(1000.0, 8000.0, 0.0).minutes * 1.15);
}

#[test]
fn the_service_ceiling_comes_down_on_a_warm_day_and_up_on_a_cold_one() {
    let isa_plus = |dev: f64| move |ft: f64| isa_temp_c(ft) + dev;
    assert!(close(altitude_at_density_altitude(13500.0, isa_plus(0.0)), 13500.0, 1.0));
    let warm = altitude_at_density_altitude(13500.0, isa_plus(15.0));
    let cold = altitude_at_density_altitude(13500.0, isa_plus(-10.0));
    assert!(11500.0 < warm && warm < 12000.0 && 14500.0 < cold && cold < 15000.0);
}

#[test]
fn a_profiles_cruise_is_at_the_altitude_its_handbook_quotes() {
    // A C152's 75% is quoted at 8,000 ft (its handbook's figure 5-7).
    let c152 = Airplane {
        cruise_tas_kt: 107.0,
        fuel_burn_gph: 6.1,
        cruise_power_pct: Some(75.0),
        cruise_altitude_ft: Some(8000.0),
        service_ceiling_ft: 14700.0,
        ..Default::default()
    };
    let at_8000 = c152.cruise(8000.0, None);
    assert!(close(at_8000.tas_kt, 107.0, 0.5) && close(at_8000.fuel_burn_gph, 6.1, 0.05));
    assert!(c152.cruise(6000.0, None).tas_kt < 107.0);
}

#[test]
fn a_profile_with_no_cruise_power_or_climb_burn_assumes_neither() {
    // The owner's rule (2026-11-09): no other airplane's figure fills a
    // gap. No cruise power: the TAS and burn as given at any altitude.
    let own = Airplane { cruise_power_pct: None, climb_fuel_burn_gph: None, ..c172() };
    let high = own.cruise(9500.0, Some(isa_temp_c(9500.0) + 10.0));
    assert_eq!((high.tas_kt, high.fuel_burn_gph, high.power_pct), (110.0, 8.5, None));
    assert!(high.density_altitude_ft > 9500.0);
    // No climb burn: the climb's minutes, its gallons not known.
    assert_eq!(own.climb_burn_gph(), None);
    let climber = Climber::new(&own);
    assert!(!climber.burn_known());
    let climb = climber.climb(1000.0, 8000.0, 0.0);
    assert!(climb.minutes > 0.0 && climb.gallons == 0.0);
}
