//! The flight's own figures, one copy for the planner and the phones:
//! the wind triangle, VFR cruising altitudes, the fuel reserve and the
//! atmosphere. Each is the planner's (wingtip.navlog, wingtip.altitude,
//! wingtip.performance) written again here, and services/planner/tests_wingtip/test_flight_rules.py
//! holds the two to the same answer; the web's TypeScript copy of the
//! wind triangle (lib/diversion) is held to the same fixture
//! (apps/web/src/lib/fixtures/flightRules.json).

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
// density's is one less. wingtip.performance's constants, the same digits.
pub const ISA_SEA_LEVEL_C: f64 = 15.0;
pub const ISA_LAPSE_C_PER_FT: f64 = 0.0019812;
const SEA_LEVEL_K: f64 = 288.15;
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
    pressure_ratio * SEA_LEVEL_K / (oat_c + 273.15)
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
pub const ISA_TROPOPAUSE_FT: f64 = 11_000.0 / 0.3048;

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
