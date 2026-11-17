use super::*;

// The airports in view are view_airports'; here by the name they had.
pub use crate::view_airports::airports_in_view;

// --- Navaids ------------------------------------------------------------------

pub(super) struct Vor {
    pub(super) ident: String,
    pub(super) name: Option<String>,
    pub(super) kind: &'static str,
    pub(super) freq: Option<String>,
    pub(super) lat: f64,
    pub(super) lon: f64,
    pub(super) mag_var: Option<f64>,
    pub(super) elevation_ft: Option<f64>,
    pub(super) channel: Option<String>,
    pub(super) service_volume: Option<Option<String>>,
    pub(super) hours: Option<Option<String>>,
    pub(super) restricted: bool,
}

pub(super) fn some_text(s: &str) -> Option<String> {
    (!s.is_empty()).then(|| s.to_owned())
}

/// The planner's NavaidsInView for the box, JSON: the VORs of the packs'
/// tables inside it by ident, at most NAVAID_LIMIT, and no fixes.
pub fn navaids_in_view(packs: &[Pack], south: f64, west: f64, north: f64, east: f64) -> String {
    let view: Bbox = [west, south, east, north];
    let mut vors: Vec<Vor> = Vec::new();
    for p in packs {
        let Some(t) = p.section("navaids").and_then(|b| std::str::from_utf8(b).ok()).and_then(json::table) else { continue };
        let (id, kind, name, status, lat, lon, elev, var, hemis, freq, chan, alt, hours) = (
            t.col("NAV_ID"),
            t.col("NAV_TYPE"),
            t.col("NAME"),
            t.col("NAV_STATUS"),
            t.col("LAT_DECIMAL"),
            t.col("LONG_DECIMAL"),
            t.col("ELEV"),
            t.col("MAG_VARN"),
            t.col("MAG_VARN_HEMIS"),
            t.col("FREQ"),
            t.col("CHAN"),
            t.col("ALT_CODE"),
            t.col("OPER_HOURS"),
        );
        for r in &t.rows {
            let get = |c: Option<usize>| c.and_then(|c| r.get(c)).map(|s| s.trim()).unwrap_or("");
            let Some(&kind) = NAVAID_KINDS.iter().find(|k| **k == get(kind)) else { continue };
            let ident = get(id).to_uppercase();
            if ident.is_empty() || get(status) == "SHUTDOWN" {
                continue;
            }
            let (Ok(la), Ok(lo)) = (get(lat).parse::<f64>(), get(lon).parse::<f64>()) else { continue };
            if !in_box((lo, la), view) {
                continue;
            }
            let likelier = |k: &str| NAVAID_KINDS.iter().position(|n| *n == k).unwrap();
            // One facility filed as two kinds at one place is one, the
            // likelier to fly to (wingtip.fixes' _read_navaids).
            if let Some(at) = vors.iter().position(|v| v.ident == ident && crate::geo::distance_nm(la, lo, v.lat, v.lon) < SAME_FACILITY_NM)
            {
                if likelier(kind) < likelier(vors[at].kind) {
                    vors.remove(at);
                } else {
                    continue;
                }
            }
            let mag_var = get(var).parse::<f64>().ok().map(|d| if get(hemis).eq_ignore_ascii_case("W") { -d } else { d });
            vors.push(Vor {
                ident,
                name: some_text(&crate::spoken::title(get(name))),
                kind,
                freq: some_text(get(freq)),
                lat: la,
                lon: lo,
                mag_var,
                elevation_ft: get(elev).parse::<f64>().ok(),
                channel: some_text(get(chan)),
                service_volume: alt.map(|_| some_text(get(alt))),
                hours: hours.map(|_| some_text(get(hours))),
                restricted: get(status).to_uppercase().contains("RESTRICTED"),
            });
        }
    }
    vors.retain(|v| VOR_KINDS.contains(&v.kind));
    vors.stable_sort_by(|a, b| a.ident.cmp(&b.ident));
    vors.truncate(NAVAID_LIMIT);
    let mut out = String::from("{\"vors\":[");
    for (k, v) in vors.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        out.push_str("{\"ident\":");
        json::string(&mut out, &v.ident);
        out.push_str(",\"name\":");
        json::opt_string(&mut out, v.name.as_deref());
        out.push_str(&format!(",\"kind\":\"{}\",\"freq\":", v.kind));
        json::opt_string(&mut out, v.freq.as_deref());
        out.push_str(",\"lat\":");
        json::number(&mut out, v.lat);
        out.push_str(",\"lon\":");
        json::number(&mut out, v.lon);
        out.push_str(",\"mag_var\":");
        json::opt_number(&mut out, v.mag_var);
        out.push_str(",\"elevation_ft\":");
        json::opt_number(&mut out, v.elevation_ft);
        out.push_str(",\"channel\":");
        json::opt_string(&mut out, v.channel.as_deref());
        out.push_str(",\"service_volume\":");
        json::opt_string(&mut out, v.service_volume.as_ref().and_then(|s| s.as_deref()));
        out.push_str(",\"hours\":");
        json::opt_string(&mut out, v.hours.as_ref().and_then(|s| s.as_deref()));
        out.push_str(&format!(",\"restricted\":{},\"remarks\":[]}}", v.restricted));
    }
    out.push_str("],\"fixes\":[]}");
    out
}
