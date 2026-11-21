//! Whose rules a point and a route are under, asked by name
//! (`jurisdiction_of`, `route_jurisdiction`; jurisdiction.rs says how and
//! why, decision 0053): the apps warn where a figure is worked out by the
//! FAA's rules for a place outside the United States, and the Brief says
//! it once.

use crate::jurisdiction::{caution, country_name, jurisdiction_of, leg_codes};
use wingtip_core::ask::{Ask, num_in, strings};
use wingtip_core::json::{self, Value};

/// Why it matters, as the Brief's line says under its tap: 14 CFR 91.703(a).
const WHY: &str = "Every figure and rule here is the FAA's. Within a foreign country a U.S. airplane flies by that country's own rules, and over the high seas by ICAO Annex 2.";
const CITE: &str = "14 CFR 91.703(a)";

/// What to do first: Canada's own rules by their names (the Canadian
/// Aviation Regulations, SOR/96-433, and Transport Canada's AIM), else the
/// country's.
fn action(codes: &[&str]) -> &'static str {
    match codes {
        ["CA"] => "Check Canada's rules (the CARs and the TC AIM) before you go.",
        _ => "Check that country's rules before you go.",
    }
}

#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut out = String::new();
    if name == "jurisdiction_of" {
        let code = jurisdiction_of(ask.num("lat")?, ask.num("lon")?);
        out.push_str("{\"code\":");
        json::string(&mut out, code);
        out.push_str(",\"name\":");
        json::string(&mut out, country_name(code));
        out.push_str(",\"caution\":");
        json::opt_string(&mut out, caution(&[code]).as_deref());
        out.push('}');
        return Ok(out);
    }
    let points = ask
        .list("points")?
        .iter()
        .map(|p| Ok((num_in(name, p, "lat")?, num_in(name, p, "lon")?)))
        .collect::<Result<Vec<_>, String>>()?;
    let codes: Vec<&str> = points.iter().map(|&(lat, lon)| jurisdiction_of(lat, lon)).collect();
    // Every country met, each once in the order met, the legs' too.
    let mut met: Vec<&str> = Vec::new();
    out.push_str("{\"points\":[");
    for (i, code) in codes.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"code\":");
        json::string(&mut out, code);
        out.push_str(",\"caution\":");
        json::opt_string(&mut out, caution(&[code]).as_deref());
        out.push('}');
    }
    out.push_str("],\"legs\":[");
    for (i, pair) in points.windows(2).enumerate() {
        let leg: Vec<&str> = leg_codes(pair[0], pair[1]).into_iter().filter(|c| *c != "US").collect();
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"codes\":");
        strings(&mut out, &leg.iter().map(|c| c.to_string()).collect::<Vec<_>>());
        out.push_str(",\"caution\":");
        json::opt_string(&mut out, caution(&leg).as_deref());
        out.push('}');
        met.extend(leg);
    }
    met.extend(codes.iter().filter(|c| **c != "US"));
    let mut outside: Vec<&str> = Vec::new();
    for code in met {
        if !outside.contains(&code) {
            outside.push(code);
        }
    }
    out.push_str("],\"outside\":");
    strings(&mut out, &outside.iter().map(|c| c.to_string()).collect::<Vec<_>>());
    // The Brief's one line for the whole route, as gonogo_glance_lines
    // words its own: the finding, what to do, why, and the rule.
    out.push_str(",\"brief\":");
    match caution(&outside) {
        None => out.push_str("null"),
        Some(lead) => {
            let act = action(&outside);
            out.push_str("{\"lead\":");
            json::string(&mut out, &lead);
            out.push_str(",\"line\":");
            json::string(&mut out, &format!("{lead}. {act}"));
            out.push_str(",\"action\":");
            json::string(&mut out, act);
            out.push_str(",\"why\":");
            json::string(&mut out, WHY);
            out.push_str(",\"cite\":");
            json::string(&mut out, CITE);
            out.push('}');
        }
    }
    out.push('}');
    Ok(out)
}
