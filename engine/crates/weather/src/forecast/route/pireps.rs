//! The PIREPs a route meets and those in a box (route.rs re-exports
//! them): still told, within the corridor, urgent ones first.

use super::*;

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
    // Each leg's miles and course solved once for every report, not once a
    // report (track_from is track_nm with the course given).
    let legs: Vec<(f64, f64)> = path
        .windows(2)
        .map(|w| (geo::distance_nm(w[0].0, w[0].1, w[1].0, w[1].1), geo::bearing_deg(w[0].0, w[0].1, w[1].0, w[1].1)))
        .collect();
    for report in reports.iter().filter(|r| told(r, now)) {
        let (Some(lat), Some(lon)) = (num(report, "lat"), num(report, "lon")) else { continue };
        let mut offset = 0.0;
        let mut nearest = None;
        for (leg, &(leg_nm, course)) in path.windows(2).zip(&legs) {
            // A report surely more than the corridor off the leg's line
            // (core's surely_off_nm) fails the cross-track test below on
            // the ellipsoid too: let go after one inverse solve.
            if geo::surely_off_nm(lat, lon, leg[0], course, corridor_nm) {
                offset += leg_nm;
                continue;
            }
            let (cross, along) = geo::track_from(lat, lon, leg[0], course);
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
