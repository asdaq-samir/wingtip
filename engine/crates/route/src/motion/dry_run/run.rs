use super::*;

/// The flight flown on paper from the nav log's rows, starting at
/// `start_s` (s since 1970: the departure picked, or now), along `line`
/// (the planner's course_line, [lat, lon] pairs) where there is one, and
/// with `missed` the last approach gone missed.
pub fn dry_run(rows: &[Row], start_s: f64, line: Option<&[LatLon]>, missed: bool) -> DryRun {
    let Some(first) = rows.first().filter(|r| r.kind == Kind::Departure) else { return DryRun::default() };
    let plan = plan_profile(rows).0;
    let mut anchors =
        vec![Anchor { along: 0.0, route: 0.0, lat: first.lat, lon: first.lon, t: start_s, fuel: 0.0, gs: None, track: None, flown: None }];
    let mut missable = false;
    let mut went_missed = false;
    let mut last_final: Option<(f64, f64)> = None;
    // Go missed is the last approach's, the one whose final the run's button
    // is on (DryRunControls): a stop's approach before it is flown to its
    // runway -- the audit's finding, every approach went missed.
    fn procedure_of<'a>(row: &Row<'a>) -> Option<&'a Value> {
        row.leg.and_then(|l| l.get("procedure")).filter(|p| !matches!(p, Value::Null))
    }
    let last_approach = rows
        .iter()
        .enumerate()
        .filter(|(_, r)| r.kind != Kind::Departure && !r.is_leg_point() && procedure_of(r).is_some_and(|p| truthy(p.get("missed"))))
        .map(|(i, _)| i)
        .next_back();
    for (i, row) in rows.iter().enumerate().skip(1) {
        let Some(part) = row.leg_of() else { break };
        let prev = anchors.last().expect("the departure's anchor").clone();
        let whole = if row.kind == Kind::Departure { None } else { row.leg };
        let flown_by = procedure_of(row);
        if flown_by.is_some() && row.is_leg_point() {
            // A top of climb or descent on a leg flown by its procedures: laid
            // along the route, passed as the leg starts, the leg flown whole
            // along their path at the row it ends at (below).
            anchors.push(Anchor { flown: None, ..prev });
            continue;
        }
        if let (Some(by), Some(whole)) = (flown_by, whole) {
            // The whole leg, its time and fuel the planner's with the path's
            // miles more in them.
            let gs = maybe(whole, "groundspeed_kt").or_else(|| maybe(whole, "tas_kt"));
            let seconds = match maybe(whole, "ete_min") {
                Some(ete) => ete * 60.0,
                None => match gs {
                    Some(gs) if gs > 0.0 => ((f(whole, "distance_nm") + f(by, "more_nm")) / gs) * 3600.0,
                    _ => 0.0,
                },
            };
            let fuel = maybe(whole, "fuel_gal").unwrap_or_else(|| (f(whole, "fuel_burn_gph") * seconds) / 3600.0);
            let ground = if row.lands() { row.elevation_ft.unwrap_or(0.0) } else { 0.0 };
            let flown_path = path_of(by.get("path"));
            // The missed approach, there to fly; flown at its point when asked
            // (`missed`), where the approach ended at the runway.
            let has_missed = truthy(by.get("missed"));
            if has_missed {
                missable = true;
            }
            let go_missed = (missed && has_missed && Some(i) == last_approach).then(|| by.get("missed")).flatten();
            if go_missed.is_some() {
                went_missed = true;
            }
            // The missed approach point (`map_at`): the runway's threshold,
            // where the path ends, or short of it on a VOR's or a LOC's
            // approach -- gone missed, the path is cut there and the missed
            // approach flown from it.
            let map_at = index(by, "map_at").unwrap_or(flown_path.len().saturating_sub(1));
            let landed = cumulative(&flown_path);
            let path = match go_missed {
                Some(m) => {
                    let mut p = flown_path[..(map_at + 1).min(flown_path.len())].to_vec();
                    p.extend(path_of(m.get("path")));
                    p
                }
                None => flown_path.clone(),
            };
            let at = cumulative(&path);
            let at_map = landed.get(map_at).copied().unwrap_or(f64::NAN);
            let nm = *at.last().unwrap_or(&0.0);
            // The leg's time and fuel are the planner's for the path to the runway.
            let landed_nm = js_max(1e-9, *landed.last().unwrap_or(&0.0));
            let t_at = |s: f64| prev.t + (seconds * s) / landed_nm;
            if has_missed {
                // Its final from the final approach fix, the last time the
                // path is there (after a course reversal round it), or the
                // last five miles where the chart names none.
                let from = match index(by, "final_at") {
                    Some(k) => at.get(k).copied().unwrap_or(f64::NAN),
                    None => js_max(0.0, at_map - 5.0),
                };
                last_final = Some((t_at(from), t_at(at_map)));
            }
            // The plan's own climb along the path, from the leg's start to its
            // top of climb, and its cruise after: not its descent, laid along
            // the route, which the chart's altitudes stand in for.
            let cruise = f(whole, "altitude_ft");
            let toc_at = whole.get("toc").filter(|t| !matches!(t, Value::Null)).map(|t| f(t, "along_nm"));
            let climb = |s: f64| match toc_at {
                Some(top) if s < top => height_on(&plan, prev.route + s).unwrap_or(cruise),
                _ => cruise,
            };
            let ft: Vec<Option<f64>> = by.get("ft").and_then(Value::as_array).unwrap_or(&[]).iter().map(Value::as_f64).collect();
            let landing = truthy(by.get("landing")).then(|| landing_heights(&landed, &ft, cruise, ground, &climb));
            // Gone missed, the descent to the runway is flown to the missed
            // approach point, and the climb is from the height there.
            let map_ft = landing.as_ref().map_or(ground, |l| height_on(l, at_map).unwrap_or(ground));
            let heights = match (&landing, go_missed) {
                (Some(l), Some(m)) => {
                    let mut h: Vec<ProfilePoint> = l.iter().copied().filter(|p| p.along_nm <= at_map).collect();
                    if h.last().map(|p| p.along_nm) != Some(at_map) {
                        h.push(ProfilePoint { along_nm: at_map, plan_ft: map_ft });
                    }
                    h.extend(missed_heights(at_map, nm, map_ft, maybe(m, "ft").unwrap_or(cruise)));
                    Some(h)
                }
                _ => landing,
            };
            anchors.push(Anchor {
                along: prev.along + nm,
                route: prev.route + f(whole, "distance_nm"),
                lat: row.lat,
                lon: row.lon,
                // Gone missed, on past the missed approach point at the leg's pace.
                t: t_at(nm),
                fuel: prev.fuel + (fuel * nm) / landed_nm,
                gs,
                track: maybe(whole, "true_course_deg"),
                flown: Some(Flown { path, at, heights }),
            });
            continue;
        }
        let gs = maybe(part, "groundspeed_kt").or_else(|| maybe(part, "tas_kt"));
        let mut seconds = match maybe(part, "ete_min") {
            Some(ete) => ete * 60.0,
            None => match gs {
                Some(gs) if gs > 0.0 => (f(part, "distance_nm") / gs) * 3600.0,
                _ => 0.0,
            },
        };
        let mut fuel = maybe(part, "fuel_gal").unwrap_or_else(|| (f(part, "fuel_burn_gph") * seconds) / 3600.0);
        // A hold the pilot put on the leg (plan.with_holds), its minutes and
        // fuel in the leg's and so in its last piece's: taken out of the
        // piece, and flown round its racetrack -- as the leg leaves its
        // point, or, into the destination, before it lands.
        let hold = whole.and_then(|w| w.get("hold")).filter(|h| !matches!(h, Value::Null));
        let ends_leg = !row.is_leg_point();
        if let (Some(hold), true) = (hold, ends_leg) {
            seconds = js_max(0.0, seconds - f(hold, "minutes") * 60.0);
            fuel = js_max(0.0, fuel - f(hold, "gal"));
        }
        let before = &rows[i - 1];
        // The leg's first piece: not after a top of climb or descent of the
        // same leg.
        let first_piece = !(before.is_leg_point() && before.leg == whole);
        if let Some(hold) = hold {
            let at_end = matches!(hold.get("at_end"), Some(Value::Bool(true)));
            if if at_end { ends_leg } else { first_piece } {
                let distance = f(part, "distance_nm");
                let flown = held_path(hold, (prev.lat, prev.lon), (row.lat, row.lon), distance, prev.route, &plan);
                anchors.push(Anchor {
                    along: prev.along + flown.at.last().copied().unwrap_or(0.0),
                    route: prev.route + distance,
                    lat: row.lat,
                    lon: row.lon,
                    t: prev.t + seconds + f(hold, "minutes") * 60.0,
                    fuel: prev.fuel + fuel + f(hold, "gal"),
                    gs,
                    track: maybe(part, "true_course_deg"),
                    flown: Some(flown),
                });
                continue;
            }
        }
        anchors.push(Anchor {
            along: prev.along + f(part, "distance_nm"),
            route: prev.route + f(part, "distance_nm"),
            lat: row.lat,
            lon: row.lon,
            t: prev.t + seconds,
            fuel: prev.fuel + fuel,
            gs,
            track: maybe(part, "true_course_deg"),
            flown: None,
        });
    }
    if anchors.len() < 2 {
        return DryRun::default();
    }
    // Every row, every bend of the profile -- the plan's, or an approach's
    // -- every corner of an approach, and every STEP_NM between.
    let end = anchors.last().map_or(0.0, |a| a.along);
    let mut marks: Vec<f64> = anchors.iter().map(|a| a.along).collect();
    for w in anchors.windows(2) {
        let (a, b) = (&w[0], &w[1]);
        match &b.flown {
            Some(flown) => {
                marks.extend(flown.at.iter().map(|s| a.along + s));
                match &flown.heights {
                    Some(heights) => marks.extend(heights.iter().map(|h| a.along + h.along_nm)),
                    None => {
                        // The plan's own bends, laid evenly over the path.
                        let k = flown.at.last().copied().unwrap_or(0.0) / js_max(1e-9, b.route - a.route);
                        marks.extend(
                            plan.iter()
                                .filter(|p| p.along_nm > a.route && p.along_nm < b.route)
                                .map(|p| a.along + (p.along_nm - a.route) * k),
                        );
                    }
                }
            }
            None => {
                marks.extend(plan.iter().filter(|p| p.along_nm > a.route && p.along_nm < b.route).map(|p| a.along + p.along_nm - a.route))
            }
        }
    }
    let mut s = STEP_NM;
    while s < end {
        marks.push(s);
        s += STEP_NM;
    }
    // A row's anchor is its own: one each, in order, from the departure's.
    let landings = anchors
        .iter()
        .zip(rows)
        .filter(|(_, row)| (row.kind == Kind::Stop && !row.fix) || row.kind == Kind::Destination)
        .map(|(a, row)| Landing { ident: row.ident.clone(), t: a.t, nm: a.along, fuel: a.fuel })
        .collect();
    let mut out = DryRun {
        row_t: anchors.iter().map(|a| a.t).collect(),
        bends: anchors.iter().map(|a| (a.route, a.along)).collect(),
        missable,
        last_final,
        landings,
        ..DryRun::default()
    };
    let total_route = anchors.last().map_or(0.0, |a| a.route);
    let on_line = line.filter(|l| l.len() >= 2).map(|l| (l, cumulative(l)));
    let mut seg = 1;
    for along in sorted_once(marks) {
        while seg < anchors.len() - 1 && anchors[seg].along < along {
            seg += 1;
        }
        let (a, b) = (&anchors[seg - 1], &anchors[seg]);
        let frac = if b.along > a.along { js_min(1.0, js_max(0.0, (along - a.along) / (b.along - a.along))) } else { 1.0 };
        let t = a.t + (b.t - a.t) * frac;
        // Two marks at one moment (a row on a profile's bend) are one report.
        if out.points.last().is_some_and(|p| t <= p.t) {
            continue;
        }
        let (at, track, alt) = match &b.flown {
            Some(flown) => {
                let s = along - a.along;
                let (at, track) = on_path(&flown.path, &flown.at, s);
                let alt = match &flown.heights {
                    Some(h) => height_on(h, s),
                    None => height_on(&plan, a.route + (s / js_max(1e-9, flown.at.last().copied().unwrap_or(0.0))) * (b.route - a.route)),
                };
                (at, Some(track), alt)
            }
            None => {
                // The route's own distance, on a leg flown as it was planned.
                let route = a.route + (along - a.along);
                let (at, track) = match &on_line {
                    // Where the route's distance is on the course the map
                    // draws: its length matched to the legs', so the two end
                    // together.
                    Some((points, lengths)) => {
                        let length = lengths.last().copied().unwrap_or(0.0);
                        let (at, track) = on_path(points, lengths, if total_route > 0.0 { (route / total_route) * length } else { 0.0 });
                        (at, Some(track))
                    }
                    None => (between((a.lat, a.lon), (b.lat, b.lon), frac), b.track),
                };
                (at, track, height_on(&plan, route))
            }
        };
        out.points.push(RunPoint { t, lat: at.0, lon: at.1, alt_ft: alt, gs_kt: b.gs, track_deg: track });
        out.along_nm.push(along);
        out.fuel_gal.push(a.fuel + (b.fuel - a.fuel) * frac);
    }
    // Landed: at a standstill on the field at the run's end, not at the leg's
    // ground speed. Held there at 120 kt, own ship was in the air to the
    // alerts ahead, which said "Tower 307 ft, now, 120 ft above you" over El
    // Dorado's runway (the owner's recording, 2026-10-19). Not where the run
    // goes missed and ends in the air, or stops short of the legs not in.
    let last_row = rows.last();
    if !went_missed
        && anchors.len() == rows.len()
        && last_row.is_some_and(|r| r.kind == Kind::Destination && !r.fix)
        && let Some(p) = out.points.last_mut()
    {
        p.gs_kt = Some(0.0);
    }
    out
}
