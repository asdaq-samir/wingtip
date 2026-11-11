//! A NOTAM in our own words, on four lines (notam_read's `what`, `where`
//! and `why`; its window is the fourth): what it is and its condition,
//! where it is on the field, and what it means to the pilot. The owner,
//! 2026-11-11: "reformat the notam a bit in our own words: title(what),
//! when, where, why (significance to pilot) on different lines".
//!
//! Each is said only where the NOTAM's subject words (FAA Order JO 7930.2
//! 1-2-1: the keyword and the words straight after it, notam_subject's
//! reading) say all of it; otherwise None, and the NOTAM's words written
//! out (notam_read's `words`) stand in for the what. A why is given only
//! where the consequence is a settled rule or a plain fact, its source
//! beside it; anything else has none, never a guess.

use super::body::{grouped, is_taxiway};
use super::NotamRead;
use crate::contractions::compass;
use crate::notam_subject::parts::{condition, designations, is_fuel, lamp_of, Lamp};
use crate::notam_subject::subject_of;

#[derive(Debug, Default, PartialEq)]
pub struct Four {
    pub what: Option<String>,
    pub place: Option<String>,
    pub why: Option<String>,
}

/// The condition in our words, in lower case ("closed", "out of service").
fn cond(words: &[String]) -> Option<String> {
    condition(words).map(str::to_ascii_lowercase)
}

/// "BTN TWY A AND TWY B" (3-3-6) as "between taxiway A and taxiway B";
/// None where the words after BTN are not two places it knows.
fn between(words: &[String]) -> Option<(String, usize)> {
    if words.first().is_none_or(|w| w != "BTN") {
        return None;
    }
    let one = |at: usize| -> Option<(String, usize)> {
        let (kind, d) = (words.get(at)?.as_str(), words.get(at + 1)?);
        let named = match kind {
            "TWY" if is_taxiway(d) => "taxiway",
            "RWY" if designations(std::slice::from_ref(d)).1 == 1 => "runway",
            "GATE" => "gate",
            _ => return None,
        };
        Some(([named, " ", d].concat(), at + 2))
    };
    let (a, at) = one(1)?;
    if words.get(at).is_none_or(|w| w != "AND") {
        return None;
    }
    let (b, end) = one(at + 1)?;
    Some((["between ", &a, " and ", &b].concat(), end))
}

/// A runway's NOTAM (RWY).
fn runway(body: &[String], r: &NotamRead, schedule: Option<&str>) -> Four {
    let (_, used) = designations(body);
    let named: Vec<&str> = body[..used].iter().map(String::as_str).filter(|w| *w != "AND").collect();
    let Some(title) = r.title.as_deref().filter(|_| !named.is_empty()) else { return Four::default() };
    let rwy = named.join(" and ");
    // No where: the what names the runway already, and the card is the
    // field's (the owner, 2026-11-11: "Notam of runway doesn't need a where").
    let place = None;
    let rest = &body[used..];
    if let Some(lamp) = lamp_of(&rest[..rest.len().min(1)]) {
        let Some(c) = cond(rest).filter(|_| rest.len() == 2) else { return Four { place, ..Four::default() } };
        let out = c == "out of service";
        let why = match lamp {
            // A VGSI gives visual descent guidance to the runway (AIM
            // 2-1-2): with it out there is none.
            Lamp::Papi | Lamp::Vasi if out => Some(["No visual glide path guidance to runway ", &rwy, "."].concat()),
            // An ALS is part of an approach's visual aids (AIM 2-1-1); with
            // it out the minimums may go up by the chart's inoperative
            // components note or the TPP's table (AIM 1-1-9, REFERENCE).
            Lamp::Approach(_) if out => {
                Some("Visibility minimums may be higher: see the approach chart's notes for inoperative approach lights.".to_owned())
            }
            _ => None,
        };
        return Four { what: Some([title, " ", &c].concat()), place, why };
    }
    if rest.first().is_some_and(|w| w == "CLSD") {
        // CLSD EXC XNG, EXC TAX (JO 7930.2 TBL 3-3-1): closed to landing and
        // takeoff, open to cross or to taxi on.
        let (what, open) = match &rest[1..] {
            [] => ("closed", ""),
            [e, x] if e == "EXC" && x == "XNG" => ("closed except crossing", " It may be crossed."),
            [e, x] if e == "EXC" && (x == "TAX" || x == "TAXI") => ("closed except taxiing", " It may be taxied on."),
            _ => return Four { place, ..Four::default() },
        };
        let when = schedule.map_or(String::new(), |s| [", ", s].concat());
        // A closed runway is not to be landed on or taken off from (CLSD,
        // JO 7340.2); at the times its schedule gives where it has one.
        let why = ["No landing or takeoff on it while it is closed.", open].concat();
        return Four { what: Some([title, " ", what, &when].concat()), place, why: Some(why) };
    }
    Four { place, ..Four::default() }
}

/// A taxiway's NOTAM (TWY): "Taxiway A closed between taxiway B and
/// taxiway C".
fn taxiway(body: &[String], r: &NotamRead) -> Four {
    let Some(title) = r.title.as_deref() else { return Four::default() };
    let n = body.iter().take_while(|w| *w == "AND" || is_taxiway(w)).count();
    let span = between(&body[n..]);
    let tail = span.as_ref().map_or(String::new(), |(s, _)| [" ", s.as_str()].concat());
    let after = span.as_ref().map_or(n, |(_, end)| n + end);
    let what = (body.get(after..) == Some(&["CLSD".to_owned()][..])).then(|| [title, " closed", &tail].concat());
    // No where: the what says between which, the card is the field's.
    Four { what, place: None, why: None }
}

/// A figure with FT as the app writes it: "857.9FT" as "857.9 ft".
fn feet(w: &str) -> Option<String> {
    let n = w.strip_suffix("FT")?;
    (!n.is_empty() && n.bytes().all(|b| b.is_ascii_digit() || b == b'.')).then(|| [grouped(n).as_str(), " ft"].concat())
}

/// An obstacle's NOTAM (OBST): its kind, its top MSL and above the ground
/// as it gives them ("1049FT (330FT AGL)": feet are MSL unless AGL is
/// stated, 4-2-1), its light where that is out, and where it is from the
/// field ("(1.3NM W ORD)").
fn obstacle(raw: &[String], r: &NotamRead, idents: &[String]) -> Four {
    let kind = r.title.as_deref().and_then(|t| t.strip_prefix("Obstacle: "));
    let at = raw.iter().position(|w| feet(w).is_some() && raw.iter().skip(1).any(|n| n == "AGL"));
    let msl = at.and_then(|i| feet(&raw[i]));
    let agl = at.and_then(|i| raw.get(i + 1)).and_then(|w| feet(w));
    // "TOWER LGT (ASR ...) ... U/S": the obstacle's light is what is out.
    let light_out =
        raw.get(1).is_some_and(|w| w == "LGT") && raw.last().is_some_and(|w| condition(std::slice::from_ref(w)) == Some("Out of service"));
    // The what is the thing and what is wrong with it; how high it stands
    // is where it is, beside how far from the field (the owner,
    // 2026-11-11: "Tower light altitude also counts as where, and not what
    // part of the title").
    let what = kind.filter(|k| !k.is_empty()).map(|k| {
        let k = [k[..1].to_ascii_uppercase().as_str(), &k[1..]].concat();
        [k.as_str(), if light_out { " light out of service" } else { "" }].concat()
    });
    let height = match (&msl, &agl) {
        (Some(m), Some(a)) => Some([m.as_str(), " MSL (", a, " above ground)"].concat()),
        (Some(m), None) => Some([m.as_str(), " MSL"].concat()),
        _ => None,
    };
    // "(1.3NM W ORD)": a distance, a compass point (3-3-9) and a place.
    let from_field = raw.windows(3).find_map(|p| {
        let nm = p[0].strip_suffix("NM").filter(|n| n.parse::<f64>().is_ok())?;
        let dir = compass(&p[1])?;
        let from = &p[2];
        let field_is = r.location.as_deref() == Some(from.as_str()) || idents.iter().any(|i| i == from);
        Some([nm, " nm ", dir, " of ", if field_is { "the field" } else { from }].concat())
    });
    let place = match (from_field, height) {
        (None, None) => None,
        // Not the field's name: the card is the field's (the owner,
        // 2026-11-11: "Where is only needed when it's not obvious").
        (spot, top) => Some([spot, top].into_iter().flatten().collect::<Vec<_>>().join(", ")),
    };
    // Its top MSL, which a pilot's altitude is set against (14 CFR 91.119's
    // clearances are from obstacles); its light out, a plain fact.
    let why = msl.map(|m| {
        let lit = if light_out { " Its light is out: it may be hard to see at night." } else { "" };
        ["Its top is ", &m, " MSL: keep clear of it.", lit].concat()
    });
    Four { what, place, why }
}

/// An ILS's NOTAM (NAV ILS RWY 09 GP U/S): its parts by name ("GP/LOC").
fn navaid(body: &[String], r: &NotamRead) -> Four {
    let Some(title) = r.title.as_deref() else { return Four::default() };
    let ils = body.first().is_some_and(|w| w == "ILS") && body.get(1).is_some_and(|w| w == "RWY");
    let c = cond(body);
    if !ils {
        return Four { what: c.map(|c| [title, " ", &c].concat()), ..Four::default() };
    }
    let rwy = body.get(2).map_or("", String::as_str);
    // No where: the what names the runway.
    let place = None;
    let parts: Vec<&str> = body.get(3).filter(|p| condition(std::slice::from_ref(*p)).is_none()).map_or(vec![], |p| p.split('/').collect());
    let named: Vec<&str> = parts
        .iter()
        .map(|p| match *p {
            "GP" | "GS" => Some("glide slope"),
            "LOC" => Some("localizer"),
            "DME" => Some("DME"),
            "OM" => Some("outer marker"),
            "MM" => Some("middle marker"),
            "IM" => Some("inner marker"),
            _ => None,
        })
        .collect::<Option<_>>()
        .unwrap_or_default();
    let (Some(c), true) = (c, parts.len() == named.len() && body.len() <= 5) else { return Four { place, ..Four::default() } };
    let what = if named.is_empty() {
        ["ILS runway ", rwy, " ", &c].concat()
    } else if named == ["glide slope"] {
        ["Glide slope runway ", rwy, " ", &c].concat()
    } else {
        ["ILS runway ", rwy, " ", &super::title::listed(&named), " ", &c].concat()
    };
    let out = c == "out of service";
    // AIM 1-1-9, inoperative ILS components: "When the localizer fails, an
    // ILS approach is not authorized"; "When the glide slope fails, the
    // ILS reverts to a non-precision localizer approach".
    let why = if !out {
        None
    } else if named.is_empty() || parts.contains(&"LOC") {
        Some(["No ILS or localizer approach to runway ", rwy, "."].concat())
    } else if named == ["glide slope"] {
        Some("No vertical guidance: fly it as a localizer approach, to the chart's LOC minimums where it gives them.".to_owned())
    } else {
        None
    };
    Four { what: Some(what), place, why }
}

/// An FDC approach NOTAM (IAP, 7-1-3): not authorized, new minimums, or
/// amended.
fn approach(after: &str, r: &NotamRead) -> Four {
    let Some(title) = r.title.as_deref() else { return Four::default() };
    let words: Vec<&str> = after.split_whitespace().map(|w| w.trim_matches(|c: char| matches!(c, ',' | '.' | ';'))).collect();
    let na = words.windows(2).any(|p| p == ["PROCEDURE", "NA"]);
    let minimums = words.iter().any(|w| matches!(*w, "DA" | "MDA" | "VIS" | "VISIBILITY" | "RVR"));
    // NA is "not authorized" (JO 7340.2); FDC NOTAMs amend published
    // approaches (AIM 5-1-3), and their minimums are then the ones to use.
    let (what, why) = if na {
        ("not authorized", Some("It cannot be flown while this NOTAM is in force."))
    } else if minimums {
        ("new minimums", Some("The minimums in this NOTAM apply in place of the chart's."))
    } else {
        ("amended", None)
    };
    Four { what: Some([title, ": ", what].concat()), place: None, why: why.map(str::to_owned) }
}

/// The fuel's or a facility's NOTAM: "100LL fuel not available".
fn service(body: &[String], r: &NotamRead) -> Four {
    let c = cond(body);
    if is_fuel(body) {
        let grades = r.title.as_deref().and_then(|t| t.strip_prefix("Fuel ")).map_or(String::new(), |g| [g, " "].concat());
        let Some(c) = c else { return Four::default() };
        // A plain fact: no fuel of that grade there.
        let why = matches!(c.as_str(), "not available" | "out of service").then(|| "Plan to fuel elsewhere.".to_owned());
        let what = [grades.as_str(), "fuel ", &c].concat();
        return Four { what: Some([what[..1].to_ascii_uppercase().as_str(), &what[1..]].concat()), place: None, why };
    }
    let what = r.title.as_deref().zip(c).map(|(t, c)| [t, " ", &c].concat());
    // A frequency out of service is not to be called on: the Chart
    // Supplement lists the field's others.
    let why = what
        .as_ref()
        .filter(|w| w.ends_with("out of service") && r.keyword.as_deref() == Some("COM"))
        .map(|_| "Use another of the field's frequencies (Chart Supplement).".to_owned());
    Four { what, place: None, why }
}

/// The four lines' three of the NOTAM's `text` (its window is the fourth).
pub(super) fn four(text: &str, r: &NotamRead, idents: &[String]) -> Four {
    // A TFR: flight within it is restricted to what it allows (14 CFR
    // 91.137-91.145), which only its own text says (91.103).
    if r.heading.as_deref() == Some("Temporary flight restriction") {
        return Four { why: Some("Read its area, altitudes and times before flying near it.".to_owned()), ..Four::default() };
    }
    let Some((keyword, body, after)) = subject_of(text) else { return Four::default() };
    let schedule = r.words.split_once("Schedule: ").map(|(_, s)| {
        let s = s.trim_end_matches('.');
        [s[..1].to_ascii_lowercase().as_str(), &s[1..]].concat()
    });
    let body = if keyword == "AD" && body.first().is_some_and(|w| w == "AP") { &body[1..] } else { &body[..] };
    match keyword.as_str() {
        "RWY" => runway(body, r, schedule.as_deref()),
        "TWY" => taxiway(body, r),
        "OBST" => obstacle(body, r, idents),
        "NAV" => navaid(body, r),
        "IAP" => approach(&after, r),
        "AD" if body.first().is_some_and(|w| w == "RWY") => runway(&body[1..], r, schedule.as_deref()),
        // The field closed: no landing or takeoff there (CLSD, JO 7340.2).
        "AD" if body == ["CLSD"] => Four {
            what: Some("Aerodrome closed".to_owned()),
            place: None,
            why: Some("No landing or takeoff at the field while it is closed.".to_owned()),
        },
        "AD" if body.first().is_some_and(|w| w == "BCN" || w == "ABN") => {
            Four { what: r.title.as_deref().zip(cond(body)).map(|(t, c)| [t, " ", &c].concat()), ..Four::default() }
        }
        "AD" if is_fuel(body) => service(body, r),
        "SVC" | "COM" => service(body, r),
        _ => Four::default(),
    }
}
