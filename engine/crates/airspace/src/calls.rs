//! The airspace rules by name (engine/facade/src/call.rs looks each up
//! from its contract file, crates/airspace/contract/<name>.json): the
//! column over a point and the Mode C veil (rules.rs: 14 CFR 71, 91.215),
//! and the region a point's cycle pack covers (pack_query.rs).

use crate::json::{self, Value};
use wingtip_core::ask::Ask;

/// `airspace_column`, `mode_c_veil` and `region_of`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    match name {
        "airspace_column" => crate::rules::column_json(v),
        "mode_c_veil" => crate::rules::veil_json(v),
        "region_of" => {
            let ask = Ask::new(name, v);
            let mut out = String::new();
            json::string(&mut out, &crate::pack_query::region_of(ask.num("lat")?, ask.num("lon")?));
            Ok(out)
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}
