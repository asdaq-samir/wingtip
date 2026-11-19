use super::*;

/// One attempt at an approach debriefed (the first where none is given);
/// None where the track did not fly it: never inbound over its final
/// approach fix within PASS_NM, or then not down its final within
/// MATCH_NM on average, or far over the fix's altitude. `minimums_ft` the
/// pilot's DA or MDA from the plate: the CIFP has no minimums, so none is
/// assumed.
pub fn debrief(d: &Drawing, points: &[Point], attempt: Option<Attempt>, minimums_ft: Option<f64>) -> Option<Debrief> {
    let run = locate(d, points, attempt)?;
    let mut state = State {
        findings: Vec::new(),
        track_off: vec![false; points.len()],
        along_at: Vec::new(),
        stretches: Vec::new(),
        worst_right: 0.0,
        crossings: Vec::new(),
        profile_gp: None,
        gp_sum: 0.0,
        gp_n: 0,
        lowest_ft: None,
        outcome: Outcome::Unknown,
        seconds_after_map: None,
    };
    course(&run, &mut state);
    altitudes(&run, &mut state);
    glidepath(&run, &mut state);
    outcome(&run, &mut state);
    Some(assemble(&run, state, minimums_ft))
}

/// The debrief as flown: the track drawn, the figures and the findings in order.
fn assemble(r: &Run, s: State, minimums_ft: Option<f64>) -> Debrief {
    let (d, points, path, passes) = (r.d, r.points, &r.path, &r.passes);
    let (attempt, guidance, has_altitude, faf, faf_cross, landed_at, climb_at, end_at, map_along, start_at, fit_nm) =
        (r.attempt, r.guidance, r.has_altitude, r.faf, r.faf_cross, r.landed_at, r.climb_at, r.end_at, r.map_along, r.start_at, r.fit_nm);
    let State {
        findings,
        track_off,
        along_at,
        crossings: crossings_out,
        profile_gp,
        gp_sum,
        gp_n,
        lowest_ft,
        outcome,
        seconds_after_map,
        ..
    } = s;
    // The track drawn: from where it came onto the way in to a couple of
    // minutes into the missed approach, or the landing.
    let draw_to = attempt.to.min(match (landed_at, climb_at) {
        (Some(l), _) => l,
        (None, Some(c)) => c + time_index(points, c, 120_000.0).max(1),
        (None, None) => end_at + 1,
    });
    let draw_from = attempt.from.max(start_at.saturating_sub(5));
    let plan_track: Vec<(f64, f64, bool)> =
        (draw_from..=draw_to.min(points.len() - 1)).map(|i| (points[i].lat, points[i].lon, track_off[i])).collect();
    let profile_all: Vec<(f64, f64, bool)> =
        along_at.iter().filter_map(|&(i, along)| points[i].alt_ft.map(|alt| (map_along - along, alt, track_off[i]))).collect();
    let every = profile_all.len().div_ceil(300).max(1);
    let profile_track = profile_all.iter().enumerate().filter(|(i, _)| i % every == 0).map(|(_, p)| *p).collect();
    let way_in_passed = passes.iter().position(|p| p.fix == faf).unwrap_or(0);
    let flown = Debrief {
        airport: d.airport.clone(),
        id: d.id.clone(),
        name: d.name.clone(),
        transition: d.transition.clone(),
        guidance,
        faf_at: time_at(points, faf_cross.i, faf_cross.u),
        fit_nm,
        glidepath_fit_ft: if gp_n > 0 { Some(gp_sum / gp_n as f64) } else { None },
        crossings: crossings_out,
        findings: ordered(findings),
        plan_inbound: path.ll.clone(),
        plan_missed: d.lines.iter().filter(|l| l.role == "missed").map(|l| l.points.clone()).collect(),
        plan_fixes: d.fixes.iter().map(|f| PlanFix { ident: f.ident.clone(), lat: f.lat, lon: f.lon, roles: f.roles.clone() }).collect(),
        plan_track,
        profile_track,
        profile_fixes: path
            .fixes
            .iter()
            .map(|f| ProfileFix { ident: f.ident.clone(), to_go_nm: map_along - path.cum[f.v], min_ft: f.min_ft, max_ft: f.max_ft })
            .collect(),
        profile_glidepath: profile_gp,
        outcome,
        seconds_after_map,
        way_in_fixes: faf,
        way_in_passed,
        has_altitude,
        lowest_ft,
        also_fits: Vec::new(),
    };
    let findings = with_minimums(&flown.findings, flown.lowest_ft, flown.outcome, minimums_ft);
    Debrief { findings, ..flown }
}
