//! `clearance_places`: the places a clearance heard named, found as idents
//! among the places the planner gives (spoken.rs), and its SID and STAR
//! among the departure's and the destination's own procedures, as the CIFP
//! codes them. The planner fetches every place and procedure and asks this
//! with them; nothing here fetches.

use crate::clearance::Found;
use crate::json::{self, Value};
use crate::spoken::{alike, found_json, letters_upper, point, points, words_of, Place, ALIKE};
use wingtip_core::ask::Ask;

/// A SID or STAR found by its name and number: its coded identifier
/// ("BUNYN1"), whether it was said outright, and its transitions.
#[derive(Clone, Debug, PartialEq)]
pub struct Procedure<'a> {
    pub id: &'a str,
    pub sure: bool,
    pub transitions: &'a [String],
}

/// A field's procedure as given: its identifier, "departure" or "arrival",
/// and its transitions' fixes.
pub struct Listed {
    pub id: String,
    pub kind: String,
    pub transitions: Vec<String>,
}

/// The SID or STAR said by its name and number -- "Bunyan" "1" -- among a
/// field's `listed` procedures of `kind` ("departure" or "arrival"). One
/// named for its navaid is said by the navaid's name ("Gopher One" is
/// GEP1), the navaids' names among `places`. None where none is like it.
pub fn procedure<'a>(name: &str, number: &str, kind: &str, listed: &'a [Listed], places: &[Place]) -> Option<Procedure<'a>> {
    let navaid_name =
        |ident: &str| places.iter().find(|p| p.what == "navaid" && p.ident == ident).and_then(|p| p.name.as_deref()).unwrap_or("");
    let said = letters_upper(name);
    // (score, said outright): outright before a sound as alike.
    let mut best: Option<(&Listed, f64, bool)> = None;
    for p in listed.iter().filter(|p| p.kind == kind) {
        // A procedure's identifier is its name's letters and its number
        // (ARINC 424's SID/STAR identifier: "BUNYN1").
        let Some(digit) = p.id.find(|c: char| c.is_ascii_digit()) else { continue };
        let (letters, n) = p.id.split_at(digit);
        if n != number || letters.is_empty() || !letters.bytes().all(|b| b.is_ascii_uppercase()) {
            continue;
        }
        let navaid = navaid_name(letters);
        let outright = letters == said || (!navaid.is_empty() && navaid.to_uppercase() == name.to_uppercase());
        let score = if outright { 1.0 } else { alike(name, letters).max(alike(name, navaid)) };
        if best.is_none_or(|(_, s, o)| (score, outright) > (s, o)) {
            best = Some((p, score, outright));
        }
    }
    // Sure only where said outright: a sound-alike is the pilot's to check,
    // as a fix's is (spoken::point).
    let (p, _, sure) = best.filter(|(_, s, _)| *s >= ALIKE)?;
    Some(Procedure { id: &p.id, sure, transitions: &p.transitions })
}

/// The procedure's transition said by its fix's name or sound -- "Duluth
/// transition" is DLH -- among its own `transitions`.
pub fn transition(said: &str, transitions: &[String], places: &[Place]) -> Option<String> {
    let mut among: Vec<Place> = places.iter().filter(|p| transitions.contains(&p.ident)).cloned().collect();
    for t in transitions {
        if !places.iter().any(|p| &p.ident == t) {
            among.push(Place { ident: t.clone(), name: None, what: "fix", lat: f64::NAN, lon: f64::NAN });
        }
    }
    point(said, &among, None).and_then(|f| f.ident)
}

fn place_in(name: &str, v: &Value) -> Result<Place, String> {
    let what = match v.get("what").and_then(Value::as_str) {
        Some("airport") => "airport",
        Some("navaid") => "navaid",
        Some("fix") => "fix",
        _ => return Err(format!("{name}: a place's \"what\" is not airport, navaid or fix")),
    };
    let ident = v.get("ident").and_then(Value::as_str).ok_or_else(|| format!("{name}: a place has no \"ident\""))?;
    Ok(Place {
        ident: ident.to_owned(),
        name: v.get("name").and_then(Value::as_str).map(str::to_owned),
        what,
        lat: wingtip_core::ask::num_in(name, v, "lat")?,
        lon: wingtip_core::ask::num_in(name, v, "lon")?,
    })
}

fn strings_in(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array).unwrap_or(&[]).iter().filter_map(|s| s.as_str().map(str::to_owned)).collect()
}

/// A SID or STAR asked: found, with its transition, as JSON.
fn procedure_json(o: &mut String, name: &str, kind: &str, asked: Option<&Value>, places: &[Place]) -> Result<(), String> {
    let Some(a @ Value::Object(_)) = asked else {
        o.push_str("null");
        return Ok(());
    };
    let ask = Ask::new(name, a);
    let listed: Vec<Listed> = ask
        .list("procedures")?
        .iter()
        .map(|p| Listed {
            id: p.get("id").and_then(Value::as_str).unwrap_or("").to_owned(),
            kind: p.get("kind").and_then(Value::as_str).unwrap_or("").to_owned(),
            transitions: strings_in(p.get("transitions")),
        })
        .collect();
    let Some(found) = procedure(ask.str("name")?, ask.str("number")?, kind, &listed, places) else {
        o.push_str("null");
        return Ok(());
    };
    let said = ask.opt_str("transition")?;
    let via = if said.is_empty() { None } else { transition(said, found.transitions, places) };
    o.push_str("{\"id\":");
    json::string(o, found.id);
    o.push_str(",\"transition\":");
    json::opt_string(o, via.as_deref());
    o.push_str(if found.sure { ",\"sure\":true}" } else { ",\"sure\":false}" });
    Ok(())
}

/// The field the planner's airport search found for an airport's name
/// said: for the longest run of its words it found one for, a single word
/// of fewer than four letters not asked. A name said short or long of the
/// one on file -- "Seattle Tacoma" for Seattle-Tacoma International, "city
/// of Colorado Springs" -- is found by fewer of its words.
fn searched_airport<'a>(words: &[String], searched: &'a [(&str, Place)]) -> Option<&'a Place> {
    (1..=words.len()).rev().flat_map(|n| (0..=words.len() - n).map(move |i| &words[i..i + n])).find_map(|run| {
        let run = run.join(" ").to_uppercase();
        if !run.contains(' ') && run.len() < 4 {
            return None;
        }
        searched.iter().find(|(r, _)| *r == run).map(|(_, a)| a)
    })
}

/// `clearance_places`: the clearance's limit (an airport by its name, AIM
/// 4-4-3 a), each phrase of its route as the places in it, and its SID and
/// STAR, among the `places` given (the nearest to the route first).
pub fn clearance_places(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let places = ask.list("places")?.iter().map(|p| place_in(name, p)).collect::<Result<Vec<_>, _>>()?;
    let searched = match v.get("limit_airports") {
        Some(Value::Object(m)) => m.iter().map(|(run, a)| Ok((run.as_str(), place_in(name, a)?))).collect::<Result<Vec<_>, String>>()?,
        _ => Vec::new(),
    };
    let mut o = String::from("{\"limit\":");
    let limit = ask.opt_str("limit")?;
    if limit.is_empty() {
        o.push_str("null");
    } else {
        let found = point(limit, &places, searched_airport(&words_of(limit).0, &searched))
            .unwrap_or(Found { said: limit.to_owned(), ..Found::default() });
        found_json(&mut o, &found);
    }
    o.push_str(",\"route\":[");
    for (k, phrase) in strings_in(v.get("route")).iter().enumerate() {
        if k > 0 {
            o.push(',');
        }
        o.push('[');
        for (m, f) in points(phrase, &places).iter().enumerate() {
            if m > 0 {
                o.push(',');
            }
            found_json(&mut o, f);
        }
        o.push(']');
    }
    o.push_str("],\"departure\":");
    procedure_json(&mut o, name, "departure", v.get("departure"), &places)?;
    o.push_str(",\"arrival\":");
    procedure_json(&mut o, name, "arrival", v.get("arrival"), &places)?;
    o.push('}');
    Ok(o)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spoken::tests::places;

    fn listed() -> Vec<Listed> {
        let p = |id: &str, kind: &str, t: &[&str]| Listed {
            id: id.into(),
            kind: kind.into(),
            transitions: t.iter().map(|s| s.to_string()).collect(),
        };
        vec![p("BUNYN1", "departure", &["DLH", "KVUSI"]), p("SNOWZ1", "departure", &["DABOY"]), p("GEP1", "arrival", &["AXN", "FAR"])]
    }

    #[test]
    fn a_sid_or_star_is_found_by_its_name_and_number() {
        let l = listed();
        let bunyan = procedure("bunyan", "1", "departure", &l, &places()).unwrap();
        assert_eq!((bunyan.id, bunyan.sure), ("BUNYN1", false));
        // Named for its navaid, said by the navaid's name.
        let gopher = procedure("Gopher", "1", "arrival", &l, &places()).unwrap();
        assert_eq!((gopher.id, gopher.sure, gopher.transitions), ("GEP1", true, &["AXN".to_string(), "FAR".to_string()][..]));
        // The number said is the procedure's: Bunyan Two is not published.
        assert!(procedure("bunyan", "2", "departure", &l, &places()).is_none());
    }

    #[test]
    fn a_transition_is_found_by_its_fixs_name_or_sound() {
        let t = ["DLH".to_string(), "KVUSI".to_string()];
        assert_eq!(transition("Duluth", &t, &places()).as_deref(), Some("DLH"));
        assert_eq!(transition("kavusi", &t, &places()).as_deref(), Some("KVUSI"));
    }

    #[test]
    fn the_planners_airport_for_a_name_is_the_limit() {
        // "Cleared to Duluth" with no navaid of the name: the field the
        // planner's search found, as AIM 4-4-3 a gives a limit.
        let duluth =
            Place { ident: "KDLH".into(), name: Some("Duluth International Airport".into()), what: "airport", lat: 46.84, lon: -92.19 };
        let none: Vec<Place> = places().into_iter().filter(|p| p.ident != "DLH").collect();
        let f = point("Duluth", &none, Some(&duluth)).unwrap();
        assert_eq!((f.ident.as_deref(), f.sure), (Some("KDLH"), true));
    }
}
