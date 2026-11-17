use super::*;

/// A leg's mark as the web's FlightPage gives it beside the finding:
/// within where neither its altitude nor its distance off the route went
/// past PA.VI.A's tolerance.
pub fn leg_ok(worst_alt_ft: Option<f64>, worst_off_nm: Option<f64>) -> bool {
    worst_alt_ft.is_none_or(|a| a.abs() <= ALTITUDE_FT) && worst_off_nm.is_none_or(|o| o.abs() <= OFF_ROUTE_NM)
}

/// A checkpoint's marks: landed at (a field), how late (+) or early, and
/// within ETA_MIN of its estimate -- none where either time is not known.
pub fn pass_marks(category: &str, due_min: Option<f64>, passed_min: Option<f64>) -> (bool, Option<f64>, Option<bool>) {
    let late = match (due_min, passed_min) {
        (Some(due), Some(passed)) => Some(passed - due),
        _ => None,
    };
    (category == "destination" || category == "stop", late, late.map(|l| l.abs() <= ETA_MIN))
}

/// A pattern entry's marks: how far off the pattern's altitude, and
/// within PATTERN_FT.
pub fn pattern_marks(alt_ft: f64, pattern_ft: f64) -> (f64, bool) {
    (alt_ft - pattern_ft, (alt_ft - pattern_ft).abs() <= PATTERN_FT)
}

pub(super) fn field(out: &mut String, first: bool, key: &str) {
    out.push_str(if first { "{\"" } else { ",\"" });
    out.push_str(key);
    out.push_str("\":");
}

pub(super) fn list<T>(out: &mut String, items: &[T], mut each: impl FnMut(&mut String, &T)) {
    out.push('[');
    for (i, item) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        each(out, item);
    }
    out.push(']');
}

pub(super) fn boolean(out: &mut String, b: bool) {
    out.push_str(if b { "true" } else { "false" });
}

/// The debrief as JSON, each finding with its mark (the planner's marked
/// Debrief) where `marked`, without where not (app.figures.debrief's own).
pub fn to_json(d: &Debrief, marked: bool) -> String {
    let mut out = String::new();
    field(&mut out, true, "takeoff");
    json::number(&mut out, d.takeoff);
    field(&mut out, false, "landing");
    json::number(&mut out, d.landing);
    field(&mut out, false, "flown_min");
    json::number(&mut out, d.flown_min);
    field(&mut out, false, "planned_min");
    json::opt_number(&mut out, d.planned_min);
    field(&mut out, false, "legs");
    list(&mut out, &d.legs, |out, l| {
        field(out, true, "from");
        json::string(out, &l.from);
        field(out, false, "to");
        json::string(out, &l.to);
        for (key, v) in [
            ("planned_alt_ft", l.planned_alt_ft),
            ("altitude_within", l.altitude_within),
            ("worst_alt_ft", l.worst_alt_ft),
            ("course_deg", l.course_deg),
            ("course_within", l.course_within),
            ("worst_off_nm", l.worst_off_nm),
        ] {
            field(out, false, key);
            json::opt_number(out, v);
        }
        if marked {
            field(out, false, "ok");
            boolean(out, leg_ok(l.worst_alt_ft, l.worst_off_nm));
        }
        out.push('}');
    });
    field(&mut out, false, "passes");
    list(&mut out, &d.passes, |out, p| {
        field(out, true, "name");
        json::string(out, &p.name);
        field(out, false, "category");
        json::string(out, &p.category);
        for (key, v) in [("due_min", p.due_min), ("passed_min", p.passed_min), ("closest_nm", p.closest_nm)] {
            field(out, false, key);
            json::opt_number(out, v);
        }
        if marked {
            let (landed, late, ok) = pass_marks(&p.category, p.due_min, p.passed_min);
            field(out, false, "landed");
            boolean(out, landed);
            field(out, false, "late_min");
            json::opt_number(out, late);
            field(out, false, "ok");
            match ok {
                Some(ok) => boolean(out, ok),
                None => out.push_str("null"),
            }
        }
        out.push('}');
    });
    field(&mut out, false, "patterns");
    list(&mut out, &d.patterns, |out, e| {
        field(out, true, "ident");
        json::string(out, &e.ident);
        field(out, false, "alt_ft");
        json::number(out, e.alt_ft);
        field(out, false, "pattern_ft");
        json::number(out, e.pattern_ft);
        if marked {
            let (off, ok) = pattern_marks(e.alt_ft, e.pattern_ft);
            field(out, false, "off_ft");
            json::number(out, off);
            field(out, false, "ok");
            boolean(out, ok);
        }
        out.push('}');
    });
    field(&mut out, false, "profile");
    list(&mut out, &d.profile, |out, &(along, alt)| {
        field(out, true, "along_nm");
        json::number(out, along);
        field(out, false, "alt_ft");
        json::number(out, alt);
        out.push('}');
    });
    field(&mut out, false, "planned");
    list(&mut out, &d.planned, |out, &(from, to, alt)| {
        field(out, true, "from_nm");
        json::number(out, from);
        field(out, false, "to_nm");
        json::number(out, to);
        field(out, false, "alt_ft");
        json::opt_number(out, alt);
        out.push('}');
    });
    field(&mut out, false, "line");
    list(&mut out, &d.line, |out, pt| {
        field(out, true, "lat");
        json::number(out, pt.lat);
        field(out, false, "lon");
        json::number(out, pt.lon);
        field(out, false, "off");
        boolean(out, pt.off);
        out.push('}');
    });
    field(&mut out, false, "has_altitude");
    boolean(&mut out, d.has_altitude);
    field(&mut out, false, "notes");
    list(&mut out, &d.notes, |out, n| json::string(out, n));
    out.push('}');
    out
}

/// The tolerances the debrief holds the flight to, for the page's headings.
pub fn tolerances_json() -> String {
    let mut out = String::new();
    for (i, (key, v)) in [
        ("altitude_ft", ALTITUDE_FT),
        ("course_deg", COURSE_DEG),
        ("off_route_nm", OFF_ROUTE_NM),
        ("eta_min", ETA_MIN),
        ("pattern_nm", PATTERN_NM),
        ("pattern_ft", PATTERN_FT),
    ]
    .iter()
    .enumerate()
    {
        field(&mut out, i == 0, key);
        json::number(&mut out, *v);
    }
    out.push('}');
    out
}

/// The whole of the planner's /api/debrief answer, JSON: `{"debrief":
/// marked or null, "tolerances"}`. The points are put in time order
/// first, as the planner does.
pub fn answer_json(checkpoints: &[Checkpoint], points: &[Point], patterns: &[(String, f64)]) -> String {
    let mut sorted = points.to_vec();
    sorted.stable_sort_by(|a, b| a.t.total_cmp(&b.t));
    let mut out = String::from("{\"debrief\":");
    match debrief(checkpoints, &sorted, patterns) {
        Some(d) => out.push_str(&to_json(&d, true)),
        None => out.push_str("null"),
    }
    out.push_str(",\"tolerances\":");
    out.push_str(&tolerances_json());
    out.push('}');
    out
}
