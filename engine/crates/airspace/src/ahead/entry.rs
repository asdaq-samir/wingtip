use super::*;

// The planner's way in: the same alerts from the data it reads -- the
// FAA's Class B, C and D shapefile, its special-use airspace, tfr.faa.gov's
// TFRs, the terrain tiles and the Digital Obstacle File -- given as JSON
// (wingtip.alerts only reads them and asks). `ahead_frame` first says
// where the data is wanted -- the box round the five minutes' track for
// the airspace, the box round the minute's for the obstacles, and the
// swath's points for the ground -- and `alerts_ahead` then says what is
// ahead.

pub(super) type R<T> = Result<T, String>;

pub(super) fn num_of(name: &str, v: &Value, key: &str) -> R<f64> {
    v.get(key).and_then(Value::as_f64).ok_or_else(|| format!("{name}: \"{key}\" is not a number"))
}

pub(super) fn opt_num_of(name: &str, v: &Value, key: &str) -> R<Option<f64>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(x) => x.as_f64().map(Some).ok_or_else(|| format!("{name}: \"{key}\" is not a number")),
    }
}

pub(super) fn str_of<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

/// A list, or None where it is null or missing: what could not be read.
pub(super) fn opt_list<'a>(name: &str, v: &'a Value, key: &str) -> R<Option<&'a [Value]>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(x) => x.as_array().map(Some).ok_or_else(|| format!("{name}: \"{key}\" is not a list")),
    }
}

/// `"polygons"`: [[ring, hole, ...], ...], each ring [[lon, lat], ...].
pub(super) fn polygons_of(name: &str, v: &Value) -> R<Polygons> {
    let bad = || format!("{name}: \"polygons\" is not [[[[lon, lat], ...], ...], ...]");
    let list = v.get("polygons").and_then(Value::as_array).ok_or_else(bad)?;
    list.iter()
        .map(|rings| {
            rings
                .as_array()
                .ok_or_else(bad)?
                .iter()
                .map(|ring| {
                    ring.as_array()
                        .ok_or_else(bad)?
                        .iter()
                        .map(|p| match p.as_array() {
                            Some([x, y]) => Ok((x.as_f64().ok_or_else(bad)?, y.as_f64().ok_or_else(bad)?)),
                            _ => Err(bad()),
                        })
                        .collect()
                })
                .collect()
        })
        .collect()
}

pub(super) struct Own {
    pub(super) lat: f64,
    pub(super) lon: f64,
    pub(super) track_deg: f64,
    pub(super) gs_kt: f64,
    pub(super) alt_ft: Option<f64>,
    pub(super) vs_fpm: f64,
}

pub(super) fn own(name: &str, v: &Value) -> R<Own> {
    Ok(Own {
        lat: num_of(name, v, "lat")?,
        lon: num_of(name, v, "lon")?,
        track_deg: num_of(name, v, "track_deg")?,
        gs_kt: num_of(name, v, "gs_kt")?,
        alt_ft: opt_num_of(name, v, "alt_ft")?,
        vs_fpm: opt_num_of(name, v, "vs_fpm")?.unwrap_or(0.0),
    })
}

/// The rule `name` worked on `v`.
pub fn call(name: &str, v: &Value) -> R<String> {
    match name {
        // Where the data is wanted: {"box": [south, west, north, east]}
        // round the airspace look-ahead's track, 1 nm wider; "near_box"
        // round the next minute's, SWATH_NM and half a mile wider, for the
        // obstacles; and "lats" and "lons", 3 rows each, the track and
        // SWATH_NM either side TERRAIN_STEP_S apart, for the ground.
        "ahead_frame" => {
            let o = own(name, v)?;
            let track = Track::new(o.lat, o.lon, o.track_deg, o.gs_kt, o.alt_ft, o.vs_fpm, LOOK_AHEAD_S, AIRSPACE_STEP_S);
            let near = Track::new(o.lat, o.lon, o.track_deg, o.gs_kt, o.alt_ft, o.vs_fpm, TERRAIN_LOOK_AHEAD_S, TERRAIN_STEP_S);
            let rows = swath(&near);
            let mut out = String::from("{");
            for (key, b) in [("box", track.bbox(1.0)), ("near_box", near.bbox(SWATH_NM + 0.5))] {
                out.push_str(&format!("\"{key}\":["));
                // Track::bbox is [west, south, east, north].
                for (i, x) in [b[1], b[0], b[3], b[2]].iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    json::number(&mut out, *x);
                }
                out.push_str("],");
            }
            out.push_str("\"lats\":[");
            for (part, pick) in [("lats", 0usize), ("lons", 1)] {
                if part == "lons" {
                    out.push_str("],\"lons\":[");
                }
                for (k, row) in rows.iter().enumerate() {
                    if k > 0 {
                        out.push(',');
                    }
                    out.push('[');
                    let values = if pick == 0 { &row.0 } else { &row.1 };
                    for (i, x) in values.iter().enumerate() {
                        if i > 0 {
                            out.push(',');
                        }
                        json::number(&mut out, *x);
                    }
                    out.push(']');
                }
            }
            out.push_str("]}");
            Ok(out)
        }
        "alerts_ahead" => alerts_ahead(v),
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

pub(super) fn alerts_ahead(v: &Value) -> R<String> {
    let name = "alerts_ahead";
    let o = own(name, v)?;
    let now = num_of(name, v, "now")? as i64;
    let ground = opt_num_of(name, v, "ground_ft")?;
    let mut alerts: Vec<Alert> = Vec::new();
    let mut unavailable: Vec<&str> = Vec::new();
    // Nothing on the ground: under flying speed (AIRBORNE_KT, the motion
    // crate's `underway`).
    if o.gs_kt < AIRBORNE_KT {
        return Ok(to_json(&[], &[], None, ground));
    }
    let track = Track::new(o.lat, o.lon, o.track_deg, o.gs_kt, o.alt_ft, o.vs_fpm, LOOK_AHEAD_S, AIRSPACE_STEP_S);
    let near = Track::new(o.lat, o.lon, o.track_deg, o.gs_kt, o.alt_ft, o.vs_fpm, TERRAIN_LOOK_AHEAD_S, TERRAIN_STEP_S);

    let mut volumes = Vec::new();
    for a in opt_list(name, v, "airspace")?.unwrap_or(&[]) {
        let shape = polygons_of(name, a)?;
        volumes.push(Volume {
            class: str_of(a, "class").chars().next().unwrap_or(' '),
            name: str_of(a, "name").to_string(),
            floor: opt_num_of(name, a, "floor_ft")?.unwrap_or(0.0),
            ceiling: opt_num_of(name, a, "ceiling_ft")?,
            holds: Box::new(move |x: f64, y: f64| polygons_hold(&shape, x, y)),
        });
    }
    alerts.extend(class_alerts(&track, volumes));

    match opt_list(name, v, "special_use")? {
        Some(list) => {
            let mut areas = Vec::new();
            for a in list {
                let shape = polygons_of(name, a)?;
                let (floor_ft, ceiling_ft) = (opt_num_of(name, a, "floor_ft")?, opt_num_of(name, a, "ceiling_ft")?);
                areas.push(Area {
                    kind: str_of(a, "type").to_string(),
                    name: str_of(a, "name").to_string(),
                    heights: sua_limit::heights(Some(a), floor_ft, ceiling_ft, [0, 0]),
                    under: opt_num_of(name, a, "ground_ft")?.or(ground),
                    times_of_use: a.get("times_of_use").and_then(Value::as_str).map(str::to_string),
                    holds: Box::new(move |x: f64, y: f64| polygons_hold(&shape, x, y)),
                });
            }
            alerts.extend(special_use_alerts(&track, areas));
        }
        None => unavailable.push("special-use airspace"),
    }

    match opt_list(name, v, "tfrs")? {
        Some(list) => {
            let mut given = Vec::new();
            for t in list {
                given.push(Tfr {
                    notam: str_of(t, "notam_id").to_string(),
                    title: str_of(t, "title").to_string(),
                    rule: str_of(t, "rule").to_string(),
                    floor: opt_num_of(name, t, "floor_ft")?,
                    floor_agl: str_of(t, "floor_ref") == "AGL",
                    ceiling: opt_num_of(name, t, "ceiling_ft")?,
                    ceiling_agl: str_of(t, "ceiling_ref") == "AGL",
                    from: opt_num_of(name, t, "effective")?.map(|s| s as i64),
                    to: opt_num_of(name, t, "expires")?.map(|s| s as i64),
                    shape: polygons_of(name, t)?,
                    under: opt_num_of(name, t, "ground_ft")?,
                });
            }
            alerts.extend(tfr_alerts(&track, ground, now, &given));
        }
        None => unavailable.push("TFRs"),
    }

    match o.alt_ft {
        Some(alt) => {
            let field = match v.get("near_field") {
                None | Some(Value::Null) => None,
                Some(f) => Some((num_of(name, f, "distance_nm")?, opt_num_of(name, f, "elevation_ft")?)),
            };
            if !field.is_some_and(|(d, e)| near_field_given(d, e, alt)) {
                let rows: Option<Vec<Vec<f64>>> = match opt_list(name, v, "swath_ground_ft")? {
                    None => None,
                    Some(rows) => Some(
                        rows.iter()
                            .map(|r| r.as_array().map(|r| r.iter().map(|x| x.as_f64().unwrap_or(f64::NAN)).collect()))
                            .collect::<Option<_>>()
                            .ok_or("alerts_ahead: \"swath_ground_ft\" is not three rows of numbers")?,
                    ),
                };
                let found = rows.and_then(|rows| {
                    terrain_with(&near, &|k, i, _, _| rows.get(k).and_then(|r| r.get(i)).copied().filter(|g| g.is_finite()))
                });
                match found {
                    Some(found) => alerts.extend(found),
                    None => unavailable.push("terrain"),
                }
            }
            match opt_list(name, v, "obstacles")? {
                Some(list) => {
                    let obstacles = list
                        .iter()
                        .map(|x| {
                            Ok(Obstacle {
                                lat: num_of(name, x, "lat")?,
                                lon: num_of(name, x, "lon")?,
                                amsl_ft: num_of(name, x, "amsl_ft")?,
                                kind: str_of(x, "type").to_string(),
                            })
                        })
                        .collect::<R<Vec<_>>>()?;
                    alerts.extend(obstacle_alerts(&near, &obstacles, o.gs_kt));
                }
                None => unavailable.push("obstacles"),
            }
        }
        // Said rather than left to read as a clear sky.
        None => unavailable.push("terrain and obstacles, with no GPS altitude"),
    }
    Ok(to_json(&sorted(alerts), &unavailable, None, ground))
}
