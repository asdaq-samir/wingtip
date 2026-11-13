//! The debrief by name (engine/facade/src/call.rs looks each up from its
//! contract file): a flight against its flown track (ACS PA.VI.A,
//! debrief.rs), the web's debrief marked as /api/debrief marks its own,
//! and the runs of a track in the air.

use super::debrief;
use crate::json::{self, Value};
use wingtip_core::ask::{num_in, opt_num_in, Ask};

/// `debrief`, `debrief_marked` and `debrief_airborne`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    match name {
        "debrief" => {
            let checkpoints = checkpoints(&ask)?;
            let points = points(&ask)?;
            let patterns = match v.get("patterns") {
                None | Some(Value::Null) => Vec::new(),
                Some(Value::Object(members)) => members
                    .iter()
                    .map(|(ident, ft)| match ft.as_f64() {
                        Some(ft) => Ok((ident.clone(), ft)),
                        None => Err(format!("debrief: the pattern altitude of {ident:?} is not a number")),
                    })
                    .collect::<Result<_, _>>()?,
                Some(_) => return Err("debrief: \"patterns\" is not an object of idents to feet".to_owned()),
            };
            Ok(debrief::answer_json(&checkpoints, &points, &patterns))
        }
        "debrief_marked" => marked(&ask),
        "debrief_airborne" => {
            let runs = debrief::airborne(&points(&ask)?);
            let mut out = String::from("[");
            for (i, (a, b)) in runs.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&format!("[{a},{b}]"));
            }
            out.push(']');
            Ok(out)
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

/// The web's debrief (its figures, snake_case, with no marks) marked as
/// /api/debrief marks its own -- each leg, pass and pattern against ACS
/// PA.VI.A's tolerances -- with the tolerances beside it: `{"debrief",
/// "tolerances"}`. The rest of the debrief goes back as it came.
fn marked(ask: &Ask) -> Result<String, String> {
    let n = ask.name;
    let Some(Value::Object(members)) = ask.v.get("debrief") else {
        return Err(format!("{n}: \"debrief\" is not an object"));
    };
    let num = |v: &Value, k: &str| opt_num_in(n, v, k);
    let opt = |v: Option<f64>| v.map_or(Value::Null, Value::Number);
    let mut marked: Vec<(String, Value)> = Vec::new();
    for (key, value) in members {
        let items = || value.as_array().ok_or_else(|| format!("{n}: \"{key}\" is not a list"));
        let with = |item: &Value, extra: Vec<(&str, Value)>| -> Result<Value, String> {
            let Value::Object(fields) = item else { return Err(format!("{n}: an item of \"{key}\" is not an object")) };
            let mut fields = fields.clone();
            fields.retain(|(k, _)| !extra.iter().any(|(e, _)| e == k));
            fields.extend(extra.into_iter().map(|(k, v)| (k.to_owned(), v)));
            Ok(Value::Object(fields))
        };
        let value = match key.as_str() {
            "legs" => Value::Array(
                items()?
                    .iter()
                    .map(|l| with(l, vec![("ok", Value::Bool(debrief::leg_ok(num(l, "worst_alt_ft")?, num(l, "worst_off_nm")?)))]))
                    .collect::<Result<_, _>>()?,
            ),
            "passes" => Value::Array(
                items()?
                    .iter()
                    .map(|p| {
                        let category = p.get("category").and_then(Value::as_str).unwrap_or("");
                        let (landed, late, ok) = debrief::pass_marks(category, num(p, "due_min")?, num(p, "passed_min")?);
                        with(p, vec![("landed", Value::Bool(landed)), ("late_min", opt(late)), ("ok", ok.map_or(Value::Null, Value::Bool))])
                    })
                    .collect::<Result<_, _>>()?,
            ),
            "patterns" => Value::Array(
                items()?
                    .iter()
                    .map(|e| {
                        let alt = num(e, "alt_ft")?.ok_or_else(|| format!("{n}: a pattern's \"alt_ft\" is missing"))?;
                        let pattern = num(e, "pattern_ft")?.ok_or_else(|| format!("{n}: a pattern's \"pattern_ft\" is missing"))?;
                        let (off, ok) = debrief::pattern_marks(alt, pattern);
                        with(e, vec![("off_ft", Value::Number(off)), ("ok", Value::Bool(ok))])
                    })
                    .collect::<Result<_, _>>()?,
            ),
            _ => value.clone(),
        };
        marked.push((key.clone(), value));
    }
    let mut out = String::from("{\"debrief\":");
    json::value(&mut out, &Value::Object(marked));
    out.push_str(",\"tolerances\":");
    out.push_str(&debrief::tolerances_json());
    out.push('}');
    Ok(out)
}

fn checkpoints(ask: &Ask) -> Result<Vec<debrief::Checkpoint>, String> {
    let n = ask.name;
    ask.list("checkpoints")?
        .iter()
        .map(|c| {
            let text = |key: &str| {
                c.get(key).and_then(Value::as_str).map(str::to_owned).ok_or_else(|| format!("{n}: a checkpoint's \"{key}\" is missing"))
            };
            let sequence_no = num_in(n, c, "sequence_no")?;
            if sequence_no.fract() != 0.0 {
                return Err(format!("{n}: a checkpoint's \"sequence_no\" is not a whole number"));
            }
            Ok(debrief::Checkpoint {
                sequence_no: sequence_no as i64,
                name: text("name")?,
                category: text("category")?,
                lat: num_in(n, c, "lat")?,
                lon: num_in(n, c, "lon")?,
                along_track_nm: num_in(n, c, "along_track_nm")?,
                true_course_deg: opt_num_in(n, c, "true_course_deg")?,
                ete_min: opt_num_in(n, c, "ete_min")?,
                altitude_ft: opt_num_in(n, c, "altitude_ft")?,
            })
        })
        .collect()
}

fn points(ask: &Ask) -> Result<Vec<debrief::Point>, String> {
    let n = ask.name;
    ask.list("points")?
        .iter()
        .map(|p| {
            Ok(debrief::Point {
                t: num_in(n, p, "t")?,
                lat: num_in(n, p, "lat")?,
                lon: num_in(n, p, "lon")?,
                alt_ft: opt_num_in(n, p, "alt_ft")?,
            })
        })
        .collect()
}
