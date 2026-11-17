use super::*;

pub(super) fn sorted(mut alerts: Vec<Alert>) -> Vec<Alert> {
    // Warnings first, then the soonest.
    alerts.stable_sort_by(|a, b| (a.level != "warning").cmp(&(b.level != "warning")).then(a.seconds.partial_cmp(&b.seconds).unwrap()));
    alerts
}

/// The alerts ahead, as the planner's {"alerts", "unavailable"} with
/// "tfrs_as_of", and "ground_ft": the packs' ground under the airplane
/// (`ground_ft`, the grid's highest in its cell plus its margin) or null,
/// which the phones' glide ring stands on (#218), JSON. `tfrs` the
/// phone's kept TFRs (one a line, as `tfrs_of` reads them) and when it downloaded
/// them; None where it has none.
#[allow(clippy::too_many_arguments)]
pub fn ahead(
    packs: &[Pack], lat: f64, lon: f64, track_deg: f64, gs_kt: f64, alt_ft: Option<f64>, vs_fpm: f64, now: i64, tfr_lines: Option<&str>,
    tfrs_at: Option<i64>,
) -> String {
    let mut alerts: Vec<Alert> = Vec::new();
    let mut unavailable: Vec<&str> = Vec::new();
    let under = ground_ft(packs, lat, lon);
    if gs_kt >= AIRBORNE_KT {
        let track = Track::new(lat, lon, track_deg, gs_kt, alt_ft, vs_fpm, LOOK_AHEAD_S, AIRSPACE_STEP_S);
        let near = Track::new(lat, lon, track_deg, gs_kt, alt_ft, vs_fpm, TERRAIN_LOOK_AHEAD_S, TERRAIN_STEP_S);
        alerts.extend(classes(packs, &track));
        alerts.extend(special_use(packs, &track, under));
        match tfr_lines {
            Some(text) => alerts.extend(tfrs(packs, &track, under, now, text)),
            None => unavailable.push("TFRs"),
        }
        match alt_ft {
            Some(alt) => {
                if !near_field(packs, lat, lon, alt) {
                    match terrain(packs, &near) {
                        Some(found) => alerts.extend(found),
                        None => unavailable.push("terrain"),
                    }
                }
                // The FAA's obstacle file is the planner's alone.
                unavailable.push("obstacles");
            }
            None => unavailable.push("terrain and obstacles, with no GPS altitude"),
        }
    }
    to_json(&sorted(alerts), &unavailable, tfrs_at, under)
}

pub(super) fn to_json(alerts: &[Alert], unavailable: &[&str], tfrs_at: Option<i64>, ground: Option<f64>) -> String {
    let mut out = String::from("{\"alerts\":[");
    for (k, a) in alerts.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        out.push_str("{\"id\":");
        json::string(&mut out, &a.id);
        out.push_str(&format!(",\"kind\":\"{}\",\"level\":\"{}\",\"name\":", a.kind, a.level));
        json::string(&mut out, &a.name);
        out.push_str(",\"class\":");
        json::opt_string(&mut out, a.class.as_deref());
        out.push_str(",\"need\":");
        json::string(&mut out, &a.need);
        out.push_str(&format!(",\"inside\":{},\"seconds\":", a.inside));
        json::number(&mut out, a.seconds);
        for (name, v) in [
            ("distance_nm", Some(a.distance_nm)),
            ("lat", Some(a.lat)),
            ("lon", Some(a.lon)),
            ("floor_ft", a.floor_ft),
            ("ceiling_ft", a.ceiling_ft),
            ("top_ft", a.top_ft),
            ("clearance_ft", a.clearance_ft),
        ] {
            out.push_str(&format!(",\"{name}\":"));
            json::opt_number(&mut out, v);
        }
        out.push_str(",\"times_of_use\":");
        json::opt_string(&mut out, a.times_of_use.as_deref());
        out.push_str(",\"notam_id\":");
        json::opt_string(&mut out, a.notam_id.as_deref());
        out.push('}');
    }
    out.push_str("],\"unavailable\":[");
    for (k, u) in unavailable.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        json::string(&mut out, u);
    }
    out.push_str("],\"tfrs_as_of\":");
    match tfrs_at {
        Some(t) => out.push_str(&t.to_string()),
        None => out.push_str("null"),
    }
    out.push_str(",\"ground_ft\":");
    json::opt_number(&mut out, ground);
    out.push('}');
    out
}
