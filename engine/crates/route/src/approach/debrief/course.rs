use super::*;

/// The course: each point against the way in, the stretches past full scale
/// and their findings.
pub(super) fn course(r: &Run, s: &mut State) {
    let (d, points, path, xy, passes) = (r.d, r.points, &r.path, &r.xy, &r.passes);
    let (attempt, guidance, gp, faf_along, map_along, start_at, start_v, end_at, map_v) =
        (r.attempt, r.guidance, r.gp, r.faf_along, r.map_along, r.start_at, r.start_v, r.end_at, r.map_v);
    let State { findings, track_off, along_at, stretches, worst_right: worst_out, .. } = s;
    let mut open = false;
    let mut worst_right = 0.0_f64;
    // Full scale either side at a distance along the way in, nm; None where
    // no figure is sure (see Guidance).
    let full_scale = |along: f64| -> Option<f64> {
        match guidance {
            Guidance::Gps => Some(if along >= faf_along {
                GPS_APPROACH_NM
            } else if along >= faf_along - GPS_RAMP_NM {
                GPS_TERMINAL_NM - ((GPS_TERMINAL_NM - GPS_APPROACH_NM) * (along - (faf_along - GPS_RAMP_NM))) / GPS_RAMP_NM
            } else {
                GPS_TERMINAL_NM
            }),
            Guidance::Localizer if gp.is_some() && along >= path.cum[path.final_from] => {
                let out_ft = (map_along - along).max(0.0) * FT_PER_NM;
                Some((LOCALIZER_THRESHOLD_FT + out_ft * rad(LOCALIZER_DEG).tan()) / FT_PER_NM)
            }
            _ => None,
        }
    };

    // A hold or a procedure turn at a fix (a hold in lieu of one) is flown
    // off the line by design: from first coming to the fix to the last time
    // over it inbound, the course is not scored.
    let hold_at = |ident: &str| d.holds.iter().any(|h| !h.missed && h.fix == ident);
    let mut reversing = vec![false; points.len()];
    for (k, pass) in passes.iter().enumerate() {
        if !hold_at(&path.fixes[pass.fix].ident) {
            continue;
        }
        let from = if k == 0 { start_at } else { passes[k - 1].i + 1 };
        let fix = path.xy[path.fixes[pass.fix].v];
        let first = (attempt.from.max(from)..=pass.i).find(|&i| (xy[i].x - fix.x).hypot(xy[i].y - fix.y) <= PASS_NM);
        if let Some(first) = first {
            for r in reversing.iter_mut().take(pass.i + 1).skip(first + 1) {
                *r = true;
            }
        }
    }
    // Course: each point from the start to the end, against the way in
    // between the fixes it was passed between.
    let last_v = path.xy.len() - 2;
    let mut seg: isize = -1;
    let mut i = start_at;
    while i <= end_at && i < points.len() {
        while ((seg + 1) as usize) < passes.len() && i > passes[(seg + 1) as usize].i {
            seg += 1;
        }
        let va = if seg < 0 { start_v } else { path.fixes[passes[seg as usize].fix].v };
        let vb = if ((seg + 1) as usize) < passes.len() { path.fixes[passes[(seg + 1) as usize].fix].v } else { map_v };
        let lo = last_v.min(va.min(vb));
        let w = against(path, xy[i], lo, (lo + 1).max(va).max(vb));
        along_at.push((i, w.along));
        if reversing[i] {
            open = false;
            i += 1;
            continue;
        }
        if w.right.abs() > worst_right.abs() {
            worst_right = w.right;
        }
        let off = full_scale(w.along).is_some_and(|scale| w.right.abs() > scale);
        if off {
            let step = if i > start_at { distance_nm(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon) } else { 0.0 };
            let side = sign(w.right);
            match stretches.last_mut() {
                Some(s) if open && s.side == side => {
                    s.nm += step;
                    if w.right.abs() > s.worst.abs() {
                        s.worst = w.right;
                    }
                }
                _ => {
                    stretches.push(Stretch { side, nm: 0.0, worst: w.right, from_along: w.along });
                    open = true;
                }
            }
            track_off[i] = true;
        } else {
            open = false;
        }
        i += 1;
    }
    let where_ = |s: &Stretch| -> String {
        if s.from_along >= faf_along - 1e-6 {
            return "on final".to_owned();
        }
        let before = path.fixes.iter().rev().find(|f| path.cum[f.v] <= s.from_along + 1e-6);
        let next = path.fixes.iter().find(|f| path.cum[f.v] > s.from_along + 1e-6);
        match (before, next) {
            (Some(b), Some(n)) => format!("from {} to {}", b.ident, n.ident),
            (None, Some(n)) => format!("before {}", n.ident),
            _ => "on the way in".to_owned(),
        }
    };
    for s in stretches.iter() {
        findings.push(finding(
            Tone::Stop,
            format!(
                "Full scale {} of the course for {} nm {}, {} nm off at most",
                if s.side > 0.0 { "right" } else { "left" },
                to_fixed(s.nm.max(0.1), 1),
                where_(s),
                to_fixed(s.worst.abs(), 1)
            ),
        ));
    }
    *worst_out = worst_right;
}
