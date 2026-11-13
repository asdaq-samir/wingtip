//! The words of a lighting remark (lighting_read's parse): the systems by
//! the Chart Supplement legend's codes, runways, frequencies, schedules
//! and counts of clicks, and the sentence's words one by one.

/// The legend's systems (Chart Supplement, Airport/Facility Directory
/// Legend, "AIRPORT LIGHTING" and "VISUAL GLIDESLOPE INDICATORS"), by
/// their names in AIM 2-1: the approach light systems (2-1-1), the visual
/// glideslope indicators (2-1-2), REIL (2-1-3), the runway edge lights by
/// intensity (2-1-4), in-runway lighting (2-1-5). A line each: the code as
/// written, the code it is shown by, and its name.
const SYSTEMS: &str = concat!(
    "ALS:ALS:Approach lights\nALSF1:ALSF1:Approach lights\nALSF-1:ALSF1:Approach lights\nALSF2:ALSF2:Approach lights\n",
    "ALSF-2:ALSF2:Approach lights\nALSAF:ALSAF:Approach lights\nALSF:ALSF:Approach lights\nMALS:MALS:Approach lights\n",
    "MALSF:MALSF:Approach lights\nMALSR:MALSR:Approach lights\nSALS:SALS:Approach lights\nSALSF:SALSF:Approach lights\n",
    "SSALS:SSALS:Approach lights\nSSALF:SSALF:Approach lights\nSSALR:SSALR:Approach lights\nODALS:ODALS:Approach lights\n",
    "RLLS:RLLS:Lead-in lights\nLDIN:LDIN:Lead-in lights\nRAIL:RAIL:Runway alignment indicator lights\n",
    "SF:SF:Sequenced flashing lights\nSFL:SFL:Sequenced flashing lights\n",
    "PAPI:PAPI:Precision approach path indicator\nPAPIS:PAPI:Precision approach path indicator\n",
    "APAPI:APAPI:Abbreviated precision approach path indicator\n",
    "VASI:VASI:Visual approach slope indicator\nVASIS:VASI:Visual approach slope indicator\n",
    "PVASI:PVASI:Pulsating visual approach slope indicator\n",
    "SAVASI:SAVASI:Simplified abbreviated visual approach slope indicator\n",
    "TRCV:TRCV:Tri-color visual approach slope indicator\nAPAP:APAP:Approach path alignment panels\n",
    "REIL:REIL:Runway end identifier lights\nREILS:REIL:Runway end identifier lights\n",
    "HIRL:HIRL:Runway edge lights, high intensity\nHIRLS:HIRL:Runway edge lights, high intensity\n",
    "MIRL:MIRL:Runway edge lights, medium intensity\nMIRLS:MIRL:Runway edge lights, medium intensity\n",
    "LIRL:LIRL:Runway edge lights, low intensity\nLIRLS:LIRL:Runway edge lights, low intensity\n",
    "CL:CL:Centerline lights\nRCLS:RCLS:Runway centerline lights\nTDZ:TDZL:Touchdown zone lights\n",
    "TDZL:TDZL:Touchdown zone lights\n",
);

/// The systems of two words, with no code of their own: the taxiway lights
/// (AIM 2-1-10) and the airport's rotating beacon (2-1-9; the legend's
/// "Rot Lt or Bcn"; ABN, aerodrome beacon), and the runway's lights where
/// a remark names no system ("RY 15/33 LGTS ACTVT - 121.95").
fn named(first: &str, second: Option<&str>) -> Option<(&'static str, usize)> {
    let lights = second.is_some_and(|s| matches!(s, "LGT" | "LGTS" | "LIGHTS"));
    let beacon = second.is_some_and(|s| matches!(s, "BCN" | "BEACON"));
    match first {
        "TWY" | "TAXIWAY" if lights => Some(("Taxiway lights", 2)),
        "PERIMETER" if lights => Some(("Perimeter lights", 2)),
        "ROTG" | "RTG" | "ROT" | "ROTATING" | "ARPT" | "APT" | "AP" | "AIRPORT" if beacon => Some(("Rotating beacon", 2)),
        "BCN" | "BEACON" | "ABN" => Some(("Rotating beacon", 1)),
        _ => None,
    }
}

/// The system starting at `t[i]`: its code, its name and how many words.
pub(super) fn system_at(t: &[String], i: usize, runway_first: bool) -> Option<(Option<&'static str>, &'static str, usize)> {
    let w = t[i].as_str();
    if runway_first && matches!(w, "LGT" | "LGTS" | "LIGHTS") {
        return Some((None, "Runway lights", 1));
    }
    if let Some(line) = SYSTEMS.lines().find(|l| l.split(':').next() == Some(w)) {
        let mut parts = line.split(':').skip(1);
        let code = parts.next();
        return Some((code, parts.next().unwrap_or_default(), 1));
    }
    named(w, t.get(i + 1).map(String::as_str)).map(|(name, n)| (None, name, n))
}

/// "18", "09L", "09/27", "18L/36R": a runway or a runway end.
pub fn is_designator(w: &str) -> bool {
    let end = |e: &str| {
        let digits = e.trim_end_matches(['L', 'R', 'C']);
        (1..=2).contains(&digits.len()) && digits.bytes().all(|b| b.is_ascii_digit()) && e.len() - digits.len() <= 1
    };
    let mut parts = w.split('/');
    parts.next().is_some_and(end) && parts.next().is_none_or(end) && parts.next().is_none()
}

pub(super) fn is_runway_word(w: &str) -> bool {
    matches!(w, "RWY" | "RY" | "RWYS" | "RYS")
}

pub(super) fn is_sep(w: &str) -> bool {
    matches!(w, "," | "&" | "AND")
}

/// A frequency a light is keyed on: the CTAF, or a figure ("122.8").
pub(super) fn frequency(w: &str) -> Option<String> {
    let figure = w.split_once('.').is_some_and(|(a, b)| a.len() == 3 && a.bytes().chain(b.bytes()).all(|c| c.is_ascii_digit()));
    (matches!(w, "CTAF" | "UNICOM") || figure).then(|| w.to_owned())
}

/// "SS-SR" as "sunset to sunrise", "DUSK-0230" as "dusk to 0230": a span
/// whose ends are sunset, sunrise, dusk, dawn or a time as written (the
/// remark's own clock, never said to be UTC or local).
pub fn schedule(w: &str) -> Option<String> {
    let end = |e: &str| match e {
        "SS" => Some("sunset".to_owned()),
        "SR" => Some("sunrise".to_owned()),
        "DUSK" | "DAWN" => Some(e.to_ascii_lowercase()),
        _ => (e.len() == 4 && e.bytes().all(|b| b.is_ascii_digit())).then(|| e.to_owned()),
    };
    let (a, b) = w.split_once('-')?;
    Some(format!("{} to {}", end(a)?, end(b)?))
}

pub(super) fn clicks(w: &str) -> Option<u32> {
    match w {
        "THREE" => Some(3),
        "FIVE" => Some(5),
        "SEVEN" => Some(7),
        _ => w.parse().ok().filter(|n| (1..=10).contains(n)),
    }
}

/// The sentence's words, its commas, semicolons and colons words of their
/// own, and a dash at a word's end or start ("09/27- CTAF") one too.
pub(super) fn tokens(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    for word in s.split_whitespace() {
        let (lead, word) = match word.strip_prefix('-') {
            Some(rest) if !rest.is_empty() => (true, rest),
            _ => (false, word),
        };
        if lead {
            out.push("-".to_owned());
        }
        let core = word.trim_end_matches([',', ';', ':', '-']);
        let core = if core.is_empty() { word } else { core };
        out.push(core.to_owned());
        out.extend(word[core.len()..].chars().map(|c| c.to_string()));
    }
    out
}

/// "DUSK TO DAWN", "SS TO SR": a span in three words, as one.
pub(super) fn schedule3(t: &[String], i: usize) -> Option<String> {
    let w = |k: usize| t.get(k).map(String::as_str).unwrap_or_default();
    (w(i + 1) == "TO").then(|| schedule(&format!("{}-{}", w(i), w(i + 2)))).flatten()
}
