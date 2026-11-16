//! What the radio says, read, by name (engine/facade/src/call.rs looks
//! each up from its contract file, crates/radio/contract/<name>.json): a
//! clearance (clearance.rs, the web's lib/clearance and lib/heardCall,
//! held to the same fixtures as the web's tests), an ATIS (atis.rs, the
//! fixture atis.json) and a D-ATIS as the tower's data link writes it
//! (datis.rs, its weather read from its METAR groups).

use crate::clearance::{self, Found, FoundPlaces, FoundProcedure, Route, Token};
use crate::json::{self, Value};
use wingtip_core::ask::Ask;

/// A clearance, an ATIS or a D-ATIS heard, read.
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut out = String::new();
    match name {
        "read_clearance" => return Ok(clearance::read(ask.str("text")?).to_json()),
        "read_atis" => return Ok(crate::atis::read(ask.str("text")?).to_json()),
        "read_datis" => return Ok(crate::datis::read_datis(ask.str("text")?).to_json()),
        "datis_remarks" => crate::atis::strings(&mut out, &crate::datis_remarks::datis_remarks(ask.str("text")?)),
        "cleared_route" => return cleared_route(&ask),
        "our_call" => out.push_str(&clearance::our_call(ask.str("text")?, ask.str("tail")?).to_string()),
        "direct_of" => json::opt_string(&mut out, clearance::direct_of(ask.str("text")?).as_deref()),
        "call_pattern" => json::opt_string(&mut out, clearance::call_pattern(ask.str("tail")?).as_deref()),
        "tokens" => {
            out.push('[');
            for (i, t) in clearance::tokens(ask.str("text")?).iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str("{\"word\":");
                json::string(&mut out, &t.word);
                if let Some(num) = &t.num {
                    out.push_str(",\"num\":");
                    json::string(&mut out, num);
                }
                out.push('}');
            }
            out.push(']');
        }
        "place_words" => {
            let toks = ask
                .list("tokens")?
                .iter()
                .map(|t| {
                    let word = t.get("word").and_then(Value::as_str).ok_or_else(|| format!("{name}: a token has no \"word\""))?;
                    Ok(Token { word: word.to_owned(), num: t.get("num").and_then(Value::as_str).map(str::to_owned) })
                })
                .collect::<Result<Vec<_>, String>>()?;
            json::string(&mut out, &clearance::place_words(&toks));
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}

/// The route a clearance gives (clearance::cleared_route) from the words
/// heard, the planner's places for them and the route planned: the web's
/// lib/clearance clearedRoute, its input the places as ClearancePlaces
/// answers them.
fn cleared_route(ask: &Ask) -> Result<String, String> {
    let name = ask.name;
    let text = ask.str("text")?;
    let str_in = |v: &Value, key: &str| -> Option<String> { v.get(key).and_then(Value::as_str).map(str::to_owned) };
    let found_in = |v: &Value| -> Result<Found, String> {
        let kind = match v.get("kind").and_then(Value::as_str) {
            Some("airport") => Some("airport"),
            Some("navaid") => Some("navaid"),
            Some("fix") => Some("fix"),
            _ => None,
        };
        let sure = match v.get("sure") {
            Some(Value::Bool(b)) => *b,
            _ => true,
        };
        Ok(Found {
            said: str_in(v, "said").unwrap_or_default(),
            ident: str_in(v, "ident"),
            name: str_in(v, "name"),
            kind,
            sure,
            ..Found::default()
        })
    };
    let procedure_in = |v: Option<&Value>| -> Result<Option<FoundProcedure>, String> {
        match v {
            None | Some(Value::Null) => Ok(None),
            Some(p @ Value::Object(_)) => Ok(Some(FoundProcedure {
                id: str_in(p, "id").ok_or_else(|| format!("{name}: a procedure found has no \"id\""))?,
                transition: str_in(p, "transition"),
            })),
            Some(_) => Err(format!("{name}: a procedure found is not an object")),
        }
    };
    let found = match ask.v.get("found") {
        None | Some(Value::Null) => FoundPlaces::default(),
        Some(f @ Value::Object(_)) => FoundPlaces {
            limit: match f.get("limit") {
                Some(l @ Value::Object(_)) => Some(found_in(l)?),
                _ => None,
            },
            route: match f.get("route") {
                Some(Value::Array(runs)) => runs
                    .iter()
                    .map(|run| run.as_array().unwrap_or(&[]).iter().map(found_in).collect::<Result<Vec<_>, _>>())
                    .collect::<Result<Vec<_>, _>>()?,
                _ => Vec::new(),
            },
            departure: procedure_in(f.get("departure"))?,
            arrival: procedure_in(f.get("arrival"))?,
        },
        Some(_) => return Err(format!("{name}: \"found\" is not an object")),
    };
    let planned = match ask.v.get("planned") {
        Some(p @ Value::Object(_)) => Route {
            dep: str_in(p, "dep").unwrap_or_default(),
            stops: p
                .get("stops")
                .and_then(Value::as_array)
                .map(|s| s.iter().filter_map(|v| v.as_str().map(str::to_owned)).collect())
                .unwrap_or_default(),
            dest: str_in(p, "dest").unwrap_or_default(),
        },
        _ => return Err(format!("{name}: \"planned\" is missing or not an object")),
    };
    let (route, typed) = clearance::cleared_route(&clearance::read(text), &found, &planned);
    let mut out = String::from("{\"route\":{\"dep\":");
    json::string(&mut out, &route.dep);
    out.push_str(",\"stops\":[");
    for (i, stop) in route.stops.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(&mut out, stop);
    }
    out.push_str("],\"dest\":");
    json::string(&mut out, &route.dest);
    out.push_str("},\"typed\":[");
    for (i, t) in typed.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"name\":");
        json::string(&mut out, &t.name);
        out.push_str(",\"before\":");
        json::opt_string(&mut out, t.before.as_deref());
        out.push_str(",\"after\":");
        json::opt_string(&mut out, t.after.as_deref());
        out.push('}');
    }
    out.push_str("]}");
    Ok(out)
}
