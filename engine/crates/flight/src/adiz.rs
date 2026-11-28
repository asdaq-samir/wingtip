//! The Air Defense Identification Zones a route meets (14 CFR part 99):
//! "an area of airspace over land or water in which the ready
//! identification, location, and control of all aircraft ... is required
//! in the interest of national security" (99.3). Part 99 asks a flight
//! "into, within, or out of the United States through an ADIZ" (99.1(a))
//! for a flight plan filed and open (99.11), a two-way radio and a
//! listening watch (99.9), its transponder on (99.13) and a position
//! report before it crosses (99.15). The planner warns of the zones a
//! route meets, never refusing it (the owner's rule: warn, never limit).
//!
//! The zones are subpart B's, each as the regulation draws it, points to
//! the second of arc: the Contiguous U.S. ADIZ (99.43), Alaska's (99.45),
//! Guam's (99.47) and Hawaii's (99.49). "The lines between points ... are
//! great circles except that the lines joining adjacent points on the same
//! parallel of latitude are rhumb lines" (99.41): a great circle is drawn
//! here as points GREAT_CIRCLE_STEP_NM apart along its geodesic, a rhumb
//! line on a parallel as the straight line in degrees it is.
//!
//! The Contiguous U.S. ADIZ runs out from the coasts and, between them,
//! "along the U.S./Mexico border" both ways (99.43): its outline crosses
//! the land border and comes back the same way, a line with no width. A
//! leg that crosses that border between the two countries (wingtip_flight's
//! jurisdiction) crosses the zone's line there, and is taken as entering it.
//!
//! Simplified toward the warning: a route is said to meet a zone where any
//! of its points, every LEG_STEP_NM along each leg, lies in it, whatever
//! its altitude or speed. 99.1(b)'s exceptions (within 10 nm of the point
//! of departure; under 180 kt true airspeed in the Hawaii and Guam ADIZs,
//! and in Alaska's with a listening watch, where only 99.7, 99.13 and 99.15
//! still apply) are said in the words, not left out, so the pilot weighs
//! them.

use std::sync::OnceLock;
use wingtip_core::geo::{destination, distance_and_bearing, ring_holds};

use crate::jurisdiction::{leg_codes, LEG_STEP_NM};

/// (lat, lon), degrees: north and east positive.
type Point = (f64, f64);

/// How far apart a great circle's points are drawn, nm: within about a
/// tenth of a mile of the geodesic between them at these latitudes.
const GREAT_CIRCLE_STEP_NM: f64 = 20.0;
/// The most points one leg is checked at, for a very long one.
const LEG_POINTS_MAX: usize = 500;

/// 99.43: from the coast of Maine round Florida and the Gulf to the
/// mouth of the Rio Grande, and back out along the outer line.
#[rustfmt::skip]
const CONTIGUOUS_EAST: &[Point] = &[
    (43.25, -65.91667), (44.35, -67.26667), (43.16667, -69.66667), (41.08333, -69.66667),
    (40.53333, -72.25), (39.91667, -73.0), (39.63333, -73.0), (39.6, -73.66667),
    (37.0, -75.5), (36.16667, -75.16667), (35.16667, -75.16667), (32.0, -80.5),
    (30.5, -81.0), (26.66667, -79.66667), (25.0, -80.08333), (24.41667, -81.25),
    (24.33333, -81.75), (24.5, -82.1), (24.68333, -82.1), (24.71667, -82.0),
    (25.0, -81.5), (25.16667, -81.38333), (25.58333, -81.5), (26.25, -82.33333),
    (27.83333, -83.08333), (28.91667, -83.5), (29.7, -84.0), (29.33333, -85.0),
    (30.0, -87.16667), (30.0, -88.5), (28.75, -88.91667), (28.75, -90.0),
    (29.41667, -94.0), (28.33333, -96.0), (27.5, -97.0), (26.0, -97.0),
    (25.96667, -97.11667), (26.0, -97.0), (26.0, -95.0), (26.5, -95.0),
    (26.5, -84.0), (24.0, -83.0), (24.0, -79.41667), (25.66667, -79.41667),
    (27.5, -78.83333), (30.75, -74.0), (39.5, -63.75), (43.0, -65.8),
];
/// 99.43: off the Pacific coast, from the border at 32°32′03″ N,
/// 117°07′25″ W out and back.
#[rustfmt::skip]
const CONTIGUOUS_WEST: &[Point] = &[
    (32.53417, -117.12361), (32.5, -117.41667), (32.58333, -118.5), (33.08333, -119.75),
    (33.91667, -120.66667), (34.83333, -121.16667), (38.83333, -124.0), (40.0, -124.58333),
    (40.41667, -124.66667), (42.83333, -124.83333), (46.25, -124.5), (48.5, -125.0),
    (48.33333, -128.0), (48.33333, -132.0), (37.7, -130.66667), (29.0, -124.0),
    (30.75, -120.83333), (32.0, -118.4), (32.5, -117.33333),
];
/// 99.45, its longitudes east of 180 written west of -180 (170° E is
/// -190) so the ring is one piece across the antimeridian.
#[rustfmt::skip]
const ALASKA: &[Point] = &[
    (54.0, -136.0), (56.95, -144.0), (57.0, -145.0), (53.0, -158.0),
    (50.0, -169.0), (50.0, -180.0), (50.0, -190.0), (53.0, -190.0),
    (60.0, -180.0), (65.0, -169.0), (75.0, -169.0), (75.0, -141.0),
    (69.83333, -141.0), (71.3, -156.73333), (68.66667, -167.16667), (67.0, -165.0),
    (65.66667, -168.25), (63.75, -165.5), (61.33333, -166.66667), (59.0, -163.0),
    (54.0, -163.0), (56.5, -154.0), (59.33333, -146.0), (59.5, -140.0),
    (57.0, -136.0), (54.58333, -133.0),
];
/// 99.49(a) and (b): the zone lies between the outer boundary and the inner.
#[rustfmt::skip]
const HAWAII_OUTER: &[Point] = &[
    (26.5, -156.0), (26.5, -161.0), (24.0, -164.0), (20.0, -164.0),
    (17.0, -160.0), (17.0, -156.0), (20.0, -153.0), (22.0, -153.0),
];
#[rustfmt::skip]
const HAWAII_INNER: &[Point] = &[
    (22.5, -157.0), (22.5, -160.0), (22.0, -161.0), (21.0, -161.0),
    (20.0, -160.0), (20.0, -156.5), (21.0, -155.5),
];
/// 99.47(b): a circle of 250 nm about 13°32′41″ N, 144°50′30″ E.
const GUAM_CENTRE: Point = (13.54472, 144.84167);
const GUAM_RADIUS_NM: f64 = 250.0;
/// 99.47(a): the inner boundary, the 50 nm arc of the NIMITZ VORTAC
/// (13°27′11″ N, 144°43′51″ E) from 13°52′07″ N, 143°59′16″ E to 13°02′08″ N,
/// 145°28′17″ E, a line to 14°49′07″ N, 146°13′58″ E, the 35 nm arc of
/// the SAIPAN NDB (15°06′46″ N, 145°42′42″ E) to 15°24′21″ N, 145°11′21″ E,
/// and a line back; each arc counterclockwise.
const NIMITZ: Point = (13.45306, 144.73083);
const SAIPAN: Point = (15.11278, 145.71167);
const GUAM_INNER_TURNS: [Point; 4] = [(13.86861, 143.98778), (13.03556, 145.47139), (14.81861, 146.23278), (15.40583, 145.18917)];

/// The zones by their keys, as the answer names them.
pub const ZONES: [&str; 4] = ["contiguous", "alaska", "hawaii", "guam"];

/// A zone's name as the pilot reads it.
pub fn zone_name(key: &str) -> &'static str {
    match key {
        "contiguous" => "the Contiguous U.S. ADIZ",
        "alaska" => "the Alaska ADIZ",
        "hawaii" => "the Hawaii ADIZ",
        _ => "the Guam ADIZ",
    }
}

/// A ring with each edge off a parallel drawn as its great circle's points
/// (99.41), its longitudes kept within 180° of the edge's start.
fn drawn(ring: &[Point]) -> Vec<(f64, f64)> {
    let mut out = Vec::new();
    for (i, &a) in ring.iter().enumerate() {
        let b = ring[(i + 1) % ring.len()];
        out.push((a.1, a.0));
        if a.0 == b.0 {
            continue; // a parallel: a rhumb line, straight in degrees
        }
        let (nm, course) = distance_and_bearing(a.0, a.1, b.0, b.1);
        let steps = (nm / GREAT_CIRCLE_STEP_NM).ceil() as usize;
        for k in 1..steps {
            let (lat, lon) = destination(a.0, a.1, course, nm * k as f64 / steps as f64);
            out.push((a.1 + (lon - a.1 + 180.0).rem_euclid(360.0) - 180.0, lat));
        }
    }
    out
}

/// An arc of `radius_nm` round `centre` from `from` to `to`, counterclockwise.
fn arc(centre: Point, radius_nm: f64, from: Point, to: Point) -> Vec<Point> {
    let start = distance_and_bearing(centre.0, centre.1, from.0, from.1).1;
    let end = distance_and_bearing(centre.0, centre.1, to.0, to.1).1;
    let sweep = (start - end).rem_euclid(360.0);
    let steps = (sweep.ceil() as usize).max(1);
    (0..=steps).map(|k| destination(centre.0, centre.1, start - sweep * k as f64 / steps as f64, radius_nm)).collect()
}

struct Rings {
    east: Vec<(f64, f64)>,
    west: Vec<(f64, f64)>,
    alaska: Vec<(f64, f64)>,
    hawaii_outer: Vec<(f64, f64)>,
    hawaii_inner: Vec<(f64, f64)>,
    guam_inner: Vec<(f64, f64)>,
}

fn rings() -> &'static Rings {
    static RINGS: OnceLock<Rings> = OnceLock::new();
    RINGS.get_or_init(|| {
        let [a, b, c, d] = GUAM_INNER_TURNS;
        let mut guam = arc(NIMITZ, 50.0, a, b);
        guam.extend(arc(SAIPAN, 35.0, c, d));
        Rings {
            east: drawn(CONTIGUOUS_EAST),
            west: drawn(CONTIGUOUS_WEST),
            alaska: drawn(ALASKA),
            hawaii_outer: drawn(HAWAII_OUTER),
            hawaii_inner: drawn(HAWAII_INNER),
            guam_inner: drawn(&guam),
        }
    })
}

/// The zone a point lies in, by its key; None outside every one.
pub fn zone_at(lat: f64, lon: f64) -> Option<&'static str> {
    let r = rings();
    let lon = (lon + 180.0).rem_euclid(360.0) - 180.0;
    if ring_holds(&r.east, lon, lat) || ring_holds(&r.west, lon, lat) {
        return Some("contiguous");
    }
    // Alaska's ring runs west past -180: a point east of 180 read there too.
    if ring_holds(&r.alaska, lon, lat) || ring_holds(&r.alaska, lon - 360.0, lat) {
        return Some("alaska");
    }
    if ring_holds(&r.hawaii_outer, lon, lat) && !ring_holds(&r.hawaii_inner, lon, lat) {
        return Some("hawaii");
    }
    let from_guam = distance_and_bearing(GUAM_CENTRE.0, GUAM_CENTRE.1, lat, lon).0;
    (from_guam <= GUAM_RADIUS_NM && !ring_holds(&r.guam_inner, lon, lat)).then_some("guam")
}

/// The zones a leg meets, each once in the order met: its points every
/// LEG_STEP_NM along its geodesic, and the Contiguous U.S. ADIZ where it
/// crosses the land border between the United States and Mexico (99.43).
pub fn leg_zones(a: Point, b: Point) -> Vec<&'static str> {
    let (nm, course) = distance_and_bearing(a.0, a.1, b.0, b.1);
    let steps = ((nm / LEG_STEP_NM).ceil() as usize).clamp(1, LEG_POINTS_MAX);
    let mut out: Vec<&'static str> = Vec::new();
    for i in 0..=steps {
        let (lat, lon) = if i == steps { b } else { destination(a.0, a.1, course, nm * i as f64 / steps as f64) };
        if let Some(zone) = zone_at(lat, lon).filter(|z| !out.contains(z)) {
            out.push(zone);
        }
    }
    if !out.contains(&"contiguous") {
        let codes = leg_codes(a, b);
        if codes.contains(&"US") && codes.contains(&"MX") {
            out.push("contiguous");
        }
    }
    out
}
