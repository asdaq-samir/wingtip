use super::*;

/// JavaScript's Math.sign, which is 0 at 0 where Rust's signum is 1.
pub(super) fn sign(n: f64) -> f64 {
    if n > 0.0 {
        1.0
    } else if n < 0.0 {
        -1.0
    } else {
        n
    }
}

/// A debrief's findings held to the pilot's minimums, the DA or MDA they
/// flew to (the CIFP has none): under them before a missed approach is
/// flying below them without the runway in sight, which 14 CFR 91.175(c)
/// and (e) do not allow; under them to land is what (c) allows with it in
/// sight. With none given, the lowest is said, measured. Again as they
/// are typed.
pub fn with_minimums(findings: &[Finding], lowest_ft: Option<f64>, outcome: Outcome, minimums_ft: Option<f64>) -> Vec<Finding> {
    let rest: Vec<Finding> = findings.iter().filter(|f| !f.minimums).cloned().collect();
    let Some(low) = lowest_ft else { return rest };
    let (tone, text) = match minimums_ft {
        Some(mins) if low < mins => {
            if outcome == Outcome::Landed {
                (Tone::Info, format!("Below {} to land: 91.175(c) asks for the runway in sight there", alt_ft(Some(mins))))
            } else {
                (
                    Tone::Stop,
                    format!(
                        "Down to {} before the missed approach, {} ft below {}",
                        alt_ft(Some(low)),
                        grouped(js_round_f(mins - low)),
                        alt_ft(Some(mins))
                    ),
                )
            }
        }
        _ => (
            if minimums_ft.is_some() { Tone::Ok } else { Tone::Info },
            format!(
                "Lowest before the MAP: {} ft{}",
                alt_ft(Some(low)),
                minimums_ft.map_or_else(String::new, |m| format!(", at or above {}", alt_ft(Some(m))))
            ),
        ),
    };
    let mut all = rest;
    all.push(Finding { tone, text, minimums: true });
    ordered(all)
}

/// How many points on from `i` the track is `ms` later.
pub(super) fn time_index(points: &[Point], i: usize, ms: f64) -> usize {
    let mut k = i;
    while k < points.len() - 1 && points[k].t - points[i].t < ms {
        k += 1;
    }
    k - i
}

/// The approaches the track flew, one for each time it came down a final:
/// of the field's approaches drawn (each without a transition, as from
/// vectors, or with the one picked), the one whose final it fitted best;
/// the one the pilot picked for the flight where it fits as well.
pub fn find_approaches(drawings: &[Drawing], points: &[Point], picked: Option<&str>, minimums_ft: Option<f64>) -> Vec<Debrief> {
    let mut found: Vec<Debrief> = Vec::new();
    for d in drawings {
        for attempt in attempts_at(d, points) {
            if let Some(flown) = debrief(d, points, Some(attempt), minimums_ft) {
                found.push(flown);
            }
        }
    }
    // One a time down a final: those within three minutes over a final
    // approach fix are one, the best kept and the rest named with it. As
    // good laterally (within 0.05 nm), the one picked for the flight wins,
    // then one whose glidepath the track came down (within GLIDEPATH_FIT_FT).
    found.stable_sort_by(|a, b| a.faf_at.partial_cmp(&b.faf_at).unwrap_or(std::cmp::Ordering::Equal));
    let followed = |f: &Debrief| f.glidepath_fit_ft.is_some_and(|ft| ft <= GLIDEPATH_FIT_FT);
    let is_picked = |f: &Debrief| picked.is_some_and(|p| f.id == p);
    let beats = |f: &Debrief, g: &Debrief| {
        if (f.fit_nm - g.fit_nm).abs() >= AS_GOOD_NM {
            return f.fit_nm < g.fit_nm;
        }
        if is_picked(f) != is_picked(g) {
            return is_picked(f);
        }
        if followed(f) != followed(g) {
            return followed(f);
        }
        false
    };
    let mut kept: Vec<Debrief> = Vec::new();
    for f in found {
        let Some(k) = kept.iter().position(|g| (g.faf_at - f.faf_at).abs() < SAME_MS) else {
            kept.push(f);
            continue;
        };
        let same = &kept[k];
        let near = (f.fit_nm - same.fit_nm).abs() < AS_GOOD_NM;
        if beats(&f, same) {
            let mut also = same.also_fits.clone();
            if near {
                also.push(same.name.clone());
            }
            kept[k] = Debrief { also_fits: also, ..f };
        } else if near && !same.also_fits.contains(&f.name) {
            kept[k].also_fits.push(f.name.clone());
        }
    }
    kept
}

/// Of an approach's transitions drawn, the one the track came in by, from
/// the vectors' debrief (its final approach fix crossed at `faf_at`, ms,
/// `passed` fixes before it): every fix of it before the final passed, and
/// the most of them; None where none was flown.
pub fn with_transition(faf_at: f64, passed: usize, drawings: &[Drawing], points: &[Point], minimums_ft: Option<f64>) -> Option<Debrief> {
    let (mut best, mut best_fixes) = (None, passed);
    for d in drawings {
        let Some(attempt) = attempts_at(d, points).into_iter().find(|a| (points[a.faf].t - faf_at).abs() < TRANSITION_MS) else { continue };
        let Some(flown) = debrief(d, points, Some(attempt), minimums_ft) else { continue };
        if flown.way_in_passed == flown.way_in_fixes && flown.way_in_passed > best_fixes {
            best_fixes = flown.way_in_passed;
            best = Some(flown);
        }
    }
    best
}
