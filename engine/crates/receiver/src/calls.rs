//! The receiver's rules as the engine's dispatcher asks them, JSON in and
//! out; each is named by its contract file in ../contract.

use crate::held::Held;
use crate::{picture_json, position, views};
use base64::alphabet::STANDARD;
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
use base64::engine::DecodePaddingMode;
use base64::Engine as _;
use wingtip_core::json::Value;

/// How a host hands the engine a receiver's bytes, since every rule takes
/// JSON: Base64 (RFC 4648, section 4: the standard alphabet), its `=`
/// padding optional. White space (RFC 2045's line break every 76
/// characters) is taken out before it is read.
const BASE64: GeneralPurpose =
    GeneralPurpose::new(&STANDARD, GeneralPurposeConfig::new().with_decode_padding_mode(DecodePaddingMode::Indifferent));

fn bytes_of(text: &str) -> Result<Vec<u8>, String> {
    BASE64.decode(text.split_ascii_whitespace().collect::<String>()).map_err(|e| format!("Base64: {e}"))
}

fn at(name: &str, v: &Value) -> Result<f64, String> {
    v.get("at").and_then(Value::as_f64).ok_or_else(|| format!("{name}: \"at\" is missing"))
}

/// The bytes a rule is handed in its "data", none where it has none.
fn data(name: &str, v: &Value) -> Result<Vec<u8>, String> {
    match v.get("data") {
        None | Some(Value::Null) => Ok(Vec::new()),
        Some(Value::String(s)) => bytes_of(s).map_err(|e| format!("{name}: \"data\": {e}")),
        Some(_) => Err(format!("{name}: \"data\" is not Base64 text")),
    }
}

pub fn call(name: &str, v: &Value) -> Result<String, String> {
    match name {
        "receiver_read" => {
            let at = at(name, v)?;
            let bytes = data(name, v)?;
            let mut picture = picture_json::read(v.get("picture"));
            picture.read(&bytes, at);
            Ok(picture_json::write(&picture, at))
        }
        // The phones hold the picture in a ReceiverSession (bindings/ffi)
        // and answer this from it; asked by name, the picture handed over
        // is held for the one read.
        "receiver_delta" => {
            let at = at(name, v)?;
            let bytes = data(name, v)?;
            Ok(Held::new(picture_json::read(v.get("picture"))).read(&bytes, at))
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
        "receiver_position" => position::position(v),
        "receiver_nexrad" => Ok(views::nexrad(&picture_json::read(v.get("picture")))),
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_as_hosts_send_it() {
        // RFC 4648, section 10's vectors, with and without the padding,
        // and a line broken as RFC 2045 breaks it.
        for (plain, coded) in [("", ""), ("f", "Zg=="), ("fo", "Zm8="), ("foob", "Zm9vYg=="), ("foobar", "Zm9vYmFy")] {
            assert_eq!(bytes_of(coded).unwrap(), plain.as_bytes());
            assert_eq!(bytes_of(coded.trim_end_matches('=')).unwrap(), plain.as_bytes());
        }
        assert_eq!(bytes_of("Zm9v\r\nYmE").unwrap(), b"fooba");
        assert!(bytes_of("Zm9v!").is_err());
    }
}
