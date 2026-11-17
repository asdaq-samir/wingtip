use super::*;

/// The run as JSON: {"points": [{t, lat, lon, alt_ft, gs_kt, track_deg}],
/// "along_nm", "fuel_gal", "row_t", "bends": [{route, run}], "missable",
/// "final": {from, to}|null, "landings": [{ident, t, nm, fuel}]}.
pub fn to_json(run: &DryRun) -> String {
    let mut out = String::from("{\"points\":[");
    for (i, p) in run.points.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"t\":");
        json::number(&mut out, p.t);
        out.push_str(",\"lat\":");
        json::number(&mut out, p.lat);
        out.push_str(",\"lon\":");
        json::number(&mut out, p.lon);
        out.push_str(",\"alt_ft\":");
        json::opt_number(&mut out, p.alt_ft);
        out.push_str(",\"gs_kt\":");
        json::opt_number(&mut out, p.gs_kt);
        out.push_str(",\"track_deg\":");
        json::opt_number(&mut out, p.track_deg);
        out.push('}');
    }
    let numbers = |out: &mut String, key: &str, xs: &[f64]| {
        out.push_str(&format!("],\"{key}\":["));
        for (i, x) in xs.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            json::number(out, *x);
        }
    };
    numbers(&mut out, "along_nm", &run.along_nm);
    numbers(&mut out, "fuel_gal", &run.fuel_gal);
    numbers(&mut out, "row_t", &run.row_t);
    out.push_str("],\"bends\":[");
    for (i, (route, run_nm)) in run.bends.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"route\":");
        json::number(&mut out, *route);
        out.push_str(",\"run\":");
        json::number(&mut out, *run_nm);
        out.push('}');
    }
    out.push_str("],\"missable\":");
    out.push_str(if run.missable { "true" } else { "false" });
    out.push_str(",\"final\":");
    match run.last_final {
        None => out.push_str("null"),
        Some((from, to)) => {
            out.push_str("{\"from\":");
            json::number(&mut out, from);
            out.push_str(",\"to\":");
            json::number(&mut out, to);
            out.push('}');
        }
    }
    out.push_str(",\"landings\":[");
    for (i, l) in run.landings.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"ident\":");
        json::string(&mut out, &l.ident);
        out.push_str(",\"t\":");
        json::number(&mut out, l.t);
        out.push_str(",\"nm\":");
        json::number(&mut out, l.nm);
        out.push_str(",\"fuel\":");
        json::number(&mut out, l.fuel);
        out.push('}');
    }
    out.push_str("]}");
    out
}

/// `dry_run`: the run (to_json), from `{"rows", "start_s", "line"?:
/// [[lat, lon]], "missed"?}`.
pub(in super::super) fn dry_run_rule(v: &Value) -> Result<String, String> {
    let n = "dry_run";
    let raw = v.get("rows").and_then(Value::as_array).ok_or("dry_run: \"rows\" is missing or not a list")?;
    let rows = rows_of(n, raw)?;
    let line = path_of(v.get("line"));
    let run = dry_run(&rows, num(n, v, "start_s")?, Some(&line[..]), opt_bool(n, v, "missed")?.unwrap_or(false));
    Ok(to_json(&run))
}
