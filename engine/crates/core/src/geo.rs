//! Distances as every app has them: geodesics on the WGS-84 ellipsoid,
//! worked out here for the planner (wingtip.geo, through geo_many), the
//! web and the phones alike, so the nav log's miles and courses are the
//! ones a GPS navigator shows for the same two points.
//!
//! The FAA's coordinates are on WGS-84 (the CIFP's, as ARINC 424 has
//! them; NASR's are NAD 83, within a metre or two of it), as GPS's are: the ellipsoid of NGA TR8350.2 (3rd ed., 2000), a = 6,378,137 m
//! and 1/f = 298.257223563 (its table 3.1). The geodesic between two
//! points on it is Karney's solution (C. F. F. Karney, "Algorithms for
//! geodesics", J. Geodesy 87:43-55, 2013), as GeographicLib has it and
//! PROJ (pyproj's Geod) runs it, from the stock crate geographiclib-rs, a
//! port of GeographicLib by the georust project, accurate to about 15
//! nanometres: no formula of our own. A nautical mile is 1,852 m exactly
//! (the International Nautical Mile, 1929; NIST SP 811, B.8).
//!
//! The 3,440.065 nm sphere it replaced was up to 0.41% and 0.16 deg off.

use std::sync::OnceLock;

use geographiclib_rs::{DirectGeodesic, Geodesic, InverseGeodesic};

use crate::json::{self, Value};

/// The mean radius, 6,371.0 km in nautical miles: not the earth the
/// figures below are worked on (that is WGS-84), but the scale of the
/// small approximations that say they take it (the replay's step in
/// degrees, the planner's KD-tree chords, the corridor prefilter), each
/// within 0.4% of the ellipsoid.
pub const EARTH_RADIUS_NM: f64 = 3440.065;

/// Metres in a nautical mile, exactly (NIST SP 811, B.8).
const M_PER_NM: f64 = 1852.0;

/// WGS-84 (NGA TR8350.2), made once: `Geodesic::wgs84()` copies it a call.
fn wgs84() -> &'static Geodesic {
    static WGS84: OnceLock<Geodesic> = OnceLock::new();
    WGS84.get_or_init(Geodesic::wgs84)
}

/// (distance in metres, initial azimuth in degrees -180 to 180) of the
/// geodesic from point one to point two.
fn inverse(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> (f64, f64) {
    let (s12, azi1, _azi2, _a12): (f64, f64, f64, f64) = wgs84().inverse(lat1, lon1, lat2, lon2);
    (s12, azi1)
}

/// The geodesic distance in nautical miles between two points in degrees.
pub fn distance_nm(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    distance_and_bearing(lat1, lon1, lat2, lon2).0
}

/// The geodesic's initial course from point one to point two, degrees 0
/// to 360 true (pyproj's Geod forward azimuth). Zero for two points that
/// coincide, as wingtip.geo answers: Karney's own 180 would give a
/// zero-length leg a due-south course.
pub fn bearing_deg(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    distance_and_bearing(lat1, lon1, lat2, lon2).1
}

/// distance_nm and bearing_deg from one solution of the inverse problem,
/// for the callers that want both (geo_many's rows, a nav log's legs).
pub fn distance_and_bearing(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> (f64, f64) {
    let (s12, azi1) = inverse(lat1, lon1, lat2, lon2);
    (s12 / M_PER_NM, if s12 == 0.0 { 0.0 } else { py_mod(azi1, 360.0) })
}

/// Where the geodesic from a point on a true course reaches `nm` out,
/// (lat, lon) in degrees, the longitude within -180 to 180 (Karney's
/// direct problem). The engine's one copy: the look ahead
/// (airspace::ahead), the phones' traffic carried on along its track
/// (the rule `destination`) and the planner's points along a leg all
/// reach a point here.
pub fn destination(lat: f64, lon: f64, bearing: f64, nm: f64) -> (f64, f64) {
    let (lat2, lon2): (f64, f64) = wgs84().direct(lat, lon, bearing, nm * M_PER_NM);
    (lat2, (lon2 + 540.0).rem_euclid(360.0) - 180.0)
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

/// (cross-track, along-track) of a point from the geodesic a -> b, in
/// nautical miles, both signed (wingtip.geo's _track): cross-track
/// positive right of course, along-track negative behind the start.
///
/// On the ellipsoid neither has a closed form. This is the point-to-line
/// solution of S. Baselga and J. C. Martinez-Llario, "Intersection and
/// point-to-line solutions for geodesics on the ellipsoid", Stud.
/// Geophys. Geod. 62:353-363 (2018), section 3, which GeographicLib's own
/// Intersect class cites: from a base X on the geodesic (first a), the
/// inverse problem X -> P gives the distance s and the angle A between
/// the line and P; a right spherical triangle of radius a (the paper's
/// choice, the semi-major axis) gives how far along the line the foot of
/// the perpendicular is, tan(sAX / a) = tan(s / a) cos A (Napier's rule,
/// the paper's eq. 10 in another of its forms, with no 0/0 at A = 90);
/// the direct problem from a moves X there, and again, until the step is
/// under a tenth of a millimetre. It converges in two or three steps (the
/// paper's table 4: 24.8 km, then 0.2 mm), each an inverse and a direct,
/// and agrees with Karney's gnomonic intercept (Karney 2013, section 8,
/// the paper's comparison). The cross-track is then the last s, signed
/// by sin A.
pub fn track_nm(lat: f64, lon: f64, a: (f64, f64), b: (f64, f64)) -> (f64, f64) {
    let course = bearing_deg(a.0, a.1, b.0, b.1);
    track_from(lat, lon, a, course)
}

/// track_nm from the course already known at `a`: geo_many's corridors
/// ask one route's start and end against thousands of points.
pub fn track_from(lat: f64, lon: f64, a: (f64, f64), course: f64) -> (f64, f64) {
    let r = wgs84().equatorial_radius();
    let (mut base, mut azimuth, mut along) = (a, course, 0.0);
    // Ten steps is far more than the paper's examples took (three, from
    // 24 km and from 1,000 km off the line); the tenth answer stands if
    // ever a point needs more.
    for tries in 1..=10 {
        let (s, to_point) = inverse(base.0, base.1, lat, lon);
        let angle = (to_point - azimuth).to_radians();
        let (sin_s, cos_s) = (s / r).sin_cos();
        let step = (sin_s * angle.cos()).atan2(cos_s) * r;
        along += step;
        if step.abs() < 1e-4 || tries == 10 {
            // The foot is under a tenth of a millimetre on, at right
            // angles, so s from here is the cross-track to well within it.
            let side = angle.sin();
            let sign = if side > 0.0 {
                1.0
            } else if side < 0.0 {
                -1.0
            } else {
                0.0
            };
            return (s * sign / M_PER_NM, along / M_PER_NM);
        }
        let (lat2, lon2, azi2): (f64, f64, f64) = wgs84().direct(a.0, a.1, course, along);
        (base, azimuth) = ((lat2, lon2), azi2);
    }
    unreachable!("the tenth try returns")
}

/// A padded (min_lat, min_lon, max_lat, max_lon) box round the route a ->
/// b (wingtip.geo.corridor_bbox): `buffer_nm` at WGS-84's shortest degree
/// of latitude, the equator's 59.7 nm (110,574 m), and of longitude
/// cos(latitude) of that at the box's poleward edge, where a degree is
/// shortest. A prefilter: a cross-track or a crossing test holds after it.
pub fn corridor_bbox(a: (f64, f64), b: (f64, f64), buffer_nm: f64) -> (f64, f64, f64, f64) {
    let pad_lat = buffer_nm / 59.7;
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

/// The geodesic figures by name, for the apps that draw between fixes (the
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
        // Each against pyproj 3.8.0's Geod(ellps="WGS84"): the foot found
        // as the root of its right-angle condition (scipy's brentq over
        // Geod.fwd and Geod.inv), an independent route to the same point.
        let close = |got: (f64, f64), want: (f64, f64)| (got.0 - want.0).abs() < 1e-9 && (got.1 - want.1).abs() < 1e-9;
        let on = track_nm(0.0, 0.5, (0.0, 0.0), (0.0, 1.0));
        assert!(close(on, (0.0, 30.053_858_205_530_23)), "{on:?}");
        let behind = track_nm(0.1, -0.5, (0.0, 0.0), (0.0, 1.0));
        assert!(close(behind, (-5.970_533_312_582_22, -30.053_858_205_527_43)), "{behind:?}");
        let beside = track_nm(44.0, -91.0, (46.8421, -92.1936), (38.7487, -90.37));
        assert!(close(beside, (-21.210_240_980_906_825, 176.585_340_569_693_07)), "{beside:?}");
        // Baselga and Martinez-Llario's example 1 (table 4): the foot they
        // give, 51 50' 45.9212" N 5 15' 37.5426" E, is 13.382445 nm from A
        // and 12.833544 nm from P by Geod.inv; to their 1e-4" (3 mm).
        let paper = track_nm(52.0, 5.5, (52.0, 5.0), (51.4, 6.0));
        assert!((paper.0 + 12.833_544).abs() < 2e-6 && (paper.1 - 13.382_445).abs() < 2e-6, "{paper:?}");
    }

    #[test]
    fn distances_are_wgs84_geodesics() {
        // pyproj 3.8.0's Geod(ellps="WGS84").inv over 1,852 m, as
        // wingtip.geo.distance_nm: O'Hare to Midway, Duluth to St Louis.
        let ord_mdw = distance_nm(41.9786, -87.9048, 41.7868, -87.7522);
        assert!((ord_mdw - 13.382_524_218_830_271).abs() < 1e-9, "{ord_mdw}");
        let dlh_stl = distance_nm(46.8421, -92.1936, 38.7487, -90.37);
        assert!((dlh_stl - 492.066_809_632_600_6).abs() < 1e-9, "{dlh_stl}");
        assert_eq!(distance_nm(45.0, -93.0, 45.0, -93.0), 0.0);
    }

    #[test]
    fn bearings_and_angles_are_wgs84_geodesics() {
        // pyproj 3.8.0's Geod(ellps="WGS84").inv's azimuth, O'Hare to
        // Midway, and Duluth to St Louis.
        let b = bearing_deg(41.9786, -87.9048, 41.7868, -87.7522);
        assert!((b - 149.214_896_390_586_74).abs() < 1e-9, "{b}");
        let b = bearing_deg(46.8421, -92.1936, 38.7487, -90.37);
        assert!((b - 169.949_158_273_416_23).abs() < 1e-9, "{b}");
        assert_eq!(bearing_deg(45.0, -93.0, 45.0, -93.0), 0.0);
        assert!((bearing_deg(42.0, -88.0, 43.0, -88.0) - 0.0).abs() < 1e-12);
        assert_eq!(angle_between(358.0, 2.0), 4.0);
        assert_eq!(angle_between(10.0, 190.0), 180.0);
        assert_eq!(py_mod(-1e-20, 360.0), 360.0);
        assert_eq!(py_mod(-30.0, 360.0), 330.0);
    }

    #[test]
    fn destination_is_the_direct_geodesic() {
        // Due north 60 nm from 45 N: pyproj 3.8.0's Geod(ellps="WGS84").fwd,
        // short of a whole degree, as a degree of latitude there is 60.006
        // nm of the ellipsoid's meridian.
        let (lat, lon) = destination(45.0, -93.0, 0.0, 60.0);
        assert!((lat - 45.999_806_133_882_48).abs() < 1e-9 && (lon + 93.0).abs() < 1e-9, "{lat} {lon}");
        assert!((distance_nm(45.0, -93.0, lat, lon) - 60.0).abs() < 1e-9);
        // Across the antimeridian the longitude comes back within 180.
        let (_, lon) = destination(0.0, 179.9, 90.0, 60.0);
        assert!((-180.0..=180.0).contains(&lon) && lon < -179.0, "{lon}");
    }

    #[test]
    fn the_geodesic_figures_by_name() {
        let ask = |name: &str, text: &str| call(name, &json::parse(text).unwrap());
        assert_eq!(ask("distance_nm", r#"{"lat1":45,"lon1":-93,"lat2":45,"lon2":-93}"#).unwrap(), "0.0");
        let b: f64 = ask("bearing_deg", r#"{"lat1":41.9786,"lon1":-87.9048,"lat2":41.7868,"lon2":-87.7522}"#).unwrap().parse().unwrap();
        assert!((b - 149.214_896_390_586_74).abs() < 1e-9, "{b}");
        let to = ask("destination", r#"{"points":[{"lat":45,"lon":-93,"bearing_deg":0,"nm":60}]}"#).unwrap();
        assert!(to.starts_with("[{\"lat\":45.99") && to.ends_with(",\"lon\":-93.0}]"), "{to}");
        assert_eq!(ask("destination", r#"{"points":[]}"#).unwrap(), "[]");
        assert!(ask("bearing_deg", "{}").is_err());
    }
}
