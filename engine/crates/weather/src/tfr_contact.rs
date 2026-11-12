//! Who a TFR's NOTAM names to call: the FAA facility it is coordinated
//! through (its "CDN FAC", JO 7930.2's coordination facility) and the
//! point of contact in charge of what goes on inside it, each with a
//! telephone or a frequency, from its XNOTAM file on tfr.faa.gov.
//!
//! The file names them in fields of their own (txtNameCoordFacility,
//! codeCoordFacilityType, txtAddrCoordPhone; txtNamePOC, txtNamePOCOrg,
//! txtAddrPOCPhone, valFreqPOC) where the FAA's template filled them; a
//! security TFR's template (99.7) leaves them empty and says the facility
//! only in its instructions: "4. FORT WORTH ARTCC, TELEPHONE 817-858-7503,
//! IS THE FAA COORDINATION FACILITY." (FDC 6/2478, read 2026-11-12). There
//! it is read from that sentence; anything else is left unsaid, never
//! guessed. A name in the FAA's capitals is written as a name is ("Fort
//! Worth ARTCC"), the facility's kind and the codes a pilot reads kept as
//! written (JO 7340.2's ARTCC, ATCT, TRACON, FSS; contractions' codes); a
//! name sent in mixed case is kept as sent.

use crate::json;
use crate::xml::Element;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Contact {
    pub name: String,
    pub phone: Option<String>,
    pub frequency: Option<String>,
}

/// The facilities' kinds a NOTAM names one by (JO 7340.2).
const KINDS: [&str; 7] = ["ARTCC", "ATCT", "TRACON", "FSS", "AFSS", "RAPCON", "CERAP"];

/// "FORT WORTH ARTCC" as "Fort Worth ARTCC"; mixed case as sent.
fn written(name: &str) -> String {
    let name = name.trim();
    if name.bytes().any(|b| b.is_ascii_lowercase()) {
        return name.to_owned();
    }
    let word = |w: &str| {
        let core = w.trim_matches(|c: char| !c.is_ascii_alphanumeric());
        if core.len() <= 1 || KINDS.contains(&core) || crate::contractions::is_code(core) {
            return w.to_owned();
        }
        let mut out = String::with_capacity(w.len());
        let mut start = true;
        for c in w.chars() {
            out.push(if start { c } else { c.to_ascii_lowercase() });
            start = !c.is_ascii_alphanumeric();
        }
        out
    };
    name.split(' ').map(word).collect::<Vec<_>>().join(" ")
}

fn field<'a>(notam: &'a Element, name: &str) -> Option<&'a str> {
    notam.text_at(&[name]).map(str::trim).filter(|t| !t.is_empty())
}

/// "817-858-7503": a North American number as the NOTAMs write one.
fn phone_at(words: &str) -> Option<String> {
    let b = words.as_bytes();
    let ok = b.len() >= 12 && b[..12].iter().enumerate().all(|(i, c)| if i == 3 || i == 7 { *c == b'-' } else { c.is_ascii_digit() });
    ok.then(|| words[..12].to_owned())
}

/// The sentence of `text` ending at `at`: from the stop before it, a
/// numbered instruction's "4. " off.
fn sentence_before(text: &str, at: usize) -> &str {
    let head = &text[..at];
    let from = head.rfind(". ").map_or(0, |i| i + 2);
    let s = head[from..].trim();
    let s = s.split_once(". ").filter(|(n, _)| n.bytes().all(|b| b.is_ascii_digit())).map_or(s, |(_, rest)| rest);
    s.trim_end_matches([',', ' '])
}

/// "FORT WORTH ARTCC, TELEPHONE 817-858-7503": the name before its TEL
/// or TELEPHONE, and the number after it.
fn named_with_phone(s: &str) -> Contact {
    let s = s.strip_prefix("THE ").unwrap_or(s);
    for tel in [", TELEPHONE ", ", TEL "] {
        if let Some((name, rest)) = s.split_once(tel) {
            return Contact { name: written(name), phone: phone_at(rest.trim()), frequency: None };
        }
    }
    Contact { name: written(s), ..Contact::default() }
}

/// The facility it is coordinated through: its own fields, else the
/// sentence of its text that calls one "THE FAA COORDINATION FACILITY" or
/// "THE CDN FAC" (JO 7340.2: CDN, coordination).
pub fn facility(notam: &Element) -> Option<Contact> {
    if let Some(name) = field(notam, "txtNameCoordFacility") {
        let kind = field(notam, "codeCoordFacilityType").unwrap_or("");
        return Some(Contact {
            name: written(&[name, " ", kind].concat()),
            phone: field(notam, "txtAddrCoordPhone").and_then(phone_at),
            frequency: None,
        });
    }
    let text = ["txtDescrTraditional", "txtDescrUSNS"].iter().find_map(|k| field(notam, k))?;
    let at = ["IS THE FAA COORDINATION FACILITY", "IS THE COORDINATION FACILITY", "IS THE CDN FAC"].iter().find_map(|p| text.find(p))?;
    Some(named_with_phone(sentence_before(text, at))).filter(|c| !c.name.is_empty())
}

/// Who is in charge inside it, from its own fields: "AIR BOSS, JIM
/// TUCCIARONE", their telephone and frequency.
pub fn contact(notam: &Element) -> Option<Contact> {
    let name = field(notam, "txtNamePOC")?;
    let name = field(notam, "txtNamePOCOrg").map_or(name.to_owned(), |org| [org, ", ", name].concat());
    Some(Contact {
        name: written(&name),
        phone: field(notam, "txtAddrPOCPhone").and_then(phone_at),
        frequency: field(notam, "valFreqPOC").map(str::to_owned),
    })
}

/// `{"name", "phone", "frequency"}`, or null.
pub fn to_json(out: &mut String, c: Option<&Contact>) {
    let Some(c) = c else {
        out.push_str("null");
        return;
    };
    out.push_str("{\"name\":");
    json::string(out, &c.name);
    out.push_str(",\"phone\":");
    json::opt_string(out, c.phone.as_deref());
    out.push_str(",\"frequency\":");
    json::opt_string(out, c.frequency.as_deref());
    out.push('}');
}

#[cfg(test)]
mod tests {
    use super::*;

    fn not(inner: &str) -> Element {
        crate::xml::parse(&["<Not>", inner, "</Not>"].concat()).unwrap()
    }

    #[test]
    fn a_security_tfrs_facility_is_read_from_its_instructions() {
        // FDC 6/2478, KSJT's, as tfr.faa.gov sent it (2026-11-12).
        let n = not(
            "<txtDescrTraditional>!FDC 6/2478 ZFW TX..AIRSPACE SAN ANGELO, TX..TEMPORARY FLIGHT RESTRICTIONS. EXC AS SPECIFIED BLW AND/OR UNLESS AUTH BY ATC: 1. ALL AIRCRAFT ENTERING OR EXITING THE TFR MUST BE ON A DISCRETE CODE ASSIGNED BY AN AIR TRAFFIC CONTROL (ATC) FACILITY. 4. FORT WORTH ARTCC, TELEPHONE 817-858-7503, IS THE FAA COORDINATION FACILITY. 2611010700-2703140800</txtDescrTraditional>",
        );
        assert_eq!(
            facility(&n),
            Some(Contact { name: "Fort Worth ARTCC".to_owned(), phone: Some("817-858-7503".to_owned()), frequency: None })
        );
        assert_eq!(contact(&n), None);
    }

    #[test]
    fn its_own_fields_come_first() {
        // FDC 6/7137, a fire's (91.137(a)(1)), 2026-11-12.
        let n = not(
            "<txtNameCoordFacility>DENVER</txtNameCoordFacility><codeCoordFacilityType>ARTCC</codeCoordFacilityType><txtAddrCoordPhone>303-651-4248</txtAddrCoordPhone><txtNamePOC>GREAT PLAINS INTERAGENCY DISPATCH CENTER</txtNamePOC><txtAddrPOCPhone>605-399-3160</txtAddrPOCPhone><valFreqPOC>120.675</valFreqPOC>",
        );
        assert_eq!(facility(&n).map(|c| (c.name, c.phone)), Some(("Denver ARTCC".to_owned(), Some("303-651-4248".to_owned()))));
        assert_eq!(
            contact(&n),
            Some(Contact {
                name: "Great Plains Interagency Dispatch Center".to_owned(),
                phone: Some("605-399-3160".to_owned()),
                frequency: Some("120.675".to_owned())
            })
        );
        // None named: nothing guessed.
        assert_eq!(facility(&not("<txtDescrTraditional>!FDC 6/1 ZFW TX..AIRSPACE.</txtDescrTraditional>")), None);
    }
}
