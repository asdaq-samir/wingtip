//! A field's weather hour by hour, as the airport card lays it out (the
//! web's lib/hourly, moved here in #482 phase 2 with the TAF's reading,
//! which the web did with metar-taf-parser): Now from the METAR, then each
//! whole hour the field's TAF covers, its groups read by taf.rs and what
//! they make of the hour by `super::hour` (FAA-H-8083-28B 27.4.2.10's change groups).
//! Times in and out are milliseconds, as the web's.

use super::{hour, Figures, Group};
use crate::json::{self, Value};
use crate::metar::{self, Layer, Wind};
use crate::taf::{self, Period, Taf};

const HOUR_S: i64 = 3600;
/// How many hours after Now: a TAF covers 24 or 30 (FAA-H-8083-28B 27.4.1).
pub const HOURS: usize = 24;

/// The sky for the hour's glyph: clear (or no cloud said), few or
/// scattered, and broken, overcast or obscured.
fn sky_of(layers: &[Layer]) -> &'static str {
    if layers.iter().any(|l| matches!(l.cover.as_str(), "BKN" | "OVC" | "VV")) {
        "cloudy"
    } else if layers.iter().any(|l| matches!(l.cover.as_str(), "FEW" | "SCT")) {
        "partly"
    } else {
        "clear"
    }
}

/// The weather worth a glyph of its own, the worst first: thunder (TS),
/// snow and the other frozen kinds (SN, SG, PL, IC, GR, GS), rain (RA,
/// DZ, UP), by FMH-1's present-weather codes (ch. 12, table 12-2).
fn precip_of(weather: &[String]) -> Option<&'static str> {
    let codes = |w: &str| -> Vec<String> {
        let w = w.trim_start_matches(['+', '-']);
        let w = w.strip_prefix("VC").unwrap_or(w);
        w.as_bytes().chunks(2).map(|c| String::from_utf8_lossy(c).into_owned()).collect()
    };
    let all: Vec<String> = weather.iter().flat_map(|w| codes(w)).collect();
    let has = |set: &[&str]| all.iter().any(|c| set.contains(&c.as_str()));
    if has(&["TS"]) {
        Some("thunder")
    } else if has(&["SN", "SG", "PL", "IC", "GR", "GS"]) {
        Some("snow")
    } else if has(&["RA", "DZ", "UP"]) {
        Some("rain")
    } else {
        None
    }
}

/// One hour as the card draws it.
#[derive(Clone, Debug, PartialEq, Default)]
struct Hour {
    at_ms: f64,
    now: bool,
    category: Option<String>,
    ceiling_ft: Option<f64>,
    visibility_sm: Option<f64>,
    sky: Option<&'static str>,
    precip: Option<&'static str>,
    wind: Option<Wind>,
    at_times: Option<String>,
    at_times_gust_kt: Option<f64>,
    at_times_thunder: bool,
    at_times_chance: bool,
}

/// A group's figures; `under`, the prevailing group whose cloud and
/// visibility a TEMPO or PROB that leaves them out keeps.
fn figures(p: &Period, under: Option<&Period>) -> Hour {
    let layers = match under {
        Some(u) if p.layers.is_empty() => &u.layers,
        _ => &p.layers,
    };
    let visibility = p.visibility_sm.or(under.and_then(|u| u.visibility_sm));
    let (ceiling, unknown) = metar::sky_ceiling(layers);
    // A ceiling of no height ("OVC///") is not known: only what the
    // visibility settles is said (metar::flight_category_of).
    let category = metar::flight_category_of(ceiling, unknown, visibility);
    Hour {
        category: category.map(str::to_owned),
        ceiling_ft: ceiling,
        visibility_sm: visibility.map(|v| (v * 100.0).round() / 100.0),
        sky: Some(sky_of(layers)),
        precip: precip_of(&p.weather),
        wind: p.wind,
        ..Default::default()
    }
}

fn held(h: &Hour) -> Figures {
    Figures { category: h.category.clone(), gust_kt: h.wind.and_then(|w| w.gust_kt), thunder: h.precip == Some("thunder") }
}

fn prevails(p: &Period) -> bool {
    matches!(p.change.as_str(), "" | "FM" | "BECMG")
}

/// The TAF's hour starting `at` (seconds); None outside its validity.
fn hour_at(t: &Taf, at: i64) -> Option<Hour> {
    if at < t.valid_from || at >= t.valid_to {
        return None;
    }
    let prevailing = t.periods.iter().rfind(|p| prevails(p) && p.from <= at && at < p.to)?;
    let mut figs = figures(prevailing, None);
    let becoming = prevailing.change == "BECMG" && prevailing.by.is_some_and(|by| at < by);
    let before = becoming.then(|| t.periods.iter().rfind(|p| prevails(p) && p.from < prevailing.from)).flatten().map(|p| figures(p, None));
    let supplemental: Vec<Group> = t
        .periods
        .iter()
        .filter(|p| matches!(p.change.as_str(), "TEMPO" | "PROB") && p.from <= at && at < p.to)
        .map(|p| Group { figures: held(&figures(p, Some(prevailing))), chance: p.probability.is_some() })
        .collect();
    let read = hour(&held(&figs), becoming, before.as_ref().map(held).as_ref(), &supplemental);
    if read.before_worse
        && let Some(was) = before
    {
        // The weather before, with the new group's wind.
        figs = Hour { wind: figs.wind, ..was };
    }
    Some(Hour {
        at_ms: at as f64 * 1000.0,
        at_times: read.at_times,
        at_times_gust_kt: read.at_times_gust_kt,
        at_times_thunder: read.at_times_thunder,
        at_times_chance: read.at_times_chance,
        ..figs
    })
}

/// Now, from the field's METAR: its figures as the planner (or own ship's
/// receiver) read them, its sky and weather from its text.
fn now_of(m: &Value, now_ms: f64) -> Hour {
    let num = |k: &str| m.get(k).and_then(Value::as_f64);
    let read = m
        .get("raw")
        .and_then(Value::as_str)
        .and_then(|raw| metar::parse(raw.split_whitespace().collect::<Vec<_>>().join(" ").trim_end_matches('=')));
    let (sky, precip) = match &read {
        Some(r) => (Some(sky_of(&r.layers)), precip_of(&r.weather)),
        None => (num("ceiling_ft").map(|_| "cloudy"), None),
    };
    let at = m.get("observed_at").and_then(Value::as_str).and_then(crate::time::parse_iso).map_or(now_ms, |t| t as f64 * 1000.0);
    Hour {
        at_ms: at,
        now: true,
        category: m.get("flight_category").and_then(Value::as_str).map(str::to_owned),
        ceiling_ft: num("ceiling_ft"),
        visibility_sm: num("visibility_sm"),
        sky,
        precip,
        wind: num("wind_speed_kt").map(|s| Wind { dir_true_deg: num("wind_dir_true_deg"), speed_kt: s, gust_kt: num("wind_gust_kt") }),
        ..Default::default()
    }
}

/// A TAF as sent, tidied as FIS-B and the feeds send it ("TAF.AMD", a
/// closing "="), dated from `now_s`.
pub fn read_taf(raw: &str, now_s: i64) -> Option<Taf> {
    let text = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let text = text.strip_prefix("TAF.AMD ").map_or(text.clone(), |rest| format!("TAF AMD {rest}"));
    taf::parse(text.trim_end_matches('='), now_s)
}

/// Now and the hours after it, as JSON: Now the METAR's, or with none the
/// TAF's for this moment; then each whole hour the TAF covers, up to
/// `count`.
pub fn field_hours(metar: Option<&Value>, taf_raw: Option<&str>, now_ms: f64, count: usize) -> String {
    let now_s = (now_ms / 1000.0).floor() as i64;
    let taf = taf_raw.and_then(|raw| read_taf(raw, now_s));
    let mut hours = Vec::new();
    match (metar, &taf) {
        (Some(m), _) => hours.push(now_of(m, now_ms)),
        (None, Some(t)) => {
            if let Some(h) = hour_at(t, now_s) {
                hours.push(Hour { at_ms: now_ms, now: true, ..h });
            }
        }
        _ => {}
    }
    if let Some(t) = &taf {
        let mut at = now_s.div_euclid(HOUR_S) * HOUR_S + HOUR_S;
        let mut n = 0;
        while n < count && at < t.valid_to {
            if let Some(h) = hour_at(t, at) {
                hours.push(h);
                n += 1;
            }
            at += HOUR_S;
        }
    }
    let mut out = String::from("[");
    for (i, h) in hours.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"at\":");
        json::number(&mut out, h.at_ms);
        out.push_str(&format!(",\"now\":{}", h.now));
        out.push_str(",\"category\":");
        json::opt_string(&mut out, h.category.as_deref());
        out.push_str(",\"ceiling_ft\":");
        json::opt_number(&mut out, h.ceiling_ft);
        out.push_str(",\"visibility_sm\":");
        json::opt_number(&mut out, h.visibility_sm);
        out.push_str(",\"sky\":");
        json::opt_string(&mut out, h.sky);
        out.push_str(",\"precip\":");
        json::opt_string(&mut out, h.precip);
        out.push_str(",\"wind_dir_true_deg\":");
        json::opt_number(&mut out, h.wind.and_then(|w| w.dir_true_deg));
        out.push_str(",\"wind_speed_kt\":");
        json::opt_number(&mut out, h.wind.map(|w| w.speed_kt.round()));
        out.push_str(",\"wind_gust_kt\":");
        json::opt_number(&mut out, h.wind.and_then(|w| w.gust_kt).map(f64::round));
        out.push_str(",\"at_times\":");
        json::opt_string(&mut out, h.at_times.as_deref());
        out.push_str(",\"at_times_gust_kt\":");
        json::opt_number(&mut out, h.at_times_gust_kt);
        out.push_str(&format!(",\"at_times_thunder\":{},\"at_times_chance\":{}}}", h.at_times_thunder, h.at_times_chance));
    }
    out.push(']');
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::time;

    fn at(day: u32, hour: i64) -> i64 {
        time::days_from_civil(2026, 11, day) * time::DAY_S + hour * 3600
    }

    #[test]
    fn a_tempo_is_weather_at_times_and_a_becmg_the_worse_while_under_way() {
        let t =
            read_taf("TAF KDLH 021120Z 0212/0312 27012KT P6SM BKN040 BECMG 0214/0216 OVC008 TEMPO 0218/0220 2SM -TSRA BKN015", at(2, 12))
                .unwrap();
        let h = hour_at(&t, at(2, 13)).unwrap();
        assert_eq!(h.category.as_deref(), Some("VFR"));
        // The BECMG to 800 ft is under way at 15Z: the worse of before and
        // after, the new weather here.
        let h = hour_at(&t, at(2, 15)).unwrap();
        assert_eq!((h.category.as_deref(), h.ceiling_ft), (Some("IFR"), Some(800.0)));
        // One getting better is the weather before until it is done.
        let up = read_taf("TAF KDLH 021120Z 0212/0312 27012KT P6SM OVC008 BECMG 0214/0216 BKN040", at(2, 12)).unwrap();
        assert_eq!(hour_at(&up, at(2, 15)).unwrap().category.as_deref(), Some("IFR"));
        assert_eq!(hour_at(&up, at(2, 16)).unwrap().category.as_deref(), Some("VFR"));
        let h = hour_at(&t, at(2, 17)).unwrap();
        assert_eq!(h.category.as_deref(), Some("IFR"));
        let h = hour_at(&t, at(2, 18)).unwrap();
        assert_eq!((h.at_times.as_deref(), h.at_times_thunder), (None, true));
        assert_eq!(hour_at(&t, at(3, 13)), None);
    }

    #[test]
    fn precipitation_by_its_codes() {
        assert_eq!(precip_of(&["-TSRA".into()]), Some("thunder"));
        assert_eq!(precip_of(&["BLSN".into(), "RA".into()]), Some("snow"));
        assert_eq!(precip_of(&["VCSH".into()]), None);
        assert_eq!(precip_of(&["BR".into()]), None);
    }

    #[test]
    fn now_from_the_metar_then_the_tafs_hours() {
        let m = json::parse(r#"{"raw":"KDLH 021253Z 27012KT 10SM FEW040 05/01 A3001","observed_at":"2026-11-02T12:53:00Z","flight_category":"VFR","ceiling_ft":null,"visibility_sm":10,"wind_dir_true_deg":270,"wind_speed_kt":12}"#).unwrap();
        let out = json::parse(&field_hours(Some(&m), Some("TAF KDLH 021120Z 0212/0312 27012KT P6SM BKN040"), at(2, 13) as f64 * 1000.0, 3))
            .unwrap();
        let hours = out.as_array().unwrap();
        assert_eq!(hours.len(), 4);
        assert_eq!(hours[0].get("sky").and_then(Value::as_str), Some("partly"));
        assert_eq!(hours[1].get("at").and_then(Value::as_f64), Some(at(2, 14) as f64 * 1000.0));
    }
}
