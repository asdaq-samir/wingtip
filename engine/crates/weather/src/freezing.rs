//! Freezing rain and freezing drizzle (FZRA, FZDZ) in a field's METAR or
//! TAF. AIM 7-1-20 (Definitions of Inflight Icing Terms): "Freezing
//! precipitation is freezing rain or freezing drizzle falling through or
//! outside of visible cloud" -- it ices an airplane clear of cloud, so it
//! is a Go / No-Go caution on any flight, VFR or IFR, not only one planned
//! in cloud at or above the freezing level (FAA-H-8083-28B ch. 20, Icing).
//! The codes are the present-weather groups of AIM 7-1-28's key ("FZDZ
//! freezing drizzle"), with any intensity (FMH-1 ch. 12).
//!
//! The simplification, toward the safer answer: every group of a TAF is
//! read, its TEMPO and PROB groups and the hours before and after the
//! flight's included, and a METAR's remarks (RMK, where "FZRAB15" is when
//! it began) are not. The pilot reads the TAF's hours themselves.

use crate::json;
use crate::metar::is_weather;

/// One freezing precipitation group found: at which field, in which
/// report ("METAR" or "TAF"), and the group as sent ("-FZRA").
#[derive(Clone, Debug, PartialEq)]
pub struct Found {
    pub ident: String,
    pub source: &'static str,
    pub group: String,
}

/// The freezing precipitation groups of a raw report, each once, in the
/// order sent; a METAR's remarks left out.
pub fn freezing_groups(raw: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for w in raw.split_whitespace().map(|w| w.trim_end_matches('=')).take_while(|w| *w != "RMK") {
        if is_weather(w) && (w.contains("FZRA") || w.contains("FZDZ")) && !out.iter().any(|o| o == w) {
            out.push(w.to_string());
        }
    }
    out
}

/// Each field's freezing precipitation, its METAR's then its TAF's.
/// `fields` is (ident, raw METAR, raw TAF).
pub fn freezing_precip(fields: &[(String, Option<String>, Option<String>)]) -> Vec<Found> {
    let mut out = Vec::new();
    for (ident, metar, taf) in fields {
        for (source, raw) in [("METAR", metar), ("TAF", taf)] {
            for group in raw.as_deref().map(freezing_groups).unwrap_or_default() {
                out.push(Found { ident: ident.clone(), source, group });
            }
        }
    }
    out
}

/// What a group is in words: freezing rain where it has FZRA, else
/// freezing drizzle.
fn words(group: &str) -> &'static str {
    if group.contains("FZRA") {
        "freezing rain"
    } else {
        "freezing drizzle"
    }
}

/// The Go / No-Go's line, None where none was found: "Freezing rain at
/// KABC (METAR -FZRA); it ices an airplane out of cloud".
pub fn freezing_line(found: &[Found]) -> Option<String> {
    let first = found.first()?;
    let said: Vec<String> = found
        .iter()
        .map(|f| {
            let verb = if f.source == "TAF" { "forecast" } else { "reported" };
            format!("{} {verb} at {} ({} {})", words(&f.group), f.ident, f.source, f.group)
        })
        .collect();
    let mut line = said.join(", ");
    // Sentence case: the first word's first letter, the codes kept.
    line.replace_range(0..1, &words(&first.group)[0..1].to_uppercase());
    Some(format!("{line}; it ices an airplane out of cloud"))
}

/// The finding as JSON: {"found": [{ident, source, group}], "line"}.
pub fn to_json(found: &[Found]) -> String {
    let mut out = String::from("{\"found\":[");
    for (i, f) in found.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"ident\":");
        json::string(&mut out, &f.ident);
        out.push_str(",\"source\":");
        json::string(&mut out, f.source);
        out.push_str(",\"group\":");
        json::string(&mut out, &f.group);
        out.push('}');
    }
    out.push_str("],\"line\":");
    json::opt_string(&mut out, freezing_line(found).as_deref());
    out.push('}');
    out
}

/// `freezing_precip` by name, its own call rather than an arm of the
/// crate's table (calls.rs), so the web's module takes it without the
/// crate's other readers (scripts/ci/wasm_size.py).
pub fn call(name: &str, v: &json::Value) -> Result<String, String> {
    let ask = wingtip_core::ask::Ask::new(name, v);
    let mut fields = Vec::new();
    for f in ask.list("fields")? {
        let raw = |key: &str| f.get(key).and_then(json::Value::as_str).map(str::to_owned);
        fields.push((raw("ident").unwrap_or_default(), raw("metar"), raw("taf")));
    }
    Ok(to_json(&freezing_precip(&fields)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn field(ident: &str, metar: Option<&str>, taf: Option<&str>) -> (String, Option<String>, Option<String>) {
        (ident.into(), metar.map(str::to_owned), taf.map(str::to_owned))
    }

    #[test]
    fn freezing_rain_and_drizzle_are_found_in_the_report_and_the_forecast_and_not_in_remarks() {
        // A METAR with light freezing rain, and its remark of when it began.
        let metar = "KORD 131751Z 03012KT 2SM -FZRA BR OVC008 M01/M02 A2992 RMK AO2 FZRAB25";
        assert_eq!(freezing_groups(metar), vec!["-FZRA"]);
        // Freezing fog is fog, not freezing precipitation.
        assert!(freezing_groups("KORD 131751Z 00000KT 1/4SM FZFG VV002 M03/M03 A3010").is_empty());
        let taf = "TAF KMDW 131720Z 1318/1424 03010KT 3SM -RA BR OVC010 TEMPO 1320/1324 1SM FZDZ OVC005";
        let found = freezing_precip(&[field("KORD", Some(metar), None), field("KMDW", None, Some(taf)), field("KGYY", None, None)]);
        assert_eq!(found.len(), 2);
        assert_eq!(
            freezing_line(&found).unwrap(),
            "Freezing rain reported at KORD (METAR -FZRA), freezing drizzle forecast at KMDW (TAF FZDZ); it ices an airplane out of cloud"
        );
        assert_eq!(freezing_line(&[]), None);
    }
}
