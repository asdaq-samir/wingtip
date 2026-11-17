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

pub(super) fn pairs_json(out: &mut String, points: &[(f64, f64)]) {
    out.push('[');
    for (i, (lat, lon)) in points.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push('[');
        json::number(out, *lat);
        out.push(',');
        json::number(out, *lon);
        out.push(']');
    }
    out.push(']');
}

pub(super) fn strings_json(out: &mut String, items: &[String]) {
    out.push('[');
    for (i, s) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(out, s);
    }
    out.push(']');
}

pub fn findings_json(out: &mut String, findings: &[Finding]) {
    out.push('[');
    for (i, f) in findings.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"tone\":");
        json::string(out, f.tone.key());
        out.push_str(",\"text\":");
        json::string(out, &f.text);
        if f.minimums {
            out.push_str(",\"minimums\":true");
        }
        out.push('}');
    }
    out.push(']');
}

/// The debrief as JSON, snake_case: the web's ApproachDebrief's members.
pub fn to_json(out: &mut String, d: &Debrief) {
    out.push_str("{\"airport\":");
    json::string(out, &d.airport);
    out.push_str(",\"id\":");
    json::string(out, &d.id);
    out.push_str(",\"name\":");
    json::string(out, &d.name);
    out.push_str(",\"transition\":");
    json::opt_string(out, d.transition.as_deref());
    out.push_str(",\"guidance\":");
    json::string(out, d.guidance.key());
    out.push_str(",\"faf_at\":");
    json::number(out, d.faf_at);
    out.push_str(",\"fit_nm\":");
    json::number(out, d.fit_nm);
    out.push_str(",\"glidepath_fit_ft\":");
    json::opt_number(out, d.glidepath_fit_ft);
    out.push_str(",\"crossings\":[");
    for (i, c) in d.crossings.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"ident\":");
        json::string(out, &c.ident);
        out.push_str(",\"roles\":");
        strings_json(out, &c.roles);
        out.push_str(",\"min_ft\":");
        json::opt_number(out, c.min_ft);
        out.push_str(",\"max_ft\":");
        json::opt_number(out, c.max_ft);
        out.push_str(",\"t\":");
        json::number(out, c.t);
        out.push_str(",\"alt_ft\":");
        json::opt_number(out, c.alt_ft);
        out.push_str(",\"under_ft\":");
        json::opt_number(out, c.under_ft);
        out.push('}');
    }
    out.push_str("],\"findings\":");
    findings_json(out, &d.findings);
    out.push_str(",\"lowest_ft\":");
    json::opt_number(out, d.lowest_ft);
    out.push_str(",\"plan\":{\"inbound\":");
    pairs_json(out, &d.plan_inbound);
    out.push_str(",\"missed\":[");
    for (i, line) in d.plan_missed.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        pairs_json(out, line);
    }
    out.push_str("],\"fixes\":[");
    for (i, f) in d.plan_fixes.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"ident\":");
        json::string(out, &f.ident);
        out.push_str(",\"lat\":");
        json::number(out, f.lat);
        out.push_str(",\"lon\":");
        json::number(out, f.lon);
        out.push_str(",\"roles\":");
        strings_json(out, &f.roles);
        out.push('}');
    }
    out.push_str("],\"track\":[");
    for (i, (lat, lon, off)) in d.plan_track.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"lat\":");
        json::number(out, *lat);
        out.push_str(",\"lon\":");
        json::number(out, *lon);
        out.push_str(if *off { ",\"off\":true}" } else { ",\"off\":false}" });
    }
    out.push_str("]},\"profile\":{\"track\":[");
    for (i, (to_go, alt, off)) in d.profile_track.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"to_go_nm\":");
        json::number(out, *to_go);
        out.push_str(",\"alt_ft\":");
        json::number(out, *alt);
        out.push_str(if *off { ",\"off\":true}" } else { ",\"off\":false}" });
    }
    out.push_str("],\"fixes\":[");
    for (i, f) in d.profile_fixes.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"ident\":");
        json::string(out, &f.ident);
        out.push_str(",\"to_go_nm\":");
        json::number(out, f.to_go_nm);
        out.push_str(",\"min_ft\":");
        json::opt_number(out, f.min_ft);
        out.push_str(",\"max_ft\":");
        json::opt_number(out, f.max_ft);
        out.push('}');
    }
    out.push_str("],\"glidepath\":");
    match &d.profile_glidepath {
        None => out.push_str("null"),
        Some(g) => {
            out.push_str("{\"from_nm\":");
            json::number(out, g.from_nm);
            out.push_str(",\"from_ft\":");
            json::number(out, g.from_ft);
            out.push_str(",\"to_nm\":");
            json::number(out, g.to_nm);
            out.push_str(",\"to_ft\":");
            json::number(out, g.to_ft);
            out.push('}');
        }
    }
    out.push_str("},\"outcome\":{\"kind\":");
    json::string(out, d.outcome.key());
    out.push_str(",\"seconds_after_map\":");
    json::opt_number(out, d.seconds_after_map);
    out.push_str("},\"has_altitude\":");
    out.push_str(if d.has_altitude { "true" } else { "false" });
    out.push_str(",\"also_fits\":");
    strings_json(out, &d.also_fits);
    out.push_str(&format!(",\"way_in\":{{\"fixes\":{},\"passed\":{}}}}}", d.way_in_fixes, d.way_in_passed));
}
