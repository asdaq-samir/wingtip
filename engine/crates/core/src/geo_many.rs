//! The sphere's figures (geo) over many points at once, columns in and
//! columns out: the planner's corridors ask a route's start against
//! thousands of points, and one crossing into the engine for all of them
//! costs what one crossing costs, where a call a point would cost a
//! thousand. The figures themselves are geo's, worked a row at a time;
//! nothing here is a second formula.
//!
//! Two ways in. `call`, the rule `great_circles` by name with JSON, for
//! the web and the phones; and `fill`, the same figures over plain f64
//! slices, which the planner's binding (engine/bindings/py) hands numpy's
//! buffers to in place, since JSON text for a corridor of points would
//! cost more than the figures (wingtip.geo says how much).

use crate::geo;
use crate::json::{self, Value};

/// One row's figure by name, from its numbers in order:
/// - `inverse` (lat1, lon1, lat2, lon2) -> (distance nm, initial bearing
///   degrees true), geo::distance_nm and geo::bearing_deg;
/// - `track` (lat, lon, start lat, start lon, end lat, end lon) ->
///   (cross-track nm, along-track nm), geo::track_nm;
/// - `destination` (lat, lon, bearing degrees true, nm) -> (lat, lon),
///   geo::destination.
pub fn figure(name: &str, a: &[f64]) -> Result<(f64, f64), String> {
    match (name, a) {
        ("inverse", &[lat1, lon1, lat2, lon2]) => Ok((geo::distance_nm(lat1, lon1, lat2, lon2), geo::bearing_deg(lat1, lon1, lat2, lon2))),
        ("track", &[lat, lon, a_lat, a_lon, b_lat, b_lon]) => Ok(geo::track_nm(lat, lon, (a_lat, a_lon), (b_lat, b_lon))),
        ("destination", &[lat, lon, bearing, nm]) => Ok(geo::destination(lat, lon, bearing, nm)),
        ("inverse" | "track" | "destination", _) => Err(format!("{name}: {} numbers a row is not its shape", a.len())),
        _ => Err(format!("the sphere has no figure called {name:?}")),
    }
}

/// `figure` over columns of equal length, row by row, into `first` and
/// `second`, which are as long as the columns.
pub fn fill(name: &str, columns: &[&[f64]], first: &mut [f64], second: &mut [f64]) -> Result<(), String> {
    let n = first.len();
    if second.len() != n || columns.iter().any(|c| c.len() != n) {
        return Err(format!("{name}: the columns and the answers are not all {n} long"));
    }
    let mut row = vec![0.0; columns.len()];
    for i in 0..n {
        for (cell, column) in row.iter_mut().zip(columns) {
            *cell = column[i];
        }
        (first[i], second[i]) = figure(name, &row)?;
    }
    Ok(())
}

fn column(v: &Value, key: &str) -> Result<Vec<f64>, String> {
    let list = v.get(key).and_then(Value::as_array).ok_or_else(|| format!("great_circles: \"{key}\" is missing or not a list"))?;
    list.iter().map(|x| x.as_f64().ok_or_else(|| format!("great_circles: \"{key}\" holds something not a number"))).collect()
}

fn numbers(out: &mut String, key: &str, values: &[f64]) {
    json::string(out, key);
    out.push_str(":[");
    for (i, v) in values.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::number(out, *v);
    }
    out.push(']');
}

/// `great_circles` by name: `{"lat1", "lon1", "lat2", "lon2"}`, each a
/// list, to `{"distance_nm", "bearing_deg"}`, each a list in the same
/// order (geo::distance_nm and geo::bearing_deg a row).
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "great_circles" {
        return Err(format!("the engine has no rule called {name:?}"));
    }
    let cols = [column(v, "lat1")?, column(v, "lon1")?, column(v, "lat2")?, column(v, "lon2")?];
    let n = cols[0].len();
    let (mut distance, mut bearing) = (vec![0.0; n], vec![0.0; n]);
    let refs: Vec<&[f64]> = cols.iter().map(Vec::as_slice).collect();
    fill("inverse", &refs, &mut distance, &mut bearing).map_err(|e| e.replace("inverse", "great_circles"))?;
    let mut out = String::from("{");
    numbers(&mut out, "distance_nm", &distance);
    out.push(',');
    numbers(&mut out, "bearing_deg", &bearing);
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn many_rows_are_each_one_figure() {
        // O'Hare to Midway, Duluth to St Louis, and a point on itself:
        // each row geo's own answer.
        let lat1 = [41.9786, 46.8421, 45.0];
        let lon1 = [-87.9048, -92.1936, -93.0];
        let lat2 = [41.7868, 38.7487, 45.0];
        let lon2 = [-87.7522, -90.37, -93.0];
        let (mut d, mut b) = ([0.0; 3], [0.0; 3]);
        fill("inverse", &[&lat1, &lon1, &lat2, &lon2], &mut d, &mut b).unwrap();
        for i in 0..3 {
            assert_eq!(d[i], geo::distance_nm(lat1[i], lon1[i], lat2[i], lon2[i]));
            assert_eq!(b[i], geo::bearing_deg(lat1[i], lon1[i], lat2[i], lon2[i]));
        }
        let (mut x, mut a) = ([0.0], [0.0]);
        fill("track", &[&[0.1], &[-0.5], &[0.0], &[0.0], &[0.0], &[1.0]], &mut x, &mut a).unwrap();
        assert_eq!((x[0], a[0]), geo::track_nm(0.1, -0.5, (0.0, 0.0), (0.0, 1.0)));
        assert!(fill("inverse", &[&lat1, &lon1, &lat2], &mut d, &mut b).is_err());
        assert!(fill("inverse", &[&lat1, &lon1, &lat2, &[1.0]], &mut d, &mut b).is_err());
        assert!(figure("haversine", &[0.0; 4]).is_err());
    }

    #[test]
    fn great_circles_by_name() {
        let ask = |text: &str| call("great_circles", &json::parse(text).unwrap());
        let got = ask(r#"{"lat1":[45,42],"lon1":[-93,-88],"lat2":[45,43],"lon2":[-93,-88]}"#).unwrap();
        assert!(got.starts_with("{\"distance_nm\":[0.0,60.04") && got.ends_with("\"bearing_deg\":[0.0,0.0]}"), "{got}");
        assert_eq!(ask(r#"{"lat1":[],"lon1":[],"lat2":[],"lon2":[]}"#).unwrap(), "{\"distance_nm\":[],\"bearing_deg\":[]}");
        assert!(ask(r#"{"lat1":[1],"lon1":[],"lat2":[],"lon2":[]}"#).is_err());
        assert!(ask(r#"{"lat1":[1]}"#).is_err());
    }
}
