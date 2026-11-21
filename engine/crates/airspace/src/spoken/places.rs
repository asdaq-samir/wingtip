use super::*;

/// "SIOUX FALLS" as "Sioux Falls", as Python's str.title() writes it.
pub fn title(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut start = true;
    for c in s.chars() {
        if c.is_alphabetic() {
            out.extend(if start { c.to_uppercase().collect::<Vec<_>>() } else { c.to_lowercase().collect() });
            start = false;
        } else {
            out.push(c);
            start = true;
        }
    }
    out
}

/// The airports, navaids and fixes of a phone pack's tables (wingtip.cycle_pack's
/// COLUMNS: NASR's APT_BASE, NAV_BASE and FIX_BASE, a row each): the
/// open airports (wingtip_flight::field: NASR ARPT_STATUS O, decision 0043)
/// by their ICAO ident where they have one, the navaids in service of the kinds a route flies over, by
/// their names, and every fix. Read once a pack and kept
/// (crate::pack_kept): a clearance heard reads the same packs as the last.
pub fn places_of(pack: &Pack) -> Vec<Place> {
    crate::pack_kept::kept(pack, "places", read_places).as_ref().clone()
}

fn read_places(pack: &Pack) -> Vec<Place> {
    let mut out = Vec::new();
    let table = |name: &str| pack.section(name).and_then(|b| std::str::from_utf8(b).ok()).and_then(json::table);
    let num = |s: &str| s.trim().parse::<f64>().ok();
    if let Some(t) = table("airports") {
        let (id, icao, site, name, lat, lon, status) = (
            t.col("ARPT_ID"),
            t.col("ICAO_ID"),
            t.col("SITE_TYPE_CODE"),
            t.col("ARPT_NAME"),
            t.col("LAT_DECIMAL"),
            t.col("LONG_DECIMAL"),
            t.col("ARPT_STATUS"),
        );
        for r in &t.rows {
            let get = |c: Option<usize>| c.and_then(|c| r.get(c)).map(String::as_str).unwrap_or("");
            if get(site) != "A" || !wingtip_flight::field::is_open(Some(get(status))) {
                continue;
            }
            let (Some(la), Some(lo)) = (num(get(lat)), num(get(lon))) else { continue };
            let ident = if get(icao).is_empty() { get(id) } else { get(icao) };
            out.push(Place { ident: ident.to_owned(), name: Some(field_name(get(name))), what: "airport", lat: la, lon: lo });
        }
    }
    if let Some(t) = table("navaids") {
        let (id, kind, name, status, lat, lon) =
            (t.col("NAV_ID"), t.col("NAV_TYPE"), t.col("NAME"), t.col("NAV_STATUS"), t.col("LAT_DECIMAL"), t.col("LONG_DECIMAL"));
        for r in &t.rows {
            let get = |c: Option<usize>| c.and_then(|c| r.get(c)).map(String::as_str).unwrap_or("");
            if !NAVAID_KINDS.contains(&get(kind)) || !get(status).starts_with("OPERATIONAL") {
                continue;
            }
            let (Some(la), Some(lo)) = (num(get(lat)), num(get(lon))) else { continue };
            out.push(Place { ident: get(id).to_owned(), name: Some(title(get(name))), what: "navaid", lat: la, lon: lo });
        }
    }
    if let Some(t) = table("fixes") {
        let (id, lat, lon) = (t.col("FIX_ID"), t.col("LAT_DECIMAL"), t.col("LONG_DECIMAL"));
        for r in &t.rows {
            let get = |c: Option<usize>| c.and_then(|c| r.get(c)).map(String::as_str).unwrap_or("");
            let (Some(la), Some(lo)) = (num(get(lat)), num(get(lon))) else { continue };
            out.push(Place { ident: get(id).to_owned(), name: None, what: "fix", lat: la, lon: lo });
        }
    }
    out
}

/// The places in nearness to the route's points (flat-earth distances,
/// enough for an order): of two that sound alike, the one by the route.
pub fn by_nearness(mut places: Vec<Place>, near: &[(f64, f64)]) -> Vec<Place> {
    if near.is_empty() {
        return places;
    }
    let squeeze = (near.iter().map(|p| p.0).sum::<f64>() / near.len() as f64).to_radians().cos();
    let d = |p: &Place| near.iter().map(|(la, lo)| (p.lat - la).powi(2) + ((p.lon - lo) * squeeze).powi(2)).fold(f64::INFINITY, f64::min);
    // Each place's nearness worked out once, not in every comparison the
    // sort makes; the same stable order by it.
    let keys: Vec<f64> = places.iter().map(d).collect();
    let mut order: Vec<usize> = (0..places.len()).collect();
    order.stable_sort_by(|&a, &b| keys[a].partial_cmp(&keys[b]).unwrap());
    let mut slots: Vec<Option<Place>> = places.drain(..).map(Some).collect();
    places.extend(order.into_iter().map(|i| slots[i].take().unwrap()));
    places
}

pub(crate) fn found_json(o: &mut String, f: &Found) {
    o.push_str("{\"said\":");
    json::string(o, &f.said);
    o.push_str(",\"ident\":");
    json::opt_string(o, f.ident.as_deref());
    o.push_str(",\"name\":");
    json::opt_string(o, f.name.as_deref());
    o.push_str(",\"kind\":");
    json::opt_string(o, f.kind);
    o.push_str(",\"lat\":");
    json::opt_number(o, f.lat);
    o.push_str(",\"lon\":");
    json::opt_number(o, f.lon);
    o.push_str(if f.sure { ",\"sure\":true}" } else { ",\"sure\":false}" });
}

/// What was heard, all the phone can make of it with no signal, as JSON:
/// the clearance (the web's Clearance), whether it was said to `tail`
/// and where its "direct" sends us, the places found in the kept packs
/// (the planner's ClearancePlaces, with the direct's), and the route it
/// gives from the one planned with the SID and STAR to pick (none
/// offline). `near`, the route's points, puts the nearer of two places
/// alike first.
pub fn hear(text: &str, tail: Option<&str>, places: Vec<Place>, near: &[(f64, f64)], planned: &crate::clearance::Route) -> String {
    use crate::clearance::{cleared_route, direct_of, our_call, read};
    let places = by_nearness(places, near);
    let c = read(text);
    let runs = c.place_runs();
    let found = find(c.limit.as_deref(), &runs, &places);
    let direct = direct_of(text);
    let direct_found = direct.as_deref().and_then(|d| points(d, &places).into_iter().find(|f| f.ident.is_some()));
    let (route, typed) = cleared_route(&c, &found, planned);
    let mut o = String::from("{\"clearance\":");
    o.push_str(&c.to_json());
    o.push_str(",\"forUs\":");
    o.push_str(if tail.is_some_and(|t| our_call(text, t)) { "true" } else { "false" });
    o.push_str(",\"direct\":");
    json::opt_string(&mut o, direct.as_deref());
    o.push_str(",\"directFound\":");
    match &direct_found {
        Some(f) => found_json(&mut o, f),
        None => o.push_str("null"),
    }
    o.push_str(",\"found\":{\"limit\":");
    match &found.limit {
        Some(f) => found_json(&mut o, f),
        None => o.push_str("null"),
    }
    o.push_str(",\"route\":[");
    for (k, run) in found.route.iter().enumerate() {
        if k > 0 {
            o.push(',');
        }
        o.push('[');
        for (m, f) in run.iter().enumerate() {
            if m > 0 {
                o.push(',');
            }
            found_json(&mut o, f);
        }
        o.push(']');
    }
    o.push_str("],\"departure\":null,\"arrival\":null},\"route\":{\"dep\":");
    json::string(&mut o, &route.dep);
    o.push_str(",\"stops\":[");
    for (k, s) in route.stops.iter().enumerate() {
        if k > 0 {
            o.push(',');
        }
        json::string(&mut o, s);
    }
    o.push_str("],\"dest\":");
    json::string(&mut o, &route.dest);
    o.push_str("},\"typed\":[");
    for (k, t) in typed.iter().enumerate() {
        if k > 0 {
            o.push(',');
        }
        o.push_str("{\"name\":");
        json::string(&mut o, &t.name);
        o.push_str(",\"before\":");
        json::opt_string(&mut o, t.before.as_deref());
        o.push_str(",\"after\":");
        json::opt_string(&mut o, t.after.as_deref());
        o.push('}');
    }
    o.push_str("]}");
    o
}
