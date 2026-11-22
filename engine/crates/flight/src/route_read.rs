//! A route typed as a pilot writes one, read back: the words of item 15 of
//! FAA Form 7233-4 (AIM Appendix 4) that filing.rs writes, so a pilot can
//! type or paste "KPWK DCT OBK V100 KLAS" or "N0110A065 KPWK V100 KLAS" into
//! the route's one field (the FPL redesign, the owner 2026-11-17: one route
//! field for both kinds of pilot). What is a point, an airway or a
//! procedure is the caller's (the web's routeEdit reads idents, airways and
//! SIDs and STARs); this takes out what is not a point -- DCT, the speed
//! and level groups -- and reads the levels.

use wingtip_core::json;

/// A cruising speed and level group's level (AIM Appendix 4, item 15):
/// "A" and the altitude in hundreds of feet in three figures ("A045" is
/// 4,500 ft), "F" and a flight level in three figures ("F180" is FL180,
/// 18,000 ft on 29.92, 14 CFR 1.1 and 91.121(a)(2)), "VFR" for a VFR
/// level (no figure). Metric levels ("S1130", "M0840") are not used in
/// the US and are not read.
fn level_ft(word: &str) -> Option<Option<f64>> {
    if word == "VFR" {
        return Some(None);
    }
    let (kind, figures) = word.split_at_checked(1)?;
    if !matches!(kind, "A" | "F") || figures.len() != 3 || !figures.bytes().all(|c| c.is_ascii_digit()) {
        return None;
    }
    figures.parse::<f64>().ok().map(|h| Some(h * 100.0))
}

/// A cruising speed (AIM Appendix 4, item 15): "N" and knots in four
/// figures ("N0110"), the true airspeed. Kilometres an hour ("K") and Mach
/// ("M") are read as present but give no knots here.
fn speed_kt(word: &str) -> Option<Option<f64>> {
    let (kind, figures) = word.split_at_checked(1)?;
    let digits = figures.bytes().all(|c| c.is_ascii_digit());
    match kind {
        "N" if figures.len() == 4 && digits => figures.parse::<f64>().ok().map(Some),
        "K" if figures.len() == 4 && digits => Some(None),
        "M" if figures.len() == 3 && digits => Some(None),
        _ => None,
    }
}

/// A speed and level group whole ("N0110A045", "N0110VFR"): its knots and
/// its level, each None where not given in knots or not a figure.
fn group(word: &str) -> Option<(Option<f64>, Option<f64>)> {
    for split in [4, 5] {
        if let (Some(speed), Some(level)) = (word.get(..split), word.get(split..))
            && let (Some(kt), Some(ft)) = (speed_kt(speed), level_ft(level))
        {
            return Some((kt, ft));
        }
    }
    None
}

/// What a typed route says.
#[derive(Debug, PartialEq)]
pub struct Read {
    /// Its points, airways and procedures in order, as typed, upper case:
    /// DCT and the speed and level groups taken out.
    pub points: Vec<String>,
    /// The cruise's level from the group at its start, feet; None where none
    /// was given or it is VFR's.
    pub cruise_ft: Option<f64>,
    pub tas_kt: Option<f64>,
    /// Where it changes on the way ("LEXOR/N0467F380"): the point and the
    /// level from there, feet.
    pub changes: Vec<(String, f64)>,
}

/// A route typed as words: split on spaces and commas, DCT (direct, AIM
/// Appendix 4) dropped, a speed and level group or a level alone read as
/// the cruise's where it comes before any point, and a point written with a
/// group after its stroke ("LEXOR/N0467F380", item 15's change of speed or
/// level) the point, the level a change from there.
pub fn read(text: &str) -> Read {
    let mut out = Read { points: Vec::new(), cruise_ft: None, tas_kt: None, changes: Vec::new() };
    for word in text.split(|c: char| c.is_whitespace() || c == ',').filter(|w| !w.is_empty()) {
        let word = word.to_ascii_uppercase();
        if word == "DCT" {
            continue;
        }
        if let Some((point, change)) = word.split_once('/')
            && let Some((_, Some(ft))) = group(change)
        {
            out.changes.push((point.to_owned(), ft));
            out.points.push(point.to_owned());
            continue;
        }
        let read = group(&word).or_else(|| level_ft(&word).map(|ft| (None, ft)));
        match read {
            Some((kt, ft)) if out.points.is_empty() => {
                out.tas_kt = out.tas_kt.or(kt);
                out.cruise_ft = out.cruise_ft.or(ft);
            }
            Some(_) => {}
            None => out.points.push(word),
        }
    }
    out
}

/// The answer's JSON: {"points": [...], "cruise_ft", "tas_kt", "changes": [{"at", "ft"}]}.
pub fn write(r: &Read, out: &mut String) {
    out.push_str("{\"points\":[");
    for (i, p) in r.points.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(out, p);
    }
    out.push_str("],\"cruise_ft\":");
    json::opt_number(out, r.cruise_ft);
    out.push_str(",\"tas_kt\":");
    json::opt_number(out, r.tas_kt);
    out.push_str(",\"changes\":[");
    for (i, (at, ft)) in r.changes.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"at\":");
        json::string(out, at);
        out.push_str(",\"ft\":");
        json::number(out, *ft);
        out.push('}');
    }
    out.push_str("]}");
}

/// A SID's or a STAR's name as a route is written with one -- a
/// clearance's, a filed flight plan's (AIM Appendix 4, item 15: the
/// procedure's computer code; "KMSP BAEE1 BAE V191 OSH OSHH2 KATW") --
/// four or five letters and its number. No airport's identifier is that
/// long (FAA JO 7350.9's location identifiers: three or four characters)
/// and no fix's has a figure in it (five-letter names, JO 7350.9), so it is
/// neither: the one test the web's route box and the iPhone's Type Route
/// both read a typed route by.
pub fn is_procedure(word: &str) -> bool {
    let b = word.as_bytes();
    matches!(b.len(), 5 | 6) && b[..b.len() - 1].iter().all(u8::is_ascii_uppercase) && b[b.len() - 1].is_ascii_digit()
}

/// The SIDs and STARs among a route's words (is_procedure), each with the
/// points typed either side of it, the nearest that is not a procedure: a
/// departure's transition is the fix after it, an arrival's the fix before
/// it (AIM 5-2-9's departure and 5-4-1's arrival transitions).
pub fn procedures(words: &[&str]) -> Vec<(String, Option<String>, Option<String>)> {
    let point = |w: &&&str| !is_procedure(w);
    words
        .iter()
        .enumerate()
        .filter(|(_, w)| is_procedure(w))
        .map(|(i, w)| {
            let before = words[..i].iter().rev().find(point).map(|w| (*w).to_owned());
            let after = words[i + 1..].iter().find(point).map(|w| (*w).to_owned());
            ((*w).to_owned(), before, after)
        })
        .collect()
}

/// `route_procedures`'s answer: [{"name", "before", "after"}].
pub fn write_procedures(list: &[(String, Option<String>, Option<String>)], out: &mut String) {
    out.push('[');
    for (i, (name, before, after)) in list.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"name\":");
        json::string(out, name);
        out.push_str(",\"before\":");
        json::opt_string(out, before.as_deref());
        out.push_str(",\"after\":");
        json::opt_string(out, after.as_deref());
        out.push('}');
    }
    out.push(']');
}

#[cfg(test)]
mod tests {
    use super::*;

    fn points(r: &Read) -> Vec<&str> {
        r.points.iter().map(String::as_str).collect()
    }

    #[test]
    fn a_route_as_typed() {
        let r = read("kpwk V100 KLAS");
        assert_eq!(points(&r), ["KPWK", "V100", "KLAS"]);
        assert_eq!((r.cruise_ft, r.tas_kt), (None, None));
        // AIM Appendix 4's direct and procedure words: DCT out, the rest kept.
        assert_eq!(points(&read("DALL3 EIC V18 MEI DCT LGC LGC4")), ["DALL3", "EIC", "V18", "MEI", "LGC", "LGC4"]);
        assert_eq!(points(&read("FLACK  DCT,IRW")), ["FLACK", "IRW"]);
    }

    #[test]
    fn the_cruise_from_item_15s_group() {
        let r = read("N0110A065 KPWK OBK V100 KLAS");
        assert_eq!(points(&r), ["KPWK", "OBK", "V100", "KLAS"]);
        assert_eq!((r.cruise_ft, r.tas_kt), (Some(6_500.0), Some(110.0)));
        // A level alone, a flight level, VFR.
        assert_eq!(read("A045 KMSN KDPA").cruise_ft, Some(4_500.0));
        assert_eq!(read("N0450F350 KORD J146 KDEN").cruise_ft, Some(35_000.0));
        let vfr = read("N0105VFR KMSN KDPA");
        assert_eq!((vfr.cruise_ft, vfr.tas_kt), (None, Some(105.0)));
        // After the first point, a group alone is not the cruise's.
        assert_eq!(read("KMSN A045 KDPA").cruise_ft, None);
        // Not groups: an airport or a fix with the same letters.
        assert_eq!(points(&read("A04 F35 KA045")), ["A04", "F35", "KA045"]);
    }

    #[test]
    fn a_change_on_the_way() {
        // AIM Appendix 4: "LEXOR/N0467F380".
        let r = read("N0450F350 KORD LEXOR/N0467F380 KDEN");
        assert_eq!(points(&r), ["KORD", "LEXOR", "KDEN"]);
        assert_eq!(r.changes, [("LEXOR".to_owned(), 38_000.0)]);
        // A pilot's own point is not a change ("VPBNG/095/14.2").
        assert_eq!(points(&read("KMSN VPBNG/095/14.2 KDPA")), ["KMSN", "VPBNG/095/14.2", "KDPA"]);
    }

    #[test]
    fn written_as_json() {
        let mut out = String::new();
        write(&read("A055 KMSN LEXOR/N0110A075 KDPA"), &mut out);
        assert_eq!(
            out,
            "{\"points\":[\"KMSN\",\"LEXOR\",\"KDPA\"],\"cruise_ft\":5500.0,\"tas_kt\":null,\"changes\":[{\"at\":\"LEXOR\",\"ft\":7500.0}]}"
        );
    }

    #[test]
    fn names_the_sids_and_stars_with_the_points_beside_them() {
        assert!(["BAEE1", "OSHH2", "KAYYS3"].iter().all(|w| is_procedure(w)));
        assert!(!["C81", "KATW", "CORIR", "V191", "1C5", "BAEE12", "baee1"].iter().any(|w| is_procedure(w)));
        let words = ["KMSP", "BAEE1", "BAE", "V191", "OSH", "OSHH2", "KATW"];
        let found = procedures(&words);
        assert_eq!(
            found,
            vec![
                ("BAEE1".to_owned(), Some("KMSP".to_owned()), Some("BAE".to_owned())),
                ("OSHH2".to_owned(), Some("OSH".to_owned()), Some("KATW".to_owned())),
            ]
        );
        assert_eq!(procedures(&["OSHH2"]), vec![("OSHH2".to_owned(), None, None)]);
    }
}
