//! `gonogo_glance_lines` by name (glance holds the rule): its input read
//! from the hosts' JSON -- the Go / No-Go's findings, the departure's and
//! destination's figures and the reports as sent -- and its answer written.

use super::calls::{items, truth, In};
use super::glance::{self, Field, Raw};
use super::strings;
use super::verdict::item_json;
use crate::json::{self, Value};

type R<T> = Result<T, String>;

/// `gonogo_glance_lines` by name.
pub fn call(name: &str, v: &Value) -> R<String> {
    let i = In { name };
    let items = items(i, v, "items")?;
    let fields = i
        .list(v, "fields")?
        .iter()
        .map(|f| {
            Ok(Field {
                ident: i.str(f, "ident")?,
                runway: i.opt_str(f, "runway")?,
                crosswind_kt: i.opt_num(f, "crosswind_kt")?,
                crosswind_over: truth(f, "crosswind_over"),
                finding: i.str(f, "finding")?,
            })
        })
        .collect::<R<Vec<_>>>()?;
    let raw = match i.obj(v, "raw")? {
        None => None,
        Some(r) => Some(Raw { metars: i.strings(r, "metars")?, tafs: i.strings(r, "tafs")?, tfrs: i.strings(r, "tfrs")? }),
    };
    let (act, rest) = glance::glance_lines(&items, &fields, raw.as_ref());
    let mut out = String::from("{\"act\":[");
    for (n, l) in act.iter().enumerate() {
        if n > 0 {
            out.push(',');
        }
        let it = &l.item;
        for (k, s) in [("{\"key\":", &it.key), (",\"finding\":", &it.finding), (",\"tab\":", &it.tab)] {
            out.push_str(k);
            json::string(&mut out, s);
        }
        out.push_str(",\"section\":");
        json::opt_string(&mut out, it.section.as_deref());
        for (k, s) in [(",\"line\":", &l.line), (",\"lead\":", &l.lead), (",\"action\":", &l.action)] {
            out.push_str(k);
            json::string(&mut out, s);
        }
        for (k, s) in [(",\"why\":", l.why), (",\"cite\":", l.cite)] {
            out.push_str(k);
            json::string(&mut out, s);
        }
        out.push_str(",\"raw\":");
        strings(&mut out, &l.raw);
        out.push('}');
    }
    out.push_str("],\"rest\":{\"line\":");
    json::string(&mut out, &rest.line);
    out.push_str(",\"finding\":");
    json::string(&mut out, rest.finding);
    out.push_str(",\"items\":[");
    for (n, it) in rest.items.iter().enumerate() {
        if n > 0 {
            out.push(',');
        }
        item_json(&mut out, it);
    }
    out.push_str("]}}");
    Ok(out)
}
