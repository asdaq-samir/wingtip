//! What a NOTAM's text keeps in capitals when faa_words sets the FAA's
//! capitals in sentence case (CLAUDE.md's "with its codes kept"), told by
//! the NOTAM's own forms rather than by a list of every ident: a NOTAM
//! given whole is a raw report, read as sent; inside the FAA's other
//! capital text, a slashed code (U/S, KZAU/QICAS), the field a distance
//! and bearing are measured from (4.6NM SSE MSN) and a lone ident in
//! brackets ((OSH)) stay as written. The forms are the NOTAM systems': the
//! domestic NOTAM's "!" head and its validity, yymmddhhmm-yymmddhhmm with
//! EST for an estimated end, or PERM (FAA JO 7930.2, Notices to Air
//! Missions), and the ICAO NOTAM's series, number and year and
//! NOTAMN/R/C (ICAO Doc 10066, PANS-AIM, the NOTAM format), as the shared
//! fixtures hold them (apps/web/src/lib/fixtures/notamRead.json).

use crate::faa_case::js_space;

/// Whether the text is a NOTAM given whole, which is a raw report and
/// stays as sent: one in the ICAO form ("A3400/26 NOTAMN Q) KZAU/QICAS/..."),
/// one with its domestic head ("!MSN 10/060 MSN ..."), or a domestic
/// NOTAM's body that still ends in its validity ("... U/S
/// 2611080154-2703080154"), as a list shows it with its head taken off.
pub(crate) fn whole_notam(text: &str) -> bool {
    let t = text.trim_matches(js_space);
    let mut words = t.split(js_space).filter(|w| !w.is_empty());
    let first = words.next().unwrap_or("");
    let domestic_head =
        first.len() > 1 && first.starts_with('!') && first[1..].bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit());
    let icao_head = icao_number(first) && words.next().is_some_and(|w| matches!(w, "NOTAMN" | "NOTAMR" | "NOTAMC"));
    let last = t.rsplit(js_space).next().unwrap_or("");
    domestic_head || icao_head || validity(last)
}

/// An ICAO NOTAM's series letter, four figures, a slash and the year's
/// two: "A3400/26".
fn icao_number(w: &str) -> bool {
    let b = w.as_bytes();
    b.len() == 8
        && b[0].is_ascii_uppercase()
        && b[1..5].iter().all(u8::is_ascii_digit)
        && b[5] == b'/'
        && b[6..].iter().all(u8::is_ascii_digit)
}

/// A domestic NOTAM's validity: its start, a hyphen, and its end or PERM,
/// each time ten figures (yymmddhhmm), an estimated end marked EST.
fn validity(w: &str) -> bool {
    let figures = |s: &str| s.len() == 10 && s.bytes().all(|b| b.is_ascii_digit());
    let Some((from, to)) = w.split_once('-') else { return false };
    figures(from) && (to == "PERM" || figures(to.strip_suffix("EST").unwrap_or(to)))
}

/// The length of a slashed code starting at `i` -- letters, a slash,
/// letters, as many times as written, each part five letters at most:
/// U/S, KZAU/QICAS, N/A -- or None. A part followed by a hyphen is left to
/// the designators' rule (VOR/DME-C), and a word as long as SUNRISE in
/// SUNRISE/SUNSET is a word, not a code.
pub(crate) fn slashed_code(c: &[char], i: usize) -> Option<usize> {
    let mut j = i;
    let mut parts = 0;
    loop {
        let start = j;
        while j < c.len() && c[j].is_ascii_uppercase() {
            j += 1;
        }
        if j == start || j - start > 5 {
            return None;
        }
        parts += 1;
        if c.get(j) == Some(&'/') && c.get(j + 1).is_some_and(char::is_ascii_uppercase) {
            j += 1;
        } else {
            break;
        }
    }
    let edge_after = c.get(j).is_none_or(|&n| !(n.is_ascii_alphanumeric() || matches!(n, '_' | '-')));
    (parts > 1 && edge_after).then_some(j - i)
}

/// The sixteen points of the compass a NOTAM gives a bearing in.
pub(crate) fn compass_point(w: &str) -> bool {
    matches!(w, "N" | "NNE" | "NE" | "ENE" | "E" | "ESE" | "SE" | "SSE" | "S" | "SSW" | "SW" | "WSW" | "W" | "WNW" | "NW" | "NNW")
}

/// Whether the word at `i..j` is an ident by where it stands: the place a
/// distance and bearing are measured from ("4.6NM SSE MSN", "1.2 NM SE OF
/// OSH" is a sentence and is not), or an ident alone in brackets, three
/// or four letters ("(OSH)").
pub(crate) fn ident_by_place(c: &[char], i: usize, j: usize) -> bool {
    let len = j - i;
    // The few words a bearing is written before in a sentence, "3NM S OF
    // THE FIELD", are words.
    let word: String = c[i..j].iter().collect();
    if !(2..=5).contains(&len) || matches!(word.as_str(), "OF" | "TO" | "AND" | "OR" | "THE" | "FROM") {
        return false;
    }
    let bracketed = i > 0 && c[i - 1] == '(' && c.get(j) == Some(&')') && (3..=4).contains(&len);
    bracketed || after_distance_and_bearing(&c[..i].iter().collect::<String>())
}

/// Whether the text ends with a distance in nautical miles and a compass
/// point, and a space: "(9.4NM S ".
fn after_distance_and_bearing(before: &str) -> bool {
    if !before.ends_with(js_space) {
        return false;
    }
    let mut back = before.split(js_space).rev().filter(|w| !w.is_empty());
    let (Some(point), Some(distance)) = (back.next(), back.next()) else { return false };
    let distance = distance.trim_start_matches('(');
    compass_point(point) && distance.strip_suffix("NM").is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit() || b == b'.'))
}
