//! What a VOR's and a fix's cards say a pilot does with them: the radial
//! the airplane is on and the course to fly to the station, the station's
//! Morse identifier, its service volume, and a fix's place off the
//! nearest VOR as a controller gives it. The web's lib/navaid had these.

use crate::figures::words::js_round_f;
use crate::geo::{bearing_deg, distance_nm};

/// A VOR as its card has it: where it is and the declination its radials
/// are aligned to (NASR NAV_BASE MAG_VARN, east positive).
#[derive(Clone, Debug, PartialEq)]
pub struct Station {
    pub ident: String,
    pub lat: f64,
    pub lon: f64,
    pub mag_var: Option<f64>,
}

/// A direction from 0 up to 360 (JavaScript's `((d % 360) + 360) % 360`).
fn normalize(deg: f64) -> f64 {
    ((deg % 360.0) + 360.0) % 360.0
}

/// Degrees as a VOR's radial or a course is said: three figures, 360 for
/// north ("the 360 radial"), never 000.
pub fn three_figures(deg: f64) -> String {
    let whole = js_round_f(normalize(deg)) as i64 % 360;
    format!("{:03}", if whole == 0 { 360 } else { whole })
}

/// The radial of `station` that a point is on, the course to fly to the
/// station and how far, nm: the magnetic bearing from the station as its
/// radials are laid out, to the station's own declination (NASR NAV_BASE
/// MAG_VARN, the year it was set in MAG_VARN_YEAR), not today's variation
/// at the airplane -- as the planner turns a pilot's "JOT/045/12"
/// (wingtip.fixes.frd_point). The course to it is the radial's reciprocal.
/// None where the station has no declination filed.
pub fn radial_of(station: &Station, lat: f64, lon: f64) -> Option<(f64, f64, f64)> {
    let var = station.mag_var?;
    // Magnetic = true - east variation.
    let radial = normalize(bearing_deg(station.lat, station.lon, lat, lon) - var);
    Some((radial, normalize(radial + 180.0), distance_nm(station.lat, station.lon, lat, lon)))
}

/// A point off the nearest of `stations` that has a declination, as a
/// controller and a flight plan give it -- "JOT 045° 12 nm", its
/// fix/radial/distance (AIM 5-1-6) -- or None with none.
pub fn fix_radial_distance(lat: f64, lon: f64, stations: &[Station]) -> Option<String> {
    let mut best: Option<(&Station, f64)> = None;
    for station in stations.iter().filter(|s| s.mag_var.is_some()) {
        let nm = distance_nm(station.lat, station.lon, lat, lon);
        if best.is_none_or(|(_, b)| nm < b) {
            best = Some((station, nm));
        }
    }
    let (station, _) = best?;
    let (radial, _, nm) = radial_of(station, lat, lon)?;
    Some(format!("{} {}° {} nm", station.ident, three_figures(radial), js_round_f(nm) as i64))
}

/// A letter or figure in International Morse Code.
fn morse_char(c: char) -> Option<&'static str> {
    Some(match c {
        'A' => "·−",
        'B' => "−···",
        'C' => "−·−·",
        'D' => "−··",
        'E' => "·",
        'F' => "··−·",
        'G' => "−−·",
        'H' => "····",
        'I' => "··",
        'J' => "·−−−",
        'K' => "−·−",
        'L' => "·−··",
        'M' => "−−",
        'N' => "−·",
        'O' => "−−−",
        'P' => "·−−·",
        'Q' => "−−·−",
        'R' => "·−·",
        'S' => "···",
        'T' => "−",
        'U' => "··−",
        'V' => "···−",
        'W' => "·−−",
        'X' => "−··−",
        'Y' => "−·−−",
        'Z' => "−−··",
        '0' => "−−−−−",
        '1' => "·−−−−",
        '2' => "··−−−",
        '3' => "···−−",
        '4' => "····−",
        '5' => "·····",
        '6' => "−····",
        '7' => "−−···",
        '8' => "−−−··",
        '9' => "−−−−·",
        _ => return None,
    })
}

/// An ident in International Morse Code, a letter's dots and dashes apart
/// from the next: what the station sends, and the only positive way to
/// know it is the one tuned (AIM 1-1-3).
pub fn morse(ident: &str) -> String {
    ident.to_uppercase().chars().filter_map(morse_char).collect::<Vec<_>>().join("  ")
}

/// A station's standard service volume, by NASR NAV_BASE's ALT_CODE (the
/// VOR's) or DME_SSV (its DME's), as AIM 1-1-8's TBL 1-1-1 (VOR/DME/TACAN
/// Standard Service Volumes; AIM Change 3, effective 9 July 2026) gives
/// each class: how far out its signal is protected, from 1,000 ft above
/// the transmitter (ATH). Below 1,000 ft ATH a VOR reaches less far (AIM
/// 1-1-8 FIG 1-1-2 and 1-1-3), and a DME below 12,900 ft ATH as far as its
/// line of sight reaches. The table gives H and VH two overlapping bands
/// above 14,500 ft ATH -- 100 nm from 14,500 up to 60,000 ft, and 130 nm
/// from 18,000 up to 45,000 ft ATH -- and DH two above 12,900 ft ATH --
/// 100 nm up to 60,000 ft, 130 nm up to 45,000 ft ATH -- so each is said
/// as the farther reach at each height: 100 nm, then 130 to 45,000, then
/// 100 again to 60,000. Every band is said, the high ones too, as the
/// table has them: an IFR pilot flies there.
pub fn service_volume(code: &str) -> Option<&'static str> {
    Some(match code {
        // "From 1,000 feet ATH up to and including 12,000 feet ATH at
        // radial distances out to 25 NM."
        "T" => "Terminal · 25 nm, 1,000–12,000 ft above it",
        // "From 1,000 feet ATH up to and including 18,000 feet ATH at
        // radial distances out to 40 NM."
        "L" => "Low · 40 nm, 1,000–18,000 ft above it",
        // 40 NM from 1,000 to 14,500 ft ATH; 100 NM from 14,500 ATH to
        // 60,000 ft; 130 NM from 18,000 to 45,000 ft ATH.
        "H" => "High · 40 nm to 14,500 ft above it, 100 nm to 18,000, 130 nm to 45,000, 100 nm to 60,000",
        // 40 NM from 1,000 up to but not including 5,000 ft ATH; 70 NM
        // from 5,000 up to but not including 18,000 ft ATH.
        "VL" => "VOR Low · 40 nm under 5,000 ft above it, 70 nm to 18,000",
        // VL's two to 14,500 ft ATH, then H's above it.
        "VH" => "VOR High · 40 nm under 5,000 ft above it, 70 nm to 14,500, 100 nm to 18,000, 130 nm to 45,000, 100 nm to 60,000",
        // Line of sight up to 12,900 ft ATH; 130 NM from 12,900 up to but
        // not including 18,000 ft ATH.
        "DL" => "DME Low · line of sight under 12,900 ft above it, 130 nm to 18,000",
        // Line of sight up to 12,900 ft ATH; 100 NM from 12,900 ATH to
        // 60,000 ft; 130 NM from 12,900 to 45,000 ft ATH.
        "DH" => "DME High · line of sight under 12,900 ft above it, 130 nm to 45,000, 100 nm to 60,000",
        _ => return None,
    })
}

/// A station's hours as NASR files them in words: "24" is continuous;
/// None where none are filed.
pub fn hours(filed: &str) -> Option<String> {
    match filed {
        "" => None,
        "24" => Some("Continuous".to_owned()),
        other => Some(other.to_owned()),
    }
}
