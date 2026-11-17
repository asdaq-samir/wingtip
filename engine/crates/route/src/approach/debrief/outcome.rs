use super::*;

/// The lowest altitude, and how the approach ended: landed, missed or neither.
pub(super) fn outcome(r: &Run, s: &mut State) {
    let (points, path, xy) = (r.points, &r.path, &r.xy);
    let (faf_v, map_v, guidance, has_altitude, map_pass, landed_at, climb_at, map_along, faf_cross, end_at) =
        (r.faf_v, r.map_v, r.guidance, r.has_altitude, r.map_pass, r.landed_at, r.climb_at, r.map_along, r.faf_cross, r.end_at);
    let worst_right = s.worst_right;
    let State { findings, stretches, lowest_ft: lowest_out, outcome: outcome_out, seconds_after_map: seconds_out, .. } = s;
    // The lowest before the missed approach point, held to the pilot's
    // minimums where they give them (with_minimums).
    let mut lowest_ft: Option<f64> = None;
    let mut i = faf_cross.i + 1;
    while i <= end_at && i < points.len() {
        if let Some(a) = points[i].alt_ft
            && lowest_ft.is_none_or(|l| a < l)
        {
            lowest_ft = Some(a);
        }
        i += 1;
    }
    if !has_altitude {
        findings.push(finding(Tone::Info, "The track has no altitudes: the course alone is debriefed".to_owned()));
    }

    // The missed approach, against the missed approach point, or the landing.
    let map_t = map_pass.map(|p| time_at(points, p.i, p.u));
    let (mut outcome, mut seconds_after_map) = (Outcome::Unknown, None);
    if let Some(landed) = landed_at {
        let s = map_t.map(|t| (points[landed].t - t) / 1000.0);
        (outcome, seconds_after_map) = (Outcome::Landed, s);
        findings.push(finding(
            Tone::Info,
            s.map_or_else(|| "Landed".to_owned(), |s| format!("Landed {} s after the MAP", js_num(js_round_f(s)))),
        ));
    } else if let Some(climb) = climb_at {
        let s = map_t.map(|t| (points[climb].t - t) / 1000.0);
        (outcome, seconds_after_map) = (Outcome::Missed, s);
        let w = against(path, xy[climb], faf_v, map_v);
        let short = map_along - w.along;
        let text = match s {
            Some(s) if js_round_f(s) >= 0.0 => {
                if js_round_f(s) == 0.0 {
                    "Missed approach started at the MAP".to_owned()
                } else {
                    format!("Missed approach started {} s after the MAP", js_num(js_round_f(s)))
                }
            }
            _ => format!(
                "Missed approach started {} nm before the MAP{}",
                to_fixed(short, 1),
                s.map_or_else(String::new, |s| format!(" ({} s)", js_num(js_round_f(-s))))
            ),
        };
        findings.push(finding(Tone::Info, text));
    } else if has_altitude {
        findings.push(finding(Tone::Info, "No climb or landing after the MAP in the track".to_owned()));
    }
    let side = |r: f64| if r >= 0.0 { "right" } else { "left" };
    if stretches.is_empty() && guidance != Guidance::Other {
        findings.push(finding(
            Tone::Ok,
            format!("Within full scale all the way, {} nm {} at most", to_fixed(worst_right.abs(), 1), side(worst_right)),
        ));
    } else if guidance == Guidance::Other {
        findings.push(finding(Tone::Info, format!("Course: {} nm {} of it at most", to_fixed(worst_right.abs(), 1), side(worst_right))));
    }
    *lowest_out = lowest_ft;
    *outcome_out = outcome;
    *seconds_out = seconds_after_map;
}
