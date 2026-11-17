use super::*;

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
