//! A light piston airplane in the day's air: the power its engine makes at
//! an altitude, what that power flies at and burns, and how fast it climbs,
//! from the density altitude the forecast temperature aloft gives. The
//! planner's wingtip.performance, moved here whole (#482 phase 4), so the
//! nav log (wingtip_route::navlog), the altitude selection and the phones
//! fly one airplane.
//!
//! A profile's cruise TAS and fuel burn -- a stock one's, or a pilot's own
//! airplane's laid over it -- are taken as the airplane's at its cruise
//! power (`cruise_power_pct`, DEFAULT_CRUISE_POWER_PCT where it names none)
//! at REFERENCE_ALTITUDE_FT on a standard day, or at the profile's own
//! `cruise_altitude_ft` where it names the row's: a row of a handbook's
//! cruise table. From there, at any altitude in any air:
//!
//! - Power is the cruise power, or what full throttle makes where the air
//!   is too thin for it: a normally aspirated engine's fraction of its
//!   sea-level power, 1.132 sigma - 0.132 (Gagg and Ferrar's correlation),
//!   sigma being the air's density over a standard day's at sea level.
//! - True airspeed goes as the cube root of power over density: the power
//!   level flight takes goes as density times TAS cubed, the parasite drag
//!   that most of a light airplane's drag at cruise is (FAA-H-8083-25C,
//!   PHAK ch. 5, "Drag").
//! - Fuel flow goes with power: a leaned engine burns much the same per
//!   horsepower at any altitude.
//! - A climb's best rate falls in a straight line with density altitude,
//!   from the sea-level figure to 100 fpm at the service ceiling, which is
//!   that by definition (FAA-H-8083-25C, PHAK ch. 11, "Service ceiling").
//!   It burns the climb's sea-level fuel flow in proportion to
//!   full-throttle power, at the climb speed.
//!
//! Pressure altitude is taken as the altitude itself: the winds/temps
//! forecast gives no pressure, and a METAR's altimeter setting is now's,
//! not the flight's. A model, not the handbook: within a few percent of a
//! light single's book figures, and the handbook governs.

use crate::flight::{density_altitude_ft, density_ratio, isa_temp_c};
use std::cell::RefCell;
use std::collections::HashMap;

/// The altitude a profile's cruise TAS and fuel burn are the airplane's
/// at, on a standard day: the flight module's CRUISE_REFERENCE_FT, the one
/// figure the apps say beside the figures (`planning_figures`).
pub const REFERENCE_ALTITUDE_FT: f64 = crate::flight::CRUISE_REFERENCE_FT;
/// The cruise power of a profile that names none: 65%, a light single's
/// usual economy-cruise setting (the stock profiles' own, data/aircraft).
pub const DEFAULT_CRUISE_POWER_PCT: f64 = 65.0;
/// The sea-level climb rate of a profile that gives none, fpm.
pub const DEFAULT_CLIMB_RATE_FPM: f64 = 500.0;
/// What the best climb has fallen to at the service ceiling, by the
/// ceiling's definition (PHAK ch. 11: the altitude where the best rate of
/// climb is 100 fpm).
pub const SERVICE_CEILING_CLIMB_FPM: f64 = 100.0;
/// The slowest climb flown. Past the service ceiling -- only a pilot's own
/// altitude goes there, the plans keep under it -- the straight line runs
/// down to nothing, and a climb that never ends is no nav log.
pub const MIN_CLIMB_RATE_FPM: f64 = 50.0;
/// A climb at full power burns more than cruise; the book figure for a
/// light single is around a third more. For a profile, or a pilot's own
/// airplane, with no climb burn of its own.
pub const CLIMB_FUEL_FACTOR: f64 = 1.3;
/// The least power a leg is flown at: full throttle makes next to nothing
/// far above anywhere a light airplane goes, and a pilot's own altitude
/// can be typed there.
pub const MIN_POWER_FRACTION: f64 = 0.05;

// The altitudes the formulas are asked at: below the lowest field, and
// above anything flown, where the pressure formula stops meaning much.
const LOWEST_FT: f64 = -2000.0;
const HIGHEST_FT: f64 = 60000.0;
// A climb's minutes and gallons, summed from the bottom of the table up in
// steps, for one airplane in one air: the plans price a climb between
// every pair of a leg's altitudes, and each is the difference of two sums.
const TABLE_STEP_FT: f64 = 100.0;
const TABLE_TOP_FT: f64 = 30000.0;

/// What the performance model reads of an airplane's profile
/// (data/aircraft/*.json, with a pilot's own figures laid over it). A
/// figure of 0 is taken as none, as the planner's `or` took it.
#[derive(Clone, Debug, Default)]
pub struct Airplane {
    pub cruise_tas_kt: f64,
    pub fuel_burn_gph: f64,
    pub cruise_power_pct: Option<f64>,
    pub cruise_altitude_ft: Option<f64>,
    /// The climb's true airspeed, knots, used as it is: not a handbook's
    /// Vy, which is indicated. The stock profiles' figure is worked from
    /// the POH's time, fuel and distance to climb (miles over minutes, a
    /// speed over the ground in still air, so a TAS; data/aircraft's
    /// `source` says so where it names the climb), and the apps ask a pilot for it as a
    /// TAS ("Climb speed (TAS)"). Converting it as if indicated would
    /// count the density twice.
    pub climb_tas_kt: Option<f64>,
    pub climb_fuel_burn_gph: Option<f64>,
    pub climb_rate_fpm_sea_level: Option<f64>,
    pub service_ceiling_ft: f64,
}

fn given(v: Option<f64>) -> Option<f64> {
    v.filter(|v| *v != 0.0 && !v.is_nan())
}

/// What a normally aspirated engine makes at full throttle in air of
/// density sigma, as a fraction of its sea-level power (Gagg and Ferrar).
pub fn full_throttle_power(sigma: f64) -> f64 {
    (1.132 * sigma - 0.132).max(0.0)
}

/// The cruise at an altitude: the true airspeed, the fuel flow, the power
/// flown (the cruise power, or less where full throttle cannot make it)
/// and the density altitude.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Cruise {
    pub tas_kt: f64,
    pub fuel_burn_gph: f64,
    pub power_pct: f64,
    pub density_altitude_ft: f64,
}

impl Airplane {
    pub fn cruise_power_pct(&self) -> f64 {
        given(self.cruise_power_pct).unwrap_or(DEFAULT_CRUISE_POWER_PCT)
    }

    /// The climb speed: the profile's own, or None where it gives none --
    /// no stock airplane's ratio of climb to cruise fills the gap (the
    /// owner, 2026-11-09), and the nav log then flies no climb. None too
    /// where the profile has no sea-level climb rate or no service
    /// ceiling (a pilot's own airplane of no stock type, whose record
    /// may carry neither): the climb's minutes are its rate falling to
    /// 100 fpm at the ceiling (climb_rate_fpm), and neither is guessed.
    pub fn climb_tas_kt(&self) -> Option<f64> {
        given(self.climb_rate_fpm_sea_level)?;
        given(Some(self.service_ceiling_ft))?;
        given(self.climb_tas_kt)
    }

    /// The climb's fuel flow at sea level: the profile's own, or
    /// CLIMB_FUEL_FACTOR times the cruise burn.
    pub fn climb_burn_gph(&self) -> f64 {
        given(self.climb_fuel_burn_gph).unwrap_or(CLIMB_FUEL_FACTOR * self.fuel_burn_gph)
    }

    /// The profile's cruise at `altitude_ft` in air at `oat_c` -- a
    /// standard day's where None, i.e. no forecast -- from its figures at
    /// the reference altitude.
    pub fn cruise(&self, altitude_ft: f64, oat_c: Option<f64>) -> Cruise {
        let altitude_ft = altitude_ft.clamp(LOWEST_FT, HIGHEST_FT);
        let setting = self.cruise_power_pct() / 100.0;
        // The handbook row's own altitude where the profile names it (a
        // C152's 75% is quoted at 8,000 ft, its POH figure 5-7), else the
        // reference altitude.
        let reference_ft = given(self.cruise_altitude_ft).unwrap_or(REFERENCE_ALTITUDE_FT);
        let sigma_ref = density_ratio(reference_ft, isa_temp_c(reference_ft));
        // The figures are at the cruise power, or at full throttle where a
        // setting above what the engine makes up there was given.
        let power_ref = setting.min(full_throttle_power(sigma_ref));
        let sigma = density_ratio(altitude_ft, oat_c.unwrap_or_else(|| isa_temp_c(altitude_ft)));
        let power = setting.min(full_throttle_power(sigma)).max(MIN_POWER_FRACTION);
        Cruise {
            tas_kt: self.cruise_tas_kt * (power / power_ref * sigma_ref / sigma).powf(1.0 / 3.0),
            fuel_burn_gph: self.fuel_burn_gph * power / power_ref,
            power_pct: power * 100.0,
            density_altitude_ft: density_altitude_ft(sigma),
        }
    }
}

/// The best rate of climb at a density altitude: the straight line from
/// the sea-level rate to 100 fpm at the service ceiling, never under
/// MIN_CLIMB_RATE_FPM.
pub fn climb_rate_fpm(sea_level_fpm: f64, ceiling_ft: f64, density_altitude: f64) -> f64 {
    let rate = sea_level_fpm - (sea_level_fpm - SERVICE_CEILING_CLIMB_FPM) * density_altitude / ceiling_ft;
    rate.max(MIN_CLIMB_RATE_FPM)
}

/// A climb's minutes and gallons.
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Climb {
    pub minutes: f64,
    pub gallons: f64,
}

type Table = (Vec<f64>, Vec<f64>);

/// One airplane's climbs, its tables kept per half degree of air for the
/// life of one answer: the plans price a climb between every pair of a
/// leg's altitudes, and the table is summed once per air.
pub struct Climber {
    sea_level_fpm: f64,
    ceiling_ft: f64,
    burn_gph: f64,
    tables: RefCell<HashMap<i64, std::rc::Rc<Table>>>,
}

impl Climber {
    pub fn new(airplane: &Airplane) -> Self {
        Climber {
            sea_level_fpm: given(airplane.climb_rate_fpm_sea_level).unwrap_or(DEFAULT_CLIMB_RATE_FPM),
            ceiling_ft: airplane.service_ceiling_ft,
            burn_gph: airplane.climb_burn_gph(),
            tables: RefCell::new(HashMap::new()),
        }
    }

    fn table(&self, isa_dev_c: f64) -> std::rc::Rc<Table> {
        // A table per half degree of air (Python's round, half to even).
        let halves = (isa_dev_c * 2.0).round_ties_even();
        let key = halves as i64;
        if let Some(t) = self.tables.borrow().get(&key) {
            return t.clone();
        }
        let dev = halves / 2.0;
        let steps = ((TABLE_TOP_FT - LOWEST_FT) / TABLE_STEP_FT).round_ties_even() as usize;
        let (mut minutes, mut gallons) = (Vec::with_capacity(steps + 1), Vec::with_capacity(steps + 1));
        minutes.push(0.0);
        gallons.push(0.0);
        for k in 0..steps {
            let mid_ft = LOWEST_FT + (k as f64 + 0.5) * TABLE_STEP_FT;
            let sigma = density_ratio(mid_ft, isa_temp_c(mid_ft) + dev);
            let step_min = TABLE_STEP_FT / climb_rate_fpm(self.sea_level_fpm, self.ceiling_ft, density_altitude_ft(sigma));
            minutes.push(minutes[k] + step_min);
            gallons.push(gallons[k] + step_min / 60.0 * self.burn_gph * full_throttle_power(sigma));
        }
        let t = std::rc::Rc::new((minutes, gallons));
        self.tables.borrow_mut().insert(key, t.clone());
        t
    }

    /// The minutes and gallons of a best-rate climb from `from_ft` to
    /// `to_ft`, in air `isa_dev_c` warmer than a standard day's all the
    /// way up (a leg's forecast difference, carried at the standard lapse
    /// rate); nothing for a descent.
    pub fn climb(&self, from_ft: f64, to_ft: f64, isa_dev_c: f64) -> Climb {
        if to_ft <= from_ft {
            return Climb::default();
        }
        let t = self.table(isa_dev_c);
        Climb { minutes: summed(&t.0, to_ft) - summed(&t.0, from_ft), gallons: summed(&t.1, to_ft) - summed(&t.1, from_ft) }
    }
}

fn summed(table: &[f64], altitude_ft: f64) -> f64 {
    let x = (altitude_ft.clamp(LOWEST_FT, TABLE_TOP_FT) - LOWEST_FT) / TABLE_STEP_FT;
    let i = (x as usize).min(table.len() - 2);
    table[i] + (x - i as f64) * (table[i + 1] - table[i])
}

/// The altitude whose density altitude is `density_altitude` in air whose
/// temperature at an altitude is `temp_at(altitude_ft)` -- where the
/// service ceiling is on the day. Density altitude rises with altitude in
/// any air an airplane flies in, so it is found by halving.
pub fn altitude_at_density_altitude(density_altitude: f64, temp_at: impl Fn(f64) -> f64) -> f64 {
    let (mut low, mut high) = (LOWEST_FT, density_altitude + 10000.0);
    for _ in 0..40 {
        let mid = (low + high) / 2.0;
        if density_altitude_ft(density_ratio(mid, temp_at(mid))) < density_altitude {
            low = mid;
        } else {
            high = mid;
        }
    }
    (low + high) / 2.0
}

#[cfg(test)]
mod tests {
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
        assert!(close(c.tas_kt, 110.0, 1e-9) && close(c.fuel_burn_gph, 8.5, 1e-9) && close(c.power_pct, 65.0, 1e-9));
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
        assert!(close(at_7000.power_pct, 75.0, 1e-9));
        assert!(close(at_10500.power_pct, (1.132 * standard_sigma(10500.0) - 0.132) * 100.0, 1e-9));
        assert!(at_10500.power_pct < 70.0);
        assert!(close(at_10500.fuel_burn_gph, 9.5 * at_10500.power_pct / 75.0, 1e-9));
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
        assert!(climb.minutes / 60.0 * 8.5 < climb.gallons && climb.gallons < climb.minutes / 60.0 * c172().climb_burn_gph());
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
}
