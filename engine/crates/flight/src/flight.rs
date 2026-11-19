//! The flight's own figures, one copy for the planner and the phones:
//! the wind triangle, VFR cruising altitudes, the fuel reserve and the
//! atmosphere. Each was once the planner's own and is asked from here
//! now; services/planner/tests_wingtip/test_flight_rules.py holds the
//! planner's calls to the shared fixture; the web's TypeScript copy of the
//! wind triangle (lib/diversion) is held to the same fixture
//! (apps/web/src/lib/fixtures/flightRules.json).

use wingtip_core::units::{KELVIN_AT_0_C, M_PER_FT};

/// The wind correction angle, degrees, positive to the right: the E6B's
/// triangle (FAA-H-8083-25C, Pilot's Handbook of Aeronautical Knowledge,
/// ch. 16, "Wind triangle"). The wind is the direction it blows FROM.
/// A crosswind past the airplane's speed holds no heading; its sine is
/// held at one, as wingtip.navlog's is, and the groundspeed says the rest.
pub fn wind_correction_deg(true_course_deg: f64, wind_from_deg: f64, wind_kt: f64, tas_kt: f64) -> f64 {
    let relative = (wind_from_deg - true_course_deg).to_radians();
    let ratio = (wind_kt / tas_kt * relative.sin()).clamp(-1.0, 1.0);
    ratio.asin().to_degrees()
}

/// The groundspeed once the heading holds the course: the airspeed's
/// share along it less the wind's (the same triangle).
pub fn groundspeed_kt(true_course_deg: f64, wind_from_deg: f64, wind_kt: f64, tas_kt: f64, wca_deg: f64) -> f64 {
    let relative = (wind_from_deg - true_course_deg).to_radians();
    tas_kt * wca_deg.to_radians().cos() - wind_kt * relative.cos()
}

/// The whole triangle, as the web's diversion draws it: the correction,
/// the true heading 0-360 and the groundspeed; None where no heading
/// holds the course (a crosswind past the airspeed) or the wind stops it.
pub fn wind_triangle(true_course_deg: f64, tas_kt: f64, wind_from_deg: f64, wind_kt: f64) -> Option<(f64, f64, f64)> {
    let relative = (wind_from_deg - true_course_deg).to_radians();
    let ratio = wind_kt * relative.sin() / tas_kt;
    if ratio.abs() > 1.0 || !ratio.is_finite() {
        return None;
    }
    // A calm wind's correction is none, not -0.
    let wca = ratio.asin().to_degrees() + 0.0;
    let gs = tas_kt * wca.to_radians().cos() - wind_kt * relative.cos();
    (gs > 0.0).then(|| (wca, (true_course_deg + wca).rem_euclid(360.0), gs))
}

/// The average ground speed over a stretch, knots: its miles over its
/// hours (FAA-H-8083-25C, PHAK ch. 16, "Flight Planning": ground speed
/// is the distance flown over the time it took). Not a number (null to
/// the host) where no time passed: a speed of a flight that has not
/// begun is not one. The copilot's planned speed (the nav log's miles
/// over its minutes) and a past flight's (the miles flown over its time
/// aloft) are both this one.
pub fn average_groundspeed_kt(distance_nm: f64, minutes: f64) -> f64 {
    if minutes > 0.0 && distance_nm.is_finite() {
        distance_nm / (minutes / 60.0)
    } else {
        f64::NAN
    }
}

/// How far along the route each of its legs ends, nm: the running sum of
/// the legs' miles, a leg with none (a departure's row) adding nothing,
/// so a row's line under its name says "Stop · 241 nm" from the start.
pub fn nm_along(legs_nm: &[Option<f64>]) -> Vec<f64> {
    let mut at = 0.0;
    legs_nm
        .iter()
        .map(|nm| {
            at += nm.filter(|n| n.is_finite()).unwrap_or(0.0);
            at
        })
        .collect()
}

/// Which half of 14 CFR 91.159's rule a magnetic course is in: 000-179
/// flies odd thousands plus 500, 180-359 even thousands plus 500.
pub fn is_eastbound(magnetic_course_deg: f64) -> bool {
    let c = magnetic_course_deg.rem_euclid(360.0);
    // Python's % on a float: rem_euclid's 360.0 for a hair under zero.
    (0.0..180.0).contains(&c)
}

/// The lowest VFR cruising altitude (14 CFR 91.159(a)) at or above a
/// floor, for a magnetic course: the first odd (eastbound) or even
/// (westbound) thousand plus 500 not under it.
pub fn lowest_vfr_cruising_altitude(floor_ft: f64, magnetic_course_deg: f64) -> f64 {
    let east = is_eastbound(magnetic_course_deg);
    let mut thousands = (floor_ft / 1000.0).floor() as i64;
    let odd = thousands.rem_euclid(2) == 1;
    if east && !odd || !east && odd {
        thousands += 1;
    }
    let mut candidate = (thousands * 1000 + 500) as f64;
    while candidate < floor_ft {
        candidate += 2000.0;
    }
    candidate
}

/// The time on the ground at a stop the pilot gave none for, minutes: a
/// turnaround -- taxi in, fuel, a break, taxi out -- at the owner's pick
/// (2026-10-20). The planner's route options and nav log count it, and the
/// web draws it before the nav log's legs say each stop's.
pub const TURNAROUND_MIN: f64 = 30.0;

/// The altitude an airplane's cruise TAS and fuel burn are taken as its
/// own at, at its cruise power on a standard day: the middle of where a
/// light single cruises across country, and a row of every handbook's
/// cruise table (FAA-H-8083-25C ch. 11's cruise performance charts). The
/// planner works each leg's out from there for the forecast air.
pub const CRUISE_REFERENCE_FT: f64 = 6000.0;

/// 14 CFR 91.151(a): fuel to the first point of landing and then 30
/// minutes at normal cruise by day, 45 at night.
pub const DAY_RESERVE_MIN: f64 = 30.0;
pub const NIGHT_RESERVE_MIN: f64 = 45.0;
/// 14 CFR 91.167(a)(3): under IFR, 45 minutes after the alternate (or
/// the destination), day or night.
pub const IFR_RESERVE_MIN: f64 = 45.0;

/// The reserve in minutes for the rules flown and the time of day.
pub fn reserve_min(ifr: bool, night: bool) -> f64 {
    if ifr {
        IFR_RESERVE_MIN
    } else if night {
        NIGHT_RESERVE_MIN
    } else {
        DAY_RESERVE_MIN
    }
}

// The International Standard Atmosphere below the tropopause (ICAO Doc
// 7488): sea level 15 C (288.15 K), a lapse of 6.5 K a kilometre
// (0.0019812 C a foot), and the exponent pressure falls off by, g/(R L);
// density's is one less. The performance module works from these.
pub const ISA_SEA_LEVEL_C: f64 = 15.0;
pub const ISA_LAPSE_C_PER_FT: f64 = 0.0019812;
const SEA_LEVEL_K: f64 = ISA_SEA_LEVEL_C + KELVIN_AT_0_C;
const LAPSE_OVER_T0_PER_FT: f64 = 6.8755856e-6;
const PRESSURE_EXPONENT: f64 = 5.2558797;
const LOWEST_FT: f64 = -2000.0;
const HIGHEST_FT: f64 = 60000.0;
/// The standard altimeter setting, inches of mercury: the standard datum
/// plane (FAA-H-8083-25C ch. 11, "Pressure Altitude").
pub const STANDARD_INHG: f64 = 29.92;

/// A standard day's temperature at a pressure altitude.
pub fn isa_temp_c(altitude_ft: f64) -> f64 {
    ISA_SEA_LEVEL_C - ISA_LAPSE_C_PER_FT * altitude_ft
}

/// Sigma: the air's density at a pressure altitude and temperature over
/// a standard day's at sea level.
pub fn density_ratio(altitude_ft: f64, oat_c: f64) -> f64 {
    let altitude_ft = altitude_ft.clamp(LOWEST_FT, HIGHEST_FT);
    let pressure_ratio = (1.0 - LAPSE_OVER_T0_PER_FT * altitude_ft).powf(PRESSURE_EXPONENT);
    pressure_ratio * SEA_LEVEL_K / (oat_c + KELVIN_AT_0_C)
}

/// The altitude at which a standard day's air has density sigma.
pub fn density_altitude_ft(sigma: f64) -> f64 {
    (1.0 - sigma.powf(1.0 / (PRESSURE_EXPONENT - 1.0))) / LAPSE_OVER_T0_PER_FT
}

/// Pressure altitude from a field's elevation and its altimeter setting:
/// the elevation plus the standard atmosphere's height of the setting's
/// pressure above 29.92 "Hg, (1 - (setting / 29.92)^(1 / 5.2558797)) x
/// 145,442 ft (ICAO Doc 7488, the ISA constants above), which is FAA-H-
/// 8083-25C ch. 11's Figure 11-3 table to within 2 ft (30.10 "Hg -165 ft,
/// 30.8 -803, 28.0 +1,824). A flat 1,000 ft an inch read 15 to 80 ft low
/// above 29.92, so pressure and density altitude came out a little low,
/// the unsafe way.
pub fn pressure_altitude_ft(elevation_ft: f64, altimeter_inhg: f64) -> f64 {
    elevation_ft + (1.0 - (altimeter_inhg / STANDARD_INHG).powf(1.0 / PRESSURE_EXPONENT)) / LAPSE_OVER_T0_PER_FT
}

/// The standard sea-level pressure, hPa (ICAO Doc 7488's 1013.25 hPa,
/// FAA-H-8083-25C ch. 4's 29.92 "Hg).
pub const ISA_SEA_LEVEL_HPA: f64 = 1013.25;
/// The tropopause of the standard atmosphere, ft (11,000 m, ICAO Doc
/// 7488): the formula below holds under it.
pub const ISA_TROPOPAUSE_FT: f64 = 11_000.0 / M_PER_FT;

/// A standard day's pressure at a pressure altitude, hPa: the same
/// troposphere formula as density_ratio's, (1 - L h / T0)^(g / R L) of
/// sea level's, which is what "pressure altitude" means -- the altitude
/// in the standard atmosphere where this pressure is (FAA-H-8083-25C ch.
/// 4). Held to the tropopause, which the map's levels (FL360 at most) are
/// under.
pub fn isa_pressure_hpa(altitude_ft: f64) -> f64 {
    let ft = altitude_ft.clamp(LOWEST_FT, ISA_TROPOPAUSE_FT);
    ISA_SEA_LEVEL_HPA * (1.0 - LAPSE_OVER_T0_PER_FT * ft).powf(PRESSURE_EXPONENT)
}

#[cfg(test)]
mod speed_tests {
    use super::*;

    #[test]
    fn the_average_ground_speed_is_the_miles_over_the_hours() {
        // PHAK ch. 16: 120 nm in 1 h 30 min is 80 kt.
        assert_eq!(average_groundspeed_kt(120.0, 90.0), 80.0);
        assert!(average_groundspeed_kt(120.0, 0.0).is_nan());
        assert!(average_groundspeed_kt(120.0, -5.0).is_nan());
        assert_eq!(nm_along(&[None, Some(12.5), Some(30.0), None, Some(7.5)]), vec![0.0, 12.5, 42.5, 42.5, 50.0]);
    }
}

#[cfg(test)]
mod isa_tests {
    use super::*;

    #[test]
    fn the_standard_atmospheres_pressures_by_altitude() {
        // The standard atmosphere's table (FAA-H-8083-25C ch. 4, "Properties
        // of standard atmosphere"): 29.92 "Hg at sea level, 20.58 at 10,000
        // ft, 13.75 at 20,000 ft; 1 hPa is 0.02953 "Hg.
        let inhg = |ft: f64| isa_pressure_hpa(ft) * 0.029_53;
        assert!((inhg(0.0) - 29.92).abs() < 0.01);
        assert!((inhg(10_000.0) - 20.58).abs() < 0.02);
        assert!((inhg(20_000.0) - 13.75).abs() < 0.02);
        // 500 hPa is about 18,300 ft (FL180 is just below it, 506 hPa).
        assert!(isa_pressure_hpa(18_000.0) > 500.0 && isa_pressure_hpa(19_000.0) < 500.0);
    }
}

#[cfg(test)]
mod cruising_tests {
    use super::*;

    #[test]
    fn the_lowest_vfr_cruising_altitude_is_91_159s_first_above_the_floor() {
        // 14 CFR 91.159(a): eastbound (000-179) odd thousands plus 500,
        // westbound (180-359) even thousands plus 500; the planner's cases
        // from before the move (tests_wingtip/test_airspace.py).
        let (east, west) = (90.0, 270.0);
        // KDSM to KOMA, the case that once gave 12,500.
        assert_eq!(lowest_vfr_cruising_altitude(3000.0, west), 4500.0);
        assert_eq!(lowest_vfr_cruising_altitude(2200.0, west), 2500.0);
        assert_eq!(lowest_vfr_cruising_altitude(2200.0, 328.0), 2500.0);
        assert_eq!(lowest_vfr_cruising_altitude(3000.0, east), 3500.0);
        // 2,500 is a westbound altitude, so eastbound climbs to 3,500.
        assert_eq!(lowest_vfr_cruising_altitude(2200.0, east), 3500.0);
        // Already legal and on its side: unchanged; just above it, the next.
        assert_eq!(lowest_vfr_cruising_altitude(4500.0, west), 4500.0);
        assert_eq!(lowest_vfr_cruising_altitude(4600.0, west), 6500.0);
        // A course past 360 wraps.
        assert_eq!(lowest_vfr_cruising_altitude(3000.0, 630.0), lowest_vfr_cruising_altitude(3000.0, west));
    }
}
