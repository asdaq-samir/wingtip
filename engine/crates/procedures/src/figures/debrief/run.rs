use super::*;

/// A flight debriefed against its track; None where the track never flew.
/// `points` in time order; `patterns` the fields' pattern altitudes, ft
/// MSL, by ident (the planner's own, wingtip.pattern's).
pub fn debrief(checkpoints: &[Checkpoint], points: &[Point], patterns: &[(String, f64)]) -> Option<Debrief> {
    let mut cps = checkpoints.to_vec();
    cps.stable_sort_by_key(|c| c.sequence_no);
    let runs = airborne(points);
    if cps.len() < 2 || runs.is_empty() {
        return None;
    }
    let leg_hops = hops(&cps);
    let mut notes = Vec::new();
    // Each hop its own flight where the track has as many; else the whole
    // track one flight, its times from the first takeoff.
    let flights: Vec<(usize, usize)> = if runs.len() == leg_hops.len() {
        runs.clone()
    } else {
        if leg_hops.len() > 1 {
            notes.push(format!(
                "The track has {} flight{} for the plan's {}: times are from the first takeoff.",
                runs.len(),
                if runs.len() == 1 { "" } else { "s" },
                leg_hops.len()
            ));
        }
        vec![(runs[0].0, runs[runs.len() - 1].1); leg_hops.len()]
    };
    let (first, last) = (points[flights[0].0], points[flights[flights.len() - 1].1]);
    let (cp0, cpn) = (&cps[0], &cps[cps.len() - 1]);
    let (off_start, off_end) = (nm(at(&first), place(cp0)), nm(at(&last), place(cpn)));
    // Python's "{:.0f}": the nearest, a tie to the even one, as Rust's.
    if off_start > 5.0 {
        notes.push(format!("The track takes off {off_start:.0} nm from {}: is it this flight's?", cp0.name));
    }
    if off_end > 5.0 {
        notes.push(format!("The track lands {off_end:.0} nm from {}.", cpn.name));
    }

    // Each leg, from checkpoint i to i + 1, and the hop it is in.
    let seg_hop: Vec<Option<usize>> = (0..cps.len() - 1).map(|i| leg_hops.iter().position(|&(a, b)| a <= i && i < b)).collect();
    let has_altitude = points.iter().any(|p| p.alt_ft.is_some());
    let mut grades = vec![Grade::default(); cps.len() - 1];
    let mut profile = Vec::new();
    let mut line = Vec::new();
    let mut passed: Vec<Option<f64>> = vec![None; cps.len()];
    let mut passes = Vec::new();
    let mut entries = Vec::new();

    for (h, &(a, b)) in leg_hops.iter().enumerate() {
        let (start, end) = flights[h];
        let hop_segs: Vec<usize> = (0..cps.len() - 1).filter(|&s| seg_hop[s] == Some(h)).collect();
        // The cruise: from first reaching the first leg's altitude to last
        // being at the last leg's, before the landing.
        let first_alt = cps.get(a + 1).and_then(|c| c.altitude_ft);
        let last_alt = cps[b].altitude_ft;
        let (mut cruise_from, mut cruise_to) = (f64::INFINITY, f64::NEG_INFINITY);
        for p in &points[start..=end] {
            let Some(alt) = p.alt_ft else { continue };
            if first_alt.is_some_and(|f| cruise_from == f64::INFINITY && alt >= f - ALTITUDE_FT) {
                cruise_from = p.t;
            }
            if last_alt.is_some_and(|l| alt >= l - ALTITUDE_FT) {
                cruise_to = p.t;
            }
        }
        let mut cursor = 0;
        let mut prev_along = cps[a].along_track_nm;
        let mut prev_t = points[start].t;
        for i in start..=end {
            let p = &points[i];
            // The nearest of the legs about where it was, so a route that
            // doubles back is not read on its way out as on its way home.
            let mut best = hop_segs[cursor];
            let mut where_ = against(&cps[best], &cps[best + 1], p);
            for &s in &hop_segs[cursor.saturating_sub(1)..=(cursor + 3).min(hop_segs.len() - 1)] {
                let w = against(&cps[s], &cps[s + 1], p);
                if w.2 < where_.2 {
                    best = s;
                    where_ = w;
                }
            }
            cursor = hop_segs.iter().position(|&s| s == best).unwrap_or(0);
            let (from, to) = (&cps[best], &cps[best + 1]);
            let (t_along, right, _) = where_;
            let along = from.along_track_nm + t_along * (to.along_track_nm - from.along_track_nm);
            // Each checkpoint passed: when the track first got past it.
            for k in a + 1..b {
                let cp_along = cps[k].along_track_nm;
                if passed[k].is_none() && along >= cp_along && cp_along > prev_along {
                    let share = if along > prev_along { (cp_along - prev_along) / (along - prev_along) } else { 0.0 };
                    passed[k] = Some(prev_t + share * (p.t - prev_t));
                }
            }
            prev_along = along;
            prev_t = p.t;
            let weight = if i < end { (points[i + 1].t - p.t).min(30_000.0) } else { 0.0 };
            let g = &mut grades[best];
            let since_leg_start = along - from.along_track_nm;
            let (to_field, from_field) = (cps[b].along_track_nm - along, along - cps[a].along_track_nm);
            // Course: not over the fields, nor in the turn onto a leg.
            if let Some(course) = to.true_course_deg
                && from_field > 2.0
                && to_field > 2.0
                && since_leg_start > 1.0
            {
                let (mut j, mut k) = (i, i);
                while points[k].t - points[j].t < 20_000.0 && (j > start || k < end) {
                    if j > start {
                        j -= 1;
                    }
                    if k < end {
                        k += 1;
                    }
                }
                if k > j {
                    let off = angle_between(bearing_deg(points[j].lat, points[j].lon, points[k].lat, points[k].lon), course);
                    g.course_w += weight;
                    if off <= COURSE_DEG {
                        g.course_in += weight;
                    }
                }
                if g.worst_off.is_none_or(|w| right.abs() > w.abs()) {
                    g.worst_off = Some(right);
                }
            }
            // Altitude: in the cruise, and not in a step to a new one.
            let planned = to.altitude_ft;
            let stepped = best > a && cps[best].altitude_ft != planned && since_leg_start < 3.0;
            let mut off_line = right.abs() > OFF_ROUTE_NM && from_field > 2.0 && to_field > 2.0;
            if let (Some(alt), Some(planned)) = (p.alt_ft, planned)
                && cruise_from <= p.t
                && p.t <= cruise_to
                && !stepped
            {
                let dev = alt - planned;
                g.alt_w += weight;
                if dev.abs() <= ALTITUDE_FT {
                    g.alt_in += weight;
                } else {
                    off_line = true;
                }
                if g.worst_alt.is_none_or(|w| dev.abs() > w.abs()) {
                    g.worst_alt = Some(dev);
                }
            }
            line.push(LinePoint { lat: p.lat, lon: p.lon, off: off_line });
            if let Some(alt) = p.alt_ft {
                profile.push((along, alt));
            }
        }

        // The checkpoints' times, from this hop's takeoff.
        let mut due = Some(0.0);
        for (k, cp) in cps.iter().enumerate().take(b + 1).skip(a + 1) {
            due = match (due, cp.ete_min) {
                (Some(d), Some(e)) => Some(d + e),
                _ => None,
            };
            let at_t = if k == b { Some(points[end].t) } else { passed[k] };
            let closest = points[start..=end].iter().map(|p| nm(at(p), place(cp))).fold(f64::INFINITY, f64::min);
            passes.push(Pass {
                name: cp.name.clone(),
                category: cp.category.clone(),
                due_min: due,
                passed_min: at_t.map(|t| (t - points[start].t) / 60_000.0),
                closest_nm: closest.is_finite().then_some(closest),
            });
        }

        // The pattern: the altitude where it first came within PATTERN_NM
        // of the field it landed at.
        let field = &cps[b];
        if let Some(&(_, pattern_ft)) = patterns.iter().find(|(ident, _)| *ident == field.name) {
            let found = points[start..=end].iter().find_map(|p| p.alt_ft.filter(|_| nm(at(p), place(field)) <= PATTERN_NM));
            if let Some(alt) = found {
                entries.push(PatternEntry { ident: field.name.clone(), alt_ft: alt, pattern_ft });
            }
        }
    }

    let legs = grades
        .iter()
        .enumerate()
        .map(|(s, g)| {
            let (from, to) = (&cps[s], &cps[s + 1]);
            LegGrade {
                from: from.name.clone(),
                to: to.name.clone(),
                planned_alt_ft: to.altitude_ft,
                altitude_within: (g.alt_w > 0.0).then(|| g.alt_in / g.alt_w),
                worst_alt_ft: g.worst_alt,
                course_deg: to.true_course_deg,
                course_within: (g.course_w > 0.0).then(|| g.course_in / g.course_w),
                worst_off_nm: g.worst_off,
            }
        })
        .collect();
    let flown_ms: f64 = flights
        .iter()
        .enumerate()
        .filter(|&(h, &(a, _))| !(h > 0 && flights[h - 1].0 == a))
        .map(|(_, &(a, b))| points[b].t - points[a].t)
        .sum();
    let mut planned_min = Some(0.0);
    for c in &cps[1..] {
        planned_min = match (planned_min, c.ete_min) {
            (Some(p), Some(e)) => Some(p + e),
            _ => None,
        };
    }
    // At most 400 points on the profile and 1,500 on the map: they are
    // drawn, not read. An off point is never thinned out of the map's.
    let stride = profile.len().div_ceil(400).max(1);
    let line_stride = line.len().div_ceil(1500).max(1);
    let line_last = line.len().saturating_sub(1);
    Some(Debrief {
        takeoff: first.t,
        landing: last.t,
        flown_min: flown_ms / 60_000.0,
        planned_min,
        legs,
        passes,
        patterns: entries,
        profile: profile.into_iter().step_by(stride).collect(),
        planned: (0..cps.len() - 1).map(|s| (cps[s].along_track_nm, cps[s + 1].along_track_nm, cps[s + 1].altitude_ft)).collect(),
        line: line.into_iter().enumerate().filter(|(i, pt)| pt.off || i % line_stride == 0 || *i == line_last).map(|(_, pt)| pt).collect(),
        has_altitude,
        notes,
    })
}
