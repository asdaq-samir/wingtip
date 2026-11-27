use super::*;

// --- verdict ----------------------------------------------------------------

pub(crate) fn verdict_input(i: In, v: &Value) -> R<verdict::Input> {
    let part = |key: &str| -> R<&Value> { i.obj(v, key)?.map_or_else(|| i.err(key, "is missing"), Ok) };
    let (w, a, t, f, r, b) = (part("weather")?, part("airspace")?, part("altitude")?, part("fuel")?, part("runways")?, part("balance")?);
    let special_use = i.list(a, "special_use")?.iter().map(|s| Ok((i.str(s, "name")?, i.str(s, "when")?))).collect::<R<Vec<_>>>()?;
    let risk = match i.obj(v, "risk")? {
        None => None,
        Some(r) => Some((i.str(r, "level")?, i.str(r, "line")?)),
    };
    Ok(verdict::Input {
        weather: verdict::Weather {
            missing: left_out(w, &["vfr_not_recommended", "under_minimums", "hazards", "unchecked"]),
            pending: truth(w, "pending"),
            failed: i.opt_str(w, "failed")?,
            vfr_not_recommended: i.strings(w, "vfr_not_recommended")?,
            under_minimums: i.strings(w, "under_minimums")?,
            icing: i.opt_str(w, "icing")?,
            hazards: i.strings(w, "hazards")?,
            unchecked: i.strings(w, "unchecked")?,
            worst: i.opt_str(w, "worst")?,
            terminal_alerts: i.strings(w, "terminal_alerts")?,
            flow_programs: i.strings(w, "flow_programs")?,
            ifr: truth(w, "ifr"),
        },
        airspace: verdict::Airspace {
            missing: left_out(a, &["unchecked", "in_force", "special_use"]),
            pending: truth(a, "pending"),
            unchecked: truth(a, "unchecked"),
            in_force: i.strings(a, "in_force")?,
            near: i.opt_num(a, "near")?.unwrap_or(0.0),
            special_use,
        },
        altitude: verdict::Altitude {
            missing: left_out(t, &["cautions"]),
            pending: truth(t, "pending"),
            problem: i.opt_str(t, "problem")?,
            cautions: i.strings(t, "cautions")?,
            flown: i.opt_str(t, "flown")?,
        },
        fuel: verdict::Fuel {
            pending: truth(f, "pending"),
            margin_gal: i.opt_num(f, "margin_gal")?,
            required_gal: i.opt_num(f, "required_gal")?,
            reserve_min: i.opt_num(f, "reserve_min")?,
            ifr: truth(f, "ifr"),
        },
        runways: verdict::Runways {
            missing: left_out(r, &["short", "crosswind"]),
            pending: truth(r, "pending"),
            worked: truth(r, "worked"),
            short: i.strings(r, "short")?,
            crosswind: i.strings(r, "crosswind")?,
            beyond: i.strings(r, "beyond")?,
            tailwind: i.strings(r, "tailwind")?,
            close: i.strings(r, "close")?,
            unchecked: i.strings(r, "unchecked")?,
        },
        balance: verdict::Balance {
            pending: truth(b, "pending"),
            worked: truth(b, "worked"),
            no_load: truth(b, "no_load"),
            problems: i.strings(b, "problems")?,
            takeoff: i.opt_str(b, "takeoff")?,
        },
        risk,
    })
}

pub(crate) fn items(i: In, v: &Value, key: &str) -> R<Vec<Item>> {
    i.list(v, key)?
        .iter()
        .map(|x| {
            Ok(Item {
                key: i.str(x, "key")?,
                label: i.str(x, "label")?,
                tab: i.str(x, "tab")?,
                section: i.opt_str(x, "section")?,
                finding: i.str(x, "finding")?,
                detail: i.str(x, "detail")?,
            })
        })
        .collect()
}

/// The planner's /api/alternate answer, as much as the finding reads:
/// None where there is none (`!data`).
pub(crate) fn alternates(i: In, data: Option<&Value>) -> R<Option<Alternates>> {
    let Some(data) = data.filter(|d| !matches!(d, Value::Null)) else { return Ok(None) };
    let required = data.get("destination").is_some_and(|d| truth(d, "required"));
    let alternate = match data.get("alternate") {
        None | Some(Value::Null) => None,
        Some(a) => Some(FiledAlternate {
            ident: i.opt_str(a, "ident")?.unwrap_or_default(),
            good: match a.get("good") {
                Some(Value::Bool(b)) => Some(*b),
                _ => None,
            },
            good_given: matches!(a.get("good"), Some(Value::Null | Value::Bool(_))),
            first_reason: i.strings(a, "reasons")?.into_iter().next(),
        }),
    };
    Ok(Some(Alternates { required, alternate }))
}

// --- minimums ---------------------------------------------------------------

pub(crate) fn runway_wind(i: In, v: &Value) -> R<Option<RunwayWind>> {
    let Some(w) = i.obj(v, "wind")? else { return Ok(None) };
    Ok(Some(RunwayWind {
        end: i.str(w, "end")?,
        headwind_kt: i.num(w, "headwind_kt")?,
        crosswind_kt: i.num(w, "crosswind_kt")?,
        gust_crosswind_kt: i.opt_num(w, "gust_crosswind_kt")?,
        in_use: truth(w, "in_use"),
        crosswind_exact_kt: i.opt_num(w, "crosswind_exact_kt")?,
    }))
}

pub(crate) fn runway(i: In, r: &Value) -> R<Runway> {
    Ok(Runway {
        surface: i.opt_str(r, "surface")?,
        length_ft: i.opt_num(r, "length_ft")?,
        closed: truth(r, "closed"),
        ends: i
            .list(r, "runway_ends")?
            .iter()
            .map(|e| {
                let (displaced_threshold_ft, lda_ft) = (i.opt_num(e, "displaced_threshold_ft")?, i.opt_num(e, "lda_ft")?);
                Ok(End { ident: i.str(e, "ident")?, heading_true_deg: i.opt_num(e, "heading_true_deg")?, displaced_threshold_ft, lda_ft })
            })
            .collect::<R<_>>()?,
        wind: runway_wind(i, r)?,
    })
}

pub(crate) fn runway_list(i: In, v: &Value, key: &str) -> R<Vec<Runway>> {
    i.list(v, key)?.iter().map(|r| runway(i, r)).collect()
}

/// A field's runways from a briefing's `airports`: none where it has none.
pub(super) fn field_runways(i: In, v: &Value, ident: &str) -> R<Vec<Runway>> {
    match v.get("airports").and_then(|a| a.get(ident)) {
        Some(a @ Value::Object(_)) => runway_list(i, a, "runways"),
        _ => Ok(vec![]),
    }
}

/// A field's METAR from a briefing's `metars`: None where it has none
/// (null, or missing); an empty object is a report, as the web takes it.
pub(super) fn metar<'v>(v: &'v Value, ident: &str) -> Option<&'v Value> {
    v.get("metars").and_then(|m| m.get(ident)).filter(|m| !matches!(m, Value::Null))
}
