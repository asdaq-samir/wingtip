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
use crate::visibility::feed_visibility;
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
        let (vis, vis_plus) = el.text_at(&["visibility_statute_mi"]).and_then(feed_visibility).unzip();
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
        r.push_str(&format!(",\"visibility_plus\":{}", vis_plus.unwrap_or(false)));
        // "M1/4SM", read from the text (the cache file's figure drops the M):
        // less than the figure, said "less than 1/4 sm".
        let minus = el.text_at(&["raw_text"]).and_then(metar::parse).is_some_and(|m| m.visibility_minus);
        r.push_str(&format!(",\"visibility_minus\":{minus}"));
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
        // The variable direction, "250V310", read from the text: the
        // cache file has no member for it (metar::variable_direction).
        r.push_str(",\"wind_variable_deg\":");
        match el.text_at(&["raw_text"]).and_then(metar::variable_direction) {
            Some((from, to)) => r.push_str(&format!("[{},{}]", from, to)),
            None => r.push_str("null"),
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
            json::opt_number(&mut p, f.text_at(&["visibility_statute_mi"]).and_then(feed_visibility).map(|(v, _)| v));
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
        // When it was issued, for a figure read from it to say how old
        // its forecast is (the profile's cloud bases).
        s.push_str(",\"issued\":");
        opt_text(&mut s, Some(issued.as_str()).filter(|t| !t.is_empty()));
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

mod advisories;
pub use advisories::*;
mod airmets;
pub use airmets::*;

#[cfg(test)]
mod tests;
