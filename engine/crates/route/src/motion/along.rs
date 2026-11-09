//! Where the airplane is along the planned route, and the fuel the plan
//! has burnt by there: the strip's countdown, the ribbon's mark and the
//! Live Activity on the iPhone, and the ribbon on Android, each worked out
//! its own way before (#482 phase 1). The dry run (dry_run.rs) lays the
//! airplane on the route itself; this finds a real one on it.

use crate::figures::debrief::OFF_ROUTE_NM;
use crate::geo::distance_nm;
use crate::json::{self, Value};

type LatLon = (f64, f64);

/// Where a position is along a line of points.
#[derive(Debug, PartialEq)]
pub struct Along {
    /// Miles along the line to the nearest point of it.
    pub along_nm: f64,
    pub total_nm: f64,
    /// Miles from the position to that nearest point.
    pub off_nm: f64,
    /// The segment it is on, from 0, and how far along it, 0 to 1.
    pub segment: usize,
    pub fraction: f64,
}

/// The nearest point on the line's segments, each worked on a flat patch
/// of the earth round it (a leg of a few miles is one), measured along the
/// line from its start. None with fewer than two points.
/// The projection is the instruments' (instruments::along), the one copy.
pub fn along(at: LatLon, line: &[LatLon]) -> Option<Along> {
    let lengths: Vec<f64> = line.windows(2).map(|w| distance_nm(w[0].0, w[0].1, w[1].0, w[1].1)).collect();
    let found = super::instruments::along(line, &lengths, at.0, at.1, 0)?;
    let start: f64 = lengths[..found.segment].iter().sum();
    let length = lengths[found.segment];
    let fraction = if length > 0.0 { ((found.along_nm - start) / length).clamp(0.0, 1.0) } else { 0.0 };
    Some(Along { along_nm: found.along_nm, total_nm: lengths.iter().sum(), off_nm: found.off_nm, segment: found.segment, fraction })
}

/// Whether a position is on the route: within OFF_ROUTE_NM (3 nm) of the
/// line, the debrief's own tolerance for the distance from the planned
/// route (ACS PA.VI.A.S5, as figures::debrief holds a flight to it).
pub fn on_route(off_nm: f64) -> bool {
    off_nm <= OFF_ROUTE_NM
}

/// A leg of the nav log: its miles and the fuel it burns.
pub struct Leg {
    pub distance_nm: f64,
    pub fuel_gal: f64,
}

/// The leg `along_nm` miles into the route falls on, from 0, and how far
/// along it, 0 to 1, laid against the legs' own miles; the last leg past
/// their end.
pub fn leg_at(legs: &[Leg], along_nm: f64) -> Option<(usize, f64)> {
    let mut start = 0.0;
    for (i, leg) in legs.iter().enumerate() {
        let end = start + leg.distance_nm;
        if along_nm <= end || i + 1 == legs.len() {
            let f = if leg.distance_nm > 0.0 { (along_nm - start) / leg.distance_nm } else { 0.0 };
            return Some((i, f.clamp(0.0, 1.0)));
        }
        start = end;
    }
    None
}

/// The fuel the legs burn up to `along_nm` miles along the route, each
/// leg's own burn spread over its miles: planning figures, as the nav
/// log's fuel column is, not the airplane's gauge.
pub fn burnt_gal(legs: &[Leg], along_nm: f64) -> f64 {
    let (mut left, mut gal) = (along_nm, 0.0);
    for leg in legs {
        if left <= 0.0 {
            break;
        }
        gal += leg.fuel_gal * (left / leg.distance_nm.max(0.001)).min(1.0);
        left -= leg.distance_nm;
    }
    gal
}

fn point(v: &Value) -> Option<LatLon> {
    match v {
        Value::Array(p) if p.len() >= 2 => Some((p[0].as_f64()?, p[1].as_f64()?)),
        Value::Object(_) => Some((v.get("lat")?.as_f64()?, v.get("lon")?.as_f64()?)),
        _ => None,
    }
}

/// `route_position`, from `{"at": {"lat", "lon"}, "line"?: [[lat, lon]],
/// "points"?: [[lat, lon]|null], "legs"?: [{"distance_nm", "fuel_gal"?}]}`:
/// where `at` is along `line` (or along `points`, the route's own points
/// with those not placed left out), `{"along_nm", "total_nm", "left_nm",
/// "off_nm", "on_route", "leg", "leg_fraction", "burnt_gal"}`, the leg by
/// the legs' miles where they are given, else the points' (an index into
/// `points` as given); null where there is no line to be on.
pub fn position_rule(v: &Value) -> Result<String, String> {
    let bad = |what: &str| format!("route_position: {what}");
    let at = v.get("at").and_then(point).ok_or_else(|| bad("\"at\" is not {\"lat\", \"lon\"}"))?;
    let list = |key: &str| -> Result<&[Value], String> {
        match v.get(key) {
            None | Some(Value::Null) => Ok(&[]),
            Some(l) => l.as_array().ok_or_else(|| bad(&format!("\"{key}\" is not a list"))),
        }
    };
    // The points placed, each with its index as given.
    let (line, index): (Vec<LatLon>, Vec<usize>) = if v.get("line").is_some_and(|l| !matches!(l, Value::Null)) {
        list("line")?.iter().enumerate().filter_map(|(i, p)| point(p).map(|p| (p, i))).unzip()
    } else {
        list("points")?.iter().enumerate().filter_map(|(i, p)| point(p).map(|p| (p, i))).unzip()
    };
    let legs: Vec<Leg> = list("legs")?
        .iter()
        .map(|l| Leg {
            distance_nm: l.get("distance_nm").and_then(Value::as_f64).unwrap_or(0.0),
            fuel_gal: l.get("fuel_gal").and_then(Value::as_f64).unwrap_or(0.0),
        })
        .collect();
    let Some(found) = along(at, &line) else { return Ok("null".to_owned()) };
    let (leg, fraction) =
        if legs.is_empty() { (index[found.segment], found.fraction) } else { leg_at(&legs, found.along_nm).unwrap_or((0, 0.0)) };
    let mut out = String::from("{\"along_nm\":");
    json::number(&mut out, found.along_nm);
    out.push_str(",\"total_nm\":");
    json::number(&mut out, found.total_nm);
    out.push_str(",\"left_nm\":");
    json::number(&mut out, (found.total_nm - found.along_nm).max(0.0));
    out.push_str(",\"off_nm\":");
    json::number(&mut out, found.off_nm);
    out.push_str(",\"on_route\":");
    out.push_str(if on_route(found.off_nm) { "true" } else { "false" });
    out.push_str(",\"leg\":");
    json::number(&mut out, leg as f64);
    out.push_str(",\"leg_fraction\":");
    json::number(&mut out, fraction);
    out.push_str(",\"burnt_gal\":");
    json::number(&mut out, burnt_gal(&legs, found.along_nm));
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_position_on_and_off_the_line() {
        // Due east along the equator, 60 nm a degree.
        let line = [(0.0, 0.0), (0.0, 1.0), (0.0, 2.0)];
        let a = along((0.02, 1.5), &line).unwrap();
        assert!((a.along_nm - 90.0).abs() < 0.5, "{a:?}");
        assert!((a.off_nm - 1.2).abs() < 0.05);
        assert!(on_route(a.off_nm));
        assert!(!on_route(3.1));
        let legs = [Leg { distance_nm: 60.0, fuel_gal: 6.0 }, Leg { distance_nm: 60.0, fuel_gal: 8.0 }];
        assert_eq!(leg_at(&legs, 90.0), Some((1, 0.5)));
        assert!((burnt_gal(&legs, 90.0) - 10.0).abs() < 1e-9);
    }
}
