//! `notam_subject`'s input read into a Card and its badges written out
//! as JSON (the contract, engine/crates/weather/contract/notam_subject.json).

use super::{subject, Card, CardLight, On, Severity};
use crate::json::{self, Value};

fn strings(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array).unwrap_or(&[]).iter().filter_map(Value::as_str).map(str::to_owned).collect()
}

/// The card as the caller sent it.
fn card_of(v: &Value) -> Card {
    let rows = |key: &str| v.get(key).and_then(Value::as_array).unwrap_or(&[]);
    Card {
        idents: strings(v.get("idents")),
        runways: strings(v.get("runways")),
        lights: rows("lights")
            .iter()
            .map(|l| CardLight {
                code: l.get("code").and_then(Value::as_str).map(str::to_owned),
                name: l.get("name").and_then(Value::as_str).unwrap_or("").to_owned(),
                runways: strings(l.get("runways")),
            })
            .collect(),
        approaches: strings(v.get("approaches")),
        frequencies: rows("frequencies")
            .iter()
            .map(|f| (f.get("type").and_then(Value::as_str).map(str::to_owned), f.get("mhz").and_then(Value::as_f64)))
            .collect(),
    }
}

/// `notam_subject`: `{"text", "tfr"?, "idents"?, "runways"?, "lights"?,
/// "approaches"?, "frequencies"?}` to `{"badges": [{"on", "index",
/// "word", "severity", "label"}]}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "notam_subject" {
        return Err(format!("{name}: not a rule of notam_subject"));
    }
    let text = v.get("text").and_then(Value::as_str).ok_or("notam_subject: \"text\" is missing")?;
    let tfr = matches!(v.get("tfr"), Some(Value::Bool(true)));
    let mut out = String::from("{\"badges\":[");
    for (k, b) in subject(text, tfr, &card_of(v)).iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        let (on, index) = match b.on {
            On::Field => ("field", None),
            On::Runway(i) => ("runway", Some(i)),
            On::Light(i) => ("light", Some(i)),
            On::Approach(i) => ("approach", Some(i)),
            On::Frequency(i) => ("frequency", Some(i)),
            On::Fuel => ("fuel", None),
        };
        out.push_str("{\"on\":");
        json::string(&mut out, on);
        out.push_str(",\"index\":");
        out.push_str(&index.map_or("null".to_owned(), |i| i.to_string()));
        out.push_str(",\"word\":");
        json::string(&mut out, b.word);
        out.push_str(",\"severity\":");
        json::string(&mut out, if b.severity == Severity::Unusable { "unusable" } else { "caution" });
        out.push_str(",\"label\":");
        json::string(&mut out, &b.label);
        out.push('}');
    }
    out.push_str("]}");
    Ok(out)
}
