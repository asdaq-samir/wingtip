use super::*;

pub(super) fn under_minimums_rule(i: In, v: &Value) -> R<String> {
    let m = i.obj(v, "minimums")?;
    let mine = match m {
        None => Minimums::default(),
        Some(m) => Minimums {
            ceiling_ft: i.opt_num(m, "ceiling_ft")?,
            visibility_sm: i.opt_num(m, "visibility_sm")?,
            crosswind_kt: i.opt_num(m, "crosswind_kt")?,
            wind_kt: i.opt_num(m, "wind_kt")?,
        },
    };
    let dest = i.str(v, "dest")?;
    let landings = i
        .strings(v, "landings")?
        .into_iter()
        .map(|ident| {
            let report = match metar(v, &ident) {
                None => None,
                Some(m) => Some(Winds {
                    ceiling_ft: i.opt_num(m, "ceiling_ft")?,
                    visibility_sm: i.opt_num(m, "visibility_sm")?,
                    wind_speed_kt: i.opt_num(m, "wind_speed_kt")?,
                    wind_gust_kt: i.opt_num(m, "wind_gust_kt")?,
                }),
            };
            let runways = field_runways(i, v, &ident)?.into_iter().map(|r| (r.closed, r.wind)).collect();
            Ok(Landing { ident, metar: report, runways })
        })
        .collect::<R<Vec<_>>>()?;
    let forecast = i.obj(v, "forecast")?;
    let station = match forecast {
        None => None,
        Some(f) => i.list(f, "stations")?.iter().find(|s| s.get("icaoId").and_then(Value::as_str) == Some(dest.as_str())),
    };
    let dest_forecast = match station {
        None => None,
        Some(s) => Some((i.opt_num(s, "ceiling_ft")?, i.opt_num(s, "visibility_sm")?)),
    };
    let w = minimums::Weather {
        landings,
        dest,
        dest_forecast,
        min_ceiling_ft: forecast.map(|f| i.opt_num(f, "min_ceiling_ft")).transpose()?.flatten(),
        min_visibility_sm: forecast.map(|f| i.opt_num(f, "min_visibility_sm")).transpose()?.flatten(),
    };
    Ok(verdict::strings_json(&minimums::under_minimums(&mine, &w)))
}

// --- icing ------------------------------------------------------------------

pub(super) fn icing_rule(i: In, v: &Value) -> R<String> {
    let selection = icing::selection_of(i, v)?;
    // A report's icing as sent; one that is not a string says none.
    let reports: Vec<Option<String>> =
        i.list(v, "pireps")?.iter().map(|p| p.get("icing").and_then(Value::as_str).map(str::to_owned)).collect();
    Ok(icing::icing_json(icing::icing_at_altitude(&selection, &i.nums(v, "flown_ft")?, &reports).as_ref()))
}

pub(super) fn icing_line_rule(i: In, v: &Value) -> R<String> {
    let f = i.obj(v, "icing")?.map_or_else(|| i.err("icing", "is missing"), Ok)?;
    let found = icing::Icing {
        altitude_ft: i.num(f, "altitude_ft")?,
        freezing_level_ft: i.num(f, "freezing_level_ft")?,
        at_or_below: truth(f, "at_or_below"),
        reports: i.opt_num(f, "reports")?.unwrap_or(0.0) as usize,
    };
    let mut out = String::new();
    json::string(&mut out, &icing::icing_line(&found));
    Ok(out)
}

// --- risk -------------------------------------------------------------------

pub(super) fn inspections(i: In, v: Option<&Value>) -> R<Option<Inspections>> {
    let Some(x) = v.filter(|x| !matches!(x, Value::Null)) else { return Ok(None) };
    let date = |key: &str| i.opt_str(x, key);
    Ok(Some(Inspections {
        annual_good_through: date("annual_good_through")?,
        elt_inspection_good_through: date("elt_inspection_good_through")?,
        elt_battery_due_on: date("elt_battery_due_on")?,
        static_check_good_through: date("static_check_good_through")?,
        transponder_check_good_through: date("transponder_check_good_through")?,
        hundred_hour_due_at_hours: i.opt_num(x, "hundred_hour_due_at_hours")?,
        hours_now: i.opt_num(x, "hours_now")?,
    }))
}

pub(super) fn squawks(i: In, v: &Value, key: &str) -> R<Vec<Squawk>> {
    i.list(v, key)?
        .iter()
        .map(|s| {
            Ok(Squawk {
                text: i.opt_str(s, "text")?.unwrap_or_default(),
                inoperative: truth(s, "inoperative"),
                deferred_for: i.opt_str(s, "deferred_for")?,
            })
        })
        .collect()
}

pub(crate) fn frat_input(i: In, v: &Value) -> R<frat::Input> {
    let vor_check = match v.get("vor_check") {
        None => VorCheck::Absent,
        Some(Value::Null) => VorCheck::None,
        Some(c) => {
            VorCheck::Checked { good_through: i.opt_str(c, "good_through")?.unwrap_or_default(), within_limit: truth(c, "within_limit") }
        }
    };
    let currency = match i.obj(v, "currency")? {
        None => None,
        Some(c) => Some(Currency {
            flights: i.opt_num(c, "flights")?.unwrap_or(0.0),
            total_hours: i.opt_num(c, "total_hours")?.unwrap_or(0.0),
            day_passengers_until: i.opt_str(c, "day_passengers_until")?,
            night_passengers_until: i.opt_str(c, "night_passengers_until")?,
            instrument_current_until: i.opt_str(c, "instrument_current_until")?,
            instrument_current_from: i.opt_str(c, "instrument_current_from")?,
            ipc_needed_after: i.opt_str(c, "ipc_needed_after")?,
            flight_review_until: i.opt_str(c, "flight_review_until")?,
            medical_expires_on: i.opt_str(c, "medical_expires_on")?,
        }),
    };
    let ticked = members(v.get("ticked")).iter().filter(|(_, on)| truthy(Some(on))).map(|(k, _)| k.clone()).collect();
    Ok(frat::Input {
        vfr_not_recommended: truth(v, "vfr_not_recommended"),
        under_minimums: i.strings(v, "under_minimums")?,
        tfr_on_route: truth(v, "tfr_on_route"),
        hazards: i.opt_num(v, "hazards")?.unwrap_or(0.0) as i64,
        night: truth(v, "night"),
        night_passengers: match v.get("night_passengers") {
            None | Some(Value::Null) => None,
            Some(_) => Some(truth(v, "night_passengers")),
        },
        fuel_margin_gal: i.opt_num(v, "fuel_margin_gal")?,
        ifr: truth(v, "ifr"),
        vor_check,
        inspections: inspections(i, v.get("inspections"))?,
        squawks: match v.get("squawks") {
            None | Some(Value::Null) => None,
            Some(_) => Some(squawks(i, v, "squawks")?),
        },
        currency,
        day: i.str(v, "day")?,
        ticked,
    })
}

// --- runways ----------------------------------------------------------------
