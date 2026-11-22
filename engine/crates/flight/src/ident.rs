//! A field's names: its FAA ident and the ICAO location indicator it may
//! be filed under (FAA JO 7350.9GG), the one copy of the "add a K" rule
//! every lookup asks (#482). Re-exported from `field`, where callers name
//! it.

/// A field's FAA ident, trimmed and uppercased: a field in the contiguous
/// US whose FAA location identifier is three letters is named by ICAO with
/// a K before them (FAA JO 7350.9, Location Identifiers), and the CIFP, a
/// domestic NOTAM or a pilot may use either, so a K and three letters or
/// figures is the three. "kdlh" is DLH; "KABCD" and "K12" stay as they are.
/// The one copy for the route, the clearance, the NOTAMs and the in-flight
/// copilot.
pub fn bare_field(ident: &str) -> String {
    let s = ident.trim().to_ascii_uppercase();
    if s.len() == 4 && s.starts_with('K') && s.bytes().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()) {
        s[1..].to_owned()
    } else {
        s
    }
}

/// Whether two idents name one field: "KOSH" and "OSH" (bare_field).
pub fn same_field(a: &str, b: &str) -> bool {
    bare_field(a) == bare_field(b)
}

/// Every name a field may be filed under, as a TAF, a METAR, a NOTAM, the
/// CIFP or a frequency table may give it, the one copy for each lookup
/// that tries them in turn: NASR's own ICAO_ID first where the caller has
/// it (APT_BASE.csv), then the K form, the ident as asked, and the FAA's
/// (bare_field), each once. FAA JO 7350.9GG, paragraph 4-1: "The location
/// indicator for airports in the contiguous United States is the
/// three-letter identifier preceded by 'K'"; Alaska's are PA, PF, PO or PP,
/// Hawaii's PH, Puerto Rico's TJ and the Virgin Islands' TI, by ICAO Doc
/// 7910's listing, not by a rule a program can follow (Juneau is JNU and
/// PAJN, Hilo ITO and PHTO, San Juan SJU and TJSJ), so outside the
/// contiguous states only NASR's ICAO_ID names the ICAO form, and none is
/// guessed. The K form is offered for any three-letter ident: an
/// identifier names one landing facility (JO 7350.9GG, 2-5 a) and K
/// indicators are the contiguous states' alone, so the K form of an Alaska
/// field's (KENA for Kenai, ENA) names no other field, it is only not
/// found, and the lookup goes on to the next name. An
/// ident with a figure in it (C81, 1C5) has no ICAO indicator, and gets
/// no K.
pub fn field_names(ident: &str, icao_id: Option<&str>) -> Vec<String> {
    let asked = ident.trim().to_ascii_uppercase();
    let bare = bare_field(&asked);
    let k = (bare.len() == 3 && bare.bytes().all(|c| c.is_ascii_uppercase())).then(|| format!("K{bare}"));
    let icao = icao_id.map(|i| i.trim().to_ascii_uppercase()).filter(|i| !i.is_empty());
    let mut names: Vec<String> = Vec::new();
    for name in [icao, k, Some(asked), Some(bare)].into_iter().flatten() {
        if !name.is_empty() && !names.contains(&name) {
            names.push(name);
        }
    }
    names
}
