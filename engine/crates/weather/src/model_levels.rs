//! The model winds' levels at a station: the GFS's pressure levels at the
//! grid point nearest it (the weather service's app.gfs reads them from
//! NOMADS' GRIB2) in the units the winds aloft are kept in, so the
//! planner reads them as it read the FB's columns (FAA-H-8083-28B
//! 27.2.1.1.1: direction true, speed in knots, temperature in degrees
//! Celsius, each level at its altitude in feet).
//!
//! The GRIB2 fields are the NCEP's (GRIB2 table 4.2, discipline 0):
//!
//! - HGT, the level's geopotential height, metres: taken as feet by the
//!   international foot, 0.3048 m exactly (NIST SP 811, B.9), as the FB's
//!   levels are heights;
//! - TMP, kelvin: degrees Celsius are kelvin less 273.15 (the SI's own
//!   definition, NIST SP 811, 4.2.1.1);
//! - UGRD and VGRD, the wind's east and north parts, metres a second,
//!   toward where it blows: knots by the international nautical mile,
//!   1,852 m exactly (NIST SP 811, B.9), so a metre a second is 3,600 /
//!   1,852 kt; and turned into the direction it blows from, true, and its
//!   speed by aloft_grid's from_parts, the one reading of a wind's parts
//!   (a part of (0, 0), no wind at all, from 360, as a calm's direction
//!   is no direction).
//!
//! Each figure as it comes, unrounded: the host writes them as its store
//! keeps them. A level with any of its four missing (the model's none
//! over the station) is left out.

use crate::aloft_grid::from_parts;
use crate::json::{self, Value};

/// Metres in a foot, the international foot (NIST SP 811 B.9).
pub const M_PER_FT: f64 = 0.3048;
/// Knots in a metre a second, by the international nautical mile (1,852
/// m, NIST SP 811 B.9): 3,600 s an hour over 1,852 m a mile.
pub const KT_PER_M_S: f64 = 3600.0 / 1852.0;
/// Kelvin at 0 degrees Celsius (NIST SP 811 4.2.1.1).
pub const KELVIN_AT_0_C: f64 = 273.15;

/// One level as the GRIB2 gives it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GribLevel {
    pub height_m: f64,
    pub temp_k: f64,
    pub u_m_s: f64,
    pub v_m_s: f64,
}

/// One level as the winds aloft are kept.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WindLevel {
    pub altitude_ft: f64,
    pub wind_dir_true_deg: f64,
    pub wind_speed_kt: f64,
    pub temp_c: f64,
}

/// A GRIB2 level in the winds aloft's units.
pub fn level(g: GribLevel) -> WindLevel {
    let w = from_parts(g.u_m_s * KT_PER_M_S, g.v_m_s * KT_PER_M_S);
    WindLevel {
        altitude_ft: g.height_m / M_PER_FT,
        wind_dir_true_deg: w.dir_true_deg,
        wind_speed_kt: w.speed_kt,
        temp_c: g.temp_k - KELVIN_AT_0_C,
    }
}

fn field(l: &Value, key: &str) -> Option<f64> {
    l.get(key).and_then(Value::as_f64).filter(|f| f.is_finite())
}

/// `model_wind_levels`: `{"levels": [{"height_m", "temp_k", "u_m_s",
/// "v_m_s"}]}` to `[{"altitude_ft", "wind_dir_true_deg", "wind_speed_kt",
/// "temp_c"}]`, in the levels' order, those with a figure missing left out.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let levels = v.get("levels").and_then(Value::as_array).ok_or_else(|| format!("{name}: \"levels\" is not a list"))?;
    let mut out = String::from("[");
    for l in levels {
        let (Some(height_m), Some(temp_k), Some(u_m_s), Some(v_m_s)) =
            (field(l, "height_m"), field(l, "temp_k"), field(l, "u_m_s"), field(l, "v_m_s"))
        else {
            continue;
        };
        let w = level(GribLevel { height_m, temp_k, u_m_s, v_m_s });
        out.push_str(if out.len() > 1 { ",{\"altitude_ft\":" } else { "{\"altitude_ft\":" });
        json::number(&mut out, w.altitude_ft);
        out.push_str(",\"wind_dir_true_deg\":");
        json::number(&mut out, w.wind_dir_true_deg);
        out.push_str(",\"wind_speed_kt\":");
        json::number(&mut out, w.wind_speed_kt);
        out.push_str(",\"temp_c\":");
        json::number(&mut out, w.temp_c);
        out.push('}');
    }
    out.push(']');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    #[test]
    fn a_level_is_read_in_feet_knots_and_celsius() {
        // 1,852 m a second east is 3,600 kt toward the east: from the west.
        let w = level(GribLevel { height_m: 3048.0, temp_k: 273.15, u_m_s: 1852.0 / 3600.0 * 10.0, v_m_s: 0.0 });
        assert!(close(w.altitude_ft, 10_000.0) && close(w.temp_c, 0.0), "{w:?}");
        assert!(close(w.wind_speed_kt, 10.0) && close(w.wind_dir_true_deg, 270.0), "{w:?}");
        // From the south-west at 20 kt: blowing north-east.
        let part = 20.0 / 2f64.sqrt() * 1852.0 / 3600.0;
        let w = level(GribLevel { height_m: 0.0, temp_k: 253.15, u_m_s: part, v_m_s: part });
        assert!(close(w.wind_speed_kt, 20.0) && close(w.wind_dir_true_deg, 225.0) && close(w.temp_c, -20.0), "{w:?}");
        // No wind at all: from 360, at nothing.
        let w = level(GribLevel { height_m: 0.0, temp_k: 288.15, u_m_s: 0.0, v_m_s: 0.0 });
        assert!(w.wind_speed_kt == 0.0 && w.wind_dir_true_deg == 360.0, "{w:?}");
    }

    #[test]
    fn the_rule_leaves_out_a_level_with_a_figure_missing() {
        let v = json::parse(
            r#"{"levels":[{"height_m":3048,"temp_k":273.15,"u_m_s":0,"v_m_s":0},{"height_m":6096,"temp_k":null,"u_m_s":1,"v_m_s":1}]}"#,
        )
        .unwrap();
        assert_eq!(
            call("model_wind_levels", &v).unwrap(),
            r#"[{"altitude_ft":10000.0,"wind_dir_true_deg":360.0,"wind_speed_kt":0.0,"temp_c":0.0}]"#
        );
        assert!(call("model_wind_levels", &json::parse("{}").unwrap()).is_err());
    }
}
