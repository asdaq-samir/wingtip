//! Whose rules a point and a route are under, asked by name
//! (`jurisdiction_of`, `route_jurisdiction`; jurisdiction.rs says how and
//! why, decision 0053): the apps warn where a figure is worked out by the
//! FAA's rules for a place outside the United States, and the Brief says
//! it once.

use crate::jurisdiction::{country_name, jurisdiction_of, leg_outside, outlines_read, province_of, Outside};
use wingtip_core::ask::{num_in, opt_str_in, strings, Ask};
use wingtip_core::json::{self, Value};

/// Why it matters, as the Brief's line says under its tap: 14 CFR 91.703(a).
const WHY: &str = "Every figure and rule here is the FAA's. Within a foreign country a U.S. airplane flies by that country's own rules, and over the high seas by ICAO Annex 2.";
const CITE: &str = "14 CFR 91.703(a)";

/// What to do first: Canada's own rules by their names (the Canadian
/// Aviation Regulations, SOR/96-433, and Transport Canada's AIM), else the
/// country's.
fn action(codes: &[&'static str]) -> &'static str {
    match codes {
        ["CA"] => "Check Canada's rules (the CARs and the TC AIM) before you go.",
        _ => "Check that country's rules before you go.",
    }
}

#[cfg_attr(target_arch = "wasm32", inline(always))]
/// The Brief's one line for a route's finding, as gonogo_glance_lines
/// words its own: `{"lead", "line", "action", "why", "cite"}`, the line
/// the lead and what to do; route_adiz's too.
pub(crate) fn brief_line(out: &mut String, lead: &str, act: &str, why: &str, cite: &str) {
    out.push_str("{\"lead\":");
    json::string(out, lead);
    out.push_str(",\"line\":");
    json::string(out, &format!("{lead}. {act}"));
    out.push_str(",\"action\":");
    json::string(out, act);
    out.push_str(",\"why\":");
    json::string(out, why);
    out.push_str(",\"cite\":");
    json::string(out, cite);
    out.push('}');
}

pub fn call(name: &str, v: &Value) -> Result<String, String> {
    outlines_read().map_err(|e| format!("{name}: {e}"))?;
    let ask = Ask::new(name, v);
    let mut out = String::new();
    if name == "jurisdiction_of" {
        let (lat, lon) = (ask.num("lat")?, ask.num("lon")?);
        let code = jurisdiction_of(lat, lon);
        out.push_str("{\"code\":");
        json::string(&mut out, code);
        out.push_str(",\"name\":");
        json::string(&mut out, country_name(code));
        out.push_str(",\"province\":");
        json::opt_string(&mut out, province_of(lat, lon));
        out.push_str(",\"caution\":");
        json::opt_string(&mut out, Outside::at(lat, lon).caution("This point is in").as_deref());
        out.push('}');
        return Ok(out);
    }
    let list = ask.list("points")?;
    let points = list.iter().map(|p| Ok((num_in(name, p, "lat")?, num_in(name, p, "lon")?))).collect::<Result<Vec<_>, String>>()?;
    let names = list.iter().map(|p| opt_str_in(name, p, "name")).collect::<Result<Vec<_>, String>>()?;
    let at: Vec<Outside> = points.iter().map(|&(lat, lon)| Outside::at(lat, lon)).collect();
    // Everywhere outside the US the route meets, its points' and legs', in
    // the order met.
    let mut route = Outside::default();
    out.push_str("{\"points\":[");
    for (i, &(lat, lon)) in points.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"code\":");
        json::string(&mut out, jurisdiction_of(lat, lon));
        // A field in Canada is said to be: "CYQT is in Canada (Ontario): …".
        let subject = names[i].map_or_else(|| "This point is in".to_string(), |n| format!("{n} is in"));
        out.push_str(",\"caution\":");
        json::opt_string(&mut out, at[i].caution(&subject).as_deref());
        out.push('}');
    }
    out.push_str("],\"legs\":[");
    for (i, pair) in points.windows(2).enumerate() {
        // One walk of the leg gives its countries (the US left out) and
        // its provinces.
        let outside = leg_outside(pair[0], pair[1]);
        let leg = &outside.countries;
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"codes\":");
        strings(&mut out, &leg.iter().map(|c| c.to_string()).collect::<Vec<_>>());
        // The leg's own warning only where it meets a country, or a
        // province of Canada, neither end is in, as KUGN to KBUF across
        // southern Ontario, or CYQT to CYWG across into Manitoba: a leg into
        // a field in Canada is said at the field, not again on the leg. It
        // is the leg's, named by where it goes, never the field's at its end.
        let (a, b) = (&at[i], &at[i + 1]);
        let new_country = leg.iter().any(|c| !a.countries.contains(c) && !b.countries.contains(c));
        let new_province = outside.provinces.iter().any(|p| !a.provinces.contains(p) && !b.provinces.contains(p));
        let subject = names[i + 1].map_or_else(|| "The leg crosses".to_string(), |n| format!("The leg to {n} crosses"));
        let crosses = new_country || new_province;
        out.push_str(",\"caution\":");
        json::opt_string(&mut out, if crosses { outside.caution(&subject) } else { None }.as_deref());
        out.push('}');
        route.add(&at[i]);
        route.add(&outside);
    }
    if let Some(last) = at.last() {
        route.add(last);
    }
    out.push_str("],\"outside\":");
    strings(&mut out, &route.countries.iter().map(|c| c.to_string()).collect::<Vec<_>>());
    // The Brief's one line for the whole route, as gonogo_glance_lines
    // words its own: the finding, what to do, why, and the rule.
    out.push_str(",\"brief\":");
    match route.caution("Part of the route is in") {
        None => out.push_str("null"),
        Some(lead) => brief_line(&mut out, &lead, action(&route.countries), WHY, CITE),
    }
    out.push('}');
    Ok(out)
}
