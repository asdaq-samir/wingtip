//! The pilot's records by name (engine/facade/src/call.rs looks each up
//! from its contract file, crates/pilot/contract/<name>.json): checklists
//! (GAMA Specification No. 1), the logbook's CSV, a POH page's figures,
//! endorsements (AC 61-65K) and currency (14 CFR 61.56, 61.57).

use super::{checklist, csv, currency, endorsements, handbook, logbook};
use crate::json::{self, Value};
use wingtip_core::ask::{strings, Ask};

/// A checklist read, written, or a section found in it (checklist.rs).
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn checklists(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut out = String::new();
    match name {
        "checklist_section" => {
            let titles = ask
                .list("titles")?
                .iter()
                .map(|t| t.as_str().map(str::to_owned).ok_or(format!("{name}: a title is not a string")))
                .collect::<Result<Vec<_>, _>>()?;
            let want = match v.get("want") {
                None | Some(Value::Null) => checklist::EMERGENCY_PHASES[2].to_owned(),
                Some(Value::String(w)) => w.clone(),
                Some(_) => return Err(format!("{name}: \"want\" is not a string")),
            };
            return Ok(checklist::section_for(&titles, &want).map_or("null".to_owned(), |i| i.to_string()));
        }
        "checklist_read" => return Ok(checklist::to_json(&checklist::read(ask.str("text")?))),
        "checklist_write" => json::string(&mut out, &checklist::write(&sections(&ask)?)),
        // The headings a checklist starts from (GAMA Specification No. 1,
        // Sections 3 and 4).
        "checklist_phases" => {
            let kind = ask.str("kind")?;
            let phases: &[&str] = match kind {
                "normal" => &checklist::NORMAL_PHASES,
                "emergency" => &checklist::EMERGENCY_PHASES,
                _ => return Err(format!("{name}: no kind {kind:?}, only \"normal\" or \"emergency\"")),
            };
            strings(&mut out, &phases.iter().map(|p| (*p).to_owned()).collect::<Vec<_>>());
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}

/// A checklist's sections, `{"checklist": {"sections": [...]}}`.
fn sections(ask: &Ask) -> Result<Vec<checklist::Section>, String> {
    let bad =
        || format!("{}: \"checklist\" is not {{\"sections\": [{{\"title\", \"items\": [{{\"challenge\", \"response\"}}]}}]}}", ask.name);
    let sections = ask.v.get("checklist").and_then(|c| c.get("sections")).and_then(Value::as_array).ok_or_else(bad)?;
    sections
        .iter()
        .map(|s| {
            let title = s.get("title").and_then(Value::as_str).ok_or_else(bad)?.to_owned();
            let items = s
                .get("items")
                .and_then(Value::as_array)
                .ok_or_else(bad)?
                .iter()
                .map(|i| {
                    Ok(checklist::Item {
                        challenge: i.get("challenge").and_then(Value::as_str).ok_or_else(bad)?.to_owned(),
                        response: match i.get("response") {
                            None | Some(Value::Null) => None,
                            Some(Value::String(r)) => Some(r.clone()),
                            Some(_) => return Err(bad()),
                        },
                    })
                })
                .collect::<Result<_, String>>()?;
            Ok(checklist::Section { title, items })
        })
        .collect()
}

/// A CSV's rows, the logbook's CSV read and written, a POH page's
/// figures (csv.rs, logbook.rs, handbook.rs).
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn files(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut out = String::new();
    match name {
        "csv_rows" => {
            out.push('[');
            for (i, row) in csv::rows(ask.str("text")?).iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                strings(&mut out, row);
            }
            out.push(']');
        }
        "logbook_csv_read" => return Ok(logbook::read_json(ask.str("text")?)),
        "logbook_csv_write" => json::string(&mut out, &logbook::write(ask.list("entries")?)),
        "handbook_figures" => return Ok(handbook::to_json(&handbook::figures_of_page(ask.str("text")?))),
        "handbook_within" => {
            let key = ask.str("key")?;
            match handbook::figure_within(key, ask.num("value")?) {
                Some(yes) => out.push_str(&yes.to_string()),
                None => return Err(format!("{name}: no figure is called {key:?}")),
            }
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}

/// Endorsements (AC 61-65K, endorsements.rs) and currency (61.56, 61.57,
/// currency.rs).
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn endorsed(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let text = |key: &str| match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.as_str())),
        Some(_) => Err(format!("{name}: \"{key}\" is not a string")),
    };
    let mut out = String::new();
    match name {
        "endorsement_lapse" => {
            let warning = endorsements::lapse_warning(text("until")?, text("until_kind")?, ask.str("signed_on")?)?;
            json::opt_string(&mut out, warning.as_deref());
        }
        "solo_standing" => {
            let (days, standing) = endorsements::solo_standing(text("until")?, ask.str("today")?)?;
            // A whole number of days, as the contract types it (integer).
            out.push_str("{\"days\":");
            out.push_str(&days.map_or("null".to_owned(), |d| d.to_string()));
            out.push_str(",\"standing\":");
            json::string(&mut out, standing);
            out.push('}');
        }
        "endorsements_in_force" => {
            let signed = ask
                .list("signed")?
                .iter()
                .map(|e| {
                    let code = e.get("code").and_then(Value::as_str).ok_or(format!("{name}: an endorsement's \"code\" is missing"))?;
                    Ok((code.to_owned(), matches!(e.get("voided"), Some(Value::Bool(true)))))
                })
                .collect::<Result<Vec<_>, String>>()?;
            out.push('[');
            for (i, (code, at)) in endorsements::in_force(&signed).iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push('[');
                json::string(&mut out, code);
                out.push_str(&format!(",{at}]"));
            }
            out.push(']');
        }
        "endorsement_render" => {
            let fields = match v.get("fields") {
                None | Some(Value::Null) => None,
                Some(f @ Value::Object(_)) => Some(f),
                Some(_) => return Err(format!("{name}: \"fields\" is not an object of names to words")),
            };
            let field = |key: &str| fields.and_then(|f| f.get(key)).and_then(Value::as_str).map(str::to_owned);
            json::string(&mut out, &endorsements::render(ask.str("template")?, ask.opt_str("student")?, &field));
        }
        "acs_codes" => strings(&mut out, &endorsements::acs_codes(ask.str("text")?)),
        "pilot_currency" => {
            let entries = currency::entries(name, ask.list("entries")?)?;
            let day = |key: &str| text(key).map_err(|_| format!("{name}: \"{key}\" is not a day"));
            let dates = currency::Dates {
                flight_review_on: day("flight_review_on")?,
                medical_expires_on: day("medical_expires_on")?,
                ipc_on: day("ipc_on")?,
                today: ask.str("today")?,
            };
            return currency::currency_json(name, &entries, &dates);
        }
        "pilot_experience" => return currency::experience_json(name, &currency::entries(name, ask.list("entries")?)?, ask.str("today")?),
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}
