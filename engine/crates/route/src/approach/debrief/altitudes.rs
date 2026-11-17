use super::*;

/// The altitude at and before each fix, against its minimum and maximum.
pub(super) fn altitudes(r: &Run, s: &mut State) {
    let (points, path, passes) = (r.points, &r.path, &r.passes);
    let (gp, start_at, faf, map, faf_along) = (r.gp, r.start_at, r.faf, r.map, r.faf_along);
    let State { findings, track_off, crossings: crossings_out, .. } = s;
    // Altitude at and before each fix: none under its minimum on the way to
    // it from the fix before -- a step-down's altitude holds until it is
    // passed, and those before it during the descent (AIM 5-4-5) -- and none
    // over its maximum where it is crossed.
    for (k, pass) in passes.iter().enumerate() {
        let fix = &path.fixes[pass.fix];
        let alt = alt_at(points, pass.i, pass.u);
        let from = if k == 0 { start_at } else { passes[k - 1].i + 1 };
        let is_map = pass.fix == map;
        let floor_at = |i: usize| -> Option<f64> {
            let min = fix.min_ft?;
            if is_map {
                return None;
            }
            // Down the glidepath before the final approach fix, under its
            // intercept altitude, is the approach flown (AIM 5-4-5): the floor
            // there is the lower of the two, less the glide slope's full scale.
            if let (true, Some(gp)) = (pass.fix == faf, gp.as_ref()) {
                let out = nm_to(&points[i], gp.lat, gp.lon);
                return Some(min.min(glidepath_ft(gp, out) - glideslope_half_ft(out)));
            }
            Some(min)
        };
        let mut under: Option<f64> = None;
        for (i, p) in points.iter().enumerate().take(pass.i + 1).skip(from) {
            let (Some(a), Some(floor)) = (p.alt_ft, floor_at(i)) else { continue };
            if floor - a > 0.0 && under.is_none_or(|u| floor - a > u) {
                under = Some(floor - a);
            }
            if floor - a > 0.0 {
                track_off[i] = true;
            }
        }
        let floor_here = floor_at(pass.i);
        if let (Some(a), Some(floor)) = (alt, floor_here)
            && floor - a > 0.0
            && under.is_none_or(|u| floor - a > u)
        {
            under = Some(floor - a);
        }
        crossings_out.push(FixCrossing {
            ident: fix.ident.clone(),
            roles: fix.roles.clone(),
            min_ft: fix.min_ft,
            max_ft: fix.max_ft,
            t: time_at(points, pass.i, pass.u),
            alt_ft: alt,
            under_ft: under,
        });
        if let (Some(under), Some(min)) = (under, fix.min_ft) {
            let at_fix = matches!((alt, floor_here), (Some(a), Some(floor)) if floor - a >= under - 1.0);
            // Inside the final, a step-down's altitude is the MDA's line of
            // minimums' alone, not a glidepath's DA (AIM 5-4-5).
            let step_down = path.cum[fix.v] > faf_along + 1e-6;
            findings.push(finding(
                if step_down { Tone::Caution } else { Tone::Stop },
                format!(
                    "{} {}: {} ft below {}{}",
                    if at_fix { "At" } else { "Before" },
                    fix.ident,
                    grouped(js_round_f(under)),
                    alt_ft(Some(min)),
                    if step_down { " (an MDA's step-down, not a glidepath's)" } else { "" }
                ),
            ));
        }
        // The final approach fix's "at" altitude is the glide slope's intercept
        // where there is a glidepath, crossed lower on it (ARINC 424-18 5.29 "I").
        if let (Some(max), Some(a)) = (fix.max_ft, alt)
            && a - max > 0.0
            && !is_map
            && !(pass.fix == faf && gp.is_some())
        {
            findings
                .push(finding(Tone::Stop, format!("At {}: {} ft above {}", fix.ident, grouped(js_round_f(a - max)), alt_ft(Some(max)))));
        }
    }
}
