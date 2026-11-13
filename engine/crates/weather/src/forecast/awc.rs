//! The Aviation Weather Center's national cache files read into the
//! shapes the planner keeps (#482 phase 2): the METARs, TAFs, SIGMETs and
//! AIRMETs, PIREPs and G-AIRMETs, each the complete current set as XML
//! (aviationweather.gov/data/cache). The weather service fetches them and
//! stores what this answers (services/weather/app/aviationweather.py);
//! the engine never fetches. Each product's ceiling and flight category
//! are metar.rs's rules, so a report read here says what a phone's own
//! reading of the raw text says.
//!
//! And how long a stored copy may still be served when a later fetch
//! fails (`held_until`), by each product's own validity.

use crate::json::{self, Value};
use crate::xml::{self, Element};
use crate::{metar, sort::StableSort, time, validity};
use wingtip_core::units::FT_PER_M;

/// How old a PIREP is still told: the conditions it reports move on. A
/// design choice -- a PIREP has no period of validity (AIM chapter 7,
/// section 1, Pilot Weather Reports; FAA-H-8083-28B 24.5.1 describes them).
pub const PIREP_MAX_AGE_S: i64 = 90 * 60;
/// The highest a PIREP is told for: a light airplane's sky under Class A
/// (18,000 ft MSL, 14 CFR 71.33), not the airliners' reports from the
/// flight levels.
pub const PIREP_MAX_ALT_FT: f64 = wingtip_flight::limits::CLASS_A_FLOOR_FT;
/// How far either side of the route a PIREP is told (a design choice).
pub const PIREP_CORRIDOR_NM: f64 = 30.0;

/// The G-AIRMET hazards a VFR flight is told of, in words (FAA-H-8083-28B
/// 26.3.1.1, AIRMETs over the CONUS: Sierra's IFR and mountain obscuration, Tango's
/// low-level turbulence, strong surface winds and low-level wind shear,
/// Zulu's icing). High-level turbulence (TURB-HI, above FL180) and the
/// freezing-level contours are not: the one is above the flight, the
/// others lines, not areas.
pub const GAIRMET_HAZARDS: [(&str, &str); 6] = [
    ("IFR", "IFR conditions"),
    ("MT_OBSC", "Mountains obscured"),
    ("TURB-LO", "Turbulence"),
    ("ICE", "Icing"),
    ("LLWS", "Low-level wind shear"),
    ("SFC_WND", "Strong surface winds"),
];
/// A G-AIRMET is a snapshot valid at its time, three hours apart out to
/// 12 hours from issue (FAA-H-8083-28B 26.3.1.1): one is told when it
/// is valid within this of some time of the flight, half the gap.
pub const GAIRMET_SNAPSHOT_S: i64 = 90 * 60;

/// How long a copy whose own contents say nothing of its validity (an
/// empty set of advisories) is served on through failed fetches: what
/// every source was held to before each was held to its own (2026-11-04),
/// a design choice.
pub const STALE_MAX_S: i64 = 3 * 3600;

fn num(text: Option<&str>) -> Option<f64> {
    text.and_then(|t| t.trim().parse::<f64>().ok()).filter(|v| v.is_finite())
}

fn unix(text: Option<&str>) -> Option<i64> {
    text.and_then(time::parse_iso)
}

/// A visibility as the feed writes it, "10+" or "1.5", in statute miles.
fn visibility(text: Option<&str>) -> Option<f64> {
    num(text.map(|t| t.trim().trim_end_matches('+')))
}

/// The ceiling (14 CFR 1.1, metar::sky_ceiling_of) of a METAR's or a TAF
/// period's sky_condition elements and vert_vis_ft: a layer the station
/// could not measure comes with no cloud_base_ft_agl, which as the lowest
/// broken or overcast leaves the ceiling not known, never none.
fn opt_text(out: &mut String, s: Option<&str>) {
    json::opt_string(out, s);
}

fn whole(out: &mut String, v: Option<f64>) {
    match v {
        Some(v) if v.fract() == 0.0 && v.abs() < 1e15 => out.push_str(&format!("{}", v as i64)),
        other => json::opt_number(out, other),
    }
}

fn root(text: &str) -> Result<Element, String> {
    xml::parse(text).map_err(|e| format!("not XML: {} at {}", e.what, e.at))
}

/// `{ident: report}`, the newest report per station in the file: its text,
/// time, flight category, weather, ceiling, visibility, wind, altimeter,
/// temperature and dewpoint, and where the station is.
pub fn metars(text: &str) -> Result<String, String> {
    let doc = root(text)?;
    let mut order: Vec<String> = Vec::new();
    let mut latest: std::collections::HashMap<String, (String, String)> = std::collections::HashMap::new();
    for el in doc.iter_named("METAR") {
        let Some(ident) = el.text_at(&["station_id"]).filter(|s| !s.is_empty()) else { continue };
        let observed = el.text_at(&["observation_time"]).unwrap_or("").to_owned();
        if latest.get(ident).is_some_and(|(was, _)| *was >= observed) {
            continue;
        }
        let (ceiling, unknown, cover) = crate::sky::sky(el);
        let vis = visibility(el.text_at(&["visibility_statute_mi"]));
        // The AWC's own category takes a layer it has no height for as no
        // ceiling, and calls "OVC/// 10SM" VFR; the ceiling is not known
        // (14 CFR 1.1), so the category is only what the visibility settles.
        let category = if unknown {
            metar::flight_category_of(None, true, vis).map(str::to_owned)
        } else {
            el.text_at(&["flight_category"]).filter(|s| !s.is_empty()).map(str::to_owned)
        };
        let mut r = String::from("{\"raw\":");
        opt_text(&mut r, el.text_at(&["raw_text"]));
        r.push_str(",\"observed_at\":");
        opt_text(&mut r, Some(observed.as_str()).filter(|s| !s.is_empty()));
        r.push_str(",\"flight_category\":");
        opt_text(&mut r, category.as_deref());
        // The weather as reported, "-TSRA BR": a thunderstorm at or near
        // the field is one to keep away from.
        r.push_str(",\"wx\":");
        json::string(&mut r, el.text_at(&["wx_string"]).unwrap_or(""));
        r.push_str(",\"ceiling_ft\":");
        whole(&mut r, ceiling);
        r.push_str(",\"ceiling_unknown\":");
        r.push_str(if unknown { "true" } else { "false" });
        r.push_str(",\"ceiling_cover\":");
        json::opt_string(&mut r, cover);
        r.push_str(",\"visibility_sm\":");
        json::opt_number(&mut r, vis);
        for (key, tag) in [
            ("wind_dir_true_deg", "wind_dir_degrees"),
            ("wind_speed_kt", "wind_speed_kt"),
            ("wind_gust_kt", "wind_gust_kt"),
            ("altimeter_in_hg", "altim_in_hg"),
            ("temp_c", "temp_c"),
            ("dewpoint_c", "dewpoint_c"),
            ("lat", "latitude"),
            ("lon", "longitude"),
        ] {
            r.push_str(&format!(",\"{key}\":"));
            // "VRB" is no number: a direction the arithmetic cannot use.
            json::opt_number(&mut r, num(el.text_at(&[tag])));
        }
        r.push('}');
        if !latest.contains_key(ident) {
            order.push(ident.to_owned());
        }
        latest.insert(ident.to_owned(), (observed, r));
    }
    let mut out = String::from("{");
    for (k, ident) in order.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        json::string(&mut out, ident);
        out.push(':');
        out.push_str(&latest[ident].1);
    }
    out.push('}');
    Ok(out)
}

/// Within one start time the prevailing forecast (the first line, or FM)
/// sorts first; BECMG, TEMPO and PROB groups modify it.
fn change_order(change: &str) -> u8 {
    match change.get(..5).unwrap_or(change) {
        "" | "FM" => 0,
        "BECMG" => 1,
        "TEMPO" => 2,
        _ => 3,
    }
}

/// `[{"icaoId", "lat", "lon", "elevation_ft", "raw", "fcsts"}]`, one per
/// station, its latest issue, its periods in time order with the
/// prevailing forecast first, each in taf.rs's shape (`timeFrom`, `timeTo`,
/// `change`, `probability`, the wind, `visibility_sm`, `ceiling_ft`,
/// `ceiling_unknown`, `wx`), so the AWC's decoding and a phone's reading
/// of the raw text are read by the same rules. The field's elevation turns
/// a ceiling, which a TAF gives above the field, into an altitude.
pub fn tafs(text: &str) -> Result<String, String> {
    let doc = root(text)?;
    let mut order: Vec<String> = Vec::new();
    let mut latest: std::collections::HashMap<String, (String, String)> = std::collections::HashMap::new();
    for el in doc.iter_named("TAF") {
        let ident = el.text_at(&["station_id"]).filter(|s| !s.is_empty());
        let (lat, lon) = (num(el.text_at(&["latitude"])), num(el.text_at(&["longitude"])));
        let (Some(ident), Some(lat), Some(lon)) = (ident, lat, lon) else { continue };
        let issued = el.text_at(&["issue_time"]).unwrap_or("").to_owned();
        if latest.get(ident).is_some_and(|(was, _)| *was >= issued) {
            continue;
        }
        let mut periods: Vec<(i64, u8, String)> = Vec::new();
        for f in el.all("forecast") {
            let (Some(from), Some(to)) = (unix(f.text_at(&["fcst_time_from"])), unix(f.text_at(&["fcst_time_to"]))) else { continue };
            let change = f.text_at(&["change_indicator"]).unwrap_or("").trim().to_owned();
            let (ceiling, unknown, _) = crate::sky::sky(f);
            let mut p = format!("{{\"timeFrom\":{from},\"timeTo\":{to},\"change\":");
            json::string(&mut p, &change);
            p.push_str(",\"probability\":");
            json::opt_number(&mut p, num(f.text_at(&["probability"])));
            // The wind from true north, as a TAF gives it (FAA-H-8083-28B 27.4.2.5, the
            // TAF), for the runway a flight finds in use; VRB has no direction.
            for (key, tag) in
                [("wind_dir_true_deg", "wind_dir_degrees"), ("wind_speed_kt", "wind_speed_kt"), ("wind_gust_kt", "wind_gust_kt")]
            {
                p.push_str(&format!(",\"{key}\":"));
                json::opt_number(&mut p, num(f.text_at(&[tag])));
            }
            p.push_str(",\"visibility_sm\":");
            json::opt_number(&mut p, visibility(f.text_at(&["visibility_statute_mi"])));
            p.push_str(",\"ceiling_ft\":");
            whole(&mut p, ceiling);
            p.push_str(",\"ceiling_unknown\":");
            p.push_str(if unknown { "true" } else { "false" });
            // The weather forecast, "TSRA", "VCTS": thunderstorms in a
            // period are one to keep away from.
            p.push_str(",\"wx\":");
            json::string(&mut p, f.text_at(&["wx_string"]).unwrap_or(""));
            p.push('}');
            periods.push((from, change_order(&change), p));
        }
        periods.stable_sort_by_key(|(from, order, _)| (*from, *order));
        let mut s = String::from("{\"icaoId\":");
        json::string(&mut s, ident);
        s.push_str(",\"lat\":");
        json::number(&mut s, lat);
        s.push_str(",\"lon\":");
        json::number(&mut s, lon);
        s.push_str(",\"elevation_ft\":");
        whole(&mut s, num(el.text_at(&["elevation_m"])).map(|m| (m * FT_PER_M).round()));
        // The forecast as issued: the figures are what a go/no-go reads,
        // the text what a pilot reads.
        s.push_str(",\"raw\":");
        opt_text(&mut s, el.text_at(&["raw_text"]));
        s.push_str(",\"fcsts\":[");
        s.push_str(&periods.iter().map(|(_, _, p)| p.as_str()).collect::<Vec<_>>().join(","));
        s.push_str("]}");
        if !latest.contains_key(ident) {
            order.push(ident.to_owned());
        }
        latest.insert(ident.to_owned(), (issued, s));
    }
    Ok(format!("[{}]", order.iter().map(|i| latest[i].1.as_str()).collect::<Vec<_>>().join(",")))
}

/// When a bulletin was issued, from its WMO abbreviated heading, "WSUS32
/// KKCI 261655": the last group is the day of the month, hour and minute
/// (UTC) of issue (WMO-No. 386, Manual on the Global Telecommunication
/// System, Attachment II-5). The SIGMET file gives no issue time of its
/// own. Put in the month of `near` (its valid time), or the month before
/// for a heading of the 31st read on the 1st; None with no heading.
pub fn wmo_issued(raw: &str, near: Option<i64>) -> Option<i64> {
    let near = near?;
    let words: Vec<&str> = raw.split_whitespace().collect();
    let letters = |w: &str, n: usize| w.len() >= n && w[..n].bytes().all(|b| b.is_ascii_uppercase());
    let digits = |w: &str| w.bytes().all(|b| b.is_ascii_digit());
    let found = words.windows(3).find(|w| {
        w[0].len() == 6 && letters(w[0], 4) && digits(&w[0][4..]) && w[1].len() == 4 && letters(w[1], 4) && w[2].len() == 6 && digits(w[2])
    })?;
    let g = found[2];
    let (day, hour, minute): (u32, i64, i64) = (g[..2].parse().ok()?, g[2..4].parse().ok()?, g[4..].parse().ok()?);
    if hour > 23 || minute > 59 {
        return None;
    }
    let (y, m, _) = time::civil_from_days(near.div_euclid(time::DAY_S));
    for back in 0..2i64 {
        let months = y * 12 + m as i64 - 1 - back;
        let (yy, mm) = (months.div_euclid(12), (months.rem_euclid(12) + 1) as u32);
        if day == 0 || day > time::days_in_month(yy, mm) {
            continue;
        }
        let t = time::days_from_civil(yy, mm, day) * time::DAY_S + hour * 3600 + minute * 60;
        if t <= near + time::DAY_S {
            return Some(t);
        }
    }
    None
}

fn coords(out: &mut String, el: &Element) {
    out.push_str(",\"coords\":[");
    let mut first = true;
    for p in el.iter_named("point") {
        if let (Some(lat), Some(lon)) = (num(p.text_at(&["latitude"])), num(p.text_at(&["longitude"]))) {
            if !first {
                out.push(',');
            }
            first = false;
            out.push('[');
            json::number(out, lat);
            out.push(',');
            json::number(out, lon);
            out.push(']');
        }
    }
    out.push(']');
}

fn opt_int(out: &mut String, v: Option<i64>) {
    match v {
        Some(v) => out.push_str(&v.to_string()),
        None => out.push_str("null"),
    }
}

/// The SIGMETs and AIRMETs: `[{"hazard", "type", "altitude_low_ft",
/// "altitude_high_ft", "raw", "valid_from", "valid_to", "issued", "coords"}]`,
/// times in Unix seconds but `issued`, ISO UTC from the WMO heading.
pub fn airsigmets(text: &str) -> Result<String, String> {
    let doc = root(text)?;
    let mut items = Vec::new();
    for el in doc.iter_named("AIRSIGMET") {
        let altitude = el.child("altitude");
        let raw = el.text_at(&["raw_text"]);
        let from = unix(el.text_at(&["valid_time_from"]));
        let mut a = String::from("{\"hazard\":");
        opt_text(&mut a, el.child("hazard").and_then(|h| h.attribute("type")));
        a.push_str(",\"type\":");
        opt_text(&mut a, el.text_at(&["airsigmet_type"]));
        a.push_str(",\"altitude_low_ft\":");
        json::opt_number(&mut a, num(altitude.and_then(|x| x.attribute("min_ft_msl"))));
        a.push_str(",\"altitude_high_ft\":");
        json::opt_number(&mut a, num(altitude.and_then(|x| x.attribute("max_ft_msl"))));
        a.push_str(",\"raw\":");
        opt_text(&mut a, raw);
        a.push_str(",\"valid_from\":");
        opt_int(&mut a, from);
        a.push_str(",\"valid_to\":");
        opt_int(&mut a, unix(el.text_at(&["valid_time_to"])));
        a.push_str(",\"issued\":");
        opt_text(&mut a, wmo_issued(raw.unwrap_or(""), from).map(time::iso).as_deref());
        coords(&mut a, el);
        a.push('}');
        items.push(a);
    }
    Ok(format!("[{}]", items.join(",")))
}

/// The pilot reports in the aircraft reports file -- routine and urgent
/// (UUA) -- leaving out the AIREPs, airliners' position reports from the
/// ocean routes, which are most of it: `[{"observed_at", "observed", "lat",
/// "lon", "altitude_ft", "aircraft", "urgent", "turbulence", "icing", "raw"}]`.
pub fn pireps(text: &str) -> Result<String, String> {
    let doc = root(text)?;
    let mut items = Vec::new();
    for el in doc.iter_named("AircraftReport") {
        let kind = el.text_at(&["report_type"]).unwrap_or("");
        if !kind.contains("PIREP") {
            continue;
        }
        let (Some(lat), Some(lon)) = (num(el.text_at(&["latitude"])), num(el.text_at(&["longitude"]))) else { continue };
        fn first<'a>(el: &'a Element, tag: &'a str, attr: &str) -> Option<&'a str> {
            el.iter_named(tag).into_iter().find_map(|t| t.attribute(attr).filter(|s| !s.is_empty()))
        }
        let first = |tag: &'static str, attr: &str| first(el, tag, attr);
        let mut r = String::from("{\"observed_at\":");
        opt_text(&mut r, el.text_at(&["observation_time"]));
        r.push_str(",\"observed\":");
        opt_int(&mut r, unix(el.text_at(&["observation_time"])));
        r.push_str(",\"lat\":");
        json::number(&mut r, lat);
        r.push_str(",\"lon\":");
        json::number(&mut r, lon);
        r.push_str(",\"altitude_ft\":");
        json::opt_number(&mut r, num(el.text_at(&["altitude_ft_msl"])));
        r.push_str(",\"aircraft\":");
        opt_text(&mut r, el.text_at(&["aircraft_ref"]));
        r.push_str(",\"urgent\":");
        r.push_str(if kind.starts_with("Urgent") { "true" } else { "false" });
        r.push_str(",\"turbulence\":");
        opt_text(&mut r, first("turbulence_condition", "turbulence_intensity"));
        r.push_str(",\"icing\":");
        opt_text(&mut r, first("icing_condition", "icing_intensity"));
        r.push_str(",\"raw\":");
        opt_text(&mut r, el.text_at(&["raw_text"]));
        r.push('}');
        items.push(r);
    }
    Ok(format!("[{}]", items.join(",")))
}

/// The G-AIRMET areas a VFR flight is told of (GAIRMET_HAZARDS): `[{"hazard"
/// (in words), "severity", "due_to", "valid_at", "valid", "issued",
/// "altitude_low_ft", "from_freezing_level", "altitude_high_ft", "coords"}]`.
/// A floor of "FZL" is the freezing level, which the advisory gives beside it.
pub fn gairmets(text: &str) -> Result<String, String> {
    let doc = root(text)?;
    let mut items = Vec::new();
    for el in doc.iter_named("GAIRMET") {
        let hazard = el.child("hazard");
        let Some(words) =
            hazard.and_then(|h| h.attribute("type")).and_then(|k| GAIRMET_HAZARDS.iter().find(|(c, _)| *c == k)).map(|(_, w)| *w)
        else {
            continue;
        };
        if el.text_at(&["geometry_type"]) != Some("AREA") {
            continue;
        }
        let altitude = el.child("altitude");
        let low = altitude.and_then(|x| x.attribute("min_ft_msl"));
        let mut a = String::from("{\"hazard\":");
        json::string(&mut a, words);
        a.push_str(",\"severity\":");
        opt_text(&mut a, hazard.and_then(|h| h.attribute("severity")).filter(|s| !s.is_empty()));
        a.push_str(",\"due_to\":");
        opt_text(&mut a, el.text_at(&["due_to"]));
        a.push_str(",\"valid_at\":");
        opt_text(&mut a, el.text_at(&["valid_time"]));
        a.push_str(",\"valid\":");
        opt_int(&mut a, unix(el.text_at(&["valid_time"])));
        a.push_str(",\"issued\":");
        opt_text(&mut a, el.text_at(&["issue_time"]).filter(|s| !s.is_empty()));
        a.push_str(",\"altitude_low_ft\":");
        json::opt_number(&mut a, if matches!(low, None | Some("" | "FZL" | "SFC")) { None } else { num(low) });
        a.push_str(",\"from_freezing_level\":");
        a.push_str(if low == Some("FZL") { "true" } else { "false" });
        a.push_str(",\"altitude_high_ft\":");
        json::opt_number(&mut a, num(altitude.and_then(|x| x.attribute("max_ft_msl"))));
        coords(&mut a, el);
        a.push('}');
        items.push(a);
    }
    Ok(format!("[{}]", items.join(",")))
}

fn secs(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(Value::as_f64).map(|t| t as i64)
}

/// To when a stored copy of `product` may be served when later fetches
/// fail (Unix seconds; None, no limit), by its product's own validity:
///
/// - "metars": none. A METAR is an observation; FAA-H-8083-28B 24.4.1 gives it no
///   period of validity, only its time, which every report carries and
///   the screens show, so the last set heard is served however long the
///   outage, as "the latest reports, made at ..." (the owner, 2026-11-04);
/// - "tafs": the end of the latest valid period in it (24 or 30 hours
///   from issue, FAA-H-8083-28B 27.4.1; validity.rs);
/// - "airsigmets": the latest "valid until" of them (up to 4 hours for a
///   SIGMET, 6 for volcanic ash or a tropical cyclone, 2 for a convective
///   SIGMET, 6 for an AIRMET; FAA-H-8083-28B 26.2.4, 26.2.5, 26.3.3);
/// - "pireps": PIREP_MAX_AGE_S after the newest report, past which a held
///   set would read as "no reports along the route" where the truth is
///   "none could be had";
/// - "gairmets": GAIRMET_SNAPSHOT_S after the last snapshot.
///
/// A copy whose contents say nothing (none in force) is held STALE_MAX_S
/// from `fetched`.
pub fn held_until(product: &str, data: &Value, fetched: i64) -> Result<Option<i64>, String> {
    let list = || data.as_array().unwrap_or(&[]);
    let latest = |found: Vec<i64>, after: i64| Some(found.into_iter().max().map_or(fetched + STALE_MAX_S, |t| t + after));
    Ok(match product {
        "metars" => None,
        "tafs" => latest(
            list()
                .iter()
                .flat_map(|s| s.get("fcsts").and_then(Value::as_array).unwrap_or(&[]))
                .filter_map(|p| validity::expires_at(validity::Product::Taf, None, None, secs(p, "timeTo")))
                .collect(),
            0,
        ),
        "airsigmets" => latest(
            list().iter().filter_map(|a| validity::expires_at(validity::Product::Advisory, None, None, secs(a, "valid_to"))).collect(),
            0,
        ),
        "pireps" => latest(list().iter().filter_map(|r| secs(r, "observed")).collect(), PIREP_MAX_AGE_S),
        "gairmets" => latest(list().iter().filter_map(|a| secs(a, "valid")).collect(), GAIRMET_SNAPSHOT_S),
        other => return Err(format!("weather_held_until: no product {other:?}")),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_metar_with_no_height_for_its_overcast_is_not_vfr() {
        let xml = r#"<response><data>
          <METAR><raw_text>KXYZ 021353Z AUTO 27010KT 10SM OVC/// 10/05 A3001</raw_text><station_id>KXYZ</station_id>
            <observation_time>2026-11-02T13:53:00Z</observation_time><latitude>45.0</latitude><longitude>-93.0</longitude>
            <wind_dir_degrees>270</wind_dir_degrees><wind_speed_kt>10</wind_speed_kt><visibility_statute_mi>10+</visibility_statute_mi>
            <sky_condition sky_cover="OVC"/><flight_category>VFR</flight_category></METAR>
          <METAR><station_id>KABC</station_id><observation_time>2026-11-02T13:53:00Z</observation_time>
            <wind_dir_degrees>VRB</wind_dir_degrees><visibility_statute_mi>2</visibility_statute_mi>
            <sky_condition sky_cover="BKN" cloud_base_ft_agl="800"/><flight_category>IFR</flight_category></METAR>
        </data></response>"#;
        let v = json::parse(&metars(xml).unwrap()).unwrap();
        let x = v.get("KXYZ").unwrap();
        assert_eq!(x.get("ceiling_unknown"), Some(&Value::Bool(true)));
        assert_eq!(x.get("flight_category"), Some(&Value::Null));
        assert_eq!(x.get("visibility_sm").and_then(Value::as_f64), Some(10.0));
        let a = v.get("KABC").unwrap();
        assert_eq!(a.get("ceiling_ft").and_then(Value::as_f64), Some(800.0));
        assert_eq!(a.get("wind_dir_true_deg"), Some(&Value::Null));
    }

    #[test]
    fn a_taf_in_the_engines_shape() {
        let xml = r#"<response><data><TAF><raw_text>TAF KDLH ...</raw_text><station_id>KDLH</station_id>
          <issue_time>2026-11-02T11:20:00Z</issue_time><latitude>46.8</latitude><longitude>-92.2</longitude><elevation_m>435</elevation_m>
          <forecast><fcst_time_from>2026-11-02T18:00:00Z</fcst_time_from><fcst_time_to>2026-11-03T12:00:00Z</fcst_time_to>
            <change_indicator>FM</change_indicator><visibility_statute_mi>6+</visibility_statute_mi><sky_condition sky_cover="OVC" cloud_base_ft_agl="2500"/></forecast>
          <forecast><fcst_time_from>2026-11-02T12:00:00Z</fcst_time_from><fcst_time_to>2026-11-02T18:00:00Z</fcst_time_to>
            <visibility_statute_mi>6+</visibility_statute_mi><sky_condition sky_cover="BKN" cloud_base_ft_agl="4000"/></forecast>
        </TAF></data></response>"#;
        let v = json::parse(&tafs(xml).unwrap()).unwrap();
        let s = &v.as_array().unwrap()[0];
        assert_eq!(s.get("elevation_ft").and_then(Value::as_f64), Some(1427.0));
        let f = s.get("fcsts").and_then(Value::as_array).unwrap();
        assert_eq!(f[0].get("ceiling_ft").and_then(Value::as_f64), Some(4000.0));
        assert_eq!(f[1].get("change").and_then(Value::as_str), Some("FM"));
        let until = held_until("tafs", &v, 0).unwrap().unwrap();
        assert_eq!(Some(until), time::parse_iso("2026-11-03T12:00:00Z"));
    }

    #[test]
    fn a_bulletins_heading_dates_it() {
        let near = time::parse_iso("2026-11-01T02:00:00Z");
        assert_eq!(wmo_issued("WSUS32 KKCI 311655 SIGC", near), time::parse_iso("2026-10-31T16:55:00Z"));
        assert_eq!(wmo_issued("no heading", near), None);
    }
}
