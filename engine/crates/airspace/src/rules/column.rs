use super::*;

/// The airspace over the point in bands, from the ground to FL600: a B,
/// C or D holds its band where it is drawn, the most restrictive where
/// they overlap; E from its floor (or 14,500 ft where nothing lower is
/// drawn); G under it all; A from 18,000 ft. Bands are split where the
/// rules change -- 1,200 ft above the ground in G, 10,000 ft MSL -- and
/// joined where nothing does.
pub fn column(ground_ft: f64, volumes: &[Volume], in_veil: bool) -> Vec<Band> {
    let floor_msl = |v: &Volume| match v.floor_ref {
        FloorRef::Agl => ground_ft + v.floor_ft,
        FloorRef::Sfc => ground_ft,
        FloorRef::Msl => v.floor_ft,
    };
    let layered: Vec<(f64, f64, &Volume)> = volumes
        .iter()
        .map(|v| {
            let f = floor_msl(v);
            (f, v.ceiling_ft.max(f), v)
        })
        .collect();
    let controlled: Vec<&(f64, f64, &Volume)> = layered.iter().filter(|l| matches!(l.2.class, 'B' | 'C' | 'D')).collect();
    let class_e: Vec<&(f64, f64, &Volume)> = layered.iter().filter(|l| l.2.class == 'E').collect();
    let b_shelves: Vec<f64> = controlled.iter().filter(|l| l.2.class == 'B').map(|l| l.0).collect();

    let mut edges = vec![
        ground_ft,
        ground_ft + G_LOW_AGL_FT,
        ground_ft + TRANSPONDER_EXEMPT_AGL_FT,
        ground_ft + SPEED_200_KT_AGL_FT,
        // 71.71(a)(2): the 14,500 ft Class E stops 1,500 ft above the surface.
        ground_ft + CLASS_E_ABOVE_SURFACE_FT,
        TEN_THOUSAND_FT,
        vfr::HIGH_FROM_MSL_FT,
        CLASS_E_EVERYWHERE_FT,
        CLASS_A_FLOOR_FT,
    ];
    for (f, c, _) in &layered {
        edges.push(*f);
        edges.push(*c);
    }
    edges.retain(|e| ground_ft <= *e && *e <= CLASS_A_FLOOR_FT);
    edges.stable_sort_by(|a, b| a.partial_cmp(b).unwrap());
    edges.dedup();

    let mut bands: Vec<Band> = Vec::new();
    for pair in edges.windows(2) {
        let (bottom, top) = (pair[0], pair[1]);
        if top <= bottom {
            continue;
        }
        let middle = (bottom + top) / 2.0;
        let mut holding: Option<&Volume> = None;
        for (f, c, v) in controlled.iter().map(|l| (l.0, l.1, l.2)) {
            if f <= middle && middle < c && holding.is_none_or(|h| restrictiveness(v.class) < restrictiveness(h.class)) {
                holding = Some(v);
            }
        }
        let (class, name, ident) = match holding {
            Some(v) => (v.class, Some(v.name.clone()), v.ident.clone()),
            None if class_e.iter().any(|l| l.0 <= middle && middle < l.1)
                || (middle >= CLASS_E_EVERYWHERE_FT && middle >= ground_ft + CLASS_E_ABOVE_SURFACE_FT) =>
            {
                ('E', None, None)
            }
            None => ('G', None, None),
        };
        let agl = bottom - ground_ft;
        let under_b = class != 'B' && b_shelves.iter().any(|f| *f > middle);
        let above_bc = controlled.iter().any(|l| matches!(l.2.class, 'B' | 'C') && l.1 <= bottom);
        let band = Band {
            floor_ft: bottom,
            ceiling_ft: top,
            class,
            name,
            ident,
            minimums: minimums(class, bottom, agl),
            entry: entry(class),
            equipment: equipment(class, bottom, agl, in_veil, above_bc),
            speed_kt: speed_kt(class, bottom, under_b, agl),
        };
        match bands.last_mut() {
            Some(previous)
                if previous.class == band.class
                    && previous.name == band.name
                    && previous.ident == band.ident
                    && previous.minimums == band.minimums
                    && previous.equipment == band.equipment
                    && previous.speed_kt == band.speed_kt =>
            {
                previous.ceiling_ft = top;
            }
            _ => bands.push(band),
        }
    }
    bands.push(Band {
        floor_ft: CLASS_A_FLOOR_FT,
        ceiling_ft: TOP_FT,
        class: 'A',
        name: None,
        ident: None,
        minimums: None,
        entry: entry('A'),
        equipment: equipment('A', CLASS_A_FLOOR_FT, CLASS_A_FLOOR_FT - ground_ft, in_veil, false),
        speed_kt: None,
    });
    bands
}

pub(super) fn write_rule(out: &mut String, r: &Rule) {
    out.push_str("{\"visibility_sm\":");
    json::number(out, r.visibility_sm);
    out.push_str(",\"clear_of_clouds\":");
    out.push_str(if r.below_ft.is_none() { "true" } else { "false" });
    out.push_str(",\"below_ft\":");
    json::opt_number(out, r.below_ft);
    out.push_str(",\"above_ft\":");
    json::opt_number(out, r.above_ft);
    out.push_str(",\"horizontal_ft\":");
    json::opt_number(out, r.horizontal_ft);
    out.push('}');
}

/// A band as the planner's AirspaceBand writes it.
pub fn write_band(out: &mut String, b: &Band) {
    out.push_str("{\"floor_ft\":");
    json::number(out, b.floor_ft);
    out.push_str(",\"ceiling_ft\":");
    json::number(out, b.ceiling_ft);
    out.push_str(",\"class\":");
    json::string(out, &b.class.to_string());
    out.push_str(",\"name\":");
    json::opt_string(out, b.name.as_deref());
    out.push_str(",\"ident\":");
    json::opt_string(out, b.ident.as_deref());
    out.push_str(",\"minimums\":");
    match &b.minimums {
        Some(m) => {
            out.push_str("{\"day\":");
            write_rule(out, &m.day);
            out.push_str(",\"night\":");
            write_rule(out, &m.night);
            out.push('}');
        }
        None => out.push_str("null"),
    }
    out.push_str(",\"entry\":");
    json::string(out, b.entry);
    out.push_str(",\"equipment\":");
    json::opt_string(out, b.equipment);
    out.push_str(",\"speed_kt\":");
    match b.speed_kt {
        Some(s) => out.push_str(&s.to_string()),
        None => out.push_str("null"),
    }
    out.push('}');
}

/// The column as the planner asks it (call.rs `airspace_column`), from
/// `{"ground_ft"?, "volumes": [{"class", "name"?, "ident"?, "floor_ft", "floor_ref":
/// "SFC"|"AGL"|"MSL", "ceiling_ft"}], "in_veil"?}`: the bands, each as
/// the planner's AirspaceBand writes it. The planner reads the volumes
/// out of its own NASR shapefile or cycle pack (wingtip.airspace_at) and
/// asks the rules here, the phone's very ones.
pub fn column_json(v: &json::Value) -> Result<String, String> {
    use json::Value;
    let bad = |what: &str| format!("airspace_column: {what}");
    let num = |o: &Value, key: &str| -> Result<f64, String> {
        o.get(key).and_then(Value::as_f64).ok_or_else(|| bad(&format!("a volume's \"{key}\" is not a number")))
    };
    let ground_ft = match v.get("ground_ft") {
        None | Some(Value::Null) => 0.0,
        Some(g) => g.as_f64().ok_or_else(|| bad("\"ground_ft\" is not a number"))?,
    };
    let in_veil = match v.get("in_veil") {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(_) => return Err(bad("\"in_veil\" is not true or false")),
    };
    let listed = match v.get("volumes") {
        None | Some(Value::Null) => &[][..],
        Some(l) => l.as_array().ok_or_else(|| bad("\"volumes\" is not a list"))?,
    };
    let mut volumes = Vec::with_capacity(listed.len());
    for o in listed {
        let class = o.get("class").and_then(Value::as_str).unwrap_or("").trim();
        let class = match class.chars().next() {
            Some(c) if class.len() == 1 && matches!(c, 'B' | 'C' | 'D' | 'E') => c,
            _ => return Err(bad(&format!("a volume's class is B, C, D or E, not {class:?}"))),
        };
        let floor_ref = match o.get("floor_ref").and_then(Value::as_str) {
            Some("SFC") => FloorRef::Sfc,
            Some("AGL") => FloorRef::Agl,
            Some("MSL") => FloorRef::Msl,
            other => return Err(bad(&format!("a volume's floor_ref is SFC, AGL or MSL, not {other:?}"))),
        };
        volumes.push(Volume {
            class,
            name: o.get("name").and_then(Value::as_str).unwrap_or("").to_owned(),
            ident: o.get("ident").and_then(Value::as_str).map(|i| i.trim().to_uppercase()).filter(|i| !i.is_empty()),
            floor_ft: num(o, "floor_ft")?,
            floor_ref,
            ceiling_ft: num(o, "ceiling_ft")?,
        });
    }
    let mut out = String::from("[");
    for (k, band) in column(ground_ft, &volumes, in_veil).iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        write_band(&mut out, band);
    }
    out.push(']');
    Ok(out)
}

/// The nearest of the Mode C veil airports (14 CFR part 91 appendix D
/// section 1), each (lat, lon, ident, name), within MODE_C_VEIL_NM of the
/// point: (ident, name, distance in nm); None outside every veil.
pub fn nearest_veil(lat: f64, lon: f64, airports: impl IntoIterator<Item = (f64, f64, String, String)>) -> Option<(String, String, f64)> {
    let mut best: Option<(String, String, f64)> = None;
    for (a_lat, a_lon, ident, name) in airports {
        let d = crate::geo::distance_nm(lat, lon, a_lat, a_lon);
        if d <= MODE_C_VEIL_NM && best.as_ref().is_none_or(|b| d < b.2) {
            best = Some((ident, name, d));
        }
    }
    best
}

/// The veil as the planner asks it (call.rs `mode_c_veil`), from `{"lat",
/// "lon", "airports": [{"ident", "name"?, "lat"?, "lon"?}]}`: `{"ident",
/// "name", "distance_nm"}` to a tenth, or null. An airport with no place
/// is passed over.
pub fn veil_json(v: &json::Value) -> Result<String, String> {
    use json::Value;
    let num = |o: &Value, key: &str| match o.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(n) => n.as_f64().map(Some).ok_or_else(|| format!("mode_c_veil: \"{key}\" is not a number")),
    };
    let (lat, lon) = match (num(v, "lat")?, num(v, "lon")?) {
        (Some(lat), Some(lon)) => (lat, lon),
        _ => return Err("mode_c_veil: \"lat\" and \"lon\" are numbers".to_owned()),
    };
    let listed = v.get("airports").and_then(Value::as_array).ok_or_else(|| "mode_c_veil: \"airports\" is not a list".to_owned())?;
    let mut airports = Vec::new();
    for a in listed {
        if let (Some(a_lat), Some(a_lon)) = (num(a, "lat")?, num(a, "lon")?) {
            let text = |key: &str| a.get(key).and_then(Value::as_str).unwrap_or("").to_owned();
            airports.push((a_lat, a_lon, text("ident"), text("name")));
        }
    }
    let mut out = String::new();
    match nearest_veil(lat, lon, airports) {
        Some((ident, name, d)) => {
            out.push_str("{\"ident\":");
            json::string(&mut out, &ident);
            out.push_str(",\"name\":");
            json::opt_string(&mut out, Some(name.as_str()).filter(|n| !n.is_empty()));
            // As Python's round(d, 1): the nearest tenth, correctly rounded.
            out.push_str(&format!(",\"distance_nm\":{d:.1}}}"));
        }
        None => out.push_str("null"),
    }
    Ok(out)
}
