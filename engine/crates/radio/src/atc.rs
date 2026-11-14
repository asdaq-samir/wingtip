//! The ATC copilot's rules (their contract files in crates/radio/contract):
//!
//! - `atc_call`: a transmission heard, who said it and what it asks.
//!   `{"who": "to_us"|"from_us"|"other", "items": [...]}` from `{"text",
//!   "tail"?, "prior"?: {"text", "ago_s"}}`. With no `tail` nothing is
//!   ours ("other"). A transmission with no call sign that follows a call
//!   to us within READBACK_WITHIN_S and says one of its figures back is
//!   taken as our readback: one without the call sign, which the readback
//!   check then says (AIM 4-4-7 b.1).
//! - `readback_check`: a readback against the clearance or instruction
//!   heard (readback.rs), `{"items": [{"item", "cleared", "said",
//!   "required"}], "words"}` from `{"cleared", "said", "tail"?}`.
//!
//! The words are the edge's (each app's recognizer); what is ours, what
//! it says and whether it was read back are decided here once. Advisory
//! only: nothing is set or refused (14 CFR 91.3, 91.123).

use crate::callsign::{self, Who};
use crate::instruction::{self, Item};
use crate::json::{self, Value};
use crate::readback;

/// How soon after a call to us a transmission with no call sign may be
/// our readback, s: a readback follows at once, and a controller's next
/// call to someone else comes within a breath of it. A judgment, not a
/// rule's figure.
pub const READBACK_WITHIN_S: f64 = 20.0;

/// The figures an instruction's items carry, as a readback says them.
fn figures(items: &[Item]) -> Vec<i64> {
    let mut out = Vec::new();
    for item in items {
        match item {
            Item::Altitude { ft, .. } | Item::Expect { ft, .. } => {
                out.push(*ft);
                if *ft >= 18000 {
                    out.push(ft / 100);
                }
            }
            Item::Heading { deg: Some(d), .. } => out.push(*d),
            Item::Heading { by_deg: Some(b), .. } => out.push(*b),
            Item::Squawk { code } => out.extend(code.parse::<i64>().ok()),
            Item::Altimeter { inhg } => out.extend(inhg.replace('.', "").parse::<i64>().ok()),
            _ => {}
        }
    }
    out
}

/// Who said `text`: the call sign's place (callsign::who), else, with no
/// call sign at all, our readback where it follows our call and says its
/// figures back.
pub fn who(text: &str, tail: Option<&str>, prior: Option<(&str, f64)>) -> Who {
    let Some(tail) = tail.filter(|t| !t.trim().is_empty()) else { return Who::Other };
    let by_sign = callsign::who(text, tail);
    if by_sign != Who::Other || !callsign::spans(text, tail).is_empty() {
        return by_sign;
    }
    let Some((prior_text, ago_s)) = prior else { return Who::Other };
    if !(0.0..=READBACK_WITHIN_S).contains(&ago_s) || callsign::who(prior_text, tail) != Who::ToUs {
        return Who::Other;
    }
    let wanted = figures(&instruction::read(prior_text));
    let said = crate::clearance::tokens(text);
    let repeats =
        said.iter().filter_map(|t| t.num.as_deref()).any(|n| !n.contains('.') && n.parse::<i64>().is_ok_and(|n| wanted.contains(&n)));
    if repeats {
        Who::FromUs
    } else {
        Who::Other
    }
}

fn opt_str<'a>(name: &str, v: &'a Value, key: &str) -> Result<Option<&'a str>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a string")),
    }
}

fn str<'a>(name: &str, v: &'a Value, key: &str) -> Result<&'a str, String> {
    opt_str(name, v, key)?.ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

/// The rule `name` worked on `v`.
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    match name {
        "atc_call" => {
            let text = str(name, v, "text")?;
            let tail = opt_str(name, v, "tail")?;
            let prior = match v.get("prior") {
                None | Some(Value::Null) => None,
                Some(p) => {
                    let ago = p.get("ago_s").and_then(Value::as_f64).ok_or_else(|| format!("{name}: \"prior.ago_s\" is not a number"))?;
                    Some((str(name, p, "text")?, ago))
                }
            };
            let mut o = String::from("{\"who\":");
            json::string(&mut o, who(text, tail, prior).name());
            o.push_str(",\"items\":");
            o.push_str(&instruction::items_json(&instruction::read(text)));
            o.push('}');
            Ok(o)
        }
        "readback_check" => Ok(readback::check_json(str(name, v, "cleared")?, str(name, v, "said")?, opt_str(name, v, "tail")?)),
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}
