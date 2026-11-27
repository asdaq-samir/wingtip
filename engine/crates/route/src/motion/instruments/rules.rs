use super::*;

// --- By name ---------------------------------------------------------------

pub(super) fn pair(n: &str, v: &Value) -> Result<(f64, f64), String> {
    match v.as_array() {
        Some([a, b]) => Ok((
            a.as_f64().ok_or_else(|| format!("{n}: a point is not [lat, lon]"))?,
            b.as_f64().ok_or_else(|| format!("{n}: a point is not [lat, lon]"))?,
        )),
        _ => Err(format!("{n}: a point is not [lat, lon]")),
    }
}

pub(super) use wingtip_core::ask::opt_list_in as list;

pub(super) fn ahead_json(out: &mut String, a: &Option<Ahead>) {
    let Some(a) = a else {
        out.push_str("null");
        return;
    };
    out.push_str(&format!("{{\"index\":{},\"name\":", a.index));
    json::string(out, &a.name);
    for (key, v) in [
        ("distance_nm", Some(a.distance_nm)),
        ("bearing_deg", Some(a.bearing_deg)),
        ("bearing_mag_deg", a.bearing_mag_deg),
        ("ete_min", a.ete_min),
        ("eta_s", a.eta_s),
        ("fuel_left_gal", a.fuel_left_gal),
    ] {
        out.push_str(&format!(",\"{key}\":"));
        json::opt_number(out, v);
    }
    out.push('}');
}

/// `in_flight`: the instruments or null, from `{"fix": {"lat", "lon",
/// "track_deg"?, "speed_kt"?}, "line": [[lat, lon]], "points": [{"name",
/// "lat", "lon"}], "legs"?: [{"distance_nm", "fuel_gal"?}],
/// "fuel_start_gal"?, "now_s"?}`.
pub(in super::super) fn in_flight_rule(v: &Value) -> Result<String, String> {
    let n = "in_flight";
    let f = v.get("fix").ok_or("in_flight: \"fix\" is missing")?;
    let fix = Fix { lat: num(n, f, "lat")?, lon: num(n, f, "lon")?, track_deg: opt(n, f, "track_deg")?, speed_kt: opt(n, f, "speed_kt")? };
    let line = list(n, v, "line")?.iter().map(|p| pair(n, p)).collect::<Result<Vec<_>, _>>()?;
    let points = list(n, v, "points")?
        .iter()
        .map(|p| {
            Ok(Point {
                name: p.get("name").and_then(Value::as_str).unwrap_or("").to_owned(),
                lat: num(n, p, "lat")?,
                lon: num(n, p, "lon")?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let legs = list(n, v, "legs")?
        .iter()
        .map(|l| Ok(Leg { distance_nm: num(n, l, "distance_nm")?, fuel_gal: opt(n, l, "fuel_gal")? }))
        .collect::<Result<Vec<_>, String>>()?;
    let refuel_at: Vec<f64> = v.get("refuel_at").and_then(Value::as_array).map_or(vec![], |a| a.iter().filter_map(Value::as_f64).collect());
    let tanks = Tanks {
        start_gal: opt(n, v, "fuel_start_gal")?,
        full_gal: opt(n, v, "fuel_full_gal")?,
        taxi_gal: opt(n, v, "taxi_fuel_gal")?,
        refuel_at: refuel_at.into_iter().filter(|k| *k >= 0.0).map(|k| k as usize).collect(),
    };
    let Some(i) = in_flight(fix, &line, &points, &legs, &tanks, opt(n, v, "now_s")?) else {
        return Ok("null".to_owned());
    };
    let mut out = format!("{{\"on_route\":{}", i.on_route);
    for (key, x) in
        [("along_nm", i.along_nm), ("total_nm", i.total_nm), ("left_nm", (i.total_nm - i.along_nm).max(0.0)), ("off_nm", i.off_nm)]
    {
        out.push_str(&format!(",\"{key}\":"));
        json::number(&mut out, x);
    }
    out.push_str(",\"off_side\":");
    // No side to a position on the line, to a tenth of a mile.
    out.push_str(if i.off_nm < 0.05 {
        "null"
    } else if i.left_of_line {
        "\"left\""
    } else {
        "\"right\""
    });
    for (key, x) in [
        ("desired_track_deg", Some(i.desired_track_deg)),
        ("desired_track_mag_deg", i.desired_track_mag_deg),
        ("track_mag_deg", i.track_mag_deg),
        ("track_error_deg", i.track_error_deg),
        ("variation_deg", i.variation_deg),
        ("burnt_gal", Some(i.burnt_gal)),
        ("fuel_now_gal", i.fuel_now_gal),
        ("hop_burnt_gal", Some(i.hop_burnt_gal)),
    ] {
        out.push_str(&format!(",\"{key}\":"));
        json::opt_number(&mut out, x);
    }
    out.push_str(&format!(",\"taxi_counted\":{},\"hop\":{},\"leg\":", tanks.taxi_gal.is_some(), i.hop));
    out.push_str(&i.leg.map_or("null".to_owned(), |k| k.to_string()));
    out.push_str(",\"next\":");
    ahead_json(&mut out, &i.next);
    out.push_str(",\"destination\":");
    ahead_json(&mut out, &i.destination);
    out.push('}');
    Ok(out)
}

/// `vertical_speed`: ft a minute or null, from `{"samples": [{"t_s",
/// "altitude_ft"}]}`.
pub(in super::super) fn vertical_speed_rule(v: &Value) -> Result<String, String> {
    let n = "vertical_speed";
    let samples = list(n, v, "samples")?
        .iter()
        .filter_map(|s| match (opt(n, s, "t_s"), opt(n, s, "altitude_ft")) {
            (Ok(Some(t)), Ok(Some(a))) => Some(Ok((t, a))),
            (Err(e), _) | (_, Err(e)) => Some(Err(e)),
            _ => None,
        })
        .collect::<Result<Vec<_>, String>>()?;
    let mut out = String::new();
    json::opt_number(&mut out, vertical_speed(&samples));
    Ok(out)
}
