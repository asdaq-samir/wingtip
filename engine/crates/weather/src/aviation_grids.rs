//! The aviation grids the map's model weather layer draws by level (the
//! weather service's app.flow_awc and app.flow_dafs, the web's
//! features/weather-flow), the owner's ask of 2026-11-12 to source the
//! layer from the Aviation Weather Center: which levels each field has,
//! what the icing and turbulence values mean, and what AWC's cloud text
//! says. The weather service sends the values as AWC's products give
//! them; what they mean is decided here, once, and the hosts ask by name.
//!
//! - Levels: AWC's own picker (aviationweather.gov/gfa/help, "Winds",
//!   read 2026-11-12): "levels above Mean Sea Level (MSL) in 3,000 ft
//!   increments from the surface to FL300, and in 6,000 ft increments
//!   from FL300 to FL480", and "maximum values (MAX) for all levels".
//!   AWC names a level by its hundreds of feet ("060"), an altitude MSL
//!   under 18,000 ft and a flight level, a pressure altitude, from FL180
//!   (its map's popup: "t>=180 ? FL+t : t*100+' MSL'"; Class A and the
//!   flight levels from 18,000 ft MSL, 14 CFR 71.33). The map offers the
//!   owner's ladder of them, below.
//! - Icing: AWC's icing severity (the NWS's In-Flight Icing, IFI, the
//!   FAA and NCAR's Forecast Icing Product run operationally; GFA help,
//!   "Icing" and "Current Icing Product"): "a categorical index
//!   encompassing five categories: none, trace, light, moderate, and
//!   heavy", sent as 0 to 4 in that order (read from a live IFI file
//!   2026-11-12: values 0 to 4, fewer at each step up). "FIP severity
//!   estimates are not synonymous with the icing PIREP severities of
//!   trace, light, moderate, and severe" (AWC), so these are said as
//!   AWC says them, not as AIM 7-1-21's PIREP words.
//! - Turbulence: AWC's Graphical Turbulence Guidance, EDR (m^2/s^3)^1/3,
//!   and its table of "Estimated EDR Threshold * 100" by the aircraft's
//!   weight class (GFA help, "Turbulence", read 2026-11-12): Light (<
//!   15,500 lb) 13, 16, 36, 64; Medium (15,500 to 300,000 lb) 15, 20, 44,
//!   79; Heavy (> 300,000 lb) 17, 24, 54, 96, for light, moderate,
//!   severe and extreme. Which class applies is the asker's to say: the
//!   map has no airplane (the owner, 2026-11-09: nothing assumes one).
//! - Cloud layers: AWC's GFA cloud text at a point ("OVC035/TOP 050",
//!   "SCT021/OVC040/TOP FL280/CI ABV", "Cirrus", "SKC"; heights in
//!   hundreds of feet MSL, GFA help: "All color-coded grids and text
//!   information relays cloud heights in feet above Mean Sea Level"), and
//!   its cover "for clouds below FL180" (CLR, FEW, SCT, BKN, OVC).

use crate::json::{self, Value};
use wingtip_flight::flight::isa_pressure_hpa;

/// The wind's levels, the owner's ladder of AWC's (2026-11-12: Sfc, 3,000,
/// 6,000, 9,000, 12,000, 18,000, 24,000, 30,000 ft) and AWC's Max, the
/// strongest wind at any level with its direction.
pub const WIND_LEVELS: [&str; 9] = ["sfc", "030", "060", "090", "120", "180", "240", "300", "max"];
/// The icing's levels: AWC's icing picker runs "in 3,000 ft intervals up
/// to FL270"; the ladder's from 3,000 to FL240.
pub const ICING_LEVELS: [&str; 6] = ["030", "060", "090", "120", "180", "240"];
/// The turbulence's levels: fewer, as each is a megabyte an hour (the
/// weather service's budget), the ladder's every other step, and AWC's
/// Max ("the maximum EDR value ... for all altitudes").
pub const TURBULENCE_LEVELS: [&str; 4] = ["060", "120", "180", "max"];

/// The GFS's isobaric levels, hPa, as NOMADS' 0.5-degree files carry
/// them (gfs.tHHz.pgrb2full.0p50, NCEP's inventory), down to 200 hPa.
pub const GFS_HPA: [f64; 19] =
    [1000.0, 975.0, 950.0, 925.0, 900.0, 850.0, 800.0, 750.0, 700.0, 650.0, 600.0, 550.0, 500.0, 450.0, 400.0, 350.0, 300.0, 250.0, 200.0];

/// Each G-AIRMET hazard's short label on the map's outline, as AWC's own
/// map labels them (the owner's screenshot of aviationweather.gov's Winds
/// map, 2026-11-12: "SfcWind"; its G-AIRMET legend, "Mtn Obsc", "LLWS").
/// (The hazards' words are forecast::awc's GAIRMET_HAZARDS.)
pub const GAIRMET_LABELS: [(&str, &str); 6] = [
    ("IFR conditions", "IFR"),
    ("Mountains obscured", "Mtn Obsc"),
    ("Turbulence", "Turb"),
    ("Icing", "Ice"),
    ("Low-level wind shear", "LLWS"),
    ("Strong surface winds", "SfcWind"),
];
/// The icing severity words, by AWC's category (0 none to 4 heavy).
pub const ICING_WORDS: [&str; 5] = ["None", "Trace", "Light", "Moderate", "Heavy"];
/// The turbulence words, each from its EDR threshold in the class's row.
pub const TURBULENCE_WORDS: [&str; 4] = ["Light", "Moderate", "Severe", "Extreme"];
/// AWC's EDR thresholds by weight class (GFA help's table, x 100 there).
pub const EDR_LIGHT: [f64; 4] = [0.13, 0.16, 0.36, 0.64];
pub const EDR_MEDIUM: [f64; 4] = [0.15, 0.20, 0.44, 0.79];
pub const EDR_HEAVY: [f64; 4] = [0.17, 0.24, 0.54, 0.96];

/// A level's altitude, ft: its hundreds, as AWC names it; None for the
/// surface and for Max, which are no one altitude.
pub fn level_ft(id: &str) -> Option<f64> {
    if id.len() == 3 && id.bytes().all(|b| b.is_ascii_digit()) {
        id.parse::<f64>().ok().map(|h| h * 100.0)
    } else {
        None
    }
}

/// The GFS levels the temperature at the ladder's altitudes is read
/// between, highest pressure first: for each level, the two isobaric
/// levels round its standard-atmosphere pressure (its pressure altitude,
/// isa_pressure_hpa), and one more each side, as a real day's heights sit
/// off the standard's. The weather service then interpolates in each
/// point's own heights, not the standard's.
pub fn temperature_hpa() -> Vec<f64> {
    let mut wanted = vec![false; GFS_HPA.len()];
    for ft in WIND_LEVELS.iter().filter_map(|id| level_ft(id)) {
        let p = isa_pressure_hpa(ft);
        // The first level at or above the altitude (pressure at or under p).
        let above = GFS_HPA.iter().position(|&l| l <= p).unwrap_or(GFS_HPA.len() - 1);
        let from = above.saturating_sub(2);
        let to = (above + 1).min(GFS_HPA.len() - 1);
        for w in wanted.iter_mut().take(to + 1).skip(from) {
            *w = true;
        }
    }
    GFS_HPA.iter().zip(wanted).filter(|(_, w)| *w).map(|(l, _)| *l).collect()
}

/// The icing word for AWC's category; None for a value not 0 to 4.
pub fn icing_word(category: f64) -> Option<&'static str> {
    let c = category.round();
    (category.is_finite() && (0.0..=4.0).contains(&c)).then(|| ICING_WORDS[c as usize])
}

/// The thresholds of a weight class ("light", "medium", "heavy").
pub fn edr_row(class: &str) -> Option<[f64; 4]> {
    match class {
        "light" => Some(EDR_LIGHT),
        "medium" => Some(EDR_MEDIUM),
        "heavy" => Some(EDR_HEAVY),
        _ => None,
    }
}

/// The turbulence word for an EDR in a class's row: the highest threshold
/// it reaches; None under light's, smooth.
pub fn turbulence_word(edr: f64, row: [f64; 4]) -> Option<&'static str> {
    let mut word = None;
    for (w, from) in TURBULENCE_WORDS.iter().zip(row) {
        if edr >= from {
            word = Some(*w);
        }
    }
    word
}

/// The eighths a GFA cover stands for, the most of its band's (AIM
/// 7-1-28's key: FEW to 2/8, SCT to 4/8, BKN to 7/8 -- 6/8 here, as AWC
/// says no more -- OVC 8/8), so cloud_cover reads it back as the same
/// cover. CLR, and anything else, none.
pub fn gfa_cover_oktas(cover: &str) -> u8 {
    match cover {
        "FEW" => 2,
        "SCT" => 4,
        "BKN" => 6,
        "OVC" => 8,
        _ => 0,
    }
}

/// The highest top AWC's GFA cloud text gives, ft MSL: "TOP 050" is
/// 5,000, "TOP FL280" FL280; None where it gives none (one layer with no
/// top, cirrus alone, a clear sky).
pub fn gfa_top_ft(text: &str) -> Option<f64> {
    text.split('/')
        .filter_map(|part| part.trim().strip_prefix("TOP "))
        .filter_map(|h| h.trim_start_matches("FL").parse::<f64>().ok())
        .map(|h| h * 100.0)
        .reduce(f64::max)
}

fn levels(out: &mut String, ids: &[&str]) {
    out.push('[');
    for (i, id) in ids.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"id\":");
        json::string(out, id);
        out.push_str(",\"ft\":");
        json::opt_number(out, level_ft(id));
        // Its pressure in the standard atmosphere, hPa: where a flight
        // level is (its pressure altitude), and a guide for the others.
        out.push_str(",\"isa_hpa\":");
        json::opt_number(out, level_ft(id).map(|ft| (isa_pressure_hpa(ft) * 10.0).round() / 10.0));
        out.push('}');
    }
    out.push(']');
}

fn words_from(out: &mut String, words: &[&str], from: &[f64]) {
    out.push('[');
    for (i, (w, f)) in words.iter().zip(from).enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"word\":");
        json::string(out, w);
        out.push_str(",\"from\":");
        json::number(out, *f);
        out.push('}');
    }
    out.push(']');
}

fn strings<'a>(name: &str, v: &'a Value, key: &str) -> Result<Vec<&'a str>, String> {
    v.get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{name}: \"{key}\" is missing"))?
        .iter()
        .map(|s| s.as_str().ok_or_else(|| format!("{name}: \"{key}\" holds a non-string")))
        .collect()
}

fn number(name: &str, v: &Value, key: &str) -> Result<f64, String> {
    v.get(key).and_then(Value::as_f64).ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

/// The rules, JSON in and out (call.rs): flow_levels, aviation_grid_bands,
/// icing_severity, turbulence_category and gfa_cloud_layers.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let mut out = String::new();
    match name {
        "flow_levels" => {
            out.push_str("{\"wind\":");
            levels(&mut out, &WIND_LEVELS);
            out.push_str(",\"icing\":");
            levels(&mut out, &ICING_LEVELS);
            out.push_str(",\"turbulence\":");
            levels(&mut out, &TURBULENCE_LEVELS);
            out.push_str(",\"temperature_hpa\":[");
            for (i, p) in temperature_hpa().iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::number(&mut out, *p);
            }
            // From FL180 a level is a flight level (14 CFR 71.33's 18,000 ft).
            out.push_str("],\"flight_levels_from_ft\":");
            json::number(&mut out, wingtip_flight::limits::CLASS_A_FLOOR_FT);
            out.push('}');
        }
        "aviation_grid_bands" => {
            out.push_str("{\"icing\":");
            words_from(&mut out, &ICING_WORDS, &[0.0, 1.0, 2.0, 3.0, 4.0]);
            out.push_str(",\"turbulence\":{");
            for (i, (class, row)) in [("light", EDR_LIGHT), ("medium", EDR_MEDIUM), ("heavy", EDR_HEAVY)].iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::string(&mut out, class);
                out.push(':');
                words_from(&mut out, &TURBULENCE_WORDS, row);
            }
            out.push_str("}}");
        }
        "icing_severity" => {
            json::opt_string(&mut out, icing_word(number(name, v, "category")?));
        }
        "turbulence_category" => {
            let class = v.get("weight_class").and_then(Value::as_str).unwrap_or("");
            let row = edr_row(class).ok_or_else(|| format!("{name}: \"weight_class\" is light, medium or heavy"))?;
            json::opt_string(&mut out, turbulence_word(number(name, v, "edr")?, row));
        }
        "gfa_cloud_layers" => {
            let texts = strings(name, v, "layers")?;
            let covers = strings(name, v, "covers")?;
            if texts.len() != covers.len() {
                return Err(format!("{name}: \"layers\" and \"covers\" differ in length"));
            }
            out.push_str("{\"percent\":[");
            for (i, c) in covers.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::number(&mut out, f64::from(gfa_cover_oktas(c)) * 12.5);
            }
            out.push_str("],\"top_ft\":[");
            for (i, t) in texts.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::opt_number(&mut out, gfa_top_ft(t));
            }
            out.push_str("]}");
        }
        _ => return Err(format!("{name}: not a rule of aviation_grids")),
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model_weather::{cover_of, oktas};

    #[test]
    fn awcs_levels_are_hundreds_of_feet_and_sfc_and_max_are_none() {
        assert_eq!(level_ft("030"), Some(3000.0));
        assert_eq!(level_ft("180"), Some(18000.0));
        assert_eq!(level_ft("sfc"), None);
        assert_eq!(level_ft("max"), None);
    }

    #[test]
    fn the_temperatures_are_read_between_levels_round_each_altitude() {
        let hpa = temperature_hpa();
        // 3,000 ft is 908 hPa in the standard atmosphere: 925 and 900 round
        // it; 30,000 ft is 301 hPa: 350 and 300 round it, 250 beyond.
        assert!(hpa.contains(&925.0) && hpa.contains(&900.0));
        assert!(hpa.contains(&300.0) && hpa.contains(&250.0));
        assert!(hpa.windows(2).all(|w| w[0] > w[1]));
    }

    #[test]
    fn awcs_five_icing_categories_in_order() {
        assert_eq!(icing_word(0.0), Some("None"));
        assert_eq!(icing_word(1.0), Some("Trace"));
        assert_eq!(icing_word(3.0), Some("Moderate"));
        assert_eq!(icing_word(4.0), Some("Heavy"));
        assert_eq!(icing_word(5.0), None);
    }

    #[test]
    fn a_light_airplanes_edr_thresholds_hold_at_each_edge() {
        // GFA help: Light (< 15,500 lb) 13, 16, 36, 64 (EDR x 100).
        assert_eq!(turbulence_word(0.129, EDR_LIGHT), None);
        assert_eq!(turbulence_word(0.13, EDR_LIGHT), Some("Light"));
        assert_eq!(turbulence_word(0.16, EDR_LIGHT), Some("Moderate"));
        assert_eq!(turbulence_word(0.359, EDR_LIGHT), Some("Moderate"));
        assert_eq!(turbulence_word(0.36, EDR_LIGHT), Some("Severe"));
        assert_eq!(turbulence_word(0.64, EDR_LIGHT), Some("Extreme"));
        // The same EDR is lighter for a heavier class: 0.20 is moderate for
        // the medium class, light for the heavy.
        assert_eq!(turbulence_word(0.20, EDR_MEDIUM), Some("Moderate"));
        assert_eq!(turbulence_word(0.20, EDR_HEAVY), Some("Light"));
    }

    #[test]
    fn a_gfa_cover_reads_back_as_the_same_cover() {
        for c in ["CLR", "FEW", "SCT", "BKN", "OVC"] {
            let back = cover_of(oktas(f64::from(gfa_cover_oktas(c)) * 12.5));
            assert_eq!(back, if c == "CLR" { "SKC" } else { c });
        }
    }

    #[test]
    fn the_gfa_cloud_texts_highest_top() {
        assert_eq!(gfa_top_ft("OVC035/TOP 050"), Some(5000.0));
        assert_eq!(gfa_top_ft("SCT021/OVC040/TOP FL280/CI ABV"), Some(28000.0));
        assert_eq!(gfa_top_ft("SCT050"), None);
        assert_eq!(gfa_top_ft("Cirrus"), None);
        assert_eq!(gfa_top_ft("SKC"), None);
    }

    #[test]
    fn every_gairmet_hazard_has_its_label() {
        use crate::forecast::awc::GAIRMET_HAZARDS;
        for (_, words) in GAIRMET_HAZARDS {
            assert!(GAIRMET_LABELS.iter().any(|(w, _)| *w == words), "{words} has no label");
        }
    }
}
