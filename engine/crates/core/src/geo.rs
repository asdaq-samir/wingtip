//! Distances as wingtip.geo has them: great circles on a sphere of 3,440.065
//! nm, the approximation flight computers use (wingtip.geo's own docstring),
//! which PROJ works out for the planner and this for the phones. The
//! central angle by the atan2 form of Vincenty's formula for a sphere,
//! well-conditioned at every distance, so the two agree to a few
//! micrometres.
//!
//! The FAA's data (NASR, the CIFP, the DOF) are on WGS-84, an ellipsoid;
//! the sphere, 3,440.065 nm (6,371.0 km, the mean radius), is a stated
//! simplification whose error is accepted: 0.086% on KDLH to KSTL (0.42
//! nm in 492 nm) and at most about 0.5% anywhere, a few tenths of a mile
//! over a cross-country leg, inside any figure the nav log rounds to.

use crate::json::{self, Value};

/// wingtip.geo's EARTH_RADIUS_NM.
pub const EARTH_RADIUS_NM: f64 = 3440.065;

/// The great-circle distance in nautical miles between two points in degrees.
pub fn distance_nm(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let (p1, p2) = (lat1.to_radians(), lat2.to_radians());
    let dl = (lon2 - lon1).to_radians();
    let (s1, c1) = p1.sin_cos();
    let (s2, c2) = p2.sin_cos();
    let (sd, cd) = dl.sin_cos();
    let y = ((c2 * sd).powi(2) + (c1 * s2 - s1 * c2 * cd).powi(2)).sqrt();
    let x = s1 * s2 + c1 * c2 * cd;
    EARTH_RADIUS_NM * y.atan2(x)
}

/// The initial great-circle bearing from point one to point two, degrees
/// 0 to 360 true (wingtip.geo.bearing_deg, PROJ's forward azimuth on the same
/// sphere). Zero for two points that coincide, as wingtip.geo answers: PROJ's
/// own 180 would give a zero-length leg a due-south course.
pub fn bearing_deg(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    if distance_nm(lat1, lon1, lat2, lon2) == 0.0 {
        return 0.0;
    }
    let (p1, p2) = (lat1.to_radians(), lat2.to_radians());
    let dl = (lon2 - lon1).to_radians();
    let y = dl.sin() * p2.cos();
    let x = p1.cos() * p2.sin() - p1.sin() * p2.cos() * dl.cos();
    py_mod(y.atan2(x).to_degrees(), 360.0)
}

/// Where a great circle from a point on a true bearing reaches `nm` out,
/// (lat, lon) in degrees, the longitude within -180 to 180: the web's
/// lib/geo destination, written as it is (`deg * PI / 180`). The engine's
/// one copy: the look ahead (airspace::ahead) and the phones' traffic
/// carried on along its track (the rule `destination`) both reach a point
/// here.
pub fn destination(lat: f64, lon: f64, bearing: f64, nm: f64) -> (f64, f64) {
    use std::f64::consts::PI;
    let d = nm / EARTH_RADIUS_NM;
    let b = bearing * PI / 180.0;
    let (lat1, lon1) = (lat * PI / 180.0, lon * PI / 180.0);
    // Clamped, so a rounding past 1 at a pole is the pole, not NaN.
    let lat2 = (lat1.sin() * d.cos() + lat1.cos() * d.sin() * b.cos()).clamp(-1.0, 1.0).asin();
    let lon2 = lon1 + (b.sin() * d.sin() * lat1.cos()).atan2(d.cos() - lat1.sin() * lat2.sin());
    (lat2 * 180.0 / PI, (lon2 * 180.0 / PI + 540.0).rem_euclid(360.0) - 180.0)
}

/// How far apart two directions are, degrees 0 to 180, either way round
/// the compass (358 is 4 from 002): wingtip.geo.angle_between.
pub fn angle_between(a: f64, b: f64) -> f64 {
    (py_mod(a - b + 180.0, 360.0) - 180.0).abs()
}

/// Python's % on floats, which the planner's figures are written in: the
/// remainder takes the divisor's sign, and a zero one is +0 for a
/// positive divisor (CPython's float_rem).
pub fn py_mod(a: f64, m: f64) -> f64 {
    let r = a % m;
    if r == 0.0 {
        0.0_f64.copysign(m)
    } else if (r < 0.0) != (m < 0.0) {
        r + m
    } else {
        r
    }
}

/// (cross-track, along-track) of a point from the great circle a -> b, in
/// nautical miles, both signed (wingtip.geo's _track): cross-track positive
/// right of course, along-track negative behind the start. The standard
/// spherical identities: xtd = asin(sin(d13/R) sin(t13 - t12)) R, atd =
/// acos(cos(d13/R) / cos(xtd/R)) R, signed by cos(t13 - t12).
pub fn track_nm(lat: f64, lon: f64, a: (f64, f64), b: (f64, f64)) -> (f64, f64) {
    let to_point = distance_nm(a.0, a.1, lat, lon);
    let offset = (bearing_deg(a.0, a.1, lat, lon) - bearing_deg(a.0, a.1, b.0, b.1)).to_radians();
    let angular = to_point / EARTH_RADIUS_NM;
    let cross = (angular.sin() * offset.sin()).clamp(-1.0, 1.0).asin() * EARTH_RADIUS_NM;
    let ratio = (angular.cos() / (cross / EARTH_RADIUS_NM).cos()).clamp(-1.0, 1.0);
    let c = offset.cos();
    let sign = if c < 0.0 {
        -1.0
    } else if c > 0.0 {
        1.0
    } else {
        0.0
    };
    (cross, ratio.acos() * EARTH_RADIUS_NM * sign)
}

/// A padded (min_lat, min_lon, max_lat, max_lon) box round the route a ->
/// b (wingtip.geo.corridor_bbox): `buffer_nm` a minute of latitude a mile,
/// and of longitude cos(latitude) of a mile, taken at the box's poleward
/// edge, where a degree is shortest. A coarse prefilter: the corridor
/// itself is held by a cross-track or a crossing test after it.
pub fn corridor_bbox(a: (f64, f64), b: (f64, f64), buffer_nm: f64) -> (f64, f64, f64, f64) {
    let pad_lat = buffer_nm / 60.0;
    let widest = (a.0.abs().max(b.0.abs()) + pad_lat).min(89.0);
    let pad_lon = pad_lat / widest.to_radians().cos().max(0.05);
    (a.0.min(b.0) - pad_lat, a.1.min(b.1) - pad_lon, a.0.max(b.0) + pad_lat, a.1.max(b.1) + pad_lon)
}

/// Whether a ring of (x, y) points (longitude, latitude, on a plane of
/// degrees) holds the point (x, y), by the even-odd rule: a ray east of
/// the point crosses its edges an odd number of times. A point on an
/// edge may read either way. The one copy for the airspace ahead, the
/// map's overlays in view and 91.119(b)'s congested areas; fewer than
/// three points hold nothing.
pub fn ring_holds(ring: &[(f64, f64)], x: f64, y: f64) -> bool {
    let Some(&last) = ring.last() else { return false };
    let mut inside = false;
    let mut prev = last;
    for &cur in ring {
        let ((xi, yi), (xj, yj)) = (cur, prev);
        if (yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi {
            inside = !inside;
        }
        prev = cur;
    }
    inside
}

/// Whether a path of (lat, lon) points crosses or lies in a polygon given
/// as its ring of (lat, lon) points, on a plane of degrees as the
/// planner's shapely test read them (LineString.intersects(Polygon)): a
/// segment of the path crossing or touching an edge, or a point of the
/// path inside the ring (even-odd, which reads a ring that crosses
/// itself much as shapely's buffer(0) mended it).
pub fn path_meets_polygon(path: &[(f64, f64)], ring: &[(f64, f64)]) -> bool {
    if ring.len() < 3 || path.is_empty() {
        return false;
    }
    let n = ring.len();
    let inside = |p: (f64, f64)| {
        let mut holds = false;
        for i in 0..n {
            let (a, b) = (ring[i], ring[(i + 1) % n]);
            if (a.0 > p.0) != (b.0 > p.0) {
                let lon = a.1 + (p.0 - a.0) / (b.0 - a.0) * (b.1 - a.1);
                if p.1 < lon {
                    holds = !holds;
                }
            }
        }
        holds
    };
    if path.iter().any(|&p| inside(p)) {
        return true;
    }
    type P = (f64, f64);
    let cross = |o: P, a: P, b: P| (a.0 - o.0) * (b.1 - o.1) - (a.1 - o.1) * (b.0 - o.0);
    let within = |a: P, b: P, p: P| p.0 >= a.0.min(b.0) && p.0 <= a.0.max(b.0) && p.1 >= a.1.min(b.1) && p.1 <= a.1.max(b.1);
    let meet = |p1: P, p2: P, q1: P, q2: P| {
        let (d1, d2, d3, d4) = (cross(q1, q2, p1), cross(q1, q2, p2), cross(p1, p2, q1), cross(p1, p2, q2));
        if d1 * d2 < 0.0 && d3 * d4 < 0.0 {
            return true;
        }
        (d1 == 0.0 && within(q1, q2, p1))
            || (d2 == 0.0 && within(q1, q2, p2))
            || (d3 == 0.0 && within(p1, p2, q1))
            || (d4 == 0.0 && within(p1, p2, q2))
    };
    path.windows(2).any(|s| (0..n).any(|i| meet(s[0], s[1], ring[i], ring[(i + 1) % n])))
}

/// A velocity's east and north parts as a track, degrees true 0 to 360
/// toward where it goes, and a speed, in the parts' own unit: a ground
/// track from a surveillance report's parts (the FAA's STDDS tracks, read
/// by the ingest service's swim). No track where it does not move.
pub fn velocity_track(east: f64, north: f64) -> (Option<f64>, f64) {
    let speed = east.hypot(north);
    (if speed > 0.0 { Some(py_mod(east.atan2(north).to_degrees(), 360.0)) } else { None }, speed)
}

// --- By name (the facade's dispatcher, contract/*.json) -----------------

fn num(name: &str, v: &Value, key: &str) -> Result<f64, String> {
    v.get(key).and_then(Value::as_f64).ok_or_else(|| format!("{name}: \"{key}\" is missing or not a number"))
}

/// The sphere's figures by name, for the apps that draw between fixes (the
/// phones' traffic notice, own trail and replay) and the planner, so no app
/// keeps its own great-circle arithmetic: `distance_nm` and `bearing_deg`
/// from `{"lat1", "lon1", "lat2", "lon2"}`, and `destination` from
/// `{"points": [{"lat", "lon", "bearing_deg", "nm"}]}` to `[{"lat",
/// "lon"}]`, a list so a map's airplanes carried on a step a second cross
/// into the engine once, not once each; `velocity_track` from
/// `{"velocities": [{"east", "north"}]}` to `[{"track_deg", "speed"}]`,
/// a list for the same reason.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let mut out = String::new();
    match name {
        "distance_nm" | "bearing_deg" => {
            let (lat1, lon1, lat2, lon2) = (num(name, v, "lat1")?, num(name, v, "lon1")?, num(name, v, "lat2")?, num(name, v, "lon2")?);
            let figure = if name == "distance_nm" { distance_nm(lat1, lon1, lat2, lon2) } else { bearing_deg(lat1, lon1, lat2, lon2) };
            json::number(&mut out, figure);
        }
        "destination" => {
            let points = v.get("points").and_then(Value::as_array).ok_or("destination: \"points\" is missing or not a list")?;
            out.push('[');
            for (i, p) in points.iter().enumerate() {
                let (lat, lon) = destination(num(name, p, "lat")?, num(name, p, "lon")?, num(name, p, "bearing_deg")?, num(name, p, "nm")?);
                out.push_str(if i > 0 { ",{\"lat\":" } else { "{\"lat\":" });
                json::number(&mut out, lat);
                out.push_str(",\"lon\":");
                json::number(&mut out, lon);
                out.push('}');
            }
            out.push(']');
        }
        "velocity_track" => {
            let parts = v.get("velocities").and_then(Value::as_array).ok_or("velocity_track: \"velocities\" is missing or not a list")?;
            out.push('[');
            for (i, p) in parts.iter().enumerate() {
                let (track, speed) = velocity_track(num(name, p, "east")?, num(name, p, "north")?);
                out.push_str(if i > 0 { ",{\"track_deg\":" } else { "{\"track_deg\":" });
                json::opt_number(&mut out, track);
                out.push_str(",\"speed\":");
                json::number(&mut out, speed);
                out.push('}');
            }
            out.push(']');
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_path_meets_a_polygon_by_crossing_or_inside() {
        let square = [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0)];
        assert!(path_meets_polygon(&[(0.5, -1.0), (0.5, 2.0)], &square));
        assert!(path_meets_polygon(&[(0.2, 0.2), (0.4, 0.4)], &square));
        assert!(!path_meets_polygon(&[(2.0, 2.0), (3.0, 3.0)], &square));
    }

    #[test]
    fn a_velocity_is_a_track_toward_where_it_goes() {
        let close = |a: f64, b: f64| (a - b).abs() < 1e-9;
        let (t, s) = velocity_track(3.0, 4.0);
        assert!(close(s, 5.0) && close(t.unwrap(), 36.869_897_645_844_02));
        assert!(close(velocity_track(-10.0, 0.0).0.unwrap(), 270.0));
        assert!(close(velocity_track(0.0, -10.0).0.unwrap(), 180.0));
        assert!(close(velocity_track(0.0, 10.0).0.unwrap(), 0.0));
        assert_eq!(velocity_track(0.0, 0.0), (None, 0.0));
    }

    #[test]
    fn a_ring_holds_by_the_even_odd_rule() {
        let square = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)];
        assert!(ring_holds(&square, 0.5, 0.5));
        assert!(!ring_holds(&square, 1.5, 0.5));
        // A bow tie crossing itself at (0.5, 0.5): each lobe holds, as
        // the even-odd rule reads it.
        let bow = [(0.0, 0.0), (1.0, 1.0), (1.0, 0.0), (0.0, 1.0)];
        assert!(ring_holds(&bow, 0.1, 0.5) && ring_holds(&bow, 0.9, 0.5) && !ring_holds(&bow, 0.5, 0.9));
        assert!(!ring_holds(&[], 0.0, 0.0) && !ring_holds(&[(0.0, 0.0), (1.0, 1.0)], 0.5, 0.5));
    }

    #[test]
    fn track_is_signed() {
        let (x, a) = track_nm(0.0, 0.5, (0.0, 0.0), (0.0, 1.0));
        assert!(x.abs() < 1e-6 && (a - 30.0).abs() < 0.1, "{x} {a}");
        let (x, a) = track_nm(0.1, -0.5, (0.0, 0.0), (0.0, 1.0));
        assert!(x < 0.0 && a < 0.0, "{x} {a}");
    }

    #[test]
    fn distances_are_vfr_geos() {
        // pyproj.Geod(a=3440.065, f=0).inv, as wingtip.geo.distance_nm: O'Hare
        // to Midway, Duluth to St Louis.
        let ord_mdw = distance_nm(41.9786, -87.9048, 41.7868, -87.7522);
        assert!((ord_mdw - 13.384_450_662_612_632).abs() < 1e-9, "{ord_mdw}");
        let dlh_stl = distance_nm(46.8421, -92.1936, 38.7487, -90.37);
        assert!((dlh_stl - 492.489_160_876_009_75).abs() < 1e-9, "{dlh_stl}");
        assert_eq!(distance_nm(45.0, -93.0, 45.0, -93.0), 0.0);
    }

    #[test]
    fn bearings_and_angles_are_vfr_geos() {
        // pyproj.Geod(a=3440.065, f=0).inv's azimuth, O'Hare to Midway.
        let b = bearing_deg(41.9786, -87.9048, 41.7868, -87.7522);
        assert!((b - 149.308_659_909_716_54).abs() < 1e-9, "{b}");
        assert_eq!(bearing_deg(45.0, -93.0, 45.0, -93.0), 0.0);
        assert!((bearing_deg(42.0, -88.0, 43.0, -88.0) - 0.0).abs() < 1e-12);
        assert_eq!(angle_between(358.0, 2.0), 4.0);
        assert_eq!(angle_between(10.0, 190.0), 180.0);
        assert_eq!(py_mod(-1e-20, 360.0), 360.0);
        assert_eq!(py_mod(-30.0, 360.0), 330.0);
    }

    #[test]
    fn destination_is_the_sphere_s() {
        // Due north 60 nm is a degree of latitude on wingtip.geo's sphere
        // (the look ahead's own test, before its copy was folded in here).
        let (lat, lon) = destination(45.0, -93.0, 0.0, 60.0);
        assert!((lat - 45.999_413).abs() < 1e-4 && (lon + 93.0).abs() < 1e-9, "{lat} {lon}");
        assert!((distance_nm(45.0, -93.0, lat, lon) - 60.0).abs() < 1e-9);
        // Across the antimeridian the longitude comes back within 180.
        let (_, lon) = destination(0.0, 179.9, 90.0, 60.0);
        assert!((-180.0..=180.0).contains(&lon) && lon < -179.0, "{lon}");
    }

    #[test]
    fn the_sphere_s_figures_by_name() {
        let ask = |name: &str, text: &str| call(name, &json::parse(text).unwrap());
        assert_eq!(ask("distance_nm", r#"{"lat1":45,"lon1":-93,"lat2":45,"lon2":-93}"#).unwrap(), "0.0");
        let b: f64 = ask("bearing_deg", r#"{"lat1":41.9786,"lon1":-87.9048,"lat2":41.7868,"lon2":-87.7522}"#).unwrap().parse().unwrap();
        assert!((b - 149.308_659_909_716_54).abs() < 1e-9, "{b}");
        let to = ask("destination", r#"{"points":[{"lat":45,"lon":-93,"bearing_deg":0,"nm":60}]}"#).unwrap();
        assert!(to.starts_with("[{\"lat\":45.99") && to.ends_with(",\"lon\":-93.0}]"), "{to}");
        assert_eq!(ask("destination", r#"{"points":[]}"#).unwrap(), "[]");
        assert!(ask("bearing_deg", "{}").is_err());
    }
}
