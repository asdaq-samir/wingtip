//! The FAA's own text in the app's words: its capitals set in sentence
//! case with its codes kept (CLAUDE.md's rule), a name it writes in
//! capitals written as a name is, the intensities and hazards of the
//! weather advisories, and a special-use area's floor and ceiling. The
//! web's lib/advisories had these, and the planner's app.gonogo.words and
//! the iPhone's AirportWords each a copy.
//!
//! The sentence case itself (faa_words, with the JavaScript scans it and
//! these keep to) is core's faa_case, which the weather crate's TFRs use
//! too.

use crate::figures::words::{alt_ft, js_round_f};

pub use wingtip_core::faa_case::faa_words;
pub(crate) use wingtip_core::faa_case::{js_space, js_trim, js_word};

/// A name the FAA writes in capitals, written as a name is: "CHICAGO
/// CLASS B" as "Chicago Class B", "ROCKFORD" as "Rockford" -- a place's, a
/// facility's, an airspace's -- each letter that starts a word (after
/// anything not a letter, a figure or `_`) a capital.
pub fn title_case(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut before: Option<char> = None;
    for ch in text.to_lowercase().chars() {
        let starts = js_word(ch) && before.is_none_or(|b| !js_word(b));
        out.push(if starts { ch.to_ascii_uppercase() } else { ch });
        before = Some(ch);
    }
    out
}

/// A place's name as it is written, each word capitalised: the FAA's and
/// the airport file's capitals ("EAU CLAIRE", "LA CROSSE", "STERLING/
/// ROCKFALLS") as a town is spelt -- "Eau Claire", "La Crosse",
/// "Sterling/Rockfalls" -- where sentence case read "La crosse" (the
/// owner's screenshot, 2026-10-26), and "Mc" names as they are written,
/// McCook, McAlester. A name already in mixed case is kept as it is.
pub fn place_words(text: &str) -> String {
    if text.bytes().any(|b| b.is_ascii_lowercase()) {
        return text.to_owned();
    }
    let mut c: Vec<char> = text.to_lowercase().chars().collect();
    for i in 0..c.len() {
        let after_break = i == 0 || js_space(c[i - 1]) || matches!(c[i - 1], '/' | '(' | '-');
        if after_break && c[i].is_ascii_lowercase() {
            c[i] = c[i].to_ascii_uppercase();
        }
    }
    let mut i = 0;
    while i + 2 < c.len() {
        if c[i] == 'M' && c[i + 1] == 'c' && c[i + 2].is_ascii_lowercase() && (i == 0 || !js_word(c[i - 1])) {
            c[i + 2] = c[i + 2].to_ascii_uppercase();
            i += 3;
        } else {
            i += 1;
        }
    }
    c.into_iter().collect()
}

/// The intensities PIREPs and G-AIRMETs report, in words; a code not
/// known in lower case, as it came.
pub fn intensity(code: &str) -> String {
    match code.to_uppercase().as_str() {
        "NEG" | "NEGCLR" => "none",
        "SMTH" => "smooth",
        "TRC" => "trace",
        "LGT" => "light",
        "LGT-MOD" => "light to moderate",
        "MOD" => "moderate",
        "MOD-SEV" => "moderate to severe",
        "SEV" => "severe",
        "EXTRM" => "extreme",
        _ => return code.to_lowercase(),
    }
    .to_owned()
}

/// A SIGMET's hazard in words: "Convective", "Mountain obscuration"; one
/// not known in the FAA's words, else the product's kind, else "Hazard".
pub fn sigmet_hazard(hazard: Option<&str>, kind: Option<&str>) -> String {
    let named = match hazard {
        Some(h) if !h.is_empty() => match h.to_uppercase().as_str() {
            "CONVECTIVE" => "Convective".to_owned(),
            "TURB" => "Turbulence".to_owned(),
            "ICE" => "Icing".to_owned(),
            "IFR" => "IFR".to_owned(),
            "MTN OBSCN" => "Mountain obscuration".to_owned(),
            "ASH" => "Volcanic ash".to_owned(),
            "TS" => "Thunderstorms".to_owned(),
            "DS" => "Dust storm".to_owned(),
            "SS" => "Sandstorm".to_owned(),
            _ => faa_words(h),
        },
        _ => String::new(),
    };
    if !named.is_empty() {
        named
    } else {
        kind.filter(|k| !k.is_empty()).unwrap_or("Hazard").to_owned()
    }
}

/// A G-AIRMET's hazard and how bad: "Icing, moderate".
pub fn gairmet_title(hazard: &str, severity: Option<&str>) -> String {
    match severity {
        Some(s) if !s.is_empty() => format!("{hazard}, {}", intensity(s)),
        _ => hazard.to_owned(),
    }
}

/// What a PIREP reports of the turbulence and icing, in words:
/// "Turbulence moderate · No icing"; None where it reports neither.
pub fn pirep_conditions(turbulence: Option<&str>, icing: Option<&str>) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(t) = turbulence.filter(|t| !t.is_empty()) {
        parts.push(format!("Turbulence {}", intensity(t)));
    }
    if let Some(i) = icing.filter(|i| !i.is_empty()) {
        let none = matches!(i.to_uppercase().as_str(), "NEG" | "NEGCLR");
        parts.push(if none { "No icing".to_owned() } else { format!("Icing {}", intensity(i)) });
    }
    (!parts.is_empty()).then(|| parts.join(" · "))
}

/// A special-use area's floor and ceiling as the chart's tables write
/// them: "Surface to 18,000 ft", "8,000 ft to FL180", "500 ft AGL to
/// FL180". A height the FAA's file gives as STD is a flight level, a
/// 29.92 pressure level (14 CFR 1.1, "flight level"), and SFC or a floor
/// of 0 the surface; in a sentence's middle it is "the surface".
pub fn sua_altitudes(floor: (Option<f64>, Option<&str>), ceiling: (Option<f64>, Option<&str>), mid_sentence: bool) -> String {
    let height = |ft: Option<f64>, reference: Option<&str>, bottom: bool| -> String {
        if reference == Some("SFC") || (bottom && ft == Some(0.0)) {
            return if mid_sentence { "the surface" } else { "Surface" }.to_owned();
        }
        let Some(ft) = ft else { return "unstated".to_owned() };
        if reference == Some("STD") {
            return format!("FL{}", js_round_f(ft / 100.0) as i64);
        }
        format!("{} ft{}", alt_ft(Some(ft)), if reference == Some("AGL") { " AGL" } else { "" })
    };
    format!("{} to {}", height(floor.0, floor.1, true), height(ceiling.0, ceiling.1, false))
}

/// NASR's fuel codes as the pump is labelled: its jet fuels by name, the
/// rest (100LL, UL94, MOGAS) as the codes they are.
pub fn fuel_names(types: &[&str]) -> String {
    types
        .iter()
        .map(|t| match *t {
            "A" => "Jet A",
            "A+" => "Jet A+",
            "A1" => "Jet A-1",
            "A1+" => "Jet A-1+",
            other => other,
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// "CHICAGO, DUPAGE AIRPORT CLASS D" as "Chicago, Dupage Airport": the
/// class (and a Class E's figure) at the end taken off, the name written
/// as a name is.
pub fn short_airspace_name(name: &str) -> String {
    let c: Vec<char> = name.chars().collect();
    let mut end = c.len();
    // [A-G]\d? at the very end, either case.
    if end > 0 && c[end - 1].is_ascii_digit() && end > 1 && ('A'..='G').contains(&c[end - 2].to_ascii_uppercase()) {
        end -= 2;
    } else if end > 0 && ('A'..='G').contains(&c[end - 1].to_ascii_uppercase()) {
        end -= 1;
    } else {
        return title_case(name);
    }
    let spaces_before = |mut at: usize| {
        let to = at;
        while at > 0 && js_space(c[at - 1]) {
            at -= 1;
        }
        (at < to).then_some(at)
    };
    let cut = spaces_before(end).and_then(|at| {
        let word: String = c[at.saturating_sub(5)..at].iter().collect();
        (at >= 5 && word.eq_ignore_ascii_case("CLASS")).then(|| spaces_before(at - 5)).flatten()
    });
    match cut {
        Some(at) => title_case(&c[..at].iter().collect::<String>()),
        None => title_case(name),
    }
}
