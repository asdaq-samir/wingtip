//! The weather along a route, from the products as awc.rs keeps them
//! (#482 phase 2, moved from the planner's wingtip.weather): what a TAF
//! says of a window of time, the worst forecast along the route, the
//! "VFR flight not recommended" reasons, and the SIGMETs, PIREPs and
//! G-AIRMETs the route meets. The products come in from the host; the
//! engine never fetches.

use super::awc::{GAIRMET_SNAPSHOT_S, PIREP_MAX_AGE_S, PIREP_MAX_ALT_FT};
use crate::json::{self, Value};
use crate::{geo, sort::StableSort};

fn num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

fn change(p: &Value) -> &str {
    p.get("change").and_then(Value::as_str).unwrap_or("")
}

fn prefix(s: &str, n: usize) -> &str {
    s.get(..n).unwrap_or(s)
}

pub use super::covers::Worst;

/// Every period of a TAF's (`fcsts`, awc.rs's shape) that says something
/// about [start, end]: the prevailing periods and TEMPO and PROB groups
/// overlapping it, and a BECMG group that began before its end -- a
/// BECMG's change lasts past its own window to the next FM (WMO No. 306;
/// FAA-H-8083-28B 27.4.2.10), and the AWC's feed carries no prevailing
/// period after it.
pub fn periods_in_window(fcsts: &[Value], start: f64, end: f64) -> Vec<&Value> {
    let overlaps = |p: &Value| num(p, "timeFrom").is_some_and(|f| f <= end) && num(p, "timeTo").is_some_and(|t| t > start);
    let overlapping: Vec<&Value> = fcsts.iter().filter(|p| overlaps(p)).collect();
    let since = overlapping
        .iter()
        .filter(|p| matches!(prefix(change(p), 5), "" | "FM"))
        .filter_map(|p| num(p, "timeFrom"))
        .fold(None, |m: Option<f64>, f| Some(m.map_or(f, |m| m.min(f))))
        .unwrap_or(start);
    let becoming = fcsts
        .iter()
        .filter(|p| change(p).starts_with("BECMG") && num(p, "timeFrom").is_some_and(|f| since <= f && f <= end) && !overlaps(p));
    overlapping.iter().copied().chain(becoming).collect()
}

/// The lowest ceiling and visibility the TAF forecasts anywhere in [start,
/// end], TEMPO and PROB groups included: a go/no-go read is the worst the
/// forecast allows, and taking the prevailing forecast alone let "TEMPO
/// 1/2SM FG" read as VFR. None where the TAF says nothing of the window.
/// `ceiling_unknown` where any period forecasts a ceiling of no height
/// (14 CFR 1.1; metar.rs sky_ceiling_of): the lowest known ceiling is then
/// not the worst the forecast allows. `covers`: covers::covers_window.
pub fn worst_in_window(fcsts: &[Value], start: f64, end: f64) -> Option<Worst> {
    let periods = periods_in_window(fcsts, start, end);
    if periods.is_empty() {
        return None;
    }
    let least = |key: &str| periods.iter().filter_map(|p| num(p, key)).fold(None, |m: Option<f64>, v| Some(m.map_or(v, |m| m.min(v))));
    Some(Worst {
        ceiling_ft: least("ceiling_ft"),
        ceiling_unknown: periods.iter().any(|p| p.get("ceiling_unknown") == Some(&Value::Bool(true))),
        visibility_sm: least("visibility_sm"),
        covers: super::covers::covers_window(fcsts, start, end),
    })
}

/// The prevailing period covering `at`: the first line or an FM group
/// whose hours hold it. None where none does -- an expired TAF, or one
/// not valid yet, is not read as the current one.
pub fn current_period(fcsts: &[Value], at: f64) -> Option<&Value> {
    fcsts.iter().find(|p| num(p, "timeFrom").is_some_and(|f| f <= at) && num(p, "timeTo").is_some_and(|t| at < t))
}

/// The prevailing forecast at `at` for its wind: the first line or FM
/// period covering it, or a BECMG begun by then (it lasts to the next
/// change), never a TEMPO or PROB group (FAA-H-8083-28B 27.4.2.10). None where no period
/// covers `at` at all.
pub fn prevailing_at(fcsts: &[Value], at: f64) -> Option<&Value> {
    current_period(fcsts, at)?;
    fcsts
        .iter()
        .filter(|p| {
            let (from, to) = (num(p, "timeFrom").unwrap_or(f64::INFINITY), num(p, "timeTo").unwrap_or(f64::NEG_INFINITY));
            from <= at && ((matches!(prefix(change(p), 5), "" | "FM") && at < to) || prefix(change(p), 5) == "BECMG")
        })
        .max_by(|a, b| num(a, "timeFrom").unwrap_or(0.0).total_cmp(&num(b, "timeFrom").unwrap_or(0.0)))
}

fn point(v: &Value) -> Option<(f64, f64)> {
    match v {
        Value::Array(xy) if xy.len() == 2 => Some((xy[0].as_f64()?, xy[1].as_f64()?)),
        _ => Some((num(v, "lat")?, num(v, "lon")?)),
    }
}

/// A list of [lat, lon] (or {"lat", "lon"}) points.
pub fn points(v: Option<&Value>) -> Vec<(f64, f64)> {
    v.and_then(Value::as_array).unwrap_or(&[]).iter().filter_map(point).collect()
}

/// The lowest forecast ceiling and visibility among the TAF stations near
/// the route a -> b over [start, end] (worst_in_window), as JSON:
/// `{"min_ceiling_ft", "min_visibility_sm", "ceiling_unknown_at",
/// "stations"}`. TAFs are issued only for the larger fields, so a wider
/// corridor (`corridor_nm`, its box) is searched than the pilotage one: a
/// small departure or destination field often has none of its own. A
/// station whose TAF says nothing of the window is left out rather than
/// read at some other time. Each station keeps where it is and its
/// field's elevation, which the altitude plan keeps each leg under its
/// clouds with (14 CFR 91.155).
pub fn tafs_along_route(tafs: &[Value], a: (f64, f64), b: (f64, f64), corridor_nm: f64, start: f64, end: f64) -> String {
    let (s, w, n, e) = geo::corridor_bbox(a, b, corridor_nm);
    let mut stations = String::new();
    let (mut ceiling, mut visibility, mut unknown_at): (Option<f64>, Option<f64>, Vec<&str>) = (None, None, Vec::new());
    for station in tafs {
        let (Some(lat), Some(lon)) = (num(station, "lat"), num(station, "lon")) else { continue };
        if !(s <= lat && lat <= n && w <= lon && lon <= e) {
            continue;
        }
        let fcsts = station.get("fcsts").and_then(Value::as_array).unwrap_or(&[]);
        let Some(worst) = worst_in_window(fcsts, start, end) else { continue };
        let ident = station.get("icaoId").and_then(Value::as_str).unwrap_or("");
        if !stations.is_empty() {
            stations.push(',');
        }
        stations.push_str("{\"icaoId\":");
        json::string(&mut stations, ident);
        stations.push_str(",\"lat\":");
        json::number(&mut stations, lat);
        stations.push_str(",\"lon\":");
        json::number(&mut stations, lon);
        stations.push_str(",\"elevation_ft\":");
        json::value(&mut stations, station.get("elevation_ft").unwrap_or(&Value::Null));
        stations.push_str(",\"ceiling_ft\":");
        json::opt_number(&mut stations, worst.ceiling_ft);
        stations.push_str(",\"ceiling_unknown\":");
        stations.push_str(if worst.ceiling_unknown { "true" } else { "false" });
        stations.push_str(",\"visibility_sm\":");
        json::opt_number(&mut stations, worst.visibility_sm);
        stations.push('}');
        if worst.ceiling_unknown {
            unknown_at.push(ident);
        }
        if let Some(c) = worst.ceiling_ft {
            ceiling = Some(ceiling.map_or(c, |m: f64| m.min(c)));
        }
        if let Some(v) = worst.visibility_sm {
            visibility = Some(visibility.map_or(v, |m: f64| m.min(v)));
        }
    }
    let mut out = String::from("{\"min_ceiling_ft\":");
    json::opt_number(&mut out, ceiling);
    out.push_str(",\"min_visibility_sm\":");
    json::opt_number(&mut out, visibility);
    out.push_str(",\"ceiling_unknown_at\":[");
    for (k, i) in unknown_at.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        json::string(&mut out, i);
    }
    out.push_str("],\"stations\":[");
    out.push_str(&stations);
    out.push_str("]}");
    out
}

/// A whole number of feet with thousands commas, "1,200" (Python's ",.0f").
pub(crate) fn feet(v: f64) -> String {
    crate::text::grouped_int(v.round() as i64)
}

/// A visibility as Python's "g" writes it: "3", "1.5", "0.25".
pub(crate) fn miles(v: f64) -> String {
    if v.fract() == 0.0 {
        format!("{}", v as i64)
    } else {
        format!("{v}")
    }
}

/// "VFR flight not recommended" -- its own named element of a standard
/// briefing (AIM 7-1-5), stated whenever conditions warrant it -- as the
/// reasons, in briefing order: either end of the route reporting IFR or
/// LIFR now (`metars`, {ident: report}), then the forecast along the route
/// (tafs_along_route's answer) under the basic VFR minimums `min_ceiling_ft`
/// and `min_visibility_sm` (14 CFR 91.155(c), (d); the caller passes
/// rules.rs's). A ceiling reported or forecast with no height ("OVC///")
/// is said too: it could be at any height, the ground included, a
/// condition that makes VFR flight doubtful (AIM 7-1-5), and saying
/// nothing would pass it as no ceiling. Empty where nothing warrants it.
pub fn vfr_not_recommended_reasons(
    idents: &[&str], metars: &Value, forecast: &Value, min_ceiling_ft: f64, min_visibility_sm: f64,
) -> Vec<String> {
    let mut reasons = Vec::new();
    for ident in idents {
        let report = metars.get(ident).unwrap_or(&Value::Null);
        match report.get("flight_category").and_then(Value::as_str) {
            Some(c @ ("IFR" | "LIFR")) => reasons.push(format!("{ident} currently reporting {c}")),
            _ if report.get("ceiling_unknown") == Some(&Value::Bool(true)) => {
                reasons.push(format!("{ident} currently reporting a ceiling of unknown height"));
            }
            _ => {}
        }
    }
    if let Some(c) = num(forecast, "min_ceiling_ft").filter(|c| *c < min_ceiling_ft) {
        reasons.push(format!("forecast ceiling as low as {} ft along the route", feet(c)));
    }
    let unknown: Vec<&str> =
        forecast.get("ceiling_unknown_at").and_then(Value::as_array).unwrap_or(&[]).iter().filter_map(Value::as_str).collect();
    if !unknown.is_empty() {
        reasons.push(format!("forecast ceiling of unknown height at {}", unknown.join(", ")));
    }
    if let Some(v) = num(forecast, "min_visibility_sm").filter(|v| *v < min_visibility_sm) {
        reasons.push(format!("forecast visibility as low as {} sm along the route", miles(v)));
    }
    reasons
}

fn object_with(out: &mut String, v: &Value, keep: impl Fn(&str) -> bool, extra: &[(&str, f64)]) {
    out.push('{');
    let mut first = true;
    if let Value::Object(members) = v {
        for (k, item) in members.iter().filter(|(k, _)| keep(k)) {
            if !first {
                out.push(',');
            }
            first = false;
            json::string(out, k);
            out.push(':');
            json::value(out, item);
        }
    }
    for (k, n) in extra {
        if !first {
            out.push(',');
        }
        first = false;
        json::string(out, k);
        out.push(':');
        json::number(out, *n);
    }
    out.push('}');
}

/// The SIGMETs (and any AIRMETs) in force at `now` whose area the route a
/// -> b crosses. The box `corridor_nm` round the route is a coarse
/// prefilter -- a convective SIGMET commonly spans several states -- and
/// the crossing is the test. CONUS AIRMETs gave way to G-AIRMETs in
/// January 2025 (gairmets_along_route). Each keeps its times, issue and
/// area for the briefing to say where and when the flight meets it.
pub fn sigmets_along_route(advisories: &[Value], a: (f64, f64), b: (f64, f64), corridor_nm: f64, now: f64) -> String {
    let (s, w, n, e) = geo::corridor_bbox(a, b, corridor_nm);
    let keys = ["hazard", "type", "altitude_low_ft", "altitude_high_ft", "raw", "valid_from", "valid_to", "issued", "coords"];
    let mut out = Vec::new();
    for adv in advisories {
        if num(adv, "valid_to").is_some_and(|t| t <= now) || num(adv, "valid_from").is_some_and(|f| f > now) {
            continue;
        }
        let ring = points(adv.get("coords"));
        if ring.len() < 3 {
            continue;
        }
        let (lo_lat, hi_lat) = ring.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |(l, h), p| (l.min(p.0), h.max(p.0)));
        let (lo_lon, hi_lon) = ring.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |(l, h), p| (l.min(p.1), h.max(p.1)));
        if hi_lat < s || lo_lat > n || hi_lon < w || lo_lon > e {
            continue;
        }
        if geo::path_meets_polygon(&[a, b], &ring) {
            let mut item = String::new();
            object_with(&mut item, adv, |k| keys.contains(&k), &[]);
            out.push(item);
        }
    }
    format!("[{}]", out.join(","))
}

/// Whether a PIREP is still told: made within PIREP_MAX_AGE_S of `now`
/// and at or under PIREP_MAX_ALT_FT (a report with no altitude kept).
fn told(report: &Value, now: f64) -> bool {
    num(report, "observed").is_some_and(|t| now - t <= PIREP_MAX_AGE_S as f64)
        && num(report, "altitude_ft").is_none_or(|a| a <= PIREP_MAX_ALT_FT)
}

/// The PIREPs still told (`told`) within `corridor_nm` of the route flown
/// through `path`, each with how far along it it is ("along_track_nm",
/// to the tenth), urgent ones first, then in route order; "observed" (the
/// Unix time) left out.
pub fn pireps_along_route(reports: &[Value], path: &[(f64, f64)], corridor_nm: f64, now: f64) -> String {
    let mut found: Vec<(bool, f64, &Value)> = Vec::new();
    for report in reports.iter().filter(|r| told(r, now)) {
        let (Some(lat), Some(lon)) = (num(report, "lat"), num(report, "lon")) else { continue };
        let mut offset = 0.0;
        let mut nearest = None;
        for leg in path.windows(2) {
            let (cross, along) = geo::track_nm(lat, lon, leg[0], leg[1]);
            let leg_nm = geo::distance_nm(leg[0].0, leg[0].1, leg[1].0, leg[1].1);
            if -corridor_nm <= along && along <= leg_nm + corridor_nm && cross.abs() <= corridor_nm {
                nearest = Some(offset + along.clamp(0.0, leg_nm));
                break;
            }
            offset += leg_nm;
        }
        if let Some(at) = nearest {
            found.push((report.get("urgent") == Some(&Value::Bool(true)), (at * 10.0).round() / 10.0, report));
        }
    }
    found.stable_sort_by(|x, y| y.0.cmp(&x.0).then(x.1.total_cmp(&y.1)));
    let items: Vec<String> = found
        .iter()
        .map(|(_, at, r)| {
            let mut s = String::new();
            object_with(&mut s, r, |k| k != "observed", &[("along_track_nm", *at)]);
            s
        })
        .collect();
    format!("[{}]", items.join(","))
}

/// The PIREPs still told (`told`) in a box (south, west, north, east),
/// for the map, the urgent last so they are drawn on top; "observed" left
/// out.
pub fn pireps_in_box(reports: &[Value], box_: (f64, f64, f64, f64), now: f64) -> String {
    let (s, w, n, e) = box_;
    let mut found: Vec<&Value> = reports
        .iter()
        .filter(|r| told(r, now))
        .filter(|r| num(r, "lat").is_some_and(|l| s <= l && l <= n) && num(r, "lon").is_some_and(|l| w <= l && l <= e))
        .collect();
    found.stable_sort_by_key(|r| r.get("urgent") == Some(&Value::Bool(true)));
    let items: Vec<String> = found
        .iter()
        .map(|r| {
            let mut s = String::new();
            object_with(&mut s, r, |k| k != "observed", &[]);
            s
        })
        .collect();
    format!("[{}]", items.join(","))
}

/// Every G-AIRMET snapshot whose area the route flown through `path`
/// crosses, valid at some time of the flight [start, end] give or take
/// GAIRMET_SNAPSHOT_S, for the briefing to pick each hazard's snapshot
/// for when the flight is in it.
pub fn gairmets_along_route(advisories: &[Value], path: &[(f64, f64)], start: f64, end: f64) -> String {
    let margin = GAIRMET_SNAPSHOT_S as f64;
    let items: Vec<String> = advisories
        .iter()
        .filter(|a| num(a, "valid").is_some_and(|v| start - margin <= v && v <= end + margin))
        .filter(|a| {
            let ring = points(a.get("coords"));
            ring.len() >= 3 && geo::path_meets_polygon(path, &ring)
        })
        .map(|a| {
            let mut s = String::new();
            json::value(&mut s, a);
            s
        })
        .collect();
    format!("[{}]", items.join(","))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fcsts(text: &str) -> Vec<Value> {
        json::parse(text).unwrap().as_array().unwrap().to_vec()
    }

    #[test]
    fn a_tempo_counts_in_the_worst() {
        let f = fcsts(
            r#"[{"timeFrom":0,"timeTo":100,"change":"","ceiling_ft":4000,"ceiling_unknown":false,"visibility_sm":6},
                         {"timeFrom":20,"timeTo":40,"change":"TEMPO","ceiling_ft":null,"ceiling_unknown":false,"visibility_sm":0.5}]"#,
        );
        let w = worst_in_window(&f, 25.0, 30.0).unwrap();
        assert_eq!((w.ceiling_ft, w.visibility_sm), (Some(4000.0), Some(0.5)));
        assert_eq!(worst_in_window(&f, 200.0, 300.0), None);
    }

    #[test]
    fn a_becmg_lasts_past_its_window() {
        let f = fcsts(
            r#"[{"timeFrom":0,"timeTo":100,"change":"","ceiling_ft":4000,"visibility_sm":6},
                         {"timeFrom":10,"timeTo":20,"change":"BECMG","ceiling_ft":800,"visibility_sm":6}]"#,
        );
        assert_eq!(worst_in_window(&f, 50.0, 60.0).unwrap().ceiling_ft, Some(800.0));
    }

    #[test]
    fn the_reasons_vfr_is_not_recommended() {
        let metars = json::parse(r#"{"KAAA":{"flight_category":"IFR"},"KBBB":{"ceiling_unknown":true}}"#).unwrap();
        let forecast = json::parse(r#"{"min_ceiling_ft":800,"min_visibility_sm":2.5,"ceiling_unknown_at":["KCCC"]}"#).unwrap();
        assert_eq!(
            vfr_not_recommended_reasons(&["KAAA", "KBBB"], &metars, &forecast, 1000.0, 3.0),
            vec![
                "KAAA currently reporting IFR", "KBBB currently reporting a ceiling of unknown height",
                "forecast ceiling as low as 800 ft along the route", "forecast ceiling of unknown height at KCCC",
                "forecast visibility as low as 2.5 sm along the route",
            ]
        );
        assert_eq!(feet(12500.0), "12,500");
    }

    #[test]
    fn pireps_are_told_in_route_order_urgent_first() {
        let r = fcsts(
            r#"[{"observed":1000,"lat":0.0,"lon":0.5,"altitude_ft":5000,"urgent":false},
                         {"observed":1000,"lat":0.0,"lon":0.2,"altitude_ft":5000,"urgent":true},
                         {"observed":1000,"lat":0.0,"lon":0.3,"altitude_ft":25000,"urgent":false},
                         {"observed":-9000,"lat":0.0,"lon":0.3,"altitude_ft":5000,"urgent":false}]"#,
        );
        let got = json::parse(&pireps_along_route(&r, &[(0.0, 0.0), (0.0, 1.0)], 30.0, 1000.0)).unwrap();
        let along: Vec<f64> = got.as_array().unwrap().iter().map(|p| num(p, "along_track_nm").unwrap()).collect();
        assert_eq!(along.len(), 2);
        assert!(along[0] < along[1] || got.as_array().unwrap()[0].get("urgent") == Some(&Value::Bool(true)));
        assert!(got.as_array().unwrap()[0].get("observed").is_none());
    }
}
