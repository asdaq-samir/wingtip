//! The map's special-use areas and fixes in view from the phone's packs,
//! with no network: what the web and Android draw from the overlay tiles'
//! `special_use` and `fixes` layers (wingtip.vector_tiles), read from the
//! same cycle's NASR and SUA data a phone pack holds (wingtip.cycle_pack's
//! `write_phone`: the `sua` layer with `sua.rec`, `sua.names` and
//! `sua.alt`, and the `fixes` table of FIX_BASE rows).
//!
//! - The areas are those the web's specialUseLayers draws, by the FAA's
//!   TYPE_CODE (wingtip.sua TYPES): prohibited (P), restricted (R), warning
//!   (W) and danger (D) areas, which the map inks orange-brown, and MOAs and
//!   alert areas (A), magenta -- ForeFlight's inks over the sectional, the
//!   owner's pick of 2026-11-08. Each ring is oriented with the area on
//!   its left (crate::view's `oriented`), so the map hatches its inside,
//!   simplified under a pixel for the box asked and written [lat, lon] to
//!   five places, whole rather than clipped, as the Class B, C and D are.
//! - The fixes are those the overlay tiles mark: the intersections on the
//!   IFR Enroute Low Altitude chart (NASR CHARTS "ENROUTE LOW"), which the
//!   map draws as four-point stars, and the VFR waypoints a fixed-wing
//!   pilot has on a chart (FIX_USE_CODE VFR, on the sectional or a
//!   terminal area chart), as wingtip.fixes reads them; by ident, at most
//!   FIX_LIMIT.

use crate::json;
use crate::pack::Pack;
use crate::sua_tab;
use crate::view::{
    in_box, meets, oriented, reaches, representative, rings_of, round5, simplified, text_at, tolerance_for, Bbox, Polygon, Pt,
};
use wingtip_core::sort::StableSort;

/// The special-use areas the map draws, by TYPE_CODE: those inked as
/// restricted, then those inked as MOAs.
pub const SUA_RESTRICTED: &[&str] = &["P", "R", "W", "D"];
pub const SUA_MOA: &[&str] = &["MOA", "A"];
/// At most this many fixes in a box (the planner's waypoints' limit).
pub const FIX_LIMIT: usize = 1000;
/// wingtip.fixes' VFR_CHARTS and ENROUTE_LOW_CHART, NASR's CHARTS names.
const VFR_CHARTS: &[&str] = &["SECTIONAL", "VFR TERMINAL AREA"];
const ENROUTE_LOW_CHART: &str = "ENROUTE LOW";

fn f64_at(b: &[u8], o: usize) -> Option<f64> {
    b.get(o..o + 8).map(|s| f64::from_le_bytes(s.try_into().unwrap()))
}

fn point(out: &mut String, p: Pt) {
    // [lat, lon], as the airspace in view writes its lines.
    out.push('[');
    json::number(out, p.1);
    out.push(',');
    json::number(out, p.0);
    out.push(']');
}

/// The special-use areas reaching into the box, JSON:
/// `{"areas": [{"type", "name", "floor_ft", "ceiling_ft", "rings": [[[lat, lon], ...]], "label": [lat, lon], "tab"}]}`,
/// restricted kinds after the MOAs, so a restricted area is drawn over a
/// MOA it lies in; an area two packs hold, once. `tab` is ForeFlight's tab
/// on its boundary (crate::sua_tab), `{"name", "floor_ft", "floor_ref",
/// "ceiling_ft", "ceiling_ref", "at": [lat, lon], "angle", "side"}`, null
/// where its limits have no figure to write, the pack keeps no codes, or
/// the piece is one the FAA marks EXCLUSION (crate::sua_tab). A pack
/// written before the FAA's DESC was kept writes its limits as coded
/// (FL180 where the area stops below it).
pub fn special_use_in_view(packs: &[Pack], south: f64, west: f64, north: f64, east: f64) -> String {
    let view: Bbox = [west, south, east, north];
    let tolerance = tolerance_for(south, north);
    let mut found: Vec<(bool, String, String, bool)> = Vec::new();
    let mut out: Vec<(bool, String)> = Vec::new();
    for p in packs {
        let (Some(layer), Some(alt), Some(names), Some(rec)) =
            (p.layer("sua"), p.section("sua.alt"), p.section("sua.names"), p.section("sua.rec"))
        else {
            continue;
        };
        let described = p.section("sua.json");
        for i in 0..layer.count {
            let (Some(a), Some(r)) = (alt.get(32 * i..32 * i + 32), rec.get(24 * i..24 * i + 24)) else { continue };
            let kind = String::from_utf8_lossy(a[..4].split(|&c| c == 0).next().unwrap_or(&[])).into_owned();
            let restricted = SUA_RESTRICTED.contains(&kind.as_str());
            if !restricted && !SUA_MOA.contains(&kind.as_str()) || !meets(layer.bbox(i), view) {
                continue;
            }
            let (Some(wkb), Some(name)) = (layer.wkb(i), text_at(names, r, 16)) else { continue };
            // What the pack keeps of the area besides (wingtip.sua `_area`):
            // a piece marked EXCLUSION (the area above what the FAA
            // excludes lower down) has the area's name, and is told apart
            // by it, so it neither hides the area nor has its tab.
            let codes = described.and_then(|d| text_at(d, r, 8)).and_then(|t| json::parse(t).ok());
            let excluded = matches!(codes.as_ref().and_then(|c| c.get("excluded")), Some(json::Value::Bool(true)));
            if found.iter().any(|(_, k, n, x)| *k == kind && n == name && *x == excluded) {
                continue;
            }
            let Some(polygons) = rings_of(wkb).map(oriented) else { continue };
            if !reaches(&polygons, view) {
                continue;
            }
            let Some(label) = representative(&polygons) else { continue };
            let rings: Vec<Vec<Pt>> = polygons
                .iter()
                .flat_map(|p| std::iter::once(&p.shell).chain(p.holes.iter()))
                .map(|ring| {
                    let mut closed = ring.clone();
                    closed.push(ring[0]);
                    simplified(&closed, tolerance).into_iter().map(|(x, y)| (round5(x), round5(y))).collect()
                })
                .filter(|ring: &Vec<Pt>| ring.len() >= 3)
                .collect();
            if rings.is_empty() {
                continue;
            }
            found.push((restricted, kind.clone(), name.to_owned(), excluded));
            let mut o = String::from("{\"type\":");
            json::string(&mut o, &kind);
            o.push_str(",\"name\":");
            json::string(&mut o, name);
            o.push_str(",\"floor_ft\":");
            json::opt_number(&mut o, f64_at(a, 8).filter(|v| !v.is_nan()));
            o.push_str(",\"ceiling_ft\":");
            json::opt_number(&mut o, f64_at(a, 16).filter(|v| !v.is_nan()));
            o.push_str(",\"rings\":[");
            for (k, ring) in rings.iter().enumerate() {
                if k > 0 {
                    o.push(',');
                }
                o.push('[');
                for (j, &pt) in ring.iter().enumerate() {
                    if j > 0 {
                        o.push(',');
                    }
                    point(&mut o, pt);
                }
                o.push(']');
            }
            o.push_str("],\"label\":");
            point(&mut o, (round5(label.0), round5(label.1)));
            o.push_str(",\"tab\":");
            let code = |key: &str| codes.as_ref().and_then(|c| c.get(key)).and_then(json::Value::as_str);
            if codes.is_some() {
                let floor = sua_tab::Limit { ft: f64_at(a, 8).filter(|v| !v.is_nan()), code: code("floor_ref"), desc: code("floor_desc") };
                let ceiling =
                    sua_tab::Limit { ft: f64_at(a, 16).filter(|v| !v.is_nan()), code: code("ceiling_ref"), desc: code("ceiling_desc") };
                tab(&mut o, &polygons, name, &kind, floor, ceiling, excluded);
            } else {
                o.push_str("null");
            }
            o.push('}');
            out.push((restricted, o));
        }
    }
    // MOAs first, then the restricted kinds over them; each kind by name.
    let mut order: Vec<usize> = (0..out.len()).collect();
    order.stable_sort_by(|&x, &y| out[x].0.cmp(&out[y].0).then(found[x].2.cmp(&found[y].2)));
    let areas: Vec<&str> = order.iter().map(|&k| out[k].1.as_str()).collect();
    format!("{{\"areas\":[{}]}}", areas.join(","))
}

/// An area's tab (crate::sua_tab), or null.
fn tab(o: &mut String, polygons: &[Polygon], name: &str, kind: &str, floor: sua_tab::Limit, ceiling: sua_tab::Limit, excluded: bool) {
    let (Some(t), Some((at, angle, side))) = (sua_tab::tab(name, kind, floor, ceiling, excluded), sua_tab::edge_place(polygons)) else {
        o.push_str("null");
        return;
    };
    o.push('{');
    sua_tab::write_words(o, &t);
    o.push_str(",\"at\":");
    point(o, (round5(at.0), round5(at.1)));
    o.push_str(",\"angle\":");
    json::number(o, angle);
    o.push_str(",\"side\":");
    json::number(o, f64::from(side));
    o.push('}');
}

/// The fixes inside the box, JSON: `{"fixes": [{"ident", "lat", "lon", "vfr"}]}`,
/// the Enroute Low chart's intersections (`vfr` false) and the charted
/// VFR waypoints (`vfr` true), by ident; one filed twice at one place, once.
pub fn fixes_in_view(packs: &[Pack], south: f64, west: f64, north: f64, east: f64) -> String {
    let view: Bbox = [west, south, east, north];
    let mut fixes: Vec<(String, f64, f64, bool)> = Vec::new();
    for p in packs {
        let Some(t) = p.section("fixes").and_then(|b| std::str::from_utf8(b).ok()).and_then(json::table) else { continue };
        let (id, lat, lon, usage, charts) =
            (t.col("FIX_ID"), t.col("LAT_DECIMAL"), t.col("LONG_DECIMAL"), t.col("FIX_USE_CODE"), t.col("CHARTS"));
        for r in &t.rows {
            let get = |c: Option<usize>| c.and_then(|c| r.get(c)).map(|s| s.trim()).unwrap_or("");
            let ident = get(id).to_uppercase();
            let (Ok(la), Ok(lo)) = (get(lat).parse::<f64>(), get(lon).parse::<f64>()) else { continue };
            if ident.is_empty() || !in_box((lo, la), view) {
                continue;
            }
            let on: Vec<&str> = get(charts).split(',').map(str::trim).filter(|c| !c.is_empty()).collect();
            let vfr = get(usage) == "VFR" && on.iter().any(|c| VFR_CHARTS.contains(c));
            if !vfr && !on.contains(&ENROUTE_LOW_CHART) {
                continue;
            }
            if fixes.iter().any(|f| f.0 == ident && (f.1 - la).abs() < 1e-6 && (f.2 - lo).abs() < 1e-6) {
                continue;
            }
            fixes.push((ident, la, lo, vfr));
        }
    }
    fixes.stable_sort_by(|a, b| a.0.cmp(&b.0));
    fixes.truncate(FIX_LIMIT);
    let mut out = String::from("{\"fixes\":[");
    for (k, (ident, la, lo, vfr)) in fixes.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        out.push_str("{\"ident\":");
        json::string(&mut out, ident);
        out.push_str(",\"lat\":");
        json::number(&mut out, *la);
        out.push_str(",\"lon\":");
        json::number(&mut out, *lo);
        out.push_str(&format!(",\"vfr\":{vfr}}}"));
    }
    out.push_str("]}");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::pack::{ENTRY, HEADER, MAGIC, VERSION};

    /// A square of a degree at (x, y), a shapefile's outer ring (clockwise).
    fn square(x: f64, y: f64) -> Vec<u8> {
        let mut wkb = vec![1u8];
        for n in [3u32, 1, 5] {
            wkb.extend_from_slice(&n.to_le_bytes());
        }
        for (px, py) in [(x, y), (x, y + 1.0), (x + 1.0, y + 1.0), (x + 1.0, y), (x, y)] {
            wkb.extend_from_slice(&px.to_le_bytes());
            wkb.extend_from_slice(&py.to_le_bytes());
        }
        wkb
    }

    fn le(values: &[f64]) -> Vec<u8> {
        values.iter().flat_map(|v| v.to_le_bytes()).collect()
    }

    /// A phone pack of two areas, R-1 inside the MOA "Ash", and three fixes.
    fn pack() -> Vec<u8> {
        pack_of(b"", [(0, 0), (0, 0)])
    }

    /// The same, each area's codes (`sua.json`, wingtip.sua `_area`) the
    /// span of `described` given.
    fn pack_of(described: &[u8], spans: [(u32, u32); 2]) -> Vec<u8> {
        let (r, moa) = (square(-88.0, 42.0), square(-88.5, 41.5));
        let mut wkb = r.clone();
        wkb.extend_from_slice(&moa);
        let off: Vec<u8> = [0u64, r.len() as u64, (r.len() + moa.len()) as u64].iter().flat_map(|v| v.to_le_bytes()).collect();
        let names = b"R-1Ash".to_vec();
        let rec = |blob: (u32, u32), name: (u32, u32)| -> Vec<u8> {
            let mut b = f64::NAN.to_le_bytes().to_vec();
            for v in [blob.0, blob.1, name.0, name.1] {
                b.extend_from_slice(&v.to_le_bytes());
            }
            b
        };
        let alt = |kind: &[u8], floor: f64, ceiling: f64| -> Vec<u8> {
            let mut b = [0u8; 8].to_vec();
            b[..kind.len()].copy_from_slice(kind);
            b[4] = 3;
            b[5] = 3;
            b.extend_from_slice(&le(&[floor, ceiling]));
            b.extend_from_slice(&[0u8; 8]);
            b
        };
        let fixes = br#"{"columns":["FIX_ID","LAT_DECIMAL","LONG_DECIMAL","FIX_USE_CODE","CHARTS"],"rows":[["CHERL","42.5","-87.5","RP","ENROUTE LOW,IAP"],["VPBNG","42.4","-87.9","VFR","SECTIONAL"],["ZZZAP","42.3","-87.7","WP","IAP"]]}"#.to_vec();
        let mut sections: Vec<(&str, Vec<u8>)> = vec![
            ("sua.box", le(&[-88.0, 42.0, -87.0, 43.0, -88.5, 41.5, -87.5, 42.5])),
            ("sua.off", off),
            ("sua.wkb", wkb),
            ("sua.rec", [rec(spans[0], (0, 3)), rec(spans[1], (3, 3))].concat()),
            ("sua.names", names),
            ("sua.alt", [alt(b"R", 0.0, 9000.0), alt(b"MOA", 500.0, f64::NAN)].concat()),
            ("fixes", fixes),
        ];
        if !described.is_empty() {
            sections.push(("sua.json", described.to_vec()));
        }
        let start = HEADER + ENTRY * sections.len();
        let (mut table, mut body) = (Vec::new(), Vec::new());
        for (name, data) in &sections {
            while !(start + body.len()).is_multiple_of(8) {
                body.push(0);
            }
            let mut n = [0u8; 16];
            n[..name.len()].copy_from_slice(name.as_bytes());
            table.extend_from_slice(&n);
            table.extend_from_slice(&((start + body.len()) as u64).to_le_bytes());
            table.extend_from_slice(&(data.len() as u64).to_le_bytes());
            body.extend_from_slice(data);
        }
        let mut out = MAGIC.to_vec();
        out.extend_from_slice(&VERSION.to_le_bytes());
        out.extend_from_slice(&[0u8; 24]);
        out.extend_from_slice(&(sections.len() as u32).to_le_bytes());
        out.extend_from_slice(&[0u8; 28]);
        out.extend_from_slice(&table);
        out.extend_from_slice(&body);
        out
    }

    #[test]
    fn the_areas_in_view_moas_under_restricted_their_rings_with_the_area_on_the_left() {
        let bytes = pack();
        let packs = [Pack::read(&bytes).unwrap()];
        let got = json::parse(&special_use_in_view(&packs, 41.0, -89.0, 43.0, -87.0)).unwrap();
        let areas = got.get("areas").and_then(|a| a.as_array()).unwrap();
        let said: Vec<(&str, &str)> =
            areas.iter().map(|a| (a.get("type").unwrap().as_str().unwrap(), a.get("name").unwrap().as_str().unwrap())).collect();
        assert_eq!(said, vec![("MOA", "Ash"), ("R", "R-1")]);
        assert_eq!(areas[1].get("ceiling_ft").and_then(|v| v.as_f64()), Some(9000.0));
        assert!(areas[0].get("ceiling_ft").unwrap().as_f64().is_none());
        // The shell counter-clockwise in lon/lat ([lat, lon] written): from
        // the south-west corner east first, the area on the left.
        let ring = areas[1].get("rings").unwrap().as_array().unwrap()[0].as_array().unwrap();
        let at = |k: usize| ring[k].as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect::<Vec<_>>();
        assert_eq!((at(0), at(1)), (vec![42.0, -88.0], vec![42.0, -87.0]));
        // Out of the box: none.
        assert_eq!(special_use_in_view(&packs, 30.0, -100.0, 31.0, -99.0), "{\"areas\":[]}");
    }

    #[test]
    fn a_tab_writes_to_but_not_including_and_an_excluded_piece_has_none() {
        // R-1 SFC to 9,000 MSL "to but not including" (ADDS' UPPER_DESC
        // TNI): 8999, as the FAA's CIFP writes it. "Ash" a piece the FAA
        // marks EXCLUSION 1: drawn, with no tab.
        let r = br#"{"floor_ref":"SFC","floor_desc":null,"ceiling_ref":"MSL","ceiling_desc":"TNI","excluded":false}"#;
        let ash = br#"{"floor_ref":"SFC","ceiling_ref":"UNLTD","excluded":true}"#;
        let described = [r.as_slice(), ash.as_slice()].concat();
        let spans = [(0, r.len() as u32), (r.len() as u32, ash.len() as u32)];
        let bytes = pack_of(&described, spans);
        let packs = [Pack::read(&bytes).unwrap()];
        let got = json::parse(&special_use_in_view(&packs, 41.0, -89.0, 43.0, -87.0)).unwrap();
        let areas = got.get("areas").and_then(|a| a.as_array()).unwrap();
        assert!(matches!(areas[0].get("tab"), Some(json::Value::Null)));
        let tab = areas[1].get("tab").unwrap();
        let word = |k: &str| tab.get(k).and_then(|v| v.as_str()).unwrap();
        let figure = |k: &str| tab.get(k).and_then(|v| v.as_f64());
        assert_eq!((word("name"), word("floor_ref"), word("ceiling_ref")), ("R-1", "SFC", "MSL"));
        assert_eq!((figure("floor_ft"), figure("ceiling_ft")), (Some(0.0), Some(8999.0)));
    }

    #[test]
    fn the_fixes_in_view_are_the_enroute_charts_and_the_charted_vfr_waypoints() {
        let bytes = pack();
        let packs = [Pack::read(&bytes).unwrap()];
        assert_eq!(
            fixes_in_view(&packs, 42.0, -88.0, 43.0, -87.0),
            "{\"fixes\":[{\"ident\":\"CHERL\",\"lat\":42.5,\"lon\":-87.5,\"vfr\":false},{\"ident\":\"VPBNG\",\"lat\":42.4,\"lon\":-87.9,\"vfr\":true}]}"
        );
    }

    #[test]
    fn no_packs_no_marks() {
        assert_eq!(special_use_in_view(&[], 41.5, -88.5, 42.5, -87.5), "{\"areas\":[]}");
        assert_eq!(fixes_in_view(&[], 41.5, -88.5, 42.5, -87.5), "{\"fixes\":[]}");
    }
}
