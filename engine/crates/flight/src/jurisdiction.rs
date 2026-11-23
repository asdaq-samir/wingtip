//! Whose rules a point is under: the United States', or another
//! country's (the owner's pick of 2026-11-21, decision 0053). Every rule
//! the engine holds is the FAA's -- 14 CFR part 91, the AIM -- and part 91
//! governs "the operation of aircraft within the United States, including
//! the waters within 3 nautical miles of the U.S. coast", with most of its
//! flight rules on to 12 nautical miles (14 CFR 91.1(a) and (b)). Outside
//! it a U.S. airplane flies by "the regulations relating to the flight and
//! maneuver of aircraft there in force" within a foreign country, and by
//! ICAO Annex 2 over the high seas (14 CFR 91.703(a)(1) and (2)). So a
//! figure worked out for a point in Canada is a US figure read as a
//! Canadian one: the engine says so, and the apps warn where the figures
//! are, never refusing the plan (the owner's rule: warn, never limit).
//!
//! The United States is 14 CFR 1.1's "in a geographical sense": the
//! States, the District of Columbia, Puerto Rico and the possessions with
//! their territorial waters. The outlines are Natural Earth's admin-0
//! countries at 1:50m (public domain; data/borders.txt, written by
//! scripts/build/borders.py, which says how they were thinned): the United
//! States with its territories, and Canada, Mexico and the Bahamas, the
//! neighbours a flight from it reaches first; anywhere else is "other".
//!
//! Simplified toward the warning: a point on no country's land is its
//! nearest kept country's within 12 nm of that country's outline (91.1(b)'s
//! 12 nm for the United States, the territorial sea of the same width for
//! the others, the nearer one between two, as a median line divides them),
//! and "other" beyond, where the US figures do not apply, so the high seas
//! are warned of too. The outlines are within about a third of a mile of
//! Natural Earth's where two countries meet and 6 nm on an open coast,
//! which the 12 nm round the land takes in; a point within that of the
//! border may read either side. An island too small for the 1:50m
//! outlines (Bimini) reads "other", still warned of.

use std::sync::OnceLock;
use wingtip_core::geo::{destination, distance_and_bearing};

/// How far out from its land a country's rules reach: 91.1(b)'s 12 nm.
pub const TERRITORIAL_SEA_NM: f64 = 12.0;
/// How far apart the points a leg is checked at lie, nm: narrower than any
/// part of a neighbour a leg could cross unseen that matters to its rules.
pub const LEG_STEP_NM: f64 = 2.0;
/// The most points one leg is checked at, for a very long one.
const LEG_POINTS_MAX: usize = 500;
/// The latitude bands the edges are filed in, degrees.
const BAND_DEG: f64 = 0.5;
const BANDS: usize = (180.0 / BAND_DEG) as usize;
/// A degree of latitude, nm (the nautical mile's own definition).
const NM_PER_DEG: f64 = 60.0;

/// An edge of an outline, (lon, lat) to (lon, lat), degrees.
type Edge = [f64; 4];

struct Country {
    code: &'static str,
    /// Its edges by the latitude bands they cross, so a point is tested
    /// against the few near it.
    bands: Vec<Vec<Edge>>,
}

fn band_of(lat: f64) -> usize {
    (((lat + 90.0) / BAND_DEG).floor().max(0.0) as usize).min(BANDS - 1)
}

/// The outlines, read once from data/borders.txt.
fn countries() -> &'static [Country] {
    static READ: OnceLock<Vec<Country>> = OnceLock::new();
    READ.get_or_init(|| read(include_str!("../data/borders.txt")))
}

fn read(text: &str) -> Vec<Country> {
    let mut out: Vec<Country> = Vec::new();
    for line in text.lines().filter(|l| !l.is_empty() && !l.starts_with('#')) {
        if let Some(code) = line.strip_prefix("C ") {
            let code = match code {
                "US" => "US",
                "CA" => "CA",
                "MX" => "MX",
                _ => "BS",
            };
            out.push(Country { code, bands: vec![Vec::new(); BANDS] });
            continue;
        }
        let Some(country) = out.last_mut() else { continue };
        let steps: Vec<i64> = line.split(' ').filter_map(|n| n.parse().ok()).collect();
        let (mut x, mut y) = (0i64, 0i64);
        let ring: Vec<(f64, f64)> = steps
            .as_chunks::<2>()
            .0
            .iter()
            .map(|&[dx, dy]| {
                x += dx;
                y += dy;
                (x as f64 / 1000.0, y as f64 / 1000.0)
            })
            .collect();
        for (i, &(x0, y0)) in ring.iter().enumerate() {
            let (x1, y1) = ring[(i + 1) % ring.len()];
            for band in &mut country.bands[band_of(y0.min(y1))..=band_of(y0.max(y1))] {
                band.push([x0, y0, x1, y1]);
            }
        }
    }
    out
}

/// Whether a point lies on a country's land: its outline crossed an odd
/// number of times going east (even-odd, as wingtip_core::geo::ring_holds).
fn holds(country: &Country, lat: f64, lon: f64) -> bool {
    let mut inside = false;
    for &[x0, y0, x1, y1] in &country.bands[band_of(lat)] {
        if (y0 > lat) != (y1 > lat) && lon < x0 + (lat - y0) * (x1 - x0) / (y1 - y0) {
            inside = !inside;
        }
    }
    inside
}

/// How far a point is from a country's outline, nm, where under `within`:
/// on the small flat frame round the point, its longitudes shrunk by the
/// latitude's cosine, which over 12 nm is well within a tenth of a mile.
fn distance_within(country: &Country, lat: f64, lon: f64, within: f64) -> Option<f64> {
    let k = lat.to_radians().cos();
    let reach = within / NM_PER_DEG;
    let mut best: Option<f64> = None;
    for band in &country.bands[band_of(lat - reach)..=band_of(lat + reach)] {
        for &[x0, y0, x1, y1] in band {
            let (ax, ay, bx, by) = ((x0 - lon) * k, y0 - lat, (x1 - lon) * k, y1 - lat);
            let (dx, dy) = (bx - ax, by - ay);
            let t = if dx == 0.0 && dy == 0.0 { 0.0 } else { (-(ax * dx + ay * dy) / (dx * dx + dy * dy)).clamp(0.0, 1.0) };
            let nm = (ax + t * dx).hypot(ay + t * dy) * NM_PER_DEG;
            if nm <= within && best.is_none_or(|b| nm < b) {
                best = Some(nm);
            }
        }
    }
    best
}

/// The country whose rules a point is under: "US", "CA", "MX", "BS", or
/// "other" (the module's comment says how).
pub fn jurisdiction_of(lat: f64, lon: f64) -> &'static str {
    let all = countries();
    if let Some(c) = all.iter().find(|c| holds(c, lat, lon)) {
        return c.code;
    }
    all.iter()
        .filter_map(|c| distance_within(c, lat, lon, TERRITORIAL_SEA_NM).map(|nm| (nm, c.code)))
        .min_by(|a, b| a.0.total_cmp(&b.0))
        .map_or("other", |(_, code)| code)
}

/// A country's name as a pilot reads it at the head of the warning;
/// "Outside the US" for a point in no kept country.
pub fn country_name(code: &str) -> &'static str {
    match code {
        "US" => "The United States",
        "CA" => "Canada",
        "MX" => "Mexico",
        "BS" => "The Bahamas",
        _ => "Outside the US",
    }
}

/// The warning for points or a leg outside the United States, the
/// countries in the order met: "Canada: rules not checked — figures use US
/// rules". None where every one is the United States.
pub fn caution(codes: &[&str]) -> Option<String> {
    let mut names = codes.iter().filter(|c| **c != "US").map(|c| country_name(c));
    let first = names.next()?.to_string();
    // A second name after the first, "Canada and outside the US".
    let names = names.fold(first, |all, next| format!("{all} and {}", next.replacen("Outside", "outside", 1)));
    Some(format!("{names}: rules not checked — figures use US rules"))
}

/// The countries met along a leg, ends included, each once in the order
/// met, at points LEG_STEP_NM apart on its geodesic.
pub fn leg_codes(a: (f64, f64), b: (f64, f64)) -> Vec<&'static str> {
    let (nm, course) = distance_and_bearing(a.0, a.1, b.0, b.1);
    let steps = ((nm / LEG_STEP_NM).ceil() as usize).clamp(1, LEG_POINTS_MAX);
    let mut codes: Vec<&'static str> = Vec::new();
    for i in 0..=steps {
        let (lat, lon) = if i == steps { b } else { destination(a.0, a.1, course, nm * i as f64 / steps as f64) };
        let code = jurisdiction_of(lat, lon);
        if !codes.contains(&code) {
            codes.push(code);
        }
    }
    codes
}
