//! A field's rules by name (calls.rs re-exports them, as the contract
//! files name them `wingtip_flight::calls::<fn>`): its status, whether it
//! is military, its site type, a hard runway, its mark's rank, the usual
//! base and its ident, from NASR's APT_BASE and APT_RWY (field.rs, based.rs).

use crate::{based, field};
use wingtip_core::ask::Ask;
use wingtip_core::json::{self, Value};

/// Whether a field is open, and the words a closed one is labelled with
/// (field.rs, NASR APT_BASE's ARPT_STATUS): `status` null or missing where
/// NASR has no record of the field.
pub fn field_status(name: &str, v: &Value) -> Result<String, String> {
    let code = match v.get("status") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.as_str()),
        Some(_) => return Err(format!("{name}: \"status\" is not a string or null")),
    };
    let mut out = format!("{{\"open\":{},\"closed\":", field::is_open(code));
    json::opt_string(&mut out, field::closed_words(code));
    out.push('}');
    Ok(out)
}

/// `field_military`: whether a field is the armed services' own, from
/// NASR APT_BASE's OWNERSHIP_TYPE_CODE and FACILITY_USE_CODE (field.rs):
/// `{"military": "military" | "joint" | null}`.
pub fn field_military(name: &str, v: &Value) -> Result<String, String> {
    let code = |key: &str| match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.as_str())),
        Some(_) => Err(format!("{name}: \"{key}\" is not a string or null")),
    };
    let mut out = String::from("{\"military\":");
    json::opt_string(&mut out, field::military(code("ownership")?, code("use")?));
    out.push('}');
    Ok(out)
}

/// `field_site_type`: the words for a field's kind of landing site, from
/// NASR APT_BASE's SITE_TYPE_CODE (field.rs's site_words), and whether an
/// airplane on wheels lands there (land_airplane_site):
/// `{"words": "Heliport" | ... | null, "airplane": bool}`, null words for
/// an airport.
pub fn field_site_type(name: &str, v: &Value) -> Result<String, String> {
    let code = match v.get("site_type") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.as_str()),
        Some(_) => return Err(format!("{name}: \"site_type\" is not a string or null")),
    };
    let mut out = String::from("{\"words\":");
    json::opt_string(&mut out, field::site_words(code));
    out.push_str(",\"airplane\":");
    out.push_str(if field::land_airplane_site(code) { "true" } else { "false" });
    out.push('}');
    Ok(out)
}

/// `runway_hard_surface`: whether NASR APT_RWY's SURFACE_TYPE_CODE is a
/// hard surface (field.rs's hard_surface): `{"hard": bool}`.
pub fn runway_hard_surface(name: &str, v: &Value) -> Result<String, String> {
    let code = match v.get("surface") {
        None | Some(Value::Null) => "",
        Some(Value::String(s)) => s.as_str(),
        Some(_) => return Err(format!("{name}: \"surface\" is not a string or null")),
    };
    Ok(format!("{{\"hard\":{}}}", field::hard_surface(code)))
}

/// `field_mark_rank`: what a field's map mark is first drawn at and kept
/// by where marks overlap and drawn at (field.rs's mark_rank):
/// `{"tier", "order", "size"}`.
pub fn field_mark_rank(name: &str, v: &Value) -> Result<String, String> {
    let text = |key: &str| match v.get(key) {
        None | Some(Value::Null) => Ok(""),
        Some(Value::String(s)) => Ok(s.as_str()),
        Some(_) => Err(format!("{name}: \"{key}\" is not a string or null")),
    };
    let towered = match v.get("towered") {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(_) => return Err(format!("{name}: \"towered\" is not a boolean")),
    };
    let hard_ft = match v.get("hard_ft") {
        None | Some(Value::Null) => 0,
        Some(Value::Number(n)) if *n >= 0.0 => n.round().min(f64::from(u32::MAX)) as u32,
        Some(_) => return Err(format!("{name}: \"hard_ft\" is not a length in feet")),
    };
    let primary = text("primary_of")?;
    let rank = field::mark_rank(text("site_type")?, text("use")?, towered, hard_ft, (!primary.is_empty()).then_some(primary));
    Ok(format!("{{\"tier\":{},\"order\":{},\"size\":\"{}\"}}", rank.tier, rank.order, rank.size))
}

/// `usual_base`: the field an airplane's past flights usually start or end
/// at (based.rs), with the counts it was judged on and the rule's figures,
/// so the host can say "6 of 9 takeoffs and landings".
pub fn usual_base(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let field = |f: &'_ Value, key: &str| -> Result<Option<String>, String> {
        match f.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::String(s)) => Ok(Some(s.clone())),
            Some(_) => Err(format!("{name}: a flight's \"{key}\" is not a string or null")),
        }
    };
    let mut held = Vec::new();
    for f in ask.list("flights")? {
        let landed = match f.get("landed") {
            None | Some(Value::Null) => false,
            Some(Value::Bool(b)) => *b,
            Some(_) => return Err(format!("{name}: a flight's \"landed\" is not true or false")),
        };
        held.push((field(f, "origin")?, field(f, "destination")?, landed));
    }
    let flights: Vec<based::Flight> =
        held.iter().map(|(o, d, landed)| based::Flight { origin: o.as_deref(), destination: d.as_deref(), landed: *landed }).collect();
    let base = based::usual_base(&flights);
    let mut out = String::from("{\"ident\":");
    json::opt_string(&mut out, base.ident);
    out.push_str(",\"most\":");
    json::opt_string(&mut out, base.most.map(|(i, _)| i));
    out.push_str(&format!(
        ",\"most_ends\":{},\"ends\":{},\"min_ends\":{},\"min_share\":",
        base.most.map_or(0, |(_, n)| n),
        base.ends,
        based::MIN_ENDS
    ));
    json::number(&mut out, based::MIN_SHARE);
    out.push('}');
    Ok(out)
}

/// A field's ident as its FAA one, whether two name one field, and every
/// name it may be filed under (field.rs, `bare_field`, `same_field`,
/// `field_names`).
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn field_ident(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut out = String::new();
    match name {
        "bare_field" => json::string(&mut out, &field::bare_field(ask.str("ident")?)),
        "same_field" => out.push_str(if field::same_field(ask.str("a")?, ask.str("b")?) { "true" } else { "false" }),
        "field_names" => {
            let icao = ask.opt_str("icao_id")?;
            let names = field::field_names(ask.str("ident")?, (!icao.is_empty()).then_some(icao));
            out.push('[');
            for (i, n) in names.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::string(&mut out, n);
            }
            out.push(']');
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}
