use super::*;

/// A stretch of the track past full scale on one side.
pub(super) struct Stretch {
    pub(super) side: f64,
    pub(super) nm: f64,
    pub(super) worst: f64,
    pub(super) from_along: f64,
}

/// A fix passed: which of the path's, at which point and how far on.
#[derive(Clone, Copy)]
pub(super) struct Pass {
    pub(super) fix: usize,
    pub(super) i: usize,
    pub(super) u: f64,
}

/// Where the track flew the approach: the path, the passes, the way in and the
/// scored stretch of the track; None where it did not fly it (see `debrief`).
pub(super) struct Run<'a> {
    pub(super) d: &'a Drawing,
    pub(super) points: &'a [Point],
    pub(super) attempt: Attempt,
    pub(super) path: Path,
    pub(super) xy: Vec<Xy>,
    pub(super) guidance: Guidance,
    pub(super) gp: Option<RunwayPath>,
    pub(super) has_altitude: bool,
    pub(super) faf: usize,
    pub(super) map: usize,
    pub(super) faf_v: usize,
    pub(super) map_v: usize,
    pub(super) faf_cross: Cross,
    pub(super) map_pass: Option<Cross>,
    pub(super) landed_at: Option<usize>,
    pub(super) climb_at: Option<usize>,
    pub(super) end_at: usize,
    pub(super) map_along: f64,
    pub(super) faf_along: f64,
    pub(super) passes: Vec<Pass>,
    pub(super) start_at: usize,
    pub(super) start_v: usize,
    pub(super) fit_nm: f64,
}

pub(super) fn locate<'a>(d: &'a Drawing, points: &'a [Point], attempt: Option<Attempt>) -> Option<Run<'a>> {
    if d.kind != "approach" || points.len() < 2 {
        return None;
    }
    let map_fix = map_fix(d)?;
    let frame = Flat::about(map_fix.lat, map_fix.lon);
    let path = path_of(d, &frame)?;
    let attempt = match attempt {
        Some(a) => a,
        None => *attempts_at(d, points).first()?,
    };
    let xy: Vec<Xy> = points.iter().map(|p| at(&frame, p.lat, p.lon)).collect();
    let guidance = guidance_of(&d.id);
    let gp = d.runway_path;
    let has_altitude = points.iter().any(|p| p.alt_ft.is_some());
    let (faf, map) = (path.faf, path.map);
    let faf_v = path.fixes[faf].v;
    let map_v = path.fixes[map].v;
    let faf_cross = *crossings(&path, faf_v, &xy, attempt.faf, attempt.faf + 1).first()?;

    // The missed approach point, the first time over it after the final
    // approach fix; else the track's nearest to it on the final.
    let map_pass = pass_of(&path, map_v, &xy, attempt.faf, attempt.to, true);
    // The landing: the flight's run of points over taxiing speed, ended near
    // the runway before the next attempt.
    let runs = airborne(points);
    let run = runs.iter().find(|&&(a, b)| a <= attempt.faf && b >= attempt.faf);
    // A run that ends with the track is the recording stopped in the air.
    let landed_at = run
        .filter(|&&(_, b)| b <= attempt.to && b < points.len() - 1 && nm_to(&points[b], map_fix.lat, map_fix.lon) <= LANDED_NM)
        .map(|&(_, b)| b);
    // The missed approach: the lowest point after the final approach fix
    // from which the track climbed CLIMB_FT.
    let mut climb_at: Option<usize> = None;
    if has_altitude && landed_at.is_none() {
        let mut low: Option<(usize, f64)> = None;
        for (i, p) in points.iter().enumerate().take(attempt.to + 1).skip(attempt.faf + 1) {
            let Some(alt) = p.alt_ft else { continue };
            match low {
                Some((_, low_ft)) if alt > low_ft => {
                    if alt - low_ft >= CLIMB_FT {
                        climb_at = low.map(|(k, _)| k);
                        break;
                    }
                }
                _ => low = Some((i, alt)),
            }
        }
    }
    // The scored way in ends over the missed approach point, or where the
    // climb or the landing came first.
    let end_at = [Some(map_pass.map_or(attempt.to, |p| p.i + 1)), climb_at, landed_at].into_iter().flatten().min().unwrap_or(attempt.to);
    let map_along = path.cum[map_v];

    // Each fix of the way in passed, back from the final approach fix: the
    // last time over it before the next, so a hold or a procedure turn there
    // is flown before it counts.
    let mut passes: Vec<Pass> = vec![Pass { fix: faf, i: faf_cross.i, u: faf_cross.u }];
    for k in (0..faf).rev() {
        if let Some(last) = pass_of(&path, path.fixes[k].v, &xy, attempt.from, passes[0].i, false)
            && last.i <= passes[0].i
        {
            passes.insert(0, Pass { fix: k, i: last.i, u: last.u });
        }
    }
    // Fixes after the final approach fix (step-downs, the MAP), forward.
    for k in faf + 1..path.fixes.len() {
        let from = passes[passes.len() - 1].i;
        if let Some(c) = pass_of(&path, path.fixes[k].v, &xy, from, end_at + 1, true) {
            passes.push(Pass { fix: k, i: c.i, u: c.u });
        }
    }
    // From vectors to the final, where no fix before the final approach fix
    // was passed: from where the track came onto the final's line, within
    // PASS_NM of it, going its way.
    let mut start_at = passes[0].i;
    let mut start_v = path.fixes[passes[0].fix].v;
    if passes[0].fix == faf {
        let mut i = faf_cross.i;
        while i > attempt.from {
            let w = against(&path, xy[i - 1], path.final_from, faf_v);
            if w.away > PASS_NM || w.along < path.cum[path.final_from] - 0.01 {
                break;
            }
            i -= 1;
        }
        start_at = i;
        start_v = path.final_from;
    }

    // The fit: the mean distance off the final, from its final approach fix.
    let (mut fit_sum, mut fit_n) = (0.0, 0usize);
    let mut i = faf_cross.i + 1;
    while i <= end_at && i < points.len() {
        let w = against(&path, xy[i], faf_v, map_v);
        if w.along >= map_along - 1e-6 && i > faf_cross.i + 1 {
            break;
        }
        fit_sum += w.away;
        fit_n += 1;
        i += 1;
    }
    let fit_nm = if fit_n > 0 { fit_sum / fit_n as f64 } else { faf_cross.right.abs() };
    if fit_nm > MATCH_NM {
        return None;
    }
    let faf_alt = alt_at(points, faf_cross.i, faf_cross.u);
    let faf_limit = path.fixes[faf].min_ft.or(path.fixes[faf].max_ft);
    if let (Some(alt), Some(limit)) = (faf_alt, faf_limit)
        && alt - limit > MATCH_FT
    {
        return None;
    }

    let faf_along = path.cum[faf_v];
    Some(Run {
        d,
        points,
        attempt,
        path,
        xy,
        guidance,
        gp,
        has_altitude,
        faf,
        map,
        faf_v,
        map_v,
        faf_cross,
        map_pass,
        landed_at,
        climb_at,
        end_at,
        map_along,
        faf_along,
        passes,
        start_at,
        start_v,
        fit_nm,
    })
}

/// What the stages find, handed from one to the next.
pub(super) struct State {
    pub(super) findings: Vec<Finding>,
    pub(super) track_off: Vec<bool>,
    pub(super) along_at: Vec<(usize, f64)>,
    pub(super) stretches: Vec<Stretch>,
    pub(super) worst_right: f64,
    pub(super) crossings: Vec<FixCrossing>,
    pub(super) profile_gp: Option<ProfileGlidepath>,
    pub(super) gp_sum: f64,
    pub(super) gp_n: usize,
    pub(super) lowest_ft: Option<f64>,
    pub(super) outcome: Outcome,
    pub(super) seconds_after_map: Option<f64>,
}
