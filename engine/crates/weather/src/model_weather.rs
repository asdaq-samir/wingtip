//! The model weather the map's flow layer draws (the weather service's
//! app.flow, the web's features/weather-flow), said in the words a pilot
//! reads it by: the precipitation's intensity, the sky's cover, the
//! thunderstorm energy's category and the ceiling's bands. The weather
//! service sends the model's values as they are, and what they mean is
//! decided here, once; the hosts ask by name.
//!
//! - Precipitation intensity, AIM 7-1-12, "ATC Inflight Weather Avoidance
//!   Assistance" (read 2026-11-11): "LIGHT" (< 26 dBZ), "MODERATE" (26 to
//!   40 dBZ), "HEAVY" (> 40 to 50 dBZ), "EXTREME" (> 50 dBZ), the words
//!   ATC says of a radar echo. A model's precipitation rate is read as
//!   the reflectivity the WSR-88D's default Z-R relation gives it, Z =
//!   300 R^1.4 (the NWS's network default since the WSR-88D replaced the
//!   WSR-57; NWS Tallahassee, "Z-R relationships", weather.gov/tae/
//!   research-zrpaper; Fulton et al. 1998, Weather and Forecasting 13),
//!   so the model's hours and the radar's are said alike.
//! - Sky cover, AIM 7-1-28's key: "Sky Clear 0/8, FEW >0/8-2/8, ScaTtered
//!   3/8-4/8, BroKeN 5/8-7/8, OverCast 8/8". A model's cover in percent
//!   is taken to the nearest eighth, as an observer estimates it, with
//!   none only at 0 and eight only at 100 (WMO code table 2700, oktas).
//! - Ceiling, 14 CFR 1.1: "the height above the earth's surface of the
//!   lowest layer of clouds or obscuring phenomena that is reported as
//!   'broken', 'overcast', or 'obscuration'"; its bands AIM 7-1-7's
//!   categories' ceilings, the ones metar::flight_category_of decides by
//!   (held to it by a test here).
//! - CAPE, the NWS's (Lincoln, IL, "Severe Weather Topics: CAPE",
//!   weather.gov/ilx/swop-severetopics-CAPE, read 2026-11-11): "less than
//!   1000J/kg represent weak instability, 1000 to 2500J/kg moderate
//!   instability, 2500-4000J/kg strong instability, and greater than
//!   4000J/kg extreme instability", which it calls a sliding scale with
//!   place and season. A guide to the energy a storm could draw on, not a
//!   forecast of storms.

use crate::json::{self, Value};

/// The intensity words, AIM 7-1-12, each from its least dBZ: light under
/// 26, moderate 26 to 40, heavy over 40 to 50, extreme over 50.
pub const LIGHT: &str = "Light";
pub const MODERATE: &str = "Moderate";
pub const HEAVY: &str = "Heavy";
pub const EXTREME: &str = "Extreme";
pub const MODERATE_FROM_DBZ: f64 = 26.0;
pub const HEAVY_OVER_DBZ: f64 = 40.0;
pub const EXTREME_OVER_DBZ: f64 = 50.0;

/// Under this reflectivity nothing is said to fall: the app's choice, not
/// the AIM's (whose "light" has no floor). 10 dBZ is under a tenth of a
/// millimetre an hour by Z = 300 R^1.4 (0.09 mm/h), a trace, which a
/// model gives over wide areas where a radar shows no echo; the map is
/// drawn clear under it, as Apple Weather's precipitation map is.
pub const LEAST_DBZ: f64 = 10.0;

/// The WSR-88D's default Z-R relation for rain, Z = A R^B, Z in mm^6 m^-3
/// and R in mm/h (see the module's note).
pub const ZR_A: f64 = 300.0;
pub const ZR_B: f64 = 1.4;

/// The CAPE categories, J/kg, each from its least (NWS Lincoln, above):
/// weak under 1,000, moderate 1,000 to 2,500, strong 2,500 to 4,000,
/// extreme over 4,000.
/// AIM 7-1-7's ceiling bounds, ft: LIFR "less than 500", IFR "500 to less
/// than 1,000", MVFR "1,000 to 3,000", VFR "greater than 3,000".
pub const CEILING_IFR_FROM_FT: f64 = 500.0;
pub const CEILING_MVFR_FROM_FT: f64 = 1000.0;
pub const CEILING_VFR_OVER_FT: f64 = 3000.0;

pub const CAPE_BANDS: [(&str, f64); 4] = [("Weak", 0.0), ("Moderate", 1000.0), ("Strong", 2500.0), ("Extreme", 4000.0)];

/// The reflectivity a precipitation rate gives by the Z-R relation, dBZ:
/// 10 log10(300 R^1.4). None where none falls.
pub fn dbz_of_rate(rate_mm_h: f64) -> Option<f64> {
    (rate_mm_h.is_finite() && rate_mm_h > 0.0).then(|| 10.0 * (ZR_A * rate_mm_h.powf(ZR_B)).log10())
}

/// The AIM 7-1-12 word for a reflectivity; None under LEAST_DBZ.
pub fn intensity(dbz: f64) -> Option<&'static str> {
    if !dbz.is_finite() || dbz < LEAST_DBZ {
        None
    } else if dbz < MODERATE_FROM_DBZ {
        Some(LIGHT)
    } else if dbz <= HEAVY_OVER_DBZ {
        Some(MODERATE)
    } else if dbz <= EXTREME_OVER_DBZ {
        Some(HEAVY)
    } else {
        Some(EXTREME)
    }
}

/// What falls, where something does: snow at or under 0 C at 2 m, rain
/// over it. A simplification, the freezing point at the surface alone:
/// sleet, freezing rain and wet snow fall either side of it, and the
/// model's own precipitation type is not read. Said only as the bubble's
/// glyph, never as a hazard.
pub fn falls_as(temp_c: f64) -> &'static str {
    if temp_c <= 0.0 {
        "snow"
    } else {
        "rain"
    }
}

/// A cover in percent as eighths of the sky: the nearest eighth, none
/// only at 0 and all eight only at 100 (WMO code table 2700).
pub fn oktas(percent: f64) -> u8 {
    if percent <= 0.0 {
        0
    } else if percent >= 100.0 {
        8
    } else {
        ((percent / 12.5).round() as u8).clamp(1, 7)
    }
}

/// The METAR contraction for a cover in eighths (AIM 7-1-28's key).
pub fn cover_of(oktas: u8) -> &'static str {
    match oktas {
        0 => "SKC",
        1..=2 => "FEW",
        3..=4 => "SCT",
        5..=7 => "BKN",
        _ => "OVC",
    }
}

/// The CAPE category for an energy, J/kg (CAPE_BANDS).
pub fn cape_category(j_kg: f64) -> &'static str {
    let mut word = CAPE_BANDS[0].0;
    for (w, from) in CAPE_BANDS {
        // "greater than 4000" is extreme; 4,000 itself still strong.
        let over = if from == 4000.0 { j_kg > from } else { j_kg >= from };
        if over {
            word = w;
        }
    }
    word
}

fn num(name: &str, v: &Value, key: &str) -> Result<Option<f64>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

fn band(out: &mut String, word: &str, from: f64) {
    out.push_str("{\"word\":");
    json::string(out, word);
    out.push_str(",\"from\":");
    json::number(out, from);
    out.push('}');
}

fn bands(out: &mut String, list: &[(&str, f64)]) {
    out.push('[');
    for (i, (word, from)) in list.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        band(out, word, *from);
    }
    out.push(']');
}

/// The rules, JSON in and out (call.rs): model_weather_bands,
/// precip_intensity, precip_dbz, cloud_cover, cape_category and
/// compass_point.
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let mut out = String::new();
    match name {
        "model_weather_bands" => {
            out.push_str("{\"precip\":{\"least_dbz\":");
            json::number(&mut out, LEAST_DBZ);
            out.push_str(",\"bands\":");
            bands(&mut out, &[(LIGHT, LEAST_DBZ), (MODERATE, MODERATE_FROM_DBZ), (HEAVY, HEAVY_OVER_DBZ), (EXTREME, EXTREME_OVER_DBZ)]);
            out.push_str("},\"ceiling\":");
            bands(&mut out, &[("LIFR", 0.0), ("IFR", CEILING_IFR_FROM_FT), ("MVFR", CEILING_MVFR_FROM_FT), ("VFR", CEILING_VFR_OVER_FT)]);
            out.push_str(",\"cape\":");
            bands(&mut out, &CAPE_BANDS);
            out.push('}');
        }
        "precip_intensity" => {
            let dbz = num(name, v, "dbz")?.ok_or_else(|| format!("{name}: \"dbz\" is missing"))?;
            let word = intensity(dbz);
            out.push_str("{\"word\":");
            json::opt_string(&mut out, word);
            out.push_str(",\"falls_as\":");
            json::opt_string(&mut out, word.and(num(name, v, "temp_c")?).map(falls_as));
            out.push('}');
        }
        "precip_dbz" => {
            let rates = v.get("rates_mm_h").and_then(Value::as_array).ok_or_else(|| format!("{name}: \"rates_mm_h\" is missing"))?;
            out.push_str("{\"dbz\":[");
            for (i, r) in rates.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                let rate = r.as_f64().ok_or_else(|| format!("{name}: a rate is not a number"))?;
                // To the hundredth: far finer than the map's 0.3 dBZ step.
                json::number(&mut out, dbz_of_rate(rate).map_or(0.0, |d| (d * 100.0).round() / 100.0));
            }
            out.push_str("]}");
        }
        "cloud_cover" => {
            let percent = num(name, v, "percent")?.ok_or_else(|| format!("{name}: \"percent\" is missing"))?;
            let eighths = oktas(percent);
            out.push_str("{\"oktas\":");
            out.push_str(&eighths.to_string());
            out.push_str(",\"cover\":");
            json::string(&mut out, cover_of(eighths));
            out.push('}');
        }
        "cape_category" => {
            let j_kg = num(name, v, "j_kg")?.ok_or_else(|| format!("{name}: \"j_kg\" is missing"))?;
            json::string(&mut out, cape_category(j_kg));
        }
        "compass_point" => {
            // The bubble's wind, said as Apple Weather's map says it (the
            // owner's screenshot, 2026-11-12): the direction it blows from
            // as one of JO 7930.2 3-3-9's 16 points.
            let bearing = num(name, v, "bearing_deg")?.ok_or_else(|| format!("{name}: \"bearing_deg\" is missing"))?;
            json::string(&mut out, crate::contractions::point_of(bearing));
        }
        _ => return Err(format!("{name}: not a rule of model_weather")),
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metar;

    #[test]
    fn the_aims_intensity_words_hold_at_each_edge() {
        // AIM 7-1-12: < 26 light, 26 to 40 moderate, > 40 to 50 heavy, > 50 extreme.
        assert_eq!(intensity(9.9), None);
        assert_eq!(intensity(10.0), Some(LIGHT));
        assert_eq!(intensity(25.9), Some(LIGHT));
        assert_eq!(intensity(26.0), Some(MODERATE));
        assert_eq!(intensity(40.0), Some(MODERATE));
        assert_eq!(intensity(40.1), Some(HEAVY));
        assert_eq!(intensity(50.0), Some(HEAVY));
        assert_eq!(intensity(50.1), Some(EXTREME));
    }

    #[test]
    fn a_rate_is_the_reflectivity_z_300_r_1_4_gives() {
        // 10 mm/h: 10 log10(300 * 10^1.4) = 24.77 + 14 = 38.77 dBZ.
        assert!((dbz_of_rate(10.0).unwrap() - 38.77).abs() < 0.01);
        // 1 mm/h: 10 log10(300) = 24.77 dBZ.
        assert!((dbz_of_rate(1.0).unwrap() - 24.77).abs() < 0.01);
        assert_eq!(dbz_of_rate(0.0), None);
    }

    #[test]
    fn broken_begins_at_five_eighths_to_the_nearest_eighth() {
        assert_eq!(cover_of(oktas(0.0)), "SKC");
        assert_eq!(cover_of(oktas(1.0)), "FEW");
        assert_eq!(cover_of(oktas(50.0)), "SCT");
        assert_eq!(cover_of(oktas(56.0)), "SCT");
        assert_eq!(cover_of(oktas(56.25)), "BKN");
        assert_eq!(cover_of(oktas(99.0)), "BKN");
        assert_eq!(cover_of(oktas(100.0)), "OVC");
    }

    #[test]
    fn the_ceiling_bands_are_the_flight_categories_own() {
        let at = |ft: f64| metar::flight_category_of(Some(ft), false, Some(10.0));
        assert_eq!(at(CEILING_IFR_FROM_FT - 1.0), Some("LIFR"));
        assert_eq!(at(CEILING_IFR_FROM_FT), Some("IFR"));
        assert_eq!(at(CEILING_MVFR_FROM_FT), Some("MVFR"));
        assert_eq!(at(CEILING_VFR_OVER_FT), Some("MVFR"));
        assert_eq!(at(CEILING_VFR_OVER_FT + 1.0), Some("VFR"));
    }

    #[test]
    fn the_nws_cape_categories_hold_at_each_edge() {
        assert_eq!(cape_category(0.0), "Weak");
        assert_eq!(cape_category(999.0), "Weak");
        assert_eq!(cape_category(1000.0), "Moderate");
        assert_eq!(cape_category(2500.0), "Strong");
        assert_eq!(cape_category(4000.0), "Strong");
        assert_eq!(cape_category(4001.0), "Extreme");
    }
}
