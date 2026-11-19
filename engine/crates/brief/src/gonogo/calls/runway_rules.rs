use super::*;

pub(crate) fn table(i: In, t: &Value) -> R<ShortField> {
    let grids = |key: &str| -> R<Vec<Vec<Vec<f64>>>> {
        i.list(t, "tables")?
            .iter()
            .map(|w| {
                i.list(w, key)?
                    .iter()
                    .map(|row| {
                        row.as_array().map_or_else(
                            || i.err(key, "is not a grid"),
                            |r| r.iter().map(|x| x.as_f64().map_or_else(|| i.err(key, "is not a grid of numbers"), Ok)).collect(),
                        )
                    })
                    .collect()
            })
            .collect()
    };
    let st = ShortField {
        pressure_altitudes_ft: i.nums(t, "pressure_altitudes_ft")?,
        temperatures_c: i.nums(t, "temperatures_c")?,
        weights_lb: i.nums(t, "weights_lb")?,
        ground_roll_ft: grids("ground_roll_ft")?,
        total_50ft_ft: grids("total_50ft_ft")?,
        grass_ground_roll_pct: i.num(t, "grass_ground_roll_pct")?,
        headwind_kt_per_10pct: i.opt_num(t, "headwind_kt_per_10pct")?,
        tailwind_kt_per_10pct: i.opt_num(t, "tailwind_kt_per_10pct")?,
        tailwind_max_kt: i.opt_num(t, "tailwind_max_kt")?,
    };
    // A table the reading would run off: two altitudes and temperatures at
    // least, a grid of them for every weight.
    let (rows, cols, n) = (st.pressure_altitudes_ft.len(), st.temperatures_c.len(), st.weights_lb.len());
    let fits = |g: &Vec<Vec<Vec<f64>>>| g.len() == n && g.iter().all(|w| w.len() == rows && w.iter().all(|r| r.len() == cols));
    if rows < 2 || cols < 2 || n == 0 || !fits(&st.ground_roll_ft) || !fits(&st.total_50ft_ft) {
        return i.err("table", "is not a short-field table of its altitudes, temperatures and weights");
    }
    Ok(st)
}

pub(super) fn distances_json(d: &runways::Distances) -> String {
    let mut out = String::from("{");
    runways::distances_json(&mut out, d);
    out.push('}');
    out
}

pub(super) fn end_distance_rule(i: In, v: &Value) -> R<String> {
    let t = table(i, i.obj(v, "table")?.map_or_else(|| i.err("table", "is missing"), Ok)?)?;
    let r = match i.obj(v, "runway")? {
        None => None,
        Some(r) => Some(runway(i, r)?),
    };
    let (d, over) = runways::end_distance(
        &t,
        r.as_ref(),
        r.as_ref().and_then(|r| r.length_ft),
        (i.num(v, "pressure_alt_ft")?, i.num(v, "temp_c")?),
        i.opt_num(v, "weight_lb")?,
        i.num(v, "headwind_kt")?,
    );
    let mut out = distances_json(&d);
    out.pop();
    out.push_str(&format!(",\"over\":{over}}}"));
    Ok(out)
}

pub(super) fn flown_json(f: Option<runways::Flown>) -> String {
    match f {
        None => "null".into(),
        Some((r, e, by_wind)) => format!("{{\"runway\":{r},\"end\":{e},\"by_wind\":{by_wind}}}"),
    }
}

/// The picks, each kind an object of field to end or a list of [field,
/// end] pairs (the web's Map, in its order); None where none are given.
pub(super) fn picks(i: In, v: Option<&Value>) -> R<Option<Picks>> {
    let Some(p) = v.filter(|p| !matches!(p, Value::Null)) else { return Ok(None) };
    let pairs = |key: &str| -> R<Vec<(String, String)>> {
        match p.get(key) {
            None | Some(Value::Null) => Ok(vec![]),
            Some(Value::Object(m)) => m
                .iter()
                .map(|(f, e)| e.as_str().map(|e| (f.clone(), e.to_owned())).map_or_else(|| i.err(key, "holds a non-string end"), Ok))
                .collect(),
            Some(Value::Array(list)) => list
                .iter()
                .map(|pair| match pair.as_array() {
                    Some([Value::String(f), Value::String(e)]) => Ok((f.clone(), e.clone())),
                    _ => i.err(key, "holds a pair that is not [field, end]"),
                })
                .collect(),
            Some(_) => i.err(key, "is not an object or a list of pairs"),
        }
    };
    Ok(Some(Picks { pattern: pairs("pattern")?, takeoff: pairs("takeoff")? }))
}

pub(super) fn runway_checks_rule(i: In, v: &Value) -> R<String> {
    let aircraft = i.obj(v, "aircraft")?;
    let tables = |key: &str| -> R<Option<ShortField>> {
        match aircraft.map(|a| i.obj(a, key)).transpose()?.flatten() {
            None => Ok(None),
            Some(t) => Ok(Some(table(i, t)?)),
        }
    };
    let airplane = Airplane {
        takeoff: tables("takeoff")?,
        landing: tables("landing")?,
        demonstrated_kt: match aircraft.map(|a| i.obj(a, "crosswind")).transpose()?.flatten() {
            None => None,
            Some(c) => i.opt_num(c, "demonstrated_kt")?,
        },
    };
    let fields = i
        .list(v, "fields")?
        .iter()
        .map(|f| {
            let ident = i.str(f, "ident")?;
            let report = match metar(v, &ident) {
                None => None,
                Some(m) => Some(Report {
                    altimeter_in_hg: i.opt_num(m, "altimeter_in_hg")?,
                    temp_c: i.opt_num(m, "temp_c")?,
                    wind_dir_true_deg: i.opt_num(m, "wind_dir_true_deg")?,
                    wind_speed_kt: i.opt_num(m, "wind_speed_kt")?,
                    wind_gust_kt: i.opt_num(m, "wind_gust_kt")?,
                }),
            };
            Ok(Field { runways: field_runways(i, v, &ident)?, elevation_ft: i.opt_num(f, "elevation_ft")?, metar: report, ident })
        })
        .collect::<R<Vec<_>>>()?;
    let p = picks(i, v.get("picks"))?;
    Ok(runways::checks_json(&runways::runway_checks(
        &airplane,
        true,
        &fields,
        i.opt_num(v, "takeoff_lb")?,
        i.opt_num(v, "landing_lb")?,
        p.as_ref(),
    )))
}

// --- weight and balance -----------------------------------------------------

pub(super) fn envelope(i: In, v: &Value) -> R<Vec<(f64, f64)>> {
    i.list(v, "envelope")?
        .iter()
        .map(|p| match p.as_array() {
            Some([Value::Number(a), Value::Number(w)]) => Ok((*a, *w)),
            _ => i.err("envelope", "holds a point that is not [arm, weight]"),
        })
        .collect()
}

pub(super) fn loading(i: In, v: &Value) -> R<Loading> {
    let l = i.obj(v, "loading")?.map_or_else(|| i.err("loading", "is missing"), Ok)?;
    Ok(Loading {
        max_ramp_lb: i.num(l, "max_ramp_lb")?,
        max_takeoff_lb: i.num(l, "max_takeoff_lb")?,
        max_landing_lb: i.num(l, "max_landing_lb")?,
        sample_empty_weight_lb: i.num(l, "sample_empty_weight_lb")?,
        sample_empty_moment_lb_in: i.num(l, "sample_empty_moment_lb_in")?,
        stations: i
            .list(l, "stations")?
            .iter()
            .map(|s| Ok(Station { name: i.str(s, "name")?, arm_in: i.num(s, "arm_in")?, max_lb: i.opt_num(s, "max_lb")? }))
            .collect::<R<_>>()?,
        baggage_combined_max_lb: i.opt_num(l, "baggage_combined_max_lb")?,
        fuel_arm_in: i.num(l, "fuel_arm_in")?,
        fuel_max_gal: i.num(l, "fuel_max_gal")?,
        // Avgas's standard 6 lb a gallon (FAA-H-8083-1B, Aircraft Weight
        // and Balance Handbook), where the airplane's handbook gives none.
        fuel_lb_per_gal: i.opt_num(l, "fuel_lb_per_gal")?.unwrap_or(6.0),
        start_taxi_fuel_lb: i.opt_num(l, "start_taxi_fuel_lb")?.unwrap_or(0.0),
        envelope: envelope(i, l)?,
    })
}

pub(super) fn load(i: In, v: &Value) -> R<Load> {
    let l = i.obj(v, "load")?.map_or_else(|| i.err("load", "is missing"), Ok)?;
    Ok(Load {
        empty_weight_lb: i.num(l, "empty_weight_lb")?,
        empty_arm_in: i.num(l, "empty_arm_in")?,
        stations_lb: i
            .list(l, "stations_lb")?
            .iter()
            .map(|x| match x {
                Value::Null => Ok(None),
                Value::Number(n) => Ok(Some(*n)),
                _ => i.err("stations_lb", "holds a non-number"),
            })
            .collect::<R<_>>()?,
        fuel_gal: i.num(l, "fuel_gal")?,
    })
}
