//! The forecast's rules as crate::call answers them, JSON in and out; the
//! names and their inputs are listed in call.rs with the others.

use super::{awc, field, hours, route};
use crate::json::{self, Value};
use crate::{metar, winds};
use wingtip_core::sort::StableSort;

type R<T> = Result<T, String>;

/// A member that is a number, or None where it is missing or null.
fn opt_num(name: &str, v: &Value, key: &str) -> R<Option<f64>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

fn num(name: &str, v: &Value, key: &str) -> R<f64> {
    opt_num(name, v, key)?.ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

fn opt_bool(name: &str, v: &Value, key: &str) -> R<bool> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(false),
        Some(Value::Bool(b)) => Ok(*b),
        Some(_) => Err(format!("{name}: \"{key}\" is not true or false")),
    }
}

fn text<'a>(name: &str, v: &'a Value, key: &str) -> R<&'a str> {
    v.get(key).and_then(Value::as_str).ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

fn list<'a>(name: &str, v: &'a Value, key: &str) -> R<&'a [Value]> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        Some(_) => Err(format!("{name}: \"{key}\" is not a list")),
    }
}

fn at(name: &str, v: &Value, key: &str) -> R<(f64, f64)> {
    route::points(Some(&Value::Array(vec![v.get(key).cloned().unwrap_or(Value::Null)])))
        .first()
        .copied()
        .ok_or_else(|| format!("{name}: \"{key}\" is not a [lat, lon] point"))
}

/// A report's or a forecast group's ceiling and visibility, as a host's
/// own reader found its groups (the iPhone's ATIS reader): the ceiling
/// 14 CFR 1.1's (metar::ceiling_of), the vertical visibility into an
/// obscuration settling it, and none where the lowest is sent with no
/// height; the visibility in statute miles, metres converted as metar.rs
/// reads them and given to the hundredth, CAVOK the AWC's 6+ (WMO No. 306:
/// 10 km or more).
fn ceiling_visibility(name: &str, v: &Value) -> R<(Option<f64>, Option<f64>)> {
    let mut layers = Vec::new();
    for l in list(name, v, "layers")? {
        let cover = l.get("cover").and_then(Value::as_str).ok_or_else(|| format!("{name}: a layer's \"cover\" is missing"))?;
        layers.push(metar::Layer { cover: cover.to_owned(), base_ft_agl: opt_num(name, l, "base_ft")? });
    }
    let vertical_visibility = opt_num(name, v, "vertical_visibility_ft")?;
    let visibility = if opt_bool(name, v, "cavok")? {
        Some(6.0)
    } else {
        match v.get("visibility") {
            None | Some(Value::Null) => None,
            Some(vis) => {
                let value = num(name, vis, "value")?;
                match vis.get("unit").and_then(Value::as_str) {
                    Some("m") => Some((metar::metres_to_sm(value) * 100.0).round() / 100.0),
                    Some("sm") | None => Some(value),
                    Some(other) => return Err(format!("{name}: the visibility's \"unit\" is sm or m, not {other:?}")),
                }
            }
        }
    };
    let sky = layers.iter().map(|l| (l.cover.as_str(), l.base_ft_agl));
    Ok((metar::ceiling_of(sky, vertical_visibility), visibility))
}

/// `[[altitude_ft, temp_c], ...]`, lowest first.
fn profile(name: &str, v: &Value) -> R<Vec<(f64, f64)>> {
    let mut out: Vec<(f64, f64)> = list(name, v, "profile")?
        .iter()
        .map(|p| match p.as_array() {
            Some([a, t]) => Ok((a.as_f64().ok_or("")?, t.as_f64().ok_or("")?)),
            _ => Err(""),
        })
        .collect::<Result<_, &str>>()
        .map_err(|_| format!("{name}: \"profile\" is not [[altitude_ft, temp_c], ...]"))?;
    out.stable_sort_by(|a, b| a.0.total_cmp(&b.0));
    Ok(out)
}

/// A station's levels, `{"<altitude_ft>": {"wind_dir_true_deg"?,
/// "wind_speed_kt"}}`, as the weather service stores them.
fn levels(name: &str, v: &Value) -> R<Vec<(f64, Option<f64>, f64)>> {
    let Some(Value::Object(members)) = v.get("levels") else {
        return Err(format!("{name}: \"levels\" is not an object of altitudes"));
    };
    let mut out = Vec::new();
    for (alt, level) in members {
        let alt: f64 = alt.parse().map_err(|_| format!("{name}: a level's altitude {alt:?} is not a number"))?;
        if let Some(speed) = opt_num(name, level, "wind_speed_kt")? {
            out.push((alt, opt_num(name, level, "wind_dir_true_deg")?, speed));
        }
    }
    Ok(out)
}

fn wind_json(out: &mut String, w: Option<winds::WindAt>) {
    match w {
        Some(w) => {
            out.push_str("{\"wind_dir_true_deg\":");
            json::number(out, w.dir_true_deg);
            out.push_str(",\"wind_speed_kt\":");
            json::number(out, w.speed_kt);
            out.push('}');
        }
        None => out.push_str("null"),
    }
}

fn period_json(out: &mut String, p: Option<&Value>) {
    match p {
        Some(p) => json::value(out, p),
        None => out.push_str("null"),
    }
}

/// The rule `name` worked on `v`.
pub fn call(name: &str, v: &Value) -> R<String> {
    let mut out = String::new();
    match name {
        "ceiling_visibility" => {
            let (ceiling, visibility) = ceiling_visibility(name, v)?;
            out.push_str("{\"ceiling_ft\":");
            json::opt_number(&mut out, ceiling);
            out.push_str(",\"visibility_sm\":");
            json::opt_number(&mut out, visibility);
            out.push('}');
        }
        "flight_category" => {
            let (ceiling, visibility) = (opt_num(name, v, "ceiling_ft")?, opt_num(name, v, "visibility_sm")?);
            // A ceiling sent with no height ("OVC///") is one not known, not
            // none (14 CFR 1.1): only what the visibility settles is said.
            let category = metar::flight_category_of(ceiling, opt_bool(name, v, "ceiling_unknown")?, visibility);
            json::opt_string(&mut out, category);
        }
        "field_hours" => {
            let metar = v.get("metar").filter(|m| !matches!(m, Value::Null));
            let taf = v.get("taf").and_then(Value::as_str);
            let count = opt_num(name, v, "count")?.map_or(hours::HOURS, |c| c.max(0.0) as usize);
            out = hours::field_hours(metar, taf, num(name, v, "now")?, count);
        }
        "awc_metars_read" => out = awc::metars(text(name, v, "text")?).map_err(|e| format!("{name}: {e}"))?,
        "awc_tafs_read" => out = awc::tafs(text(name, v, "text")?).map_err(|e| format!("{name}: {e}"))?,
        "awc_airsigmets_read" => out = awc::airsigmets(text(name, v, "text")?).map_err(|e| format!("{name}: {e}"))?,
        "awc_pireps_read" => out = awc::pireps(text(name, v, "text")?).map_err(|e| format!("{name}: {e}"))?,
        "awc_gairmets_read" => out = awc::gairmets(text(name, v, "text")?).map_err(|e| format!("{name}: {e}"))?,
        "weather_held_until" => {
            let until = awc::held_until(text(name, v, "product")?, v.get("data").unwrap_or(&Value::Null), num(name, v, "fetched")? as i64)?;
            json::opt_number(&mut out, until.map(|t| t as f64));
        }
        "gairmet_hazards" => {
            out.push_str("{\"hazards\":{");
            for (i, (code, words)) in awc::GAIRMET_HAZARDS.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::string(&mut out, code);
                out.push(':');
                json::string(&mut out, words);
            }
            out.push_str("},\"labels\":{");
            for (i, (words, label)) in crate::aviation_grids::GAIRMET_LABELS.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::string(&mut out, words);
                out.push(':');
                json::string(&mut out, label);
            }
            out.push_str(&format!("}},\"snapshot_s\":{}}}", awc::GAIRMET_SNAPSHOT_S));
        }
        "taf_window" => {
            let fcsts = list(name, v, "fcsts")?;
            let start = num(name, v, "start")?;
            let end = opt_num(name, v, "end")?.unwrap_or(start);
            out.push_str("{\"periods\":[");
            for (i, p) in route::periods_in_window(fcsts, start, end).iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::value(&mut out, p);
            }
            out.push_str("],\"worst\":");
            match route::worst_in_window(fcsts, start, end) {
                Some(w) => {
                    out.push_str("{\"ceiling_ft\":");
                    json::opt_number(&mut out, w.ceiling_ft);
                    out.push_str(&format!(",\"ceiling_unknown\":{},\"visibility_sm\":", w.ceiling_unknown));
                    json::opt_number(&mut out, w.visibility_sm);
                    out.push_str(&format!(",\"covers\":{}}}", w.covers));
                }
                None => out.push_str("null"),
            }
            out.push_str(",\"current\":");
            period_json(&mut out, route::current_period(fcsts, start));
            out.push_str(",\"prevailing\":");
            period_json(&mut out, route::prevailing_at(fcsts, start));
            out.push('}');
        }
        "tafs_along_route" => {
            let start = num(name, v, "start")?;
            out = route::tafs_along_route(
                list(name, v, "tafs")?,
                at(name, v, "from")?,
                at(name, v, "to")?,
                opt_num(name, v, "corridor_nm")?.unwrap_or(10.0),
                start,
                opt_num(name, v, "end")?.unwrap_or(start),
            );
        }
        "sigmets_along_route" => {
            out = route::sigmets_along_route(
                list(name, v, "advisories")?,
                at(name, v, "from")?,
                at(name, v, "to")?,
                opt_num(name, v, "corridor_nm")?.unwrap_or(25.0),
                num(name, v, "now")?,
            );
        }
        "pireps_along_route" => {
            out = route::pireps_along_route(
                list(name, v, "reports")?,
                &route::points(v.get("path")),
                opt_num(name, v, "corridor_nm")?.unwrap_or(awc::PIREP_CORRIDOR_NM),
                num(name, v, "now")?,
            );
        }
        "pireps_in_box" => {
            let b = list(name, v, "box")?;
            let edge =
                |i: usize| b.get(i).and_then(Value::as_f64).ok_or_else(|| format!("{name}: \"box\" is not [south, west, north, east]"));
            out = route::pireps_in_box(list(name, v, "reports")?, (edge(0)?, edge(1)?, edge(2)?, edge(3)?), num(name, v, "now")?);
        }
        "gairmets_along_route" => {
            out = route::gairmets_along_route(
                list(name, v, "advisories")?,
                &route::points(v.get("path")),
                num(name, v, "start")?,
                num(name, v, "end")?,
            );
        }
        "freezing_level" => match winds::freezing_level(&profile(name, v)?) {
            Some((ft, at_or_below)) => {
                out.push_str("{\"ft\":");
                json::number(&mut out, ft);
                out.push_str(&format!(",\"at_or_below\":{at_or_below}}}"));
            }
            None => out.push_str("null"),
        },
        "temperature_at" => json::opt_number(&mut out, winds::temperature_at(&profile(name, v)?, num(name, v, "altitude_ft")?)),
        "service_ceiling_on_the_day" => {
            json::number(&mut out, winds::service_ceiling_on_the_day(num(name, v, "book_ft")?, &profile(name, v)?))
        }
        "wind_at_altitude" => {
            let lv = levels(name, v)?;
            match v.get("altitudes") {
                // Many altitudes at once (route options' grid), a list in their order.
                Some(Value::Array(alts)) => {
                    out.push('[');
                    for (i, a) in alts.iter().enumerate() {
                        if i > 0 {
                            out.push(',');
                        }
                        let a = a.as_f64().ok_or_else(|| format!("{name}: an altitude is not a number"))?;
                        wind_json(&mut out, winds::wind_at_altitude(&lv, a));
                    }
                    out.push(']');
                }
                _ => wind_json(&mut out, winds::wind_at_altitude(&lv, num(name, v, "altitude_ft")?)),
            }
        }
        "forecast_hour" => json::string(&mut out, winds::forecast_hour(opt_num(name, v, "hours_ahead")?)),
        "field_taf" => {
            let at = match v.get("at") {
                None | Some(Value::Null) => None,
                Some(p) => Some((num(name, p, "lat")?, num(name, p, "lon")?)),
            };
            let stations = list(name, v, "stations")?
                .iter()
                .map(|s| {
                    let icao_id =
                        s.get("icao_id").and_then(Value::as_str).ok_or_else(|| format!("{name}: a station has no \"icao_id\""))?;
                    let at = match (opt_num(name, s, "lat")?, opt_num(name, s, "lon")?) {
                        (Some(lat), Some(lon)) => Some((lat, lon)),
                        _ => None,
                    };
                    Ok(field::Station { icao_id, at })
                })
                .collect::<R<Vec<_>>>()?;
            let found = field::field_taf(text(name, v, "ident")?, at, &stations);
            out.push_str("{\"index\":");
            match found {
                Some((i, _)) => out.push_str(&i.to_string()),
                None => out.push_str("null"),
            }
            out.push_str(",\"nm\":");
            json::opt_number(&mut out, found.and_then(|(_, nm)| nm));
            out.push_str(",\"reach_nm\":");
            json::number(&mut out, field::TAF_REACH_NM);
            out.push('}');
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}
