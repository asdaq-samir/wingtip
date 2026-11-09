//! What the screens take from the picture: the traffic to draw, the
//! receiver's own merged with the internet's; a field's METAR and TAF
//! as FIS-B sent them; and the NEXRAD as rectangles of each level.

use crate::nexrad::{self, Block};
use crate::picture::Picture;
use crate::report;
use wingtip_core::json::{self, Value};

/// The height to add to a target's pressure altitude to have it on own
/// ship's scale: own ship's height less its own pressure altitude, so two
/// airplanes' pressure altitudes, which a receiver sends on 29.92 inHg
/// (GDL 90 Data Interface Specification, 3.5.1.4), keep their difference
/// whatever the day's pressure. Own ship's height is the host's (its GPS,
/// MSL) where it gives one, else the receiver's own GPS height where it
/// says that is MSL (ForeFlight's ID message); None where own ship's
/// pressure altitude is not known, and the targets are given as sent.
fn offset(p: &Picture, own_ft: Option<f64>) -> Option<f64> {
    let own = p.ownship.as_ref()?;
    let pressure = own.heard.report.pressure_ft?;
    let msl = own_ft.or(if p.receiver.msl { own.geometric_ft } else { None })?;
    Some(msl - pressure)
}

/// The traffic to draw, as the internet's traffic gives it (the contract's
/// TrafficPlane, the planner's TrafficAircraft): first what the receiver
/// hears, its heights put on own ship's scale (`offset`), then each
/// airplane of the internet's the receiver does not hear, by its ICAO
/// address, and never own ship. A receiver's report is its own, seconds
/// old at most; the internet's is relayed and older.
pub fn traffic(p: &Picture, internet: &[Value], own_ft: Option<f64>, at: f64) -> String {
    let shift = offset(p, own_ft);
    let mut heard: Vec<String> = p.targets.iter().map(|t| report::hex(t.report.address_type, t.report.address)).collect();
    if let Some(o) = &p.ownship {
        heard.push(report::hex(o.heard.report.address_type, o.heard.report.address));
    }
    let mut out = String::from("[");
    let mut first = true;
    let mut sep = |out: &mut String| {
        if !first {
            out.push(',');
        }
        first = false;
    };
    for t in &p.targets {
        let r = &t.report;
        sep(&mut out);
        out.push_str("{\"hex\":");
        json::string(&mut out, &report::hex(r.address_type, r.address));
        out.push_str(",\"callsign\":");
        json::opt_string(&mut out, r.callsign.as_deref());
        out.push_str(",\"category\":");
        json::opt_string(&mut out, report::category(r.emitter).as_deref());
        out.push_str(",\"lat\":");
        json::number(&mut out, r.lat);
        out.push_str(",\"lon\":");
        json::number(&mut out, r.lon);
        out.push_str(",\"altitude_ft\":");
        json::opt_number(&mut out, r.pressure_ft.map(|ft| ft + shift.unwrap_or(0.0)));
        out.push_str(",\"pressure_altitude\":");
        out.push_str(if shift.is_none() && r.pressure_ft.is_some() { "true" } else { "false" });
        out.push_str(",\"track_deg\":");
        json::opt_number(&mut out, r.track_deg);
        out.push_str(",\"speed_kt\":");
        json::opt_number(&mut out, r.speed_kt);
        out.push_str(",\"vertical_fpm\":");
        json::opt_number(&mut out, r.vertical_fpm);
        out.push_str(",\"emergency\":");
        json::opt_string(&mut out, report::emergency_word(r.emergency));
        out.push_str(",\"seen_s\":");
        json::number(&mut out, (at - t.at).max(0.0));
        out.push('}');
    }
    for plane in internet {
        let hex = plane.get("hex").and_then(Value::as_str).unwrap_or("").to_ascii_lowercase();
        if heard.contains(&hex) {
            continue;
        }
        sep(&mut out);
        json::value(&mut out, plane);
    }
    out.push(']');
    out
}

/// Whether a FIS-B location is the field asked for: the same, or the
/// field's three-letter ident with the K the contiguous states' ICAO
/// identifiers have before it ("ORD", "KORD"; FAA JO 7350.9).
fn is_field(location: &str, ident: &str) -> bool {
    let (l, i) = (location.to_ascii_uppercase(), ident.to_ascii_uppercase());
    l == i || (i.len() == 3 && l == format!("K{i}")) || (l.len() == 3 && i == format!("K{l}"))
}

/// A field's latest METAR (or SPECI) and TAF the receiver was sent, as
/// FIS-B sent them, with the time each was sent and heard.
pub fn reports(p: &Picture, ident: &str) -> String {
    let newest = |kinds: &[&str]| {
        p.texts
            .iter()
            .filter(|k| kinds.contains(&k.text.kind.as_str()) && k.text.location.as_deref().is_some_and(|l| is_field(l, ident)))
            .max_by(|a, b| a.at.total_cmp(&b.at))
    };
    let mut out = String::from("{");
    for (i, (name, kinds)) in [("metar", &["METAR", "SPECI"][..]), ("taf", &["TAF"][..])].iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(&mut out, name);
        out.push(':');
        match newest(kinds) {
            None => out.push_str("null"),
            Some(k) => {
                out.push_str("{\"kind\":");
                json::string(&mut out, &k.text.kind);
                out.push_str(",\"text\":");
                json::string(&mut out, &k.text.text);
                out.push_str(",\"time\":");
                json::string(&mut out, &k.text.time);
                out.push_str(",\"at\":");
                json::number(&mut out, k.at);
                out.push('}');
            }
        }
    }
    out.push('}');
    out
}

/// The NEXRAD to draw: for each level 1 to 7 (DO-358B's eight levels, 0
/// none), its rectangles, the regional product's where one was sent and
/// the CONUS product's elsewhere (the regional is the finer, 1.5 by 1
/// minutes a bin against the CONUS's 7.5 by 5), and the newest block's
/// time.
pub fn nexrad(p: &Picture) -> String {
    let regional: Vec<&Block> = p.blocks.iter().filter(|k| k.regional).map(|k| &k.block).collect();
    let conus: Vec<&Block> = p.blocks.iter().filter(|k| !k.regional).map(|k| &k.block).collect();
    let ids: std::collections::HashSet<u32> = regional.iter().map(|b| b.id).collect();
    let covered = |lat: f64, lon: f64| nexrad::block_at(lat, lon).is_some_and(|id| ids.contains(&id));
    let mut out = String::from("{\"levels\":[");
    for level in 1..=7u8 {
        if level > 1 {
            out.push(',');
        }
        let mut rects = nexrad::rects(&regional, level, &|_, _| false);
        rects.extend(nexrad::rects(&conus, level, &covered));
        out.push_str(&format!("{{\"level\":{level},\"rects\":["));
        for (i, r) in rects.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            out.push('[');
            for (j, v) in r.iter().enumerate() {
                if j > 0 {
                    out.push(',');
                }
                json::number(&mut out, (v * 1e5).round() / 1e5);
            }
            out.push(']');
        }
        out.push_str("]}");
    }
    let newest = p.blocks.iter().max_by(|a, b| a.at.total_cmp(&b.at));
    out.push_str("],\"time\":");
    json::opt_string(&mut out, newest.map(|k| k.time.as_str()));
    out.push_str(",\"at\":");
    json::opt_number(&mut out, newest.map(|k| k.at));
    out.push('}');
    out
}
