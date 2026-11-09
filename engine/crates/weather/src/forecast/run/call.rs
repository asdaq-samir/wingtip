//! `forecast_run` as crate::call answers it, JSON in and out (its contract:
//! contract/forecast_run.json).

use super::{met::Met, Field, Input, Minimums, Modelled, Role, Run, Sample, WindPeriod};
use crate::json::{self, Value};

type R<T> = Result<T, String>;

const NAME: &str = "forecast_run";

fn opt_num(v: &Value, key: &str) -> R<Option<f64>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{NAME}: \"{key}\" is not a number")),
    }
}

fn num(v: &Value, key: &str) -> R<f64> {
    opt_num(v, key)?.ok_or_else(|| format!("{NAME}: \"{key}\" is missing"))
}

fn list<'a>(v: &'a Value, key: &str) -> R<&'a [Value]> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        Some(_) => Err(format!("{NAME}: \"{key}\" is not a list")),
    }
}

fn levels(v: &Value) -> R<Vec<(f64, Option<f64>, f64)>> {
    let Some(Value::Object(members)) = v.get("levels") else {
        return Err(format!("{NAME}: a wind period's \"levels\" is not an object of altitudes"));
    };
    let mut out = Vec::new();
    for (alt, level) in members {
        let alt: f64 = alt.parse().map_err(|_| format!("{NAME}: a level's altitude {alt:?} is not a number"))?;
        if let Some(speed) = opt_num(level, "wind_speed_kt")? {
            out.push((alt, opt_num(level, "wind_dir_true_deg")?, speed));
        }
    }
    Ok(out)
}

fn sample(v: &Value) -> R<Sample> {
    Ok(Sample {
        t: num(v, "t")?,
        lat: num(v, "lat")?,
        lon: num(v, "lon")?,
        alt_ft: opt_num(v, "alt_ft")?,
        row: num(v, "row")?.max(0.0) as usize,
        modelled: list(v, "modelled")?
            .iter()
            .map(|m| {
                Ok(Modelled { valid: num(m, "valid")?, ceiling_ft: opt_num(m, "ceiling_ft")?, visibility_sm: opt_num(m, "visibility_sm")? })
            })
            .collect::<R<_>>()?,
        winds: list(v, "winds")?
            .iter()
            .map(|w| Ok(WindPeriod { from: num(w, "use_from")?, to: num(w, "use_to")?, levels: levels(w)? }))
            .collect::<R<_>>()?,
    })
}

fn field(v: &Value) -> R<Field> {
    let role = match v.get("role").and_then(Value::as_str) {
        Some("departure") => Role::Departure,
        Some("stop") => Role::Stop,
        Some("destination") => Role::Destination,
        _ => return Err(format!("{NAME}: a field's \"role\" is not departure, stop or destination")),
    };
    Ok(Field {
        ident: v.get("ident").and_then(Value::as_str).ok_or_else(|| format!("{NAME}: a field has no \"ident\""))?.to_owned(),
        role,
        t: num(v, "t")?,
        lat: num(v, "lat")?,
        lon: num(v, "lon")?,
    })
}

fn met_json(out: &mut String, m: &Met) {
    out.push_str("\"category\":");
    json::opt_string(out, m.category);
    out.push_str(",\"ceiling_ft\":");
    json::opt_number(out, m.ceiling_ft);
    out.push_str(&format!(",\"ceiling_unknown\":{},\"visibility_sm\":", m.ceiling_unknown));
    json::opt_number(out, m.visibility_sm);
    out.push_str(",\"source\":");
    json::opt_string(out, m.source.as_ref().map(|s| s.words()).as_deref());
}

fn indexes(out: &mut String, items: &[usize]) {
    out.push('[');
    out.push_str(&items.iter().map(usize::to_string).collect::<Vec<_>>().join(","));
    out.push(']');
}

fn write(r: &Run, track: &[Sample]) -> String {
    let mut out = String::from("{\"samples\":[");
    for (i, (m, s)) in r.samples.iter().zip(track).enumerate() {
        out.push_str(if i > 0 { ",{\"t\":" } else { "{\"t\":" });
        json::number(&mut out, s.t);
        out.push_str(",\"lat\":");
        json::number(&mut out, s.lat);
        out.push_str(",\"lon\":");
        json::number(&mut out, s.lon);
        out.push(',');
        met_json(&mut out, &m.met);
        out.push_str(",\"wind_dir_true_deg\":");
        json::opt_number(&mut out, m.wind.map(|w| w.dir_true_deg.round()));
        out.push_str(",\"wind_speed_kt\":");
        json::opt_number(&mut out, m.wind.map(|w| w.speed_kt.round()));
        out.push_str(",\"areas\":");
        indexes(&mut out, &m.areas);
        out.push('}');
    }
    out.push_str("],\"legs\":[");
    for (i, l) in r.legs.iter().enumerate() {
        out.push_str(&format!("{}{{\"row\":{},\"from_t\":", if i > 0 { "," } else { "" }, l.row));
        json::number(&mut out, l.from_t);
        out.push_str(",\"to_t\":");
        json::number(&mut out, l.to_t);
        out.push_str(",\"category\":");
        json::opt_string(&mut out, l.category);
        out.push_str(",\"worst_t\":");
        json::opt_number(&mut out, l.worst.map(|w| track[w].t));
        out.push('}');
    }
    out.push_str("],\"fields\":[");
    for (i, f) in r.fields.iter().enumerate() {
        out.push_str(if i > 0 { ",{\"ident\":" } else { "{\"ident\":" });
        json::string(&mut out, &f.field.ident);
        out.push_str(",\"role\":");
        json::string(&mut out, f.field.role.word());
        out.push_str(",\"t\":");
        json::number(&mut out, f.field.t);
        out.push(',');
        met_json(&mut out, &f.met);
        out.push('}');
    }
    out.push_str("],\"areas\":[");
    for (i, a) in r.areas.iter().enumerate() {
        out.push_str(if i > 0 { ",{\"kind\":" } else { "{\"kind\":" });
        json::string(&mut out, a.kind.word());
        out.push_str(",\"words\":");
        json::string(&mut out, &a.words);
        out.push_str(",\"source\":");
        json::string(&mut out, &a.source);
        for (key, v) in [("low_ft", a.low_ft), ("high_ft", a.high_ft), ("valid_from", a.valid_from), ("valid_to", a.valid_to)] {
            out.push_str(&format!(",\"{key}\":"));
            json::opt_number(&mut out, v);
        }
        out.push_str(",\"coords\":[");
        for (k, (lat, lon)) in a.coords.iter().enumerate() {
            out.push_str(if k > 0 { ",[" } else { "[" });
            json::number(&mut out, *lat);
            out.push(',');
            json::number(&mut out, *lon);
            out.push(']');
        }
        out.push_str("]}");
    }
    out.push_str("],\"alerts\":[");
    for (i, a) in r.alerts.iter().enumerate() {
        out.push_str(if i > 0 { ",{\"t\":" } else { "{\"t\":" });
        json::number(&mut out, a.t);
        out.push_str(",\"lat\":");
        json::number(&mut out, a.lat);
        out.push_str(",\"lon\":");
        json::number(&mut out, a.lon);
        out.push_str(",\"kind\":");
        json::string(&mut out, a.kind.word());
        out.push_str(",\"words\":");
        json::string(&mut out, &a.words);
        out.push_str(",\"source\":");
        json::string(&mut out, &a.source);
        out.push('}');
    }
    out.push_str("]}");
    out
}

/// The dispatcher's entry (engine/facade/build.rs).
pub fn call(name: &str, v: &Value) -> R<String> {
    if name != NAME {
        return Err(format!("the engine has no rule called {name:?}"));
    }
    let track = list(v, "track")?.iter().map(sample).collect::<R<Vec<_>>>()?;
    let mine = v.get("minimums").unwrap_or(&Value::Null);
    let input = Input {
        fields: list(v, "fields")?.iter().map(field).collect::<R<_>>()?,
        tafs: list(v, "tafs")?,
        sigmets: list(v, "sigmets")?,
        gairmets: list(v, "gairmets")?,
        outlooks: list(v, "outlooks")?,
        vfr: v.get("rules").and_then(Value::as_str) != Some("IFR"),
        minimums: Minimums { ceiling_ft: opt_num(mine, "ceiling_ft")?, visibility_sm: opt_num(mine, "visibility_sm")? },
        track,
    };
    Ok(write(&super::run(&input), &input.track))
}
