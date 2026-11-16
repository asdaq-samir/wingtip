//! Which of the phones' pack regions lie ahead of the airplane (the iPhone
//! audit's IOS-20): the regions a shell reads for what is ahead, in the
//! order the airplane reaches them. Before this the iPhone read the
//! regions within a fixed 0.3 degrees of itself, which at 48 N is 12 nm
//! east and west, short of five minutes at 200 kt (17 nm), so near a
//! region's edge the one ahead went unread.
//!
//! A region (pack_query::region_of) is a square of REGION_DEG degrees;
//! a volume, an area or a field is written into every region its box
//! reaches (wingtip.cycle_pack's `write_phone`), so the regions the
//! look-ahead's line and its pad cross hold all it can meet. Looked along
//! two lines, each from the airplane: its track over the ground, and the
//! route from the point on it nearest the airplane, each `look_ahead_nm`
//! long. Geometry only: no figure here is an aviation rule.

use crate::geo::{bearing_deg, box_around, destination, distance_nm, track_nm};
use crate::json::Value;
use crate::pack_query::region_of;
use crate::sort::StableSort;
use wingtip_core::ask::{strings, Ask};

/// How finely each line is walked, nm. With PAD_NM's box round each step
/// the boxes overlap, so no region the padded line crosses is skipped
/// between two of them.
pub const STEP_NM: f64 = 1.0;
/// Either side of each line, nm: the pad the alerts ahead read their
/// volumes and areas within (crate::ahead, Track::bbox(1.0)).
pub const PAD_NM: f64 = 1.0;

/// A point along a line: (miles ahead of the airplane, lat, lon).
type Ahead = (f64, f64, f64);

/// The track's points from the airplane, every STEP_NM to `look_nm`.
fn along_track(lat: f64, lon: f64, track_deg: f64, look_nm: f64) -> Vec<Ahead> {
    let steps = (look_nm / STEP_NM).ceil() as usize;
    (0..=steps)
        .map(|i| {
            let d = (i as f64 * STEP_NM).min(look_nm);
            let (la, lo) = destination(lat, lon, track_deg, d);
            (d, la, lo)
        })
        .collect()
}

/// The route's points from the one on it nearest the airplane, every
/// STEP_NM along it to `look_nm` or its end; none for a route of fewer
/// than two points.
fn along_route(lat: f64, lon: f64, route: &[(f64, f64)], look_nm: f64) -> Vec<Ahead> {
    // The nearest point: on each leg, the foot of the perpendicular
    // (core's track_nm) kept within the leg's ends.
    let mut best: Option<(f64, usize, f64)> = None;
    for (i, w) in route.windows(2).enumerate() {
        let (a, b) = (w[0], w[1]);
        let length = distance_nm(a.0, a.1, b.0, b.1);
        let along = if length > 0.0 { track_nm(lat, lon, a, b).1.clamp(0.0, length) } else { 0.0 };
        let foot = destination(a.0, a.1, bearing_deg(a.0, a.1, b.0, b.1), along);
        let off = distance_nm(lat, lon, foot.0, foot.1);
        if best.is_none_or(|(o, _, _)| off < o) {
            best = Some((off, i, along));
        }
    }
    let Some((_, first, mut from)) = best else { return Vec::new() };
    let mut out = Vec::new();
    let mut ahead_at_start = 0.0;
    for w in route[first..].windows(2) {
        let (a, b) = (w[0], w[1]);
        let (length, course) = (distance_nm(a.0, a.1, b.0, b.1), bearing_deg(a.0, a.1, b.0, b.1));
        let mut s = from;
        loop {
            let ahead = ahead_at_start + (s - from);
            let (la, lo) = destination(a.0, a.1, course, s);
            out.push((ahead, la, lo));
            let next = (s + STEP_NM).min(length).min(from + look_nm - ahead_at_start);
            if ahead >= look_nm || next <= s {
                break;
            }
            s = next;
        }
        ahead_at_start += length - from;
        from = 0.0;
        if ahead_at_start >= look_nm {
            break;
        }
    }
    out
}

/// The regions a line's points and their pad reach, each with the miles
/// ahead it is first reached at. A box smaller than a region meets just
/// the regions its corners are in; and where a step crosses both a
/// parallel and a meridian of the grid, the two corners it may cut are
/// counted as well, should the pad be none.
fn reached(line: &[Ahead], pad_nm: f64, out: &mut Vec<(f64, String)>) {
    let region = |la: f64, lo: f64| region_of(la, (lo + 540.0).rem_euclid(360.0) - 180.0);
    for (k, &(d, la, lo)) in line.iter().enumerate() {
        let (s, w, n, e) = box_around(la, lo, pad_nm);
        for (a, b) in [(la, lo), (s, w), (s, e), (n, w), (n, e)] {
            out.push((d, region(a, b)));
        }
        if let Some(&(_, pla, plo)) = k.checked_sub(1).map(|j| &line[j]) {
            out.push((d, region(pla, lo)));
            out.push((d, region(la, plo)));
        }
    }
}

/// The regions ahead, the airplane's own first and then in the order the
/// track or the route reaches them, each once. `track_deg` None (no
/// track, standing still) reads the track as nowhere; an empty route, as
/// none.
pub fn regions_ahead(lat: f64, lon: f64, track_deg: Option<f64>, route: &[(f64, f64)], look_ahead_nm: f64, pad_nm: f64) -> Vec<String> {
    let look = look_ahead_nm.max(0.0);
    let mut found = Vec::new();
    reached(&[(0.0, lat, lon)], pad_nm, &mut found);
    if let Some(t) = track_deg {
        reached(&along_track(lat, lon, t, look), pad_nm, &mut found);
    }
    reached(&along_route(lat, lon, route, look), pad_nm, &mut found);
    // The airplane's own region first, then by the miles ahead, a tie in
    // the order found.
    let own = region_of(lat, lon);
    found.stable_sort_by(|a, b| (a.1 != own).cmp(&(b.1 != own)).then(a.0.total_cmp(&b.0)));
    let mut out: Vec<String> = Vec::new();
    for (_, name) in found {
        if !out.contains(&name) {
            out.push(name);
        }
    }
    out
}

/// `regions_ahead`: `["n40w088", ...]` from `{"lat", "lon", "track_deg"?,
/// "route"?: [[lat, lon]], "look_ahead_nm", "pad_nm"?}`.
pub fn regions_ahead_rule(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut route = Vec::new();
    let points = match v.get("route") {
        None | Some(Value::Null) => &[][..],
        Some(_) => ask.list("route")?,
    };
    for p in points {
        match p.as_array() {
            Some([a, b]) => match (a.as_f64(), b.as_f64()) {
                (Some(la), Some(lo)) => route.push((la, lo)),
                _ => return Err(format!("{name}: a route point is not [lat, lon]")),
            },
            _ => return Err(format!("{name}: a route point is not [lat, lon]")),
        }
    }
    let regions = regions_ahead(
        ask.num("lat")?,
        ask.num("lon")?,
        ask.opt_num("track_deg")?,
        &route,
        ask.num("look_ahead_nm")?,
        ask.opt_num("pad_nm")?.unwrap_or(PAD_NM).max(0.0),
    );
    let mut out = String::new();
    strings(&mut out, &regions);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json;

    #[test]
    fn the_region_ahead_east_at_48_north_is_read() {
        // 17 nm east of 47.9 N 92.3 W is 0.42 degrees of longitude, into
        // n44w092 from n44w096: the case the fixed 0.3 degrees missed.
        assert_eq!(regions_ahead(47.9, -92.3, Some(90.0), &[], 17.0, 0.0), ["n44w096", "n44w092"]);
        // Standing still with no route: the airplane's own alone.
        assert_eq!(regions_ahead(47.9, -92.3, None, &[], 17.0, 0.0), ["n44w096"]);
    }

    #[test]
    fn the_route_ahead_is_read_in_order_and_behind_is_not() {
        // A route south-west to north-east across three regions; the
        // airplane on it at 41.9 N 88.1 W (n40w092), flying north.
        let route = [(41.0, -91.0), (41.9, -88.1), (45.5, -83.0)];
        let found = regions_ahead(41.9, -88.1, Some(0.0), &route, 400.0, 0.0);
        assert_eq!(found[0], "n40w092");
        let at = |r: &str| found.iter().position(|f| f == r);
        // The route on north-east into n40w088 and then n44w084; the leg
        // behind (n40w092 back to 91 W) adds nothing new.
        assert!(at("n40w088").unwrap() < at("n44w084").unwrap(), "{found:?}");
        // The track north crosses 44 N within 400 nm: n44w092.
        assert!(at("n44w092").is_some(), "{found:?}");
        // Nothing west of 92 W, behind on the route.
        assert!(at("n40w096").is_none(), "{found:?}");
    }

    #[test]
    fn the_pad_reaches_a_region_just_beside_the_line() {
        // Flying east along 43.99 N, 0.6 nm south of the line at 44 N.
        let without = regions_ahead(43.99, -90.0, Some(90.0), &[], 10.0, 0.0);
        assert_eq!(without, ["n40w092"]);
        let with = regions_ahead(43.99, -90.0, Some(90.0), &[], 10.0, 1.0);
        assert_eq!(with, ["n40w092", "n44w092"]);
    }

    #[test]
    fn a_step_across_a_corner_reads_both_regions_it_may_cut() {
        // A diagonal step from n40w092 to n44w088 across the corner at
        // 44 N 88 W also counts n44w092 and n40w088.
        let mut found = Vec::new();
        reached(&[(0.0, 43.995, -88.005), (1.0, 44.005, -87.995)], 0.0, &mut found);
        let names: Vec<&str> = found.iter().map(|f| f.1.as_str()).collect();
        for r in ["n40w092", "n44w088", "n44w092", "n40w088"] {
            assert!(names.contains(&r), "{r}: {names:?}");
        }
    }

    #[test]
    fn a_route_point_that_is_not_a_pair_is_refused() {
        let v = json::parse(r#"{"lat": 41.9, "lon": -88.1, "look_ahead_nm": 10, "route": [[41.0]]}"#).unwrap();
        assert!(regions_ahead_rule("regions_ahead", &v).is_err());
        let v = json::parse(r#"{"lat": 41.9, "lon": -88.1, "look_ahead_nm": 10}"#).unwrap();
        assert_eq!(regions_ahead_rule("regions_ahead", &v).unwrap(), r#"["n40w092"]"#);
    }
}
