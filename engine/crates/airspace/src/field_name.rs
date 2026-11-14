//! A field's name as every app writes it: NASR APT_BASE's ARPT_NAME, in
//! capitals ("SIERRA VISTA MUNI-LIBBY AAF"), title-cased as Python's
//! str.title() does (spoken::title: "Sierra Vista Muni-Libby") but with the
//! FAA's codes kept in capitals (CLAUDE.md, Writing: the FAA's text with
//! its codes kept; the coordinator's list, 2026-11-13): the armed
//! services' field types and the like, which are read letter by letter.
//! Words the FAA abbreviates but a pilot reads as words (Muni, Intl, Rgnl)
//! stay title case. One copy: the phones' packs (view, spoken) and the
//! planner (wingtip.field_use, through `airport_names`) name a field alike.

use crate::json::{self, Value};

/// The codes kept in capitals: Army Air Field, Air Force Base, Army
/// Heliport, Air National Guard Base, Air Reserve Base, Joint Reserve
/// Base, Marine Corps Air Station and Facility, Naval Air Station and
/// Facility, Naval Air Weapons Station, Naval Outlying Landing Field,
/// Outlying Landing Field, the Air Force, the Coast Guard, Coast Guard Air
/// Station, and a company's LLC.
const CODES: [&str; 17] =
    ["AAF", "AFB", "AHP", "ANGB", "ARB", "JRB", "MCAS", "MCAF", "NAS", "NAF", "NAWS", "NOLF", "OLF", "USAF", "USCG", "CGAS", "LLC"];

/// "SIERRA VISTA MUNI-LIBBY AAF" as "Sierra Vista Muni-Libby AAF".
pub fn field_name(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut word = String::new();
    let flush = |word: &mut String, out: &mut String| {
        if CODES.iter().any(|c| c.eq_ignore_ascii_case(word)) {
            out.push_str(&word.to_uppercase());
        } else {
            out.push_str(&crate::spoken::title(word));
        }
        word.clear();
    };
    for c in s.chars() {
        if c.is_alphabetic() {
            word.push(c);
        } else {
            flush(&mut word, &mut out);
            out.push(c);
        }
    }
    flush(&mut word, &mut out);
    out
}

/// `airport_names`: `{"names": [...]}` written as `field_name` writes each.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let names = v.get("names").and_then(Value::as_array).ok_or_else(|| format!("{name}: \"names\" is missing or not a list"))?;
    let mut out = String::from("[");
    for (i, n) in names.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(&mut out, &field_name(n.as_str().ok_or_else(|| format!("{name}: \"names\" holds a non-string"))?));
    }
    out.push(']');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_faas_codes_are_kept_and_the_words_title_cased() {
        // NASR 2026-10-29's ARPT_NAMEs.
        assert_eq!(field_name("SIERRA VISTA MUNI-LIBBY AAF"), "Sierra Vista Muni-Libby AAF");
        assert_eq!(field_name("MAXWELL AFB"), "Maxwell AFB");
        assert_eq!(field_name("BARIN NOLF"), "Barin NOLF");
        assert_eq!(field_name("CHICAGO O'HARE INTL"), "Chicago O'Hare Intl");
        assert_eq!(field_name("DONALD ALFRED GADE"), "Donald Alfred Gade");
        // A code only as a whole word: NASHVILLE is no NAS.
        assert_eq!(field_name("NASHVILLE INTL"), "Nashville Intl");
    }
}
