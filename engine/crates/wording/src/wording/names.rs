//! Names the FAA writes in capitals, written as names are, where the
//! sentence case of faa_words and the place names of place_words do not
//! fit: a registrant's or a maker's name in the aircraft registry
//! (MASTER, DEREG, ACFTREF; ardata.pdf), a facility's in NASR's
//! frequencies, and a street address (NASR's contacts, the Census
//! Bureau's geocoder); and an airplane's type in a few words from the
//! registry's maker and model. The planner's wingtip.registry_codes,
//! faa_frequencies, faa_contacts and geocode had each their own, and the
//! web's components/airplane/shortType the short type. How a name is
//! written is no aviation rule: these only keep one copy.

use crate::json::{self, Value};
use wingtip_core::ask::opt_str_in as opt_text;

/// Words of a name kept in capitals: a company's form, a generation.
const KEPT: &[&str] = &["LLC", "LLP", "LP", "PC", "PLLC", "USA", "US", "II", "III", "IV", "FBO", "DBA"];
/// A facility's own codes in NASR's names ("DULUTH RCO").
const FACILITY: &[&str] = &["RCO", "TWR"];
/// Words of three letters or fewer in a maker's name written as words,
/// not as its initials.
const WORDS: &[&str] = &["INC", "CO", "LTD", "AND", "THE", "OF", "DE", "LA", "Y", "DEL", "EL", "VAN", "VON"];

/// How a name is written.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    /// A registrant's: each word capitalised, a company's form (KEPT) and a
    /// word with figures kept.
    Person,
    /// A maker's: a person's, and its initials too ("IAE", "CFM"), which in
    /// a person's ("JOE") are a name.
    Maker,
    /// A facility's: a person's, and the facility's own codes kept.
    Facility,
    /// A street address: each word capitalised, its compass points (NE)
    /// and ordinals (1st) as they are written.
    Street,
}

/// First letter up, the rest down, as Python's str.capitalize.
fn capitalize(w: &str) -> String {
    let mut c = w.chars();
    match c.next() {
        Some(first) => first.to_uppercase().chain(c.flat_map(char::to_lowercase)).collect(),
        None => String::new(),
    }
}

/// A word starting after anything not a letter, as Python's str.title:
/// "1ST" is "1St", put right by `street`.
fn title(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut after_letter = false;
    for ch in text.chars() {
        if ch.is_alphabetic() {
            if after_letter {
                out.extend(ch.to_lowercase());
            } else {
                out.extend(ch.to_uppercase());
            }
            after_letter = true;
        } else {
            out.push(ch);
            after_letter = false;
        }
    }
    out
}

fn street(text: &str) -> String {
    title(text.trim())
        .split(' ')
        .map(|w| match w {
            "Ne" | "Nw" | "Se" | "Sw" => w.to_uppercase(),
            _ => {
                // An ordinal's letters after its figures: "1St" is "1st".
                let cut = w.len().saturating_sub(2);
                let (head, tail) = w.split_at(if w.is_char_boundary(cut) { cut } else { 0 });
                if head.ends_with(|c: char| c.is_ascii_digit()) && matches!(tail, "St" | "Nd" | "Rd" | "Th") {
                    format!("{head}{}", tail.to_lowercase())
                } else {
                    w.to_owned()
                }
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// A name in the FAA's capitals as `kind` writes it: "ROCA ROJA Y CABALLO
/// GRIS DE IDAHO LLC" as "Roca Roja Y Caballo Gris De Idaho LLC", "DULUTH
/// RCO" as "Duluth RCO", "2627 HOLLYWOOD WAY NE" as "2627 Hollywood Way NE".
pub fn name_case(text: &str, kind: Kind) -> String {
    if kind == Kind::Street {
        return street(text);
    }
    let word = |w: &str| {
        let bare = w.trim_matches(|c| matches!(c, '.' | ',' | '&'));
        let initials = kind == Kind::Maker
            && bare.chars().count() <= 3
            && !bare.is_empty()
            && bare.chars().all(char::is_alphabetic)
            && !WORDS.contains(&bare);
        if KEPT.contains(&bare) || (kind == Kind::Facility && FACILITY.contains(&bare)) || w.chars().any(|c| c.is_ascii_digit()) || initials
        {
            w.to_owned()
        } else {
            capitalize(w)
        }
    };
    text.split_whitespace().map(word).collect::<Vec<_>>().join(" ")
}

/// The words after a maker's name the registry carries that say what kind
/// of company it is, not who: "AIRBUS S A S", "PIPER AIRCRAFT INC",
/// "CIRRUS DESIGN CORP".
const COMPANY: &[&str] = &[
    "AIRCRAFT", "AVIATION", "AEROSPACE", "DESIGN", "INDUSTRIES", "IND", "INC", "CORP", "CO", "COMPANY", "LLC", "LTD", "GMBH", "SA", "SAS",
];

/// Its maker alone, short: "AIRBUS S A S" is "Airbus", "PIPER AIRCRAFT
/// INC" "Piper" (the owner, 2026-11-27: "Maybe just Airbus A321").
pub fn make_short(manufacturer: &str) -> Option<String> {
    let words: Vec<&str> = manufacturer.split_whitespace().collect();
    let cut = (1..words.len()).find(|&i| COMPANY.contains(&words[i].to_uppercase().as_str()) || words[i].chars().count() == 1);
    let cased = |w: &&str| {
        if w.chars().count() >= 2 && w.chars().all(|c| c.is_ascii_uppercase()) {
            capitalize(w)
        } else {
            (*w).to_owned()
        }
    };
    let kept = words[..cut.unwrap_or(words.len())].iter().map(cased).collect::<Vec<_>>().join(" ");
    (!kept.is_empty()).then_some(kept)
}

/// Its model without the variant: "A321-271NX" is "A321", "PA-28-140"
/// "PA-28". A model starting with letters alone keeps its number (PA-28,
/// DHC-6); one whose first part has a figure in it is that part.
pub fn model_short(model: &str) -> Option<String> {
    let parts: Vec<&str> = model.trim().split('-').collect();
    let first = parts[0];
    let lettered = !first.is_empty() && first.chars().all(|c| c.is_ascii_alphabetic());
    let short = if lettered && parts.len() > 1 { parts[..2].join("-") } else { first.to_owned() };
    (!short.is_empty()).then_some(short)
}

/// `name_case`: `{"text"} | {"texts"}` and `"kind"` (person, the default;
/// maker; facility; street), a string or each of the texts (a null row
/// "\"\""). `airplane_short_type`: `{"manufacturer"?, "model"?}` to
/// `{"make_short", "model_short"}`, each null where there is none.
pub fn answer(name: &str, v: &Value) -> Result<String, String> {
    if name == "airplane_short_type" {
        let mut out = String::from("{\"make_short\":");
        json::opt_string(&mut out, opt_text(name, v, "manufacturer")?.and_then(make_short).as_deref());
        out.push_str(",\"model_short\":");
        json::opt_string(&mut out, opt_text(name, v, "model")?.and_then(model_short).as_deref());
        out.push('}');
        return Ok(out);
    }
    let kind = match opt_text(name, v, "kind")? {
        None | Some("person") => Kind::Person,
        Some("maker") => Kind::Maker,
        Some("facility") => Kind::Facility,
        Some("street") => Kind::Street,
        Some(other) => return Err(format!("{name}: \"kind\" is person, maker, facility or street, not {other:?}")),
    };
    let mut out = String::new();
    match v.get("texts") {
        Some(Value::Array(texts)) => {
            out.push('[');
            for (i, t) in texts.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                match t {
                    Value::String(s) => json::string(&mut out, &name_case(s, kind)),
                    Value::Null => out.push_str("\"\""),
                    _ => return Err(format!("{name}: \"texts\" is not a list of strings")),
                }
            }
            out.push(']');
        }
        Some(_) => return Err(format!("{name}: \"texts\" is not a list")),
        None => json::string(&mut out, &name_case(opt_text(name, v, "text")?.unwrap_or(""), kind)),
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_as_the_planner_wrote_them() {
        assert_eq!(name_case("ROCA ROJA Y CABALLO GRIS DE IDAHO LLC", Kind::Person), "Roca Roja Y Caballo Gris De Idaho LLC");
        assert_eq!(name_case("UNITED AIRLINES INC", Kind::Person), "United Airlines Inc");
        assert_eq!(name_case("JOE SMITH III", Kind::Person), "Joe Smith III");
        assert_eq!(name_case("IAE INTERNATIONAL AERO", Kind::Maker), "IAE International Aero");
        assert_eq!(name_case("JOE  BLOGGS", Kind::Person), "Joe Bloggs");
        assert_eq!(name_case("DE HAVILLAND", Kind::Maker), "De Havilland");
        assert_eq!(name_case("DULUTH RCO", Kind::Facility), "Duluth RCO");
        assert_eq!(name_case("2627 HOLLYWOOD WAY", Kind::Street), "2627 Hollywood Way");
        assert_eq!(name_case("100 1ST AVE NE", Kind::Street), "100 1st Ave NE");
        assert_eq!(name_case("4000 INTERNATIONAL LN", Kind::Street), "4000 International Ln");
        assert_eq!(name_case("1 O'HARE WAY", Kind::Street), "1 O'Hare Way");
    }

    // components/airplane/shortType.test.ts's cases, which this replaced.
    #[test]
    fn an_airplanes_type_in_a_few_words() {
        let both = |m: &str, t: &str| format!("{} {}", make_short(m).unwrap_or_default(), model_short(t).unwrap_or_default());
        assert_eq!(both("AIRBUS S A S", "A321-271NX"), "Airbus A321");
        assert_eq!(both("Airbus S A S", "A321-271NX"), "Airbus A321");
        assert_eq!(both("BOEING", "737-8H4"), "Boeing 737");
        assert_eq!(both("PIPER AIRCRAFT INC", "PA-28-140"), "Piper PA-28");
        assert_eq!(both("CESSNA", "172S"), "Cessna 172S");
        assert_eq!(both("DE HAVILLAND", "DHC-6"), "De Havilland DHC-6");
        assert_eq!(both("CIRRUS DESIGN CORP", "SR22"), "Cirrus SR22");
        assert_eq!(make_short(""), None);
        assert_eq!(model_short("  "), None);
    }
}
