//! The aircraft rules as crate::call answers them, JSON in and out; each
//! name and its input are in its file in crates/pilot/contract.

use super::filters;
use super::registry;
use crate::json::{self, Value};
use wingtip_core::ask::{opt_num_in as opt_num, opt_str_in as opt_str};

type R<T> = Result<T, String>;

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
