//! Places said aloud, found as idents, the one matcher: the planner asks
//! it (`clearance_places`, spoken_ask.rs) with the places it finds near
//! the route and nationwide, and the native app in the air with no signal
//! (`hear`) among the places the phone keeps: the airports, navaids and
//! fixes of each region it holds a pack of (crate::pack_query,
//! wingtip.cycle_pack's `write_phone`). Offline, a place outside the kept
//! regions is not found, and is said so. The places are always given:
//! nothing here fetches them.
//!
//! - A navaid by its name: "Gopher" is GEP (NASR NAV_BASE's NAME).
//! - A fix said as a word, by its sound among those near the route:
//!   PYKLA as "pickla", unsure until the pilot has read it.
//! - An airport by its name followed by "airport" (AIM 4-4-3 a).
//! - Anything spelled in the phonetic alphabet by its ident.
//!
//! The SIDs and STARs are the CIFP's, which no pack holds: offline they
//! are shown as said, not found; the planner gives a field's own.

use crate::clearance::{Found, FoundPlaces};
use crate::pack::Pack;
use crate::{field_name::field_name, json, sort::StableSort};

/// A place a clearance may name.
#[derive(Clone, Debug, PartialEq)]
pub struct Place {
    pub ident: String,
    pub name: Option<String>,
    /// "airport", "navaid" or "fix".
    pub what: &'static str,
    pub lat: f64,
    pub lon: f64,
}

/// How alike two sounds must be for a sound-alike fix to be offered.
pub(crate) const ALIKE: f64 = 0.75;

fn kind_word(w: &str) -> Option<&'static str> {
    Some(match w {
        "airport" | "field" | "international" | "regional" | "municipal" => "airport",
        "vor" | "vortac" | "tacan" | "dme" | "ndb" | "beacon" => "navaid",
        "intersection" | "waypoint" | "fix" => "fix",
        _ => return None,
    })
}

const FILLER: &[&str] = &["the", "a", "an", "of", "and", "to"];

pub(crate) fn letters_upper(word: &str) -> String {
    word.to_uppercase().chars().filter(|c| c.is_ascii_uppercase()).collect()
}

/// A word's sound as its consonants: its first letter (any vowel as A),
/// then each consonant sound once -- "pickla" and PYKLA are one sound.
pub fn sound(word: &str) -> String {
    let mut s = letters_upper(word);
    if s.is_empty() {
        return s;
    }
    for (spelled, said) in [
        ("PH", "F"),
        ("CK", "K"),
        ("GH", "G"),
        ("SCH", "SK"),
        ("TH", "T"),
        ("WR", "R"),
        ("KN", "N"),
        ("X", "KS"),
        ("Q", "K"),
        ("Z", "S"),
        ("C", "K"),
        ("DG", "J"),
    ] {
        s = s.replace(spelled, said);
    }
    let mut chars = s.chars();
    let first = chars.next().unwrap();
    let mut out = String::from(if "AEIOUY".contains(first) { 'A' } else { first });
    for ch in chars {
        if "AEIOUYHW".contains(ch) || out.ends_with(ch) {
            continue;
        }
        out.push(ch);
    }
    out
}

/// A word's sound with its vowels kept as one: "pickla" and PYKLA are
/// both PAKLA, where PCKLE is PKLA.
pub fn spelled(word: &str) -> String {
    let mut s = letters_upper(word);
    for (spelled, said) in [("PH", "F"), ("CK", "K"), ("GH", "G"), ("X", "KS"), ("Q", "K"), ("Z", "S"), ("C", "K")] {
        s = s.replace(spelled, said);
    }
    s = s.replace(['H', 'W'], "");
    let mut out = String::new();
    let mut vowels = false;
    for ch in s.chars() {
        if "AEIOUY".contains(ch) {
            if !vowels {
                out.push('A');
            }
            vowels = true;
        } else {
            out.push(ch);
            vowels = false;
        }
    }
    let mut squeezed = String::new();
    for ch in out.chars() {
        if !squeezed.ends_with(ch) {
            squeezed.push(ch);
        }
    }
    squeezed
}

/// How alike two sounds are, 0 to 1: twice the letters they share in
/// order over both lengths (the `similar` crate's diff ratio, as Python's
/// difflib gives it but from the longest common subsequence).
pub fn ratio(a: &str, b: &str) -> f64 {
    let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let total = a.len() + b.len();
    if total == 0 {
        return 1.0;
    }
    let ops = similar::capture_diff_slices(similar::Algorithm::Myers, &a, &b);
    // Counted here, in f64: similar's own diff_ratio is an f32.
    let shared: usize = ops.iter().map(|op| if let similar::DiffOp::Equal { len, .. } = op { *len } else { 0 }).sum();
    2.0 * shared as f64 / total as f64
}

pub(crate) fn alike(a: &str, b: &str) -> f64 {
    ratio(&sound(a), &sound(b))
}

fn closer(a: &str, b: &str) -> f64 {
    ratio(&spelled(a), &spelled(b))
}

/// The words of a point as said, and the kind its last word asks for.
pub fn words_of(said: &str) -> (Vec<String>, Option<&'static str>) {
    let lower = said.to_lowercase();
    let mut words: Vec<String> = lower
        .split(|c: char| !(c.is_ascii_lowercase() || c.is_ascii_digit() || c == '\''))
        .filter(|w| !w.is_empty() && !FILLER.contains(w))
        .map(str::to_owned)
        .collect();
    let mut kind = None;
    while let Some(k) = words.last().and_then(|w| kind_word(w)) {
        kind = kind.or(Some(k));
        words.pop();
    }
    (words, kind)
}

/// A name as words, its marks gone: "WILKES BARRE" for Wilkes-Barre.
pub fn name_words(name: &str) -> String {
    name.to_uppercase()
        .split(|c: char| !(c.is_ascii_uppercase() || c.is_ascii_digit() || c == '\''))
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn row(said: &str, p: &Place, sure: bool) -> Found {
    Found {
        said: said.to_owned(),
        ident: Some(p.ident.clone()),
        name: p.name.clone(),
        kind: Some(p.what),
        lat: Some(p.lat),
        lon: Some(p.lon),
        sure,
    }
}

/// The airport an airport's name said is, the nearest first (`places` in
/// order of nearness): one whose name holds the words, or fewer of them,
/// the longest run first.
fn airport_named<'a>(words: &[String], places: &'a [Place]) -> Option<&'a Place> {
    for n in (1..=words.len()).rev() {
        for i in 0..=words.len() - n {
            let run = words[i..i + n].join(" ").to_uppercase();
            if n == 1 && run.len() < 4 {
                continue;
            }
            let hit = places.iter().find(|p| {
                p.what == "airport" && p.name.as_deref().is_some_and(|name| format!(" {} ", name_words(name)).contains(&format!(" {run} ")))
            });
            if hit.is_some() {
                return hit;
            }
        }
    }
    None
}

/// The place `said` names among `places`, the nearest to the route first,
/// or `airport`, the field the planner's search found for an airport's
/// name said (nationwide, beyond the places near the route); None where
/// nothing is near enough.
pub fn point(said: &str, places: &[Place], airport: Option<&Place>) -> Option<Found> {
    let (words, kind) = words_of(said);
    if words.is_empty() {
        return None;
    }
    let joined = words.concat().to_uppercase();
    let spaced = words.join(" ").to_uppercase();
    let wanted: Vec<&Place> = places.iter().filter(|p| kind.is_none_or(|k| p.what == k)).collect();
    let exact: Vec<&&Place> = wanted.iter().filter(|p| p.ident.to_uppercase() == joined).collect();
    if let Some(p) = exact.first()
        && p.what != "fix"
    {
        return Some(row(said, p, true));
    }
    if kind == Some("airport")
        && let Some(a) = airport.or_else(|| airport_named(&words, places))
    {
        return Some(row(said, a, true));
    }
    if let Some(p) = wanted.iter().find(|p| p.name.as_deref().is_some_and(|n| name_words(n) == spaced)) {
        return Some(row(said, p, true));
    }
    if let Some(p) = exact.first() {
        return Some(row(said, p, true));
    }
    // An airport's name said short with no "airport": "cleared to Duluth".
    if let Some(a) =
        airport.filter(|a| kind.is_none_or(|k| k == "airport") && name_words(a.name.as_deref().unwrap_or("")).starts_with(&spaced))
    {
        return Some(row(said, a, true));
    }
    if words.len() != 1 {
        return None;
    }
    let mut scored: Vec<(f64, f64, &Place)> = wanted
        .iter()
        .filter(|p| p.what != "airport")
        .map(|p| (alike(&joined, &p.ident).max(alike(&joined, p.name.as_deref().unwrap_or(""))), closer(&joined, &p.ident), *p))
        .collect();
    // Stable, as Python's sorted: of equals, the nearer stays first.
    scored.stable_sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap().then(b.1.partial_cmp(&a.1).unwrap()));
    match scored.first() {
        Some((s, _, p)) if *s >= ALIKE => Some(row(said, p, false)),
        _ => None,
    }
}

/// The places a run of words names one after another, the longest names
/// first; a word that names nothing kept, unfound.
pub fn points(said: &str, places: &[Place]) -> Vec<Found> {
    let (words, _) = words_of(said);
    let mut out = Vec::new();
    let mut i = 0;
    while i < words.len() {
        let mut took = false;
        for j in (i + 1..=words.len()).rev() {
            if let Some(found) = point(&words[i..j].join(" "), places, None)
                && (found.sure || j == i + 1)
            {
                out.push(found);
                i = j;
                took = true;
                break;
            }
        }
        if !took {
            out.push(Found { said: words[i].clone(), ..Found::default() });
            i += 1;
        }
    }
    out
}

/// The places a clearance named, found among `places`: its limit and each
/// run of its route. No SID or STAR: the CIFP is not in a pack.
pub fn find(limit: Option<&str>, runs: &[&str], places: &[Place]) -> FoundPlaces {
    FoundPlaces {
        limit: limit.map(|l| point(l, places, None).unwrap_or(Found { said: l.to_owned(), ..Found::default() })),
        route: runs.iter().map(|r| points(r, places)).collect(),
        departure: None,
        arrival: None,
    }
}

/// The navaid kinds a route flies over, as wingtip.fixes keeps them.
const NAVAID_KINDS: &[&str] = &["VORTAC", "VOR/DME", "VOR", "DME", "TACAN", "NDB/DME", "NDB"];

mod places;
pub use places::*;

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn place(ident: &str, name: Option<&str>, what: &'static str, lat: f64, lon: f64) -> Place {
        Place { ident: ident.into(), name: name.map(Into::into), what, lat, lon }
    }

    /// Round KMSP and KDLH, as NASR names them.
    pub(crate) fn places() -> Vec<Place> {
        vec![
            place("GEP", Some("Gopher"), "navaid", 45.15, -93.37),
            place("DLH", Some("Duluth"), "navaid", 46.80, -92.20),
            place("FSD", Some("Sioux Falls"), "navaid", 43.65, -96.78),
            place("PYKLA", None, "fix", 46.83, -91.85),
            place("KVUSI", None, "fix", 45.8, -92.9),
            place("BUNYN", None, "fix", 45.3, -93.1),
            place("KDLH", Some("Duluth International Airport"), "airport", 46.84, -92.19),
        ]
    }

    #[test]
    fn a_sound_is_its_consonants() {
        assert_eq!(sound("pickla"), "PKL");
        assert_eq!(sound("PYKLA"), "PKL");
        assert_eq!(sound("bunyan"), sound("BUNYN"));
        assert_eq!(sound("snows"), sound("SNOWZ"));
        assert_eq!(sound("ohana"), sound("OANNA"));
        assert_eq!(spelled("pickla"), "PAKLA");
        assert_eq!(spelled("PCKLE"), "PKLA");
    }

    #[test]
    fn ratio_is_twice_the_shared_letters_over_both_lengths() {
        // As difflib.SequenceMatcher(None, a, b).ratio() gives these.
        assert!((ratio("PKL", "PKL") - 1.0).abs() < 1e-12);
        assert!((ratio("ABCD", "BCDA") - 0.75).abs() < 1e-12);
        assert!((ratio("PAKLA", "PKLA") - 8.0 / 9.0).abs() < 1e-12);
        assert_eq!(ratio("", "X"), 0.0);
    }

    #[test]
    fn an_ident_or_a_name_is_found_outright() {
        assert_eq!(point("GEP", &places(), None).unwrap().ident.as_deref(), Some("GEP"));
        let g = point("the Gopher VOR", &places(), None).unwrap();
        assert_eq!((g.ident.as_deref(), g.kind, g.sure), (Some("GEP"), Some("navaid"), true));
        assert_eq!(point("Sioux Falls", &places(), None).unwrap().ident.as_deref(), Some("FSD"));
    }

    #[test]
    fn a_fix_said_as_a_word_is_found_by_its_sound_unsure() {
        let f = point("pickla", &places(), None).unwrap();
        assert_eq!((f.ident.as_deref(), f.sure), (Some("PYKLA"), false));
        let mut more = vec![place("PCKLE", None, "fix", 46.9, -91.9)];
        more.extend(places());
        assert_eq!(point("pickla", &more, None).unwrap().ident.as_deref(), Some("PYKLA"));
        assert!(point("zebra", &places(), None).is_none());
    }

    #[test]
    fn airport_after_a_name_is_the_field() {
        // AIM 4-4-3 a: an airport and its navaid often share a name.
        assert_eq!(point("the Duluth airport", &places(), None).unwrap().ident.as_deref(), Some("KDLH"));
        assert_eq!(point("Duluth", &places(), None).unwrap().ident.as_deref(), Some("DLH"));
    }

    #[test]
    fn a_route_with_no_commas_is_its_places_in_order() {
        let found = points("Gopher Sioux Falls pickla wibble", &places());
        let idents: Vec<_> = found.iter().map(|f| f.ident.clone()).collect();
        assert_eq!(idents, vec![Some("GEP".into()), Some("FSD".into()), Some("PYKLA".into()), None]);
        assert_eq!(found[3].said, "wibble");
    }

    #[test]
    fn a_navaids_name_comes_before_a_fix_spelled_as_the_word() {
        let p = vec![
            place("FLINT", None, "fix", 43.0, -83.7),
            place("FNT", Some("Flint"), "navaid", 42.97, -83.74),
            place("LVZ", Some("Wilkes-Barre"), "navaid", 41.27, -75.69),
        ];
        assert_eq!(point("Flint", &p, None).unwrap().ident.as_deref(), Some("FNT"));
        assert_eq!(point("flint intersection", &p, None).unwrap().ident.as_deref(), Some("FLINT"));
        let idents: Vec<_> = points("Wilkes Barre Flint", &p).into_iter().map(|f| f.ident).collect();
        assert_eq!(idents, vec![Some("LVZ".into()), Some("FNT".into())]);
    }

    #[test]
    fn names_are_titled_as_python_titles_them() {
        assert_eq!(title("SIOUX FALLS"), "Sioux Falls");
        assert_eq!(title("WILKES-BARRE"), "Wilkes-Barre");
    }
}
