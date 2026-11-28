//! The countries' and Canada's provinces' outlines, read from
//! data/borders.bin (Natural Earth's admin-0 and admin-1 at 1:50m, public
//! domain, as scripts/build/borders.py writes them) and filed by latitude
//! band, for jurisdiction's tests of whose rules a point is under. Only
//! the decoding is here: the file's records, its zigzag varints and the
//! codes the engine knows; what the outlines mean is jurisdiction's.

use std::sync::OnceLock;

/// The latitude bands the edges are filed in, degrees.
const BAND_DEG: f64 = 0.5;
const BANDS: usize = (180.0 / BAND_DEG) as usize;
/// An edge of an outline, (lon, lat) to (lon, lat), degrees.
pub(crate) type Edge = [f64; 4];

pub(crate) struct Country {
    pub(crate) code: &'static str,
    /// Its edges by the latitude bands they cross, so a point is tested
    /// against the few near it.
    pub(crate) bands: Vec<Vec<Edge>>,
}

pub(crate) fn band_of(lat: f64) -> usize {
    (((lat + 90.0) / BAND_DEG).floor().max(0.0) as usize).min(BANDS - 1)
}

/// The outlines, read once from data/borders.bin: the countries, and
/// Canada's provinces and territories, which only name where in Canada a
/// point is.
pub(crate) struct Outlines {
    countries: Vec<Country>,
    pub(crate) provinces: Vec<Country>,
}

pub(crate) fn outlines() -> Result<&'static Outlines, &'static str> {
    static READ: OnceLock<Result<Outlines, String>> = OnceLock::new();
    READ.get_or_init(|| read(include_bytes!("../data/borders.bin"))).as_ref().map_err(String::as_str)
}

/// The outlines read whole, or why not: asked first by each call that
/// reads them (jurisdiction_call, adiz_call), so a bad borders.bin fails
/// that call alone, never with a panic that in WebAssembly takes the whole
/// engine down.
pub fn outlines_read() -> Result<(), String> {
    outlines().map(|_| ()).map_err(str::to_owned)
}

/// The countries; none where the outlines could not be read, so every
/// point then reads "other" and is warned of, the safe side.
pub(crate) fn countries() -> &'static [Country] {
    outlines().map_or(&[], |all| &all.countries)
}

/// The engine's own code for one the file names, so each is a 'static str.
/// A code the engine does not know (a new territory in borders.bin) fails
/// the read, never reads as some other country: the file is built in, so
/// the_outlines_name_only_known_places fails on it before it ships.
fn code_of(code: &str) -> Result<&'static str, String> {
    const CODES: [&str; 17] = ["US", "CA", "MX", "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT", "BS"];
    CODES.iter().find(|c| **c == code).copied().ok_or_else(|| format!("borders.bin names {code}, which the engine does not know"))
}

/// The countries and the provinces borders.bin holds, in its order, for
/// the test that every one is known.
#[cfg(test)]
pub(crate) fn outline_codes() -> Result<(Vec<&'static str>, Vec<&'static str>), String> {
    let all = read(include_bytes!("../data/borders.bin"))?;
    Ok((all.countries.iter().map(|c| c.code).collect(), all.provinces.iter().map(|p| p.code).collect()))
}

/// The zigzag LEB128 varint at `at`, `at` moved past it (borders.py's `varint`).
fn varint(bytes: &[u8], at: &mut usize) -> Option<i64> {
    let mut z: u64 = 0;
    for shift in (0..64).step_by(7) {
        let b = *bytes.get(*at)?;
        *at += 1;
        z |= u64::from(b & 0x7F) << shift;
        if b < 0x80 {
            return Some((z >> 1) as i64 ^ -((z & 1) as i64));
        }
    }
    None
}

/// The outlines from borders.bin's records, as scripts/build/borders.py
/// writes them; bytes not so are an error, never a panic.
pub(crate) fn read(bytes: &[u8]) -> Result<Outlines, String> {
    let bad = || "borders.bin is not as scripts/build/borders.py writes it".to_owned();
    let mut all = Outlines { countries: Vec::new(), provinces: Vec::new() };
    let mut into_provinces = false;
    let mut at = 0;
    while let Some(&kind) = bytes.get(at) {
        at += 1;
        if kind == b'C' || kind == b'P' {
            let code = bytes.get(at..at + 2).and_then(|c| std::str::from_utf8(c).ok()).ok_or_else(bad)?;
            (at, into_provinces) = (at + 2, kind == b'P');
            let list = if into_provinces { &mut all.provinces } else { &mut all.countries };
            list.push(Country { code: code_of(code)?, bands: vec![Vec::new(); BANDS] });
            continue;
        }
        let list = if into_provinces { &mut all.provinces } else { &mut all.countries };
        let (b'R', Some(country)) = (kind, list.last_mut()) else { return Err(bad()) };
        let count = varint(bytes, &mut at).ok_or_else(bad)?;
        let (mut x, mut y, mut ring) = (0i64, 0i64, Vec::new());
        for _ in 0..count {
            (x, y) = (x + varint(bytes, &mut at).ok_or_else(bad)?, y + varint(bytes, &mut at).ok_or_else(bad)?);
            ring.push((x as f64 / 1000.0, y as f64 / 1000.0));
        }
        for (i, &(x0, y0)) in ring.iter().enumerate() {
            let (x1, y1) = ring[(i + 1) % ring.len()];
            for band in &mut country.bands[band_of(y0.min(y1))..=band_of(y0.max(y1))] {
                band.push([x0, y0, x1, y1]);
            }
        }
    }
    Ok(all)
}
