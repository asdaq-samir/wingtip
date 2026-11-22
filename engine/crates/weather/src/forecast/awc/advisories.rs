use super::*;

/// When a bulletin was issued, from its WMO abbreviated heading, "WSUS32
/// KKCI 261655": the last group is the day of the month, hour and minute
/// (UTC) of issue (WMO-No. 386, Manual on the Global Telecommunication
/// System, Attachment II-5). The SIGMET file gives no issue time of its
/// own. Put in the month of `near` (its valid time), or the month before
/// for a heading of the 31st read on the 1st; None with no heading.
pub fn wmo_issued(raw: &str, near: Option<i64>) -> Option<i64> {
    let near = near?;
    let words: Vec<&str> = raw.split_whitespace().collect();
    let letters = |w: &str, n: usize| w.len() >= n && w[..n].bytes().all(|b| b.is_ascii_uppercase());
    let digits = |w: &str| w.bytes().all(|b| b.is_ascii_digit());
    let found = words.windows(3).find(|w| {
        w[0].len() == 6 && letters(w[0], 4) && digits(&w[0][4..]) && w[1].len() == 4 && letters(w[1], 4) && w[2].len() == 6 && digits(w[2])
    })?;
    let g = found[2];
    let (day, hour, minute): (u32, i64, i64) = (g[..2].parse().ok()?, g[2..4].parse().ok()?, g[4..].parse().ok()?);
    if hour > 23 || minute > 59 {
        return None;
    }
    let (y, m, _) = time::civil_from_days(near.div_euclid(time::DAY_S));
    for back in 0..2i64 {
        let months = y * 12 + m as i64 - 1 - back;
        let (yy, mm) = (months.div_euclid(12), (months.rem_euclid(12) + 1) as u32);
        if day == 0 || day > time::days_in_month(yy, mm) {
            continue;
        }
        let t = time::days_from_civil(yy, mm, day) * time::DAY_S + hour * 3600 + minute * 60;
        if t <= near + time::DAY_S {
            return Some(t);
        }
    }
    None
}

pub(super) fn coords(out: &mut String, el: &Element) {
    out.push_str(",\"coords\":[");
    let mut first = true;
    for p in el.iter_named("point") {
        if let (Some(lat), Some(lon)) = (num(p.text_at(&["latitude"])), num(p.text_at(&["longitude"]))) {
            if !first {
                out.push(',');
            }
            first = false;
            out.push('[');
            json::number(out, lat);
            out.push(',');
            json::number(out, lon);
            out.push(']');
        }
    }
    out.push(']');
}

pub(super) fn opt_int(out: &mut String, v: Option<i64>) {
    match v {
        Some(v) => out.push_str(&v.to_string()),
        None => out.push_str("null"),
    }
}

/// The SIGMETs of the combined cache file, sigmets.cache.xml: the United
/// States' convective SIGMETs, its non-convective ones and the
/// international ones, every FIR's, in one (the AWC's data API v4.34,
/// 2026-10-08, which deprecated the airsigmets file; schema sigmet1_1.xsd):
/// `[{"hazard", "type", "altitude_low_ft", "altitude_high_ft", "raw",
/// "valid_from", "valid_to", "issued", "coords"}]`, times in Unix seconds
/// but `issued`, ISO UTC from the WMO heading.
///
/// The file says no kind of its own. A convective SIGMET's hazard is
/// "CONV" (the airsigmets file said "CONVECTIVE", which every reader of
/// the store looks for, so it is kept); an international SIGMET's
/// thunderstorms are "TS", kept as the file says. Every one is "type"
/// "SIGMET": the AIRMETs over the CONUS are the G-AIRMETs (`gairmets`).
/// One SIGMET of several areas (`multiarea`) is one advisory an area, so
/// no ring joins two; one drawn as a line with a width ("WI 90NM WID LINE
/// BTN ...") has no ring and keeps only its words.
pub fn airsigmets(text: &str) -> Result<String, String> {
    let doc = root(text)?;
    let mut items = Vec::new();
    for el in doc.iter_named("SIGMET") {
        let altitude = el.child("altitude");
        let raw = el.text_at(&["raw_text"]);
        let from = unix(el.text_at(&["valid_time_from"]));
        let hazard = el.child("hazard").and_then(|h| h.attribute("type")).map(|h| if h == "CONV" { "CONVECTIVE" } else { h });
        let areas: Vec<Option<&Element>> = match (el.child("multiarea"), el.child("area")) {
            (Some(many), _) => many.all("area").map(Some).collect(),
            (None, one) => vec![one],
        };
        for area in areas {
            let mut a = String::from("{\"hazard\":");
            opt_text(&mut a, hazard);
            a.push_str(",\"type\":\"SIGMET\",\"altitude_low_ft\":");
            json::opt_number(&mut a, num(altitude.and_then(|x| x.attribute("base_ft_msl"))));
            a.push_str(",\"altitude_high_ft\":");
            json::opt_number(&mut a, num(altitude.and_then(|x| x.attribute("top_ft_msl"))));
            a.push_str(",\"raw\":");
            opt_text(&mut a, raw);
            a.push_str(",\"valid_from\":");
            opt_int(&mut a, from);
            a.push_str(",\"valid_to\":");
            opt_int(&mut a, unix(el.text_at(&["valid_time_to"])));
            a.push_str(",\"issued\":");
            opt_text(&mut a, wmo_issued(raw.unwrap_or(""), from).map(time::iso).as_deref());
            match area {
                Some(ring) => coords(&mut a, ring),
                None => a.push_str(",\"coords\":[]"),
            }
            a.push('}');
            items.push(a);
        }
    }
    Ok(format!("[{}]", items.join(",")))
}

/// The pilot reports in the aircraft reports file -- routine and urgent
/// (UUA) -- leaving out the AIREPs, airliners' position reports from the
/// ocean routes, which are most of it: `[{"observed_at", "observed", "lat",
/// "lon", "altitude_ft", "aircraft", "urgent", "turbulence", "icing", "raw"}]`.
pub fn pireps(text: &str) -> Result<String, String> {
    let doc = root(text)?;
    let mut items = Vec::new();
    for el in doc.iter_named("AircraftReport") {
        let kind = el.text_at(&["report_type"]).unwrap_or("");
        if !kind.contains("PIREP") {
            continue;
        }
        let (Some(lat), Some(lon)) = (num(el.text_at(&["latitude"])), num(el.text_at(&["longitude"]))) else { continue };
        fn first<'a>(el: &'a Element, tag: &'a str, attr: &str) -> Option<&'a str> {
            el.iter_named(tag).into_iter().find_map(|t| t.attribute(attr).filter(|s| !s.is_empty()))
        }
        let first = |tag: &'static str, attr: &str| first(el, tag, attr);
        let mut r = String::from("{\"observed_at\":");
        opt_text(&mut r, el.text_at(&["observation_time"]));
        r.push_str(",\"observed\":");
        opt_int(&mut r, unix(el.text_at(&["observation_time"])));
        r.push_str(",\"lat\":");
        json::number(&mut r, lat);
        r.push_str(",\"lon\":");
        json::number(&mut r, lon);
        r.push_str(",\"altitude_ft\":");
        json::opt_number(&mut r, num(el.text_at(&["altitude_ft_msl"])));
        r.push_str(",\"aircraft\":");
        opt_text(&mut r, el.text_at(&["aircraft_ref"]));
        r.push_str(",\"urgent\":");
        r.push_str(if kind.starts_with("Urgent") { "true" } else { "false" });
        r.push_str(",\"turbulence\":");
        opt_text(&mut r, first("turbulence_condition", "turbulence_intensity"));
        r.push_str(",\"icing\":");
        opt_text(&mut r, first("icing_condition", "icing_intensity"));
        r.push_str(",\"raw\":");
        opt_text(&mut r, el.text_at(&["raw_text"]));
        r.push('}');
        items.push(r);
    }
    Ok(format!("[{}]", items.join(",")))
}

/// The G-AIRMET areas a VFR flight is told of (GAIRMET_HAZARDS): `[{"hazard"
/// (in words), "severity", "due_to", "valid_at", "valid", "issued",
/// "altitude_low_ft", "from_freezing_level", "altitude_high_ft", "coords"}]`.
/// A floor of "FZL" is the freezing level, which the advisory gives beside it.
pub fn gairmets(text: &str) -> Result<String, String> {
    let doc = root(text)?;
    let mut items = Vec::new();
    for el in doc.iter_named("GAIRMET") {
        let hazard = el.child("hazard");
        let Some(words) =
            hazard.and_then(|h| h.attribute("type")).and_then(|k| GAIRMET_HAZARDS.iter().find(|(c, _)| *c == k)).map(|(_, w)| *w)
        else {
            continue;
        };
        if el.text_at(&["geometry_type"]) != Some("AREA") {
            continue;
        }
        let altitude = el.child("altitude");
        let low = altitude.and_then(|x| x.attribute("min_ft_msl"));
        let mut a = String::from("{\"hazard\":");
        json::string(&mut a, words);
        a.push_str(",\"severity\":");
        opt_text(&mut a, hazard.and_then(|h| h.attribute("severity")).filter(|s| !s.is_empty()));
        a.push_str(",\"due_to\":");
        opt_text(&mut a, el.text_at(&["due_to"]));
        a.push_str(",\"valid_at\":");
        opt_text(&mut a, el.text_at(&["valid_time"]));
        a.push_str(",\"valid\":");
        opt_int(&mut a, unix(el.text_at(&["valid_time"])));
        a.push_str(",\"issued\":");
        opt_text(&mut a, el.text_at(&["issue_time"]).filter(|s| !s.is_empty()));
        a.push_str(",\"altitude_low_ft\":");
        json::opt_number(&mut a, if matches!(low, None | Some("" | "FZL" | "SFC")) { None } else { num(low) });
        a.push_str(",\"from_freezing_level\":");
        a.push_str(if low == Some("FZL") { "true" } else { "false" });
        a.push_str(",\"altitude_high_ft\":");
        json::opt_number(&mut a, num(altitude.and_then(|x| x.attribute("max_ft_msl"))));
        coords(&mut a, el);
        a.push('}');
        items.push(a);
    }
    Ok(format!("[{}]", items.join(",")))
}

pub(super) fn secs(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(Value::as_f64).map(|t| t as i64)
}

/// To when a stored copy of `product` may be served when later fetches
/// fail (Unix seconds; None, no limit), by its product's own validity:
///
/// - "metars": none. A METAR is an observation; FAA-H-8083-28B 24.4.1 gives it no
///   period of validity, only its time, which every report carries and
///   the screens show, so the last set heard is served however long the
///   outage, as "the latest reports, made at ..." (the owner, 2026-11-04);
/// - "tafs": the end of the latest valid period in it (24 or 30 hours
///   from issue, FAA-H-8083-28B 27.4.1; validity.rs);
/// - "airsigmets": the latest "valid until" of them (up to 4 hours for a
///   SIGMET, 6 for volcanic ash or a tropical cyclone, 2 for a convective
///   SIGMET, 6 for an AIRMET; FAA-H-8083-28B 26.2.4, 26.2.5, 26.3.3);
/// - "airmets", Alaska's (airmets.rs): the same, an AIRMET to its own
///   valid time;
/// - "pireps": PIREP_MAX_AGE_S after the newest report, past which a held
///   set would read as "no reports along the route" where the truth is
///   "none could be had";
/// - "gairmets": GAIRMET_SNAPSHOT_S after the last snapshot.
///
/// A copy whose contents say nothing (none in force) is held STALE_MAX_S
/// from `fetched`.
pub fn held_until(product: &str, data: &Value, fetched: i64) -> Result<Option<i64>, String> {
    let list = || data.as_array().unwrap_or(&[]);
    let latest = |found: Vec<i64>, after: i64| Some(found.into_iter().max().map_or(fetched + STALE_MAX_S, |t| t + after));
    Ok(match product {
        "metars" => None,
        "tafs" => latest(
            list()
                .iter()
                .flat_map(|s| s.get("fcsts").and_then(Value::as_array).unwrap_or(&[]))
                .filter_map(|p| validity::expires_at(validity::Product::Taf, None, None, secs(p, "timeTo")))
                .collect(),
            0,
        ),
        "airsigmets" | "airmets" => latest(
            list().iter().filter_map(|a| validity::expires_at(validity::Product::Advisory, None, None, secs(a, "valid_to"))).collect(),
            0,
        ),
        "pireps" => latest(list().iter().filter_map(|r| secs(r, "observed")).collect(), PIREP_MAX_AGE_S),
        "gairmets" => latest(list().iter().filter_map(|a| secs(a, "valid")).collect(), GAIRMET_SNAPSHOT_S),
        other => return Err(format!("weather_held_until: no product {other:?}")),
    })
}
