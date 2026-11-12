//! The sim_flight rule's JSON (sim): its input read, its answer written.

use super::sim::{sim_flight, Point, Setting, MAX_RATE_HZ, RATE_HZ};
use super::sim_config;
use super::{num, opt, opt_bool};
use crate::json::{self, Value};
use crate::sort::StableSort;

fn point(v: &Value) -> Result<Point, String> {
    const NAME: &str = "sim_flight";
    Ok(Point {
        t: num(NAME, v, "t")?,
        lat: num(NAME, v, "lat")?,
        lon: num(NAME, v, "lon")?,
        alt_ft: opt(NAME, v, "alt_ft")?,
        gs_kt: opt(NAME, v, "gs_kt")?,
        track_deg: opt(NAME, v, "track_deg")?,
        vs_fpm: opt(NAME, v, "vs_fpm")?,
        along_nm: opt(NAME, v, "along_nm")?.unwrap_or(0.0),
        gap: opt_bool(NAME, v, "gap")?.unwrap_or(false),
        ground: opt_bool(NAME, v, "ground")?.unwrap_or(false),
    })
}

fn list<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key).and_then(Value::as_array).unwrap_or(&[])
}

/// Rounded for the answer: a centimetre of position, a tenth of a foot,
/// a hundredth of a degree are past what a simulator draws.
fn round(v: f64, places: i32) -> f64 {
    let f = 10f64.powi(places);
    (v * f).round() / f
}

/// `sim_flight`: `{"segments": [{"rows", "msl", "setting_hpa"}]}` from
/// `{"points": [ReplaySample], "settings"?, "ground"?, "pressure"?,
/// "from"?, "to"?, "rate_hz"?}`.
pub(super) fn sim_flight_rule(v: &Value) -> Result<String, String> {
    const NAME: &str = "sim_flight";
    let points: Vec<Point> = v
        .get("points")
        .and_then(Value::as_array)
        .ok_or("sim_flight: \"points\" is missing or not a list")?
        .iter()
        .map(point)
        .collect::<Result<_, _>>()?;
    let mut settings: Vec<Setting> = list(v, "settings")
        .iter()
        .map(|s| Ok(Setting { t: num(NAME, s, "t")?, hpa: num(NAME, s, "hpa")?, alt_ft: opt(NAME, s, "alt_ft")? }))
        .collect::<Result<_, String>>()?;
    settings.retain(|s| s.hpa > 800.0 && s.hpa < 1100.0);
    settings.stable_sort_by(|a, b| a.t.total_cmp(&b.t));
    let ground: Vec<(f64, f64)> =
        list(v, "ground").iter().map(|g| Ok((num(NAME, g, "along_nm")?, num(NAME, g, "ground_ft")?))).collect::<Result<_, String>>()?;
    let pressure = opt_bool(NAME, v, "pressure")?.unwrap_or(false);
    let window = (opt(NAME, v, "from")?.unwrap_or(f64::NEG_INFINITY), opt(NAME, v, "to")?.unwrap_or(f64::INFINITY));
    let rate = match opt(NAME, v, "rate_hz")? {
        None => RATE_HZ,
        Some(r) if r > 0.0 && r <= MAX_RATE_HZ => r,
        Some(_) => return Err(format!("sim_flight: \"rate_hz\" is more than 0 and at most {MAX_RATE_HZ}")),
    };
    let segments = sim_flight(&points, &settings, &ground, pressure, window, rate);
    let mut out = String::from("{\"segments\":[");
    for (i, seg) in segments.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"rows\":[");
        for (j, r) in seg.rows.iter().enumerate() {
            if j > 0 {
                out.push(',');
            }
            let fields = [
                ("t", round(r.t, 2)),
                ("lat", round(r.lat, 7)),
                ("lon", round(r.lon, 7)),
                ("alt_ft", round(r.alt_ft, 1)),
                ("gs_kt", round(r.gs_kt, 1)),
                ("vs_fpm", round(r.vs_fpm, 0)),
                ("track_deg", round(r.track_deg, 2)),
                ("heading_mag_deg", round(r.heading_mag_deg, 2)),
                ("pitch_deg", round(r.pitch_deg, 2)),
                ("bank_deg", round(r.bank_deg, 2)),
            ];
            for (k, (key, value)) in fields.iter().enumerate() {
                out.push_str(if k == 0 { "{\"" } else { ",\"" });
                out.push_str(key);
                out.push_str("\":");
                json::number(&mut out, *value);
            }
            out.push_str(",\"agl_ft\":");
            json::opt_number(&mut out, r.agl_ft.map(|a| round(a, 1)));
            out.push_str(if r.ground { ",\"ground\":true" } else { ",\"ground\":false" });
            sim_config::write(&mut out, &r.config);
            out.push('}');
        }
        out.push_str("],\"msl\":");
        out.push_str(if seg.msl { "true" } else { "false" });
        out.push_str(",\"setting_hpa\":");
        json::opt_number(&mut out, seg.setting_hpa);
        out.push('}');
    }
    out.push_str("]}");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_rule_answers_its_contract() {
        let v = json::parse(
            r#"{"points":[{"t":0,"lat":45,"lon":-93,"alt_ft":3000,"gs_kt":120,"track_deg":0,"vs_fpm":0,"along_nm":0,"gap":false,"ground":false},
            {"t":10,"lat":45.0055,"lon":-93,"alt_ft":3000,"gs_kt":120,"track_deg":0,"vs_fpm":0,"along_nm":0.33,"gap":false,"ground":false}],
            "settings":[{"t":0,"hpa":1013.2,"alt_ft":3000}],"pressure":true,"rate_hz":2}"#,
        )
        .unwrap();
        let out = json::parse(&sim_flight_rule(&v).unwrap()).unwrap();
        let seg = &out.get("segments").and_then(Value::as_array).unwrap()[0];
        assert_eq!(seg.get("rows").and_then(Value::as_array).unwrap().len(), 21);
        assert_eq!(seg.get("msl"), Some(&Value::Bool(true)));
        assert!(sim_flight_rule(&json::parse(r#"{"points":[],"rate_hz":0}"#).unwrap()).is_err());
    }
}
