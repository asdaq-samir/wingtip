//! The aircraft rules as crate::call answers them, JSON in and out; each
//! name and its input are in its file in crates/pilot/contract.

use super::filters;
use super::registry;
use crate::json::{self, Value};

type R<T> = Result<T, String>;

fn opt_num(name: &str, v: &Value, key: &str) -> R<Option<f64>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

fn opt_str<'a>(name: &str, v: &'a Value, key: &str) -> R<Option<&'a str>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a string")),
    }
}

fn flag(out: &mut String, b: bool) {
    out.push_str(if b { "true" } else { "false" });
}

/// The rule `name` worked on `v`.
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> R<String> {
    let mut out = String::new();
    match name {
        "emitter_category" => json::opt_string(&mut out, filters::emitter(opt_str(name, v, "category")?)),
        "squawk_meaning" => json::opt_string(&mut out, filters::squawk_meaning(opt_str(name, v, "squawk")?)),
        "n_number" => flag(&mut out, registry::is_n_number(opt_str(name, v, "text")?.unwrap_or(""))),
        "registered_profile" => json::opt_string(
            &mut out,
            registry::profile_of(opt_str(name, v, "manufacturer")?, opt_str(name, v, "model")?, opt_num(name, v, "year")?),
        ),
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}
