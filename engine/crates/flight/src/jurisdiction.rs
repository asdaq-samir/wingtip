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
//! Canada's provinces and territories, from Natural Earth's admin-1 at
//! 1:50m, only name where in Canada a field or a leg is, "Canada
//! (Ontario)", so the warning says which leg and where (province_of).
//!
//! Simplified toward the warning: a point on no country's land is its
//! nearest kept country's within 12 nm of that country's outline (91.1(b)'s
//! 12 nm for the United States, the territorial sea of the same width for
//! the others, the nearer one between two, as a median line divides them),
//! and "other" beyond, where the US figures do not apply, so the high seas
//! are warned of too. The outlines are within about a third of a mile of
//! Natural Earth's where two countries meet, so a point that near the
//! border may read either side. On an open coast they are thinned by up to
//! 6 nm and the 12 nm is measured from the thinned line, so a point some 6
//! to 12 nm off such a coast, still under 91.1(b), can read "other": it is
//! then warned of as outside the US rules, the safe side (warn, never
//! limit), and is left so (the aviation audit of 2026-11-23, L5). Were it
//! to matter on real routes (the Gulf coast, the Keys), measure the buffer
//! from an unthinned coastline rather than widen it, which would take in
//! sea outside 91.1(b). An island too small for the 1:50m outlines
//! (Bimini) reads "other", still warned of.

use std::sync::OnceLock;
use wingtip_core::flat::to_segment;
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

/// The outlines, read once from data/borders.txt: the countries, and
/// Canada's provinces and territories, which only name where in Canada a
/// point is.
pub(crate) struct Outlines {
    countries: Vec<Country>,
    provinces: Vec<Country>,
}

fn outlines() -> Result<&'static Outlines, &'static str> {
    static READ: OnceLock<Result<Outlines, String>> = OnceLock::new();
    READ.get_or_init(|| read(include_str!("../data/borders.txt"))).as_ref().map_err(String::as_str)
}

/// The outlines read whole, or why not: asked first by each call that
/// reads them (jurisdiction_call, adiz_call), so a bad borders.txt fails
/// that call alone, never with a panic that in WebAssembly takes the whole
/// engine down (the round 7 audit, E-L4).
pub fn outlines_read() -> Result<(), String> {
    outlines().map(|_| ()).map_err(str::to_owned)
}

/// The countries; none where the outlines could not be read, so every
/// point then reads "other" and is warned of, the safe side.
fn countries() -> &'static [Country] {
    outlines().map_or(&[], |all| &all.countries)
}

/// The engine's own code for one the file names, so each is a 'static str.
/// A code the engine does not know (a new territory in borders.txt) fails
/// the read, never reads as some other country: the file is built in, so
/// the_outlines_name_only_known_places fails on it before it ships.
fn code_of(code: &str) -> Result<&'static str, String> {
    const CODES: [&str; 17] = ["US", "CA", "MX", "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT", "BS"];
    CODES.iter().find(|c| **c == code).copied().ok_or_else(|| format!("borders.txt names {code}, which the engine does not know"))
}

/// The countries and the provinces borders.txt holds, in its order, for
/// the test that every one is known.
#[cfg(test)]
pub(crate) fn outline_codes() -> Result<(Vec<&'static str>, Vec<&'static str>), String> {
    let all = read(include_str!("../data/borders.txt"))?;
    Ok((all.countries.iter().map(|c| c.code).collect(), all.provinces.iter().map(|p| p.code).collect()))
}

pub(crate) fn read(text: &str) -> Result<Outlines, String> {
    let mut all = Outlines { countries: Vec::new(), provinces: Vec::new() };
    let mut into_provinces = false;
    for line in text.lines().filter(|l| !l.is_empty() && !l.starts_with('#')) {
        let head = line.strip_prefix("C ").map(|c| (c, false)).or_else(|| line.strip_prefix("P ").map(|c| (c, true)));
        if let Some((code, province)) = head {
            into_provinces = province;
            let list = if province { &mut all.provinces } else { &mut all.countries };
            list.push(Country { code: code_of(code)?, bands: vec![Vec::new(); BANDS] });
            continue;
        }
        let list = if into_provinces { &mut all.provinces } else { &mut all.countries };
        let Some(country) = list.last_mut() else { continue };
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
    Ok(all)
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
            let nm = to_segment((0.0, 0.0), ((x0 - lon) * k, y0 - lat), ((x1 - lon) * k, y1 - lat)) * NM_PER_DEG;
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

/// How far from a province's outline a point in Canada off all of them
/// (Lake Ontario's Canadian half, a coast's 12 nm) is still said to be in
/// it, nm: past the 12 nm of territorial sea and the provinces' thinning.
const PROVINCE_REACH_NM: f64 = 20.0;

/// The province or territory of Canada a point there is in, by its
/// English name, "Ontario": the one whose land holds it, else the nearest
/// within PROVINCE_REACH_NM; None for a point outside Canada, or one off
/// every province's outline.
pub fn province_of(lat: f64, lon: f64) -> Option<&'static str> {
    if jurisdiction_of(lat, lon) != "CA" {
        return None;
    }
    province_in(lat, lon)
}

/// province_of for a point already known to be in Canada.
fn province_in(lat: f64, lon: f64) -> Option<&'static str> {
    let all: &[Country] = outlines().map_or(&[], |all| &all.provinces);
    let code = match all.iter().find(|p| holds(p, lat, lon)) {
        Some(p) => p.code,
        None => {
            all.iter()
                .filter_map(|p| distance_within(p, lat, lon, PROVINCE_REACH_NM).map(|nm| (nm, p.code)))
                .min_by(|a, b| a.0.total_cmp(&b.0))?
                .1
        }
    };
    match code {
        "AB" => Some("Alberta"),
        "BC" => Some("British Columbia"),
        "MB" => Some("Manitoba"),
        "NB" => Some("New Brunswick"),
        "NL" => Some("Newfoundland and Labrador"),
        "NS" => Some("Nova Scotia"),
        "NT" => Some("Northwest Territories"),
        "NU" => Some("Nunavut"),
        "ON" => Some("Ontario"),
        "PE" => Some("Prince Edward Island"),
        "QC" => Some("Quebec"),
        "SK" => Some("Saskatchewan"),
        "YT" => Some("Yukon"),
        // code_of lets only the codes above through as a province's; a
        // country's code in the provinces names none, never a panic.
        _ => None,
    }
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

/// Where outside the United States a point, a leg or a route lies: the
/// countries other than the US met, in the order met, and the provinces
/// of Canada among them, each once.
#[derive(Debug, Default, PartialEq)]
pub struct Outside {
    pub countries: Vec<&'static str>,
    pub provinces: Vec<&'static str>,
}

impl Outside {
    /// A point's country and, in Canada, its province.
    pub fn at(lat: f64, lon: f64) -> Self {
        let mut out = Outside::default();
        out.meet(jurisdiction_of(lat, lon), lat, lon);
        out
    }

    fn meet(&mut self, code: &'static str, lat: f64, lon: f64) {
        if code == "US" {
            return;
        }
        if !self.countries.contains(&code) {
            self.countries.push(code);
        }
        if code == "CA"
            && let Some(p) = province_in(lat, lon)
            && !self.provinces.contains(&p)
        {
            self.provinces.push(p);
        }
    }

    /// Another's countries and provinces after this one's, each once.
    pub fn add(&mut self, other: &Outside) {
        for c in &other.countries {
            if !self.countries.contains(c) {
                self.countries.push(c);
            }
        }
        for p in &other.provinces {
            if !self.provinces.contains(p) {
                self.provinces.push(p);
            }
        }
    }

    /// The places, as a pilot reads them after "is in" or "crosses":
    /// "Canada (Ontario) and Mexico", "airspace outside the US" for a
    /// point in no kept country (the high seas among it).
    fn places(&self) -> String {
        let names: Vec<String> = self
            .countries
            .iter()
            .map(|c| match *c {
                "CA" if !self.provinces.is_empty() => format!("Canada ({})", self.provinces.join(", ")),
                "CA" => "Canada".to_string(),
                "MX" => "Mexico".to_string(),
                "BS" => "the Bahamas".to_string(),
                _ => "airspace outside the US".to_string(),
            })
            .collect();
        and(&names)
    }

    /// Whose rules were not checked: "Canadian rules"; outside every kept
    /// country, the country's there or, over the high seas, ICAO Annex 2's
    /// (14 CFR 91.703(a)(1), (2)), "foreign and ICAO rules".
    fn rules(&self) -> String {
        let names: Vec<String> = self
            .countries
            .iter()
            .map(|c| match *c {
                "CA" => "Canadian",
                "MX" => "Mexican",
                "BS" => "Bahamian",
                _ => "foreign and ICAO",
            })
            .map(str::to_string)
            .collect();
        format!("{} rules", and(&names))
    }

    /// The warning, its subject and verb first: "The leg to KBUF crosses",
    /// "KBUF is in", "Part of the route is in", then "Canada (Ontario):
    /// Canadian rules not checked — figures use US rules". None where it is
    /// all in the United States.
    pub fn caution(&self, subject: &str) -> Option<String> {
        if self.countries.is_empty() {
            return None;
        }
        Some(format!("{subject} {}: {} not checked — figures use US rules", self.places(), self.rules()))
    }
}

/// "A", "A and B", "A, B and C".
fn and(names: &[String]) -> String {
    match names {
        [] => String::new(),
        [one] => one.clone(),
        [rest @ .., last] => format!("{} and {last}", rest.join(", ")),
    }
}

/// The countries met along a leg, ends included, each once in the order
/// met, at points LEG_STEP_NM apart on its geodesic (route_adiz's; whose
/// rules a leg is under is leg_outside's, which walks it once).
pub fn leg_codes(a: (f64, f64), b: (f64, f64)) -> Vec<&'static str> {
    let mut codes: Vec<&'static str> = Vec::new();
    along(a, b, |code, _, _| {
        if !codes.contains(&code) {
            codes.push(code);
        }
    });
    codes
}

/// Where outside the United States a leg lies, ends included, its points
/// LEG_STEP_NM apart on its geodesic.
pub fn leg_outside(a: (f64, f64), b: (f64, f64)) -> Outside {
    let mut out = Outside::default();
    along(a, b, |code, lat, lon| out.meet(code, lat, lon));
    out
}

/// Each point of a leg LEG_STEP_NM apart, its country, in order.
fn along(a: (f64, f64), b: (f64, f64), mut each: impl FnMut(&'static str, f64, f64)) {
    let (nm, course) = distance_and_bearing(a.0, a.1, b.0, b.1);
    let steps = ((nm / LEG_STEP_NM).ceil() as usize).clamp(1, LEG_POINTS_MAX);
    for i in 0..=steps {
        let (lat, lon) = if i == steps { b } else { destination(a.0, a.1, course, nm * i as f64 / steps as f64) };
        each(jurisdiction_of(lat, lon), lat, lon);
    }
}
