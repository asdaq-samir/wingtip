//! `departure_window` by name (gonogo::calls dispatches it): its input
//! read from the planner's JSON and its answer written, the rule itself
//! window's.

use super::calls::{alternates, frat_input, truth, verdict_input, In};
use super::verdict::{self, Item};
use super::window::{Answer, Hour, Input};
use crate::json::{self, Value};

type R<T> = Result<T, String>;


fn point(i: In, v: &Value, key: &str) -> R<(f64, f64)> {
    match v.get(key).and_then(Value::as_array) {
        Some([lat, lon]) => match (lat.as_f64(), lon.as_f64()) {
            (Some(lat), Some(lon)) => Ok((lat, lon)),
            _ => i.err(key, "is not [lat, lon]"),
        },
        _ => i.err(key, "is not [lat, lon]"),
    }
}

/// `departure_window`'s input read from its JSON.
pub(crate) fn read(i: In, v: &Value) -> R<Input> {
    let mine = i.obj(v, "minimums")?;
    let hours = i
        .list(v, "hours")?
        .iter()
        .map(|h| {
            let given = i.obj(h, "verdict")?.map_or_else(|| i.err("verdict", "is missing"), Ok)?;
            Ok(Hour {
                depart_s: i.num(h, "depart_s")?,
                reaches: truth(h, "reaches"),
                ete_min: i.opt_num(h, "ete_min")?,
                fuel_gal: i.opt_num(h, "fuel_gal")?,
                ground_min: i.opt_num(h, "ground_min")?.unwrap_or(0.0),
                ceiling_ft: i.opt_num(h, "ceiling_ft")?,
                visibility_sm: i.opt_num(h, "visibility_sm")?,
                verdict: verdict_input(i, given)?,
                alternate: alternates(i, h.get("alternate"))?,
            })
        })
        .collect::<R<Vec<_>>>()?;
    Ok(Input {
        start: point(i, v, "start")?,
        end: point(i, v, "end")?,
        airplane: truth(v, "airplane"),
        ceiling_ft: mine.map(|m| i.opt_num(m, "ceiling_ft")).transpose()?.flatten(),
        visibility_sm: mine.map(|m| i.opt_num(m, "visibility_sm")).transpose()?.flatten(),
        risk: i.obj(v, "risk")?.map(|r| frat_input(i, r)).transpose()?,
        hours,
    })
}

fn reason_json(out: &mut String, i: &Item) {
    verdict::item_json(out, i);
}

pub fn answer_json(a: &Answer) -> String {
    let mut out = String::from("{\"hours\":[");
    for (n, h) in a.hours.iter().enumerate() {
        if n > 0 {
            out.push(',');
        }
        out.push_str("{\"depart_s\":");
        json::number(&mut out, h.depart_s);
        out.push_str(",\"verdict\":");
        json::string(&mut out, h.verdict);
        out.push_str(",\"reasons\":[");
        for (k, r) in h.reasons.iter().enumerate() {
            if k > 0 {
                out.push(',');
            }
            reason_json(&mut out, r);
        }
        out.push_str("],\"ete_min\":");
        json::opt_number(&mut out, h.ete_min);
        out.push_str(",\"fuel_gal\":");
        json::opt_number(&mut out, h.fuel_gal);
        out.push_str(&format!(",\"night\":{},\"night_passengers\":{}", h.night, h.night_passengers));
        out.push_str(",\"margin\":");
        json::opt_number(&mut out, h.margin.map(|m| (m * 100.0).round() / 100.0));
        out.push('}');
    }
    out.push_str("],\"windows\":[");
    for (n, w) in a.windows.iter().enumerate() {
        if n > 0 {
            out.push(',');
        }
        out.push_str("{\"from_s\":");
        json::number(&mut out, w.from_s);
        out.push_str(",\"last_s\":");
        json::number(&mut out, w.last_s);
        out.push_str(&format!(",\"hours\":{}", w.hours));
        out.push_str(",\"margin\":");
        json::opt_number(&mut out, w.margin.map(|m| (m * 100.0).round() / 100.0));
        out.push_str(",\"ete_min\":");
        json::opt_number(&mut out, w.ete_min);
        out.push_str(",\"quickest_s\":");
        json::number(&mut out, w.quickest_s);
        out.push('}');
    }
    out.push_str("]}");
    out
}
