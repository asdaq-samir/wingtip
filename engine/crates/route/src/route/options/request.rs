use super::*;

/// The grid read from everything the planner sent: the sources it could
/// not read named in `unchecked`, in the order the planner reads them.
pub(super) fn read_grid(a: &Ask, unchecked: &mut Vec<String>) -> Result<(Grid, Vec<f64>), String> {
    let start = a.dep.at;
    let end = a.dest.at;
    let window = window(a);
    let top = highest_cruise_ft(a.profile.ceiling_ft);
    let ceiling = LEGAL_CEILING_FT.max(a.min_ceiling_ft.unwrap_or(0.0));
    let visibility = LEGAL_VISIBILITY_SM.max(a.min_visibility_sm.unwrap_or(0.0));
    let mut grid = Grid::new(start, end, &via(a));
    // No ceiling known (no airplane, or none in its profile): no ground
    // closed on it, and the pilot told (the owner, 2026-11-09).
    if a.profile.ceiling_ft.is_none() {
        unchecked.push("service ceiling".into());
    }
    match &a.terrain_ft {
        Some(h) => read::ground(&mut grid, h, a.profile.ceiling_ft.map(|_| top))?,
        // The tiles not to be had: the ways offered over level ground, and
        // the pilot told.
        None => unchecked.push("terrain".into()),
    }
    match &a.water_far {
        Some(far) => read::water(&mut grid, far.clone())?,
        None => unchecked.push("water".into()),
    }
    let metars_wanted = a.depart_s - a.now_s <= METAR_AHEAD_S;
    if a.tafs.is_none() || (metars_wanted && a.metars.is_none()) {
        unchecked.push("forecasts and reports".into());
    }
    read::weather(
        &mut grid,
        a.tafs.as_deref().unwrap_or(&[]),
        a.metars.as_deref().unwrap_or(&[]),
        a.depart_s,
        a.now_s,
        ceiling,
        visibility,
    );
    match &a.sigmets {
        Some(s) => read::sigmets(&mut grid, s, window),
        None => unchecked.push("SIGMETs".into()),
    }
    match &a.gairmets {
        Some(g) => read::gairmets(&mut grid, g, window, top),
        None => unchecked.push("G-AIRMETs".into()),
    }
    match &a.sua {
        Some(s) => special_use::special_use(&mut grid, s),
        None => unchecked.push("special-use airspace".into()),
    }
    match &a.tfrs {
        Some(t) => read::tfrs(&mut grid, t),
        None => unchecked.push("TFRs".into()),
    }
    // East is least: magnetic = true - variation east, each cell's (the
    // World Magnetic Model, today's), read every half degree: it changes
    // along a long east-west way, and so may its half of 91.159.
    let year = naming::decimal_year(a.now_s);
    let read = RefCell::new(std::collections::HashMap::new());
    let variation = |lat: f64, lon: f64| {
        let at = ((lat * 2.0).round() as i64, (lon * 2.0).round() as i64);
        *read.borrow_mut().entry(at).or_insert_with(|| wmm::declination(at.0 as f64 / 2.0, at.1 as f64 / 2.0, year))
    };
    // With no airplane the ways are the route's own, in still air. Each
    // way tries its own half's altitudes to the airplane's top.
    let winds = if a.profile.airplane { &a.winds[..] } else { &[] };
    let altitudes = read::cruising_altitudes(read::cruise_top_ft(a.profile.ceiling_ft));
    let gs = read::groundspeeds(&grid, winds, &altitudes, a.profile.tas_kt.max(1.0), &variation);
    Ok((grid, gs))
}

/// The ways to fly from the departure to the destination: the answer
/// route_options gives (the contract's RouteOptionsAnswer).
pub(super) fn options(a: &Ask) -> Result<String, String> {
    let (start, end) = (a.dep.at, a.dest.at);
    let mut unchecked = Vec::new();
    let (mut grid, gs) = read_grid(a, &mut unchecked)?;
    // 91.151: 30 minutes by day, 45 at night, night judged at both ends
    // of the flight's window (14 CFR 1.1, wingtip_flight::sun) unless the
    // host says.
    let night = a.night.unwrap_or_else(|| {
        let (leave, arrive) = window(a);
        wingtip_flight::sun::night_at_either_end(start, leave, end, arrive)
    });
    let reserve_gal = flight::reserve_min(false, night) / 60.0 * a.profile.burn_gph;
    if a.fields.is_none() {
        unchecked.push("fuel fields".into());
    }
    // An airplane whose usable fuel or start and taxi allowance is not
    // known: its fuel stops are not worked out, nor said to be needed or
    // not, and none is assumed (the owner, 2026-11-09).
    if a.profile.airplane && a.profile.usable_gal.is_none() {
        unchecked.push("fuel".into());
    } else if a.profile.airplane && a.profile.taxi_gal.is_none() {
        unchecked.push("start and taxi fuel".into());
    }
    // Not the route's own fields: a landing the pilot makes is not a stop
    // to add.
    let skip: Vec<&str> =
        [a.dep.ident.as_str(), a.dest.ident.as_str()].into_iter().chain(a.current_idents.iter().map(String::as_str)).collect();
    let table: Option<Vec<Field>> = a.fields.as_ref().map(|f| f.iter().filter(|f| !skip.contains(&f.ident.as_str())).cloned().collect());
    let fuel = Fuel {
        tas_kt: a.profile.tas_kt,
        burn_gph: a.profile.burn_gph,
        usable_gal: a.profile.usable_gal.unwrap_or(0.0),
        taxi_gal: a.profile.taxi_gal.unwrap_or(0.0),
        reserve_gal,
        fields: table.as_deref(),
        food: a.food,
        unread: RefCell::new(Vec::new()),
    };
    let year = naming::decimal_year(a.now_s);
    let mut found: Vec<Way> = Vec::new();
    for kind in KINDS {
        let marginal_cost = if kind == "weather" { MARGINAL_COST } else { 0.0 };
        let water_cost = if kind == "land" { WATER_COST } else { 0.0 };
        // Clear of everything where there is a way, else crossing least.
        let Some(cells) = way(&grid, &gs, start, end, marginal_cost, None, water_cost)
            .or_else(|| way(&grid, &gs, start, end, marginal_cost, Some(CLOSED_COST), water_cost))
        else {
            continue;
        };
        let mut points = vec![start];
        if cells.len() > 2 {
            points.extend(cells[1..cells.len() - 1].iter().map(|&c| grid.centre(c)));
        }
        points.push(end);
        let turns = straightened(&grid, &gs, &points, marginal_cost, water_cost, &STRAIGHTEN_STEPS_MIN, MAX_TURNS);
        let marginal_stop = MARGINAL_STOP_MIN * if kind == "weather" { 3.0 } else { 1.0 };
        let stops = stops::stops(&grid, &gs, &turns, &fuel, kind == "stops", marginal_stop);
        // No chain of fields reaches: the way offered all the same, with
        // that said (the owner's rule: no hard limits, only warnings).
        let option = make_way(kind, &mut grid, &gs, a, turns, stops.as_deref().unwrap_or(&[]), stops.is_none(), year);
        // A way that is also another's best is one option with both names.
        if let Some(same) = found.iter_mut().find(|o| o.stops == option.stops) {
            same.kinds.push(kind.to_owned());
            continue;
        }
        found.push(option);
    }
    let found = named(&grid, found);
    let current = a.current.clone().unwrap_or_else(|| vec![start, end]);
    let mine = own(&mut grid, &gs, a, &fuel, &current, &a.current_idents, &a.current_landed, "own", "Your Route");
    // The most filed route's fixes are flown over, none landed at.
    let filed = a.filed.as_ref().map(|(points, idents)| {
        let mut path = vec![start];
        path.extend(points.iter().copied());
        path.push(end);
        own(&mut grid, &gs, a, &fuel, &path, idents, &vec![false; idents.len()], "filed", "Most Filed")
    });
    let class_b = super::class_b_way::class_b_way(&mut grid, &gs, a, &fuel);

    let mut out = String::from("{\"options\":[");
    for (i, w) in found.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        way_json(&mut out, w, a.profile.airplane, &grid.hazards);
    }
    out.push_str("],\"own\":");
    way_json(&mut out, &mine, a.profile.airplane, &grid.hazards);
    for (key, way) in [("filed", &filed), ("class_b", &class_b)] {
        out.push_str(&format!(",\"{key}\":"));
        match way {
            Some(w) => way_json(&mut out, w, a.profile.airplane, &grid.hazards),
            None => out.push_str("null"),
        }
    }
    // The pilot's own route as it is flown, end to end, for the map to
    // draw beside the ways (the owner's "all routes drawn including mine",
    // 2026-10-25).
    out.push_str(",\"current_path\":");
    path_json(&mut out, &current);
    out.push_str(",\"direct\":");
    ints(&mut out, &crossed(&grid, &[start, end], false));
    // The ends' own weather, which no way round can change: said, as the
    // briefing says it, for the pilot to judge.
    let mut ends: Vec<i64> = Vec::new();
    for c in [grid.cell(start), grid.cell(end)] {
        let h = grid.closed[grid.at(c)];
        if h >= 0 && !ends.contains(&h) {
            ends.push(h);
        }
    }
    out.push_str(",\"ends\":");
    ints(&mut out, &ends);
    let (crossing, marginal) = match &a.current {
        Some(c) => (crossed(&grid, c, false), crossed(&grid, c, true)),
        None => (Vec::new(), Vec::new()),
    };
    out.push_str(",\"current\":");
    ints(&mut out, &crossing);
    // What the pilot's own route meets, as each way's: its weather strip,
    // wind and floor.
    out.push_str(",\"current_along\":{");
    along_json(&mut out, &along(&grid, &gs, &current, a.profile.tas_kt));
    out.push_str("},\"current_marginal\":");
    ints(&mut out, &marginal);
    out.push_str(",\"hazards\":[");
    for (i, h) in grid.hazards.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"kind\":");
        json::string(&mut out, &h.kind);
        out.push_str(",\"name\":");
        json::string(&mut out, &h.name);
        out.push('}');
    }
    out.push_str("],\"unchecked\":");
    strings(&mut out, &unchecked);
    // The fuel fields weighed whose places to eat were not read yet: the
    // planner reads them on the side and asks again sooner.
    out.push_str(",\"food_unread\":[");
    for (i, (ident, lat, lon)) in fuel.unread.borrow().iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"ident\":");
        json::string(&mut out, ident);
        out.push_str(",\"lat\":");
        json::number(&mut out, *lat);
        out.push_str(",\"lon\":");
        json::number(&mut out, wrap::normal(*lon));
        out.push('}');
    }
    out.push_str("]}");
    Ok(out)
}
