//! The receiver's rules as the engine's dispatcher asks them, JSON in and
//! out; each is named by its contract file in ../contract.

use crate::{picture_json, views};
use wingtip_core::base64;
use wingtip_core::json::Value;

fn at(name: &str, v: &Value) -> Result<f64, String> {
    v.get("at").and_then(Value::as_f64).ok_or_else(|| format!("{name}: \"at\" is missing"))
}

pub fn call(name: &str, v: &Value) -> Result<String, String> {
    match name {
        "receiver_read" => {
            let at = at(name, v)?;
            let bytes = match v.get("data") {
                None | Some(Value::Null) => Vec::new(),
                Some(Value::String(s)) => base64::decode(s).map_err(|e| format!("{name}: \"data\": {e}"))?,
                Some(_) => return Err(format!("{name}: \"data\" is not Base64 text")),
            };
            let mut picture = picture_json::read(v.get("picture"));
            picture.read(&bytes, at);
            Ok(picture_json::write(&picture, at))
        }
        "receiver_traffic" => {
            let at = at(name, v)?;
            let picture = picture_json::read(v.get("picture"));
            let internet = v.get("internet").and_then(Value::as_array).unwrap_or(&[]);
            Ok(views::traffic(&picture, internet, v.get("own_ft").and_then(Value::as_f64), at))
        }
        "receiver_reports" => {
            let ident = v.get("ident").and_then(Value::as_str).ok_or_else(|| format!("{name}: \"ident\" is missing"))?;
            Ok(views::reports(&picture_json::read(v.get("picture")), ident))
        }
        "receiver_nexrad" => Ok(views::nexrad(&picture_json::read(v.get("picture")))),
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}
