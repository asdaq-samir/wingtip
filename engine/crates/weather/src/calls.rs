//! The weather products' rules by name (engine/facade/src/call.rs looks
//! each up from its contract file, crates/weather/contract/<name>.json):
//! when a report stops counting (validity.rs), NOTAMs and a TFR as sent
//! read (notam.rs, tfr.rs), a report's ceiling and 14 CFR 91.155's basic
//! VFR minimums it is held to (wingtip_flight::vfr, the one copy), and
//! the FAA's data cycles (cycles.rs).

use crate::json::{self, Value};
use crate::{cycles, forecast, freezing, metar, notam, tfr, validity, xml};
use wingtip_core::ask::{opt_num_in, Ask};
use wingtip_flight::vfr::{SURFACE_AREA_CEILING_FT, SURFACE_AREA_VISIBILITY_SM};

/// A weather product's figure by name.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let mut out = String::new();
    match name {
        "weather_expires_at" | "weather_in_force" => return in_force(&ask),
        "notams_fns" => return Ok(notam::to_json(&notam::from_fns(ask.str("text")?))),
        "tfr_detail_read" => {
            let text = ask.str("text")?;
            if let Err(e) = xml::parse(text) {
                return Err(format!("{name}: not XML: {} at {}", e.what, e.at));
            }
            return Ok(tfr::parse_detail(text).map_or_else(|| "null".to_owned(), |d| tfr::to_json(&d)));
        }
        "ceiling_ft" => {
            let mut layers = Vec::new();
            if let Some(listed) = v.get("layers").filter(|l| !matches!(l, Value::Null)) {
                for l in listed.as_array().ok_or_else(|| format!("{name}: \"layers\" is not a list"))? {
                    layers.push((l.get("cover").and_then(Value::as_str).unwrap_or(""), opt_num_in(name, l, "base_ft")?));
                }
            }
            let (ceiling, _) = metar::sky_ceiling_of(layers, ask.opt_num("vert_vis_ft")?);
            json::opt_number(&mut out, ceiling);
        }
        // Whether a ceiling or a visibility is under 91.155(c), (d)'s basic
        // VFR minimums (1,000 ft, 3 sm): a missing figure is not below
        // anything, the caller saying it is unknown.
        "freezing_precip" => {
            let mut fields = Vec::new();
            for f in ask.list("fields")? {
                let raw = |key: &str| f.get(key).and_then(Value::as_str).map(str::to_owned);
                fields.push((raw("ident").unwrap_or_default(), raw("metar"), raw("taf")));
            }
            return Ok(freezing::to_json(&freezing::freezing_precip(&fields)));
        }
        "below_vfr_minimums" => {
            let below = ask.opt_num("ceiling_ft")?.is_some_and(|c| c < SURFACE_AREA_CEILING_FT)
                || ask.opt_num("visibility_sm")?.is_some_and(|v| v < SURFACE_AREA_VISIBILITY_SM);
            out.push_str(&below.to_string());
        }
        // The forecast's along-route reasons, held to the same minimums.
        "vfr_not_recommended_reasons" => {
            let idents: Vec<&str> = match v.get("idents") {
                Some(Value::Array(items)) => items.iter().filter_map(Value::as_str).collect(),
                _ => Vec::new(),
            };
            let reasons = forecast::route::vfr_not_recommended_reasons(
                &idents,
                v.get("metars").unwrap_or(&Value::Null),
                v.get("forecast").unwrap_or(&Value::Null),
                SURFACE_AREA_CEILING_FT,
                SURFACE_AREA_VISIBILITY_SM,
            );
            out.push('[');
            for (i, r) in reasons.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::string(&mut out, r);
            }
            out.push(']');
        }
        "vfr_basic_minimums" => {
            out.push_str("{\"ceiling_ft\":");
            json::number(&mut out, SURFACE_AREA_CEILING_FT);
            out.push_str(",\"visibility_sm\":");
            json::number(&mut out, SURFACE_AREA_VISIBILITY_SM);
            out.push('}');
        }
        "data_cycle" => {
            let kind = ask.str("kind")?;
            let kind = cycles::Kind::from_name(kind).ok_or_else(|| format!("{name}: \"kind\" is not airac, chart or dof: {kind:?}"))?;
            let on = ask.str("on")?;
            let on = cycles::day_of(on).ok_or_else(|| format!("{name}: \"on\" is not YYYY-MM-DD: {on:?}"))?;
            let effective = match ask.opt_str("effective")? {
                "" => None,
                e => Some(cycles::day_of(e).ok_or_else(|| format!("{name}: \"effective\" is not YYYY-MM-DD: {e:?}"))?),
            };
            return Ok(cycles::to_json(&cycles::cycle(kind, effective, on)));
        }
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}

/// When a weather report stops counting (validity.rs), as the planner's
/// wingtip_native.weather_expires_at and weather_in_force take it:
/// `weather_expires_at` the instant, Unix seconds, or null, and
/// `weather_in_force` whether it still counts at `now`.
fn in_force(ask: &Ask) -> Result<String, String> {
    use validity::Product;
    let product = match ask.str("product")? {
        "metar" => Product::Metar,
        "speci" => Product::Speci,
        "taf" => Product::Taf,
        "winds" => Product::WindsAloft,
        "advisory" => Product::Advisory,
        other => return Err(format!("{}: \"product\" is metar, speci, taf, winds or advisory, not {other:?}", ask.name)),
    };
    // Whole seconds, as the reports' own times are.
    let secs = |key: &str| ask.opt_num(key).map(|n| n.map(|s| s.floor() as i64));
    let (observed, last_routine, valid_to) = (secs("observed")?, secs("last_routine")?, secs("valid_to")?);
    if ask.name == "weather_expires_at" {
        let mut out = String::new();
        json::opt_number(&mut out, validity::expires_at(product, observed, last_routine, valid_to).map(|t| t as f64));
        return Ok(out);
    }
    let now = ask.num("now")?.floor() as i64;
    Ok(validity::in_force(product, now, observed, last_routine, secs("valid_from")?, valid_to).to_string())
}
