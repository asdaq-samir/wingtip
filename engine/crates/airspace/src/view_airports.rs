//! The landing fields in view from the phone's packs (crate::view sets
//! out what the `airports` table holds and what each pin says), with each
//! field's map mark as the overlay tiles and the planner's
//! /api/airports/in-view carry it: `mark_order` and `mark_size`, the
//! flight crate's field_mark_rank (wingtip_flight::field::mark_rank) of the
//! same NASR facts -- APT_BASE's SITE_TYPE_CODE and FACILITY_USE_CODE, its
//! TWR_TYPE_CODE's tower, the Class B or C the FAA's airspace file names
//! it the primary airport of, and its longest hard-surfaced runway, the
//! table's HARD_FT column (APT_RWY's RWY_LEN over the hard surfaces,
//! helipads left out; wingtip.cycle_pack writes it since 2026-11-14). A
//! pack written before has no HARD_FT, and its fields rank as having no
//! hard runway: below the fields of their tier that have one, never above.

use crate::json;
use crate::view::{attrs_of, f64_at, in_box, Bbox, AIRPORT_LIMIT};
use crate::{pack::Pack, sort::StableSort};

struct Pin {
    ident: String,
    faa_id: String,
    name: String,
    lat: f64,
    lon: f64,
    kind: &'static str,
    military: Option<&'static str>,
    private: bool,
    towered: bool,
    /// NASR's SITE_TYPE_CODE and FACILITY_USE_CODE, and the longest hard
    /// runway in ft (HARD_FT, 0 where the pack has none): field_mark_rank's.
    site: String,
    use_: String,
    hard_ft: u32,
}

fn rank(kind: &str) -> usize {
    ["large", "medium", "small"].iter().position(|k| *k == kind).unwrap_or(3)
}

/// The class of airspace at the surface of the point, from the packs'
/// airspace, as wingtip.airspace.surface_classes reads it off the file: the
/// lowest of the Class B, C and D whose floor is the surface there, else
/// E where a Class E reaches the surface (its E2 to E4 areas), else G.
fn surface_class(packs: &[Pack], lat: f64, lon: f64) -> char {
    let (mut best, mut in_e) = (None::<char>, false);
    for p in packs {
        let (Some(layer), Some(vols)) = (p.layer("airspace"), p.section("airspace.vol")) else { continue };
        for i in layer.holding(lon, lat).unwrap_or_default() {
            let Some(r) = vols.get(32 * i..32 * i + 32) else { continue };
            let reaching = r[1] == 0 || (r[1] == 2 && f64_at(r, 8).is_some_and(|f| f <= 0.0));
            if !reaching {
                continue;
            }
            match r[0] as char {
                c @ ('B' | 'C' | 'D') => best = Some(best.map_or(c, |b| b.min(c))),
                'E' => in_e = true,
                _ => {}
            }
        }
    }
    best.unwrap_or(if in_e { 'E' } else { 'G' })
}

/// Each Class B, C and D's primary field, by the ident the airspace file
/// names it by, to the highest class it is the primary of (the planner's
/// `_primaries`); none from packs without `airspace.attr`.
fn primaries(packs: &[Pack]) -> Vec<(String, char)> {
    let mut found: Vec<(String, char)> = Vec::new();
    for p in packs {
        let Some(vols) = p.section("airspace.vol") else { continue };
        for (i, attr) in attrs_of(p).into_iter().enumerate() {
            let (Some(ident), Some(r)) = (attr.ident, vols.get(32 * i..32 * i + 32)) else { continue };
            let class = r[0] as char;
            if !"BCD".contains(class) {
                continue;
            }
            match found.iter_mut().find(|f| f.0 == ident) {
                Some(f) => f.1 = f.1.min(class),
                None => found.push((ident, class)),
            }
        }
    }
    found
}

/// The planner's AirportsInView for the box, JSON: the open landing fields (wingtip_flight::field)
/// of the packs' tables inside it, the biggest first, at most AIRPORT_LIMIT.
pub fn airports_in_view(packs: &[Pack], south: f64, west: f64, north: f64, east: f64) -> String {
    let view: Bbox = [west, south, east, north];
    let mut pins: Vec<Pin> = Vec::new();
    for p in packs {
        let Some(t) = p.section("airports").and_then(|b| std::str::from_utf8(b).ok()).and_then(json::table) else { continue };
        let (tower, hard) = (t.col("TWR_TYPE_CODE"), t.col("HARD_FT"));
        let (id, icao, site, name, lat, lon, status, size, owner, use_) = (
            t.col("ARPT_ID"),
            t.col("ICAO_ID"),
            t.col("SITE_TYPE_CODE"),
            t.col("ARPT_NAME"),
            t.col("LAT_DECIMAL"),
            t.col("LONG_DECIMAL"),
            t.col("ARPT_STATUS"),
            t.col("SIZE"),
            t.col("OWNERSHIP_TYPE_CODE"),
            t.col("FACILITY_USE_CODE"),
        );
        for r in &t.rows {
            let get = |c: Option<usize>| c.and_then(|c| r.get(c)).map(|s| s.trim()).unwrap_or("");
            if get(site) != "A" || !wingtip_flight::field::is_open(Some(get(status))) {
                continue;
            }
            let (Ok(la), Ok(lo)) = (get(lat).parse::<f64>(), get(lon).parse::<f64>()) else { continue };
            if !in_box((lo, la), view) {
                continue;
            }
            // OurAirports' size, where the pack has it; a field it lists
            // no landing field for is not one the planner lists either.
            let kind = match size.map(|_| get(size)) {
                None => "other",
                Some("large") => "large",
                Some("medium") => "medium",
                Some("small") => "small",
                Some(_) => continue,
            };
            let ident = if get(icao).is_empty() { get(id) } else { get(icao) };
            if pins.iter().any(|p| p.ident == ident) {
                continue;
            }
            // The services' own fields, by the flight crate's one rule
            // (field_military, NASR APT_BASE's ownership and use codes).
            let military = wingtip_flight::field::military(owner.map(|_| get(owner)), Some(get(use_)));
            pins.push(Pin {
                ident: ident.to_owned(),
                faa_id: get(id).to_uppercase(),
                name: crate::field_name::field_name(get(name)),
                lat: la,
                lon: lo,
                kind,
                military,
                private: get(use_) == "PR" && military.is_none(),
                towered: get(tower).to_uppercase().starts_with("ATCT"),
                site: get(site).to_owned(),
                use_: get(use_).to_owned(),
                hard_ft: get(hard).parse::<f64>().ok().filter(|f| f.is_finite() && *f > 0.0).map_or(0, |f| f.round() as u32),
            });
        }
    }
    pins.stable_sort_by(|a, b| rank(a.kind).cmp(&rank(b.kind)).then_with(|| a.ident.cmp(&b.ident)));
    pins.truncate(AIRPORT_LIMIT);
    let primary = primaries(packs);
    let mut out = String::from("{\"airports\":[");
    for (k, p) in pins.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        out.push_str("{\"ident\":");
        json::string(&mut out, &p.ident);
        out.push_str(",\"name\":");
        json::string(&mut out, &p.name);
        out.push_str(",\"lat\":");
        json::number(&mut out, p.lat);
        out.push_str(",\"lon\":");
        json::number(&mut out, p.lon);
        out.push_str(&format!(",\"kind\":\"{}\",\"flight_category\":null,\"military\":", p.kind));
        json::opt_string(&mut out, p.military);
        out.push_str(&format!(
            ",\"private\":{},\"towered\":{},\"airspace_class\":\"{}\",\"primary_of\":",
            p.private,
            p.towered,
            surface_class(packs, p.lat, p.lon)
        ));
        let primary_of = primary.iter().find(|f| f.0 == p.faa_id).map(|(_, c)| c.to_string());
        match &primary_of {
            Some(c) => out.push_str(&format!("\"{c}\"")),
            None => out.push_str("null"),
        }
        // The mark the tiles draw it with (field_mark_rank: a Class D's
        // field counts as the primary of none there).
        let mark = wingtip_flight::field::mark_rank(&p.site, &p.use_, p.towered, p.hard_ft, primary_of.as_deref());
        out.push_str(&format!(",\"mark_order\":{},\"mark_size\":\"{}\"}}", mark.order, mark.size));
    }
    out.push_str("]}");
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::Value;
    use crate::pack::tests::written;

    /// A pack of three fields of the airports table, `with_hard` saying
    /// whether it has the HARD_FT column.
    fn pack(with_hard: bool) -> Vec<u8> {
        let rows = [
            // A towered field with 13,000 ft of hard runway.
            ["ORD", "KORD", "A", "CHICAGO O'HARE INTL", "41.98", "-87.90", "O", "PU", "ATCT", "13000"],
            // A public untowered field with 5,000 ft of it, and one with 2,000.
            ["3CK", "", "A", "LAKE IN THE HILLS", "42.21", "-88.32", "O", "PU", "NON-ATCT", "5000"],
            ["C81", "", "A", "CAMPBELL", "42.32", "-88.07", "O", "PU", "NON-ATCT", "2000"],
        ];
        let mut columns = vec!["ARPT_ID", "ICAO_ID", "SITE_TYPE_CODE", "ARPT_NAME", "LAT_DECIMAL", "LONG_DECIMAL", "ARPT_STATUS"];
        columns.extend(["FACILITY_USE_CODE", "TWR_TYPE_CODE"]);
        let keep = if with_hard { 10 } else { 9 };
        if with_hard {
            columns.push("HARD_FT");
        }
        let quote = |cells: &[&str]| cells.iter().map(|c| format!("\"{c}\"")).collect::<Vec<_>>().join(",");
        let body = rows.iter().map(|r| format!("[{}]", quote(&r[..keep]))).collect::<Vec<_>>().join(",");
        let table = format!("{{\"columns\":[{}],\"rows\":[{body}]}}", quote(&columns));
        written(&[("airports", table.into_bytes())])
    }

    fn marks(bytes: &[u8]) -> Vec<(String, u64, String)> {
        let packs = [Pack::read(bytes).unwrap()];
        let Ok(v) = json::parse(&airports_in_view(&packs, 41.0, -89.0, 43.0, -87.0)) else { panic!() };
        let mut out: Vec<(String, u64, String)> = v
            .get("airports")
            .and_then(Value::as_array)
            .unwrap()
            .iter()
            .map(|a| {
                let text = |k: &str| a.get(k).and_then(Value::as_str).unwrap().to_owned();
                (text("ident"), a.get("mark_order").and_then(Value::as_f64).unwrap() as u64, text("mark_size"))
            })
            .collect();
        crate::sort::StableSort::stable_sort_by_key(&mut out[..], |m| m.1);
        out
    }

    #[test]
    fn each_field_carries_the_tiles_mark() {
        // field_mark_rank's own: towered first (class 2), then the public
        // field with 3,000 ft of hard runway or more (tier 1, class 3), then
        // the shorter (tier 2, class 4), each less its runway's feet.
        let got = marks(&pack(true));
        assert_eq!(
            got,
            [
                ("KORD".to_owned(), 2 * 100_000 + 99_999 - 13_000, "regular".to_owned()),
                ("3CK".to_owned(), 3 * 100_000 + 99_999 - 5_000, "regular".to_owned()),
                ("C81".to_owned(), 4 * 100_000 + 99_999 - 2_000, "small".to_owned()),
            ]
        );
    }

    #[test]
    fn a_pack_without_hard_ft_ranks_its_fields_as_having_no_hard_runway() {
        let got = marks(&pack(false));
        // The untowered public field with no runway known drops to tier 2.
        assert_eq!(got[0], ("KORD".to_owned(), 2 * 100_000 + 99_999, "regular".to_owned()));
        assert_eq!(got[1].2, "small");
        assert_eq!(got[2].2, "small");
    }
}
