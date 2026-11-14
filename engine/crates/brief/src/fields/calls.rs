//! `best_fields` by name (crate::call lists it): its input read from the
//! hosts' JSON, a runway as the Go / No-Go reads one (`runway_ends`) and a
//! POH's table as its runway check does, and its answer written.

use super::{best_fields, Airplane, Answer, Field, Mode, Own, Ranked, Wind};
use crate::figures::glide::Glide;
use crate::gonogo::calls::{runway_list, table, truth, In};
use crate::json::{self, Value};
use crate::runway::performance::{FieldReport, FitWind};

type R<T> = Result<T, String>;

/// The most fields answered where `limit` is not given.
const LIMIT: usize = 10;

pub fn call(name: &str, v: &Value) -> R<String> {
    let i = In { name };
    let mode = match i.opt_str(v, "mode")?.as_deref() {
        None | Some("glide") => Mode::Glide,
        Some("diversion") => Mode::Diversion,
        Some(other) => return Err(format!("{name}: \"mode\" is glide or diversion, not {other:?}")),
    };
    let at = i.obj(v, "at")?.map_or_else(|| i.err("at", "is missing"), Ok)?;
    let own = Own {
        lat: i.num(at, "lat")?,
        lon: i.num(at, "lon")?,
        altitude_ft: i.opt_num(v, "altitude_ft")?,
        speed_kt: i.opt_num(v, "speed_kt")?,
        wind: wind(i, v)?,
        variation_deg: i.opt_num(v, "variation_deg")?,
    };
    let airplane = i.obj(v, "airplane")?.map(|a| airplane(i, a)).transpose()?;
    let fields = i.list(v, "fields")?.iter().map(|f| field(i, f)).collect::<R<Vec<_>>>()?;
    let limit = i.opt_num(v, "limit")?.map_or(LIMIT, |l| l.max(0.0) as usize);
    Ok(answer_json(&best_fields(mode, &own, airplane.as_ref(), fields, limit)))
}

/// The candidate fields as `best_fields` reads them, `{"fields": [...]}`,
/// for a rule that ranks with it: the in-flight copilot's best alternative
/// (crates/inflight's copilot_watch), one ranking for both.
pub fn fields_of(name: &str, v: &Value) -> R<Vec<Field>> {
    let i = In { name };
    i.list(v, "fields")?.iter().map(|f| field(i, f)).collect()
}

fn wind(i: In, v: &Value) -> R<Option<Wind>> {
    Ok(match i.obj(v, "wind")? {
        Some(w) => Some(Wind { from_deg: i.num(w, "from_deg")?, kt: i.num(w, "kt")? }),
        None => None,
    })
}

fn airplane(i: In, a: &Value) -> R<Airplane> {
    let glide = match i.obj(a, "glide")? {
        Some(g) => Some(Glide { best_glide_kias: i.opt_num(g, "best_glide_kias")?, ratio: i.num(g, "ratio")? }),
        None => None,
    };
    Ok(Airplane {
        glide,
        landing: i.obj(a, "landing")?.map(|t| table(i, t)).transpose()?,
        demonstrated_crosswind_kt: match i.obj(a, "crosswind")? {
            Some(c) => i.opt_num(c, "demonstrated_kt")?,
            None => None,
        },
        cruise_tas_kt: i.opt_num(a, "cruise_tas_kt")?,
    })
}

fn field(i: In, f: &Value) -> R<Field> {
    let metar = i.obj(f, "metar")?;
    let m = |key: &str| metar.map_or(Ok(None), |m| i.opt_num(m, key));
    Ok(Field {
        ident: i.str(f, "ident")?,
        name: i.opt_str(f, "name")?.unwrap_or_default(),
        lat: i.num(f, "lat")?,
        lon: i.num(f, "lon")?,
        elevation_ft: i.opt_num(f, "elevation_ft")?,
        runways: runway_list(i, f, "runways")?,
        wind: metar
            .map(|_| -> R<FitWind> { Ok(FitWind { dir_true_deg: m("dir_true_deg")?, speed_kt: m("speed_kt")?, gust_kt: m("gust_kt")? }) })
            .transpose()?,
        report: FieldReport { elevation_ft: i.opt_num(f, "elevation_ft")?, altimeter_in_hg: m("altimeter_in_hg")?, temp_c: m("temp_c")? },
        flight_category: metar.map_or(Ok(None), |m| i.opt_str(m, "flight_category"))?,
        towered: truth(f, "towered"),
        private: truth(f, "private"),
        military: truth(f, "military"),
        status: i.opt_str(f, "status")?,
    })
}

fn answer_json(a: &Answer) -> String {
    let mut out = format!(
        "{{\"mode\":\"{}\",\"needs_airplane\":{},\"glide\":",
        if a.mode == Mode::Glide { "glide" } else { "diversion" },
        a.needs_airplane
    );
    match &a.ring {
        None => out.push_str("null"),
        Some(r) => {
            out.push_str("{\"nm_per_1000_ft\":");
            json::number(&mut out, round(r.nm_per_1000_ft, 100.0));
            out.push_str(",\"agl_ft\":");
            json::number(&mut out, r.agl_ft.round());
            out.push_str(",\"still_air_nm\":");
            json::number(&mut out, round(r.still_air_nm, 10.0));
            out.push_str(",\"tas_kt\":");
            json::opt_number(&mut out, r.tas_kt.map(f64::round));
            out.push_str(",\"ring\":[");
            for (n, (lat, lon)) in r.points.iter().enumerate() {
                if n > 0 {
                    out.push(',');
                }
                out.push('[');
                json::number(&mut out, round(*lat, 1e5));
                out.push(',');
                json::number(&mut out, round(*lon, 1e5));
                out.push(']');
            }
            out.push_str("]}");
        }
    }
    out.push_str(",\"fields\":[");
    for (n, f) in a.fields.iter().enumerate() {
        if n > 0 {
            out.push(',');
        }
        ranked_json(&mut out, f);
    }
    out.push_str("]}");
    out
}

fn ranked_json(out: &mut String, r: &Ranked) {
    out.push_str("{\"ident\":");
    json::string(out, &r.field.ident);
    out.push_str(",\"name\":");
    json::string(out, &r.field.name);
    for (key, n) in [("lat", Some(r.field.lat)), ("lon", Some(r.field.lon)), ("elevation_ft", r.field.elevation_ft)] {
        out.push_str(&format!(",\"{key}\":"));
        json::opt_number(out, n);
    }
    let figures = [
        ("distance_nm", Some(round(r.distance_nm, 10.0))),
        ("course_deg", Some(r.course_deg.round().rem_euclid(360.0))),
        ("heading_true_deg", r.heading_true_deg.map(|h| h.round().rem_euclid(360.0))),
        ("heading_mag_deg", r.heading_mag_deg.map(|h| h.round().rem_euclid(360.0))),
        ("groundspeed_kt", r.groundspeed_kt.map(f64::round)),
        ("ete_min", r.ete_min.map(|m| round(m, 10.0))),
        ("reach_nm", r.reach_nm.map(|n| round(n, 10.0))),
        ("arrive_agl_ft", r.arrive_agl_ft.map(f64::round)),
    ];
    for (key, n) in figures {
        out.push_str(&format!(",\"{key}\":"));
        json::opt_number(out, n);
    }
    out.push_str(&format!(
        ",\"reach\":\"{}\",\"towered\":{},\"private\":{},\"military\":{},\"flight_category\":",
        r.reach.word(),
        r.field.towered,
        r.field.private,
        r.field.military
    ));
    json::opt_string(out, r.field.flight_category.as_deref());
    out.push_str(",\"runway\":");
    match &r.end {
        None => out.push_str("null"),
        Some(e) => {
            out.push_str("{\"end\":");
            json::string(out, &e.end);
            out.push_str(",\"heading_true_deg\":");
            json::opt_number(out, e.heading_true_deg);
            out.push_str(",\"surface\":");
            json::opt_string(out, e.surface.as_deref());
            out.push_str(",\"length_ft\":");
            json::opt_number(out, e.fit.length_ft);
            out.push_str(",\"headwind_kt\":");
            json::opt_number(out, e.headwind_kt.map(f64::round));
            out.push_str(",\"crosswind_kt\":");
            json::number(out, e.fit.crosswind_kt);
            out.push_str(",\"needed_ft\":");
            json::opt_number(out, e.fit.needed_ft);
            out.push_str(&format!(",\"short\":{},\"close\":{},\"crosswind_over\":{}}}", e.fit.short, e.fit.close, e.fit.crosswind_over));
        }
    }
    out.push_str(",\"reasons\":[");
    for (n, (tone, text)) in r.reasons.iter().enumerate() {
        if n > 0 {
            out.push(',');
        }
        out.push_str(&format!("{{\"tone\":\"{tone}\",\"text\":"));
        json::string(out, text);
        out.push('}');
    }
    out.push_str("]}");
}

/// To the `per`th: 10 a tenth.
fn round(n: f64, per: f64) -> f64 {
    (n * per).round() / per
}
