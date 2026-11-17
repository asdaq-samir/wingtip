use super::*;

// --- JSON in and out ---

pub(super) fn text(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_owned)
}

pub(super) fn end(v: Option<&Value>) -> Option<End> {
    let v = v?;
    Some(End { ident: text(v, "ident")?, traffic: text(v, "traffic") })
}

/// `radio_script`: `[{"title", "ident", "kind", "calls": [{"to", "mhz",
/// "words", "note"?, "listen"?}]}]` from `{"call_sign", "airports":
/// [{"ident", "name"?, "airspace_class"?, "frequencies",
/// "pattern_altitude_ft"?, "takeoff"?, "landing"?: {"ident",
/// "traffic"?}}], "legs": [{"from", "to", "true_course_deg",
/// "altitude_ft"}]}`.
pub fn script_json(name: &str, v: &Value, frequencies: impl Fn(&Value) -> Result<Vec<Frequency>, String>) -> Result<String, String> {
    let cs = v.get("call_sign").and_then(Value::as_str).ok_or_else(|| format!("{name}: \"call_sign\" is missing"))?;
    let airports = v.get("airports").and_then(Value::as_array).ok_or_else(|| format!("{name}: \"airports\" is missing"))?;
    let fields = airports
        .iter()
        .map(|a| {
            Ok(Field {
                ident: text(a, "ident").ok_or_else(|| format!("{name}: an airport has no \"ident\""))?,
                name: text(a, "name"),
                airspace_class: text(a, "airspace_class"),
                frequencies: frequencies(a)?,
                pattern_altitude_ft: a.get("pattern_altitude_ft").and_then(Value::as_f64),
                takeoff: end(a.get("takeoff")),
                landing: end(a.get("landing")),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let legs: Vec<Leg> = v
        .get("legs")
        .and_then(Value::as_array)
        .unwrap_or(&[])
        .iter()
        .map(|l| Leg {
            from: text(l, "from").unwrap_or_default(),
            to: text(l, "to").unwrap_or_default(),
            true_course_deg: l.get("true_course_deg").and_then(Value::as_f64).unwrap_or(0.0),
            altitude_ft: l.get("altitude_ft").and_then(Value::as_f64).unwrap_or(0.0),
        })
        .collect();
    let mut out = String::from("[");
    for (i, p) in radio_script(cs, &fields, &legs).iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"title\":");
        json::string(&mut out, &p.title);
        out.push_str(",\"ident\":");
        json::string(&mut out, &p.ident);
        out.push_str(",\"kind\":");
        json::string(&mut out, p.kind);
        out.push_str(",\"calls\":[");
        for (j, c) in p.calls.iter().enumerate() {
            if j > 0 {
                out.push(',');
            }
            out.push_str("{\"to\":");
            json::string(&mut out, &c.to);
            out.push_str(",\"mhz\":");
            json::opt_number(&mut out, c.mhz);
            out.push_str(",\"words\":");
            json::string(&mut out, &c.words);
            if let Some(note) = &c.note {
                out.push_str(",\"note\":");
                json::string(&mut out, note);
            }
            if c.listen {
                out.push_str(",\"listen\":true");
            }
            out.push('}');
        }
        out.push_str("]}");
    }
    out.push(']');
    Ok(out)
}
