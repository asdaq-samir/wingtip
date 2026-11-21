use super::*;

// --- Airspace -----------------------------------------------------------------

/// What `airspace.attr` says of a volume; every field None from a pack
/// without it.
#[derive(Clone, Default)]
pub(crate) struct Attr {
    pub(crate) ident: Option<String>,
    pub(super) number: Option<usize>,
    pub(super) ceiling_excluded: bool,
    pub(super) hours_code: Option<String>,
    pub(super) hours_remark: Option<String>,
}

/// `attrs_of`, read once a pack (crate::pack_kept): the airspace in view
/// and the airports' primaries both ask it on every pan.
pub(crate) fn attrs_kept(pack: &Pack) -> std::sync::Arc<Vec<Attr>> {
    crate::pack_kept::kept(pack, "airspace.attr", attrs_of)
}

pub(crate) fn attrs_of(pack: &Pack) -> Vec<Attr> {
    let Some(text) = pack.section("airspace.attr").and_then(|b| std::str::from_utf8(b).ok()) else { return Vec::new() };
    let Ok(Value::Array(items)) = json::parse(text) else { return Vec::new() };
    items
        .iter()
        .map(|v| Attr {
            ident: v.get("ident").and_then(Value::as_str).map(str::to_owned),
            number: v.get("number").and_then(Value::as_f64).map(|n| n as usize),
            ceiling_excluded: matches!(v.get("ceiling_excluded"), Some(Value::Bool(true))),
            hours_code: v.get("hours_code").and_then(Value::as_str).map(str::to_owned),
            hours_remark: v.get("hours_remark").and_then(Value::as_str).map(str::to_owned),
        })
        .collect()
}

pub(super) struct Found {
    pub(super) number: Option<usize>,
    pub(super) id: String,
    pub(super) ident: Option<String>,
    pub(super) name: String,
    pub(super) class: char,
    pub(super) floor_ft: f64,
    pub(super) ceiling_ft: Option<f64>,
    pub(super) attr: Attr,
    pub(super) label: Pt,
    pub(super) lines: Vec<Vec<Pt>>,
}

/// The planner's AirspaceInView for the box, JSON: the Class B, C and D
/// of the packs reaching into it, in the national file's order where the
/// packs number them, each whole. A volume in two packs (a region's edge
/// runs through it) is answered once.
pub fn airspace_in_view(packs: &[Pack], south: f64, west: f64, north: f64, east: f64) -> String {
    let view: Bbox = [west, south, east, north];
    let tolerance = tolerance_for(south, north);
    let mut found: Vec<Found> = Vec::new();
    let mut ids: std::collections::HashSet<String> = std::collections::HashSet::new();
    for p in packs {
        let (Some(layer), Some(vols), Some(names)) = (p.layer("airspace"), p.section("airspace.vol"), p.section("airspace.names")) else {
            continue;
        };
        let attrs = attrs_kept(p);
        // A pack whose attr is not one a volume reads as having none.
        let attrs: &[Attr] = if attrs.len() == layer.count { &attrs } else { &[] };
        for i in 0..layer.count {
            let Some(r) = vols.get(32 * i..32 * i + 32) else { continue };
            let class = r[0] as char;
            if !"BCD".contains(class) || !meets(layer.bbox(i), view) {
                continue;
            }
            let (Some(wkb), Some(floor), Some(ceiling), Some(name)) = (layer.wkb(i), f64_at(r, 8), f64_at(r, 16), text_at(names, r, 24))
            else {
                continue;
            };
            let Some(polygons) = rings_of(wkb).map(oriented) else { continue };
            if !reaches(&polygons, view) {
                continue;
            }
            let attr = if attrs.is_empty() { Attr::default() } else { attrs[i].clone() };
            let id = match (attr.number, &attr.ident) {
                (Some(n), Some(ident)) => format!("{ident}-{n}"),
                (Some(n), None) => format!("{class}-{n}"),
                // No number: the class and the name tell a volume apart
                // in a region, and the same from one box to the next.
                (None, _) => format!("{class}-{name}"),
            };
            if ids.contains(&id) {
                continue;
            }
            let Some(label) = representative(&polygons) else { continue };
            let lines: Vec<Vec<Pt>> = polygons
                .iter()
                .flat_map(|p| std::iter::once(&p.shell).chain(p.holes.iter()))
                .map(|ring| {
                    // A ring closed, as a polygon's boundary is, before it is
                    // simplified, so its ends stay.
                    let mut closed = ring.clone();
                    closed.push(ring[0]);
                    simplified(&closed, tolerance).into_iter().map(|(x, y)| (round5(x), round5(y))).collect()
                })
                .filter(|line: &Vec<Pt>| line.len() >= 2)
                .collect();
            if lines.is_empty() {
                continue;
            }
            ids.insert(id.clone());
            found.push(Found {
                number: attr.number,
                id,
                ident: attr.ident.clone(),
                name: name.to_owned(),
                class,
                // wingtip.airspace's floor in feet MSL: the surface, or a
                // height MSL; anything else 0 (floor ref 1 is AGL).
                floor_ft: if r[1] == 2 { floor } else { 0.0 },
                ceiling_ft: (!ceiling.is_nan()).then_some(ceiling),
                attr,
                label,
                lines,
            });
        }
    }
    found.stable_sort_by_key(|f| f.number.unwrap_or(usize::MAX));
    let mut out = String::from("{\"volumes\":[");
    for (k, f) in found.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        out.push_str("{\"id\":");
        json::string(&mut out, &f.id);
        out.push_str(",\"ident\":");
        json::opt_string(&mut out, f.ident.as_deref());
        out.push_str(",\"name\":");
        json::string(&mut out, &f.name);
        out.push_str(&format!(",\"airspace_class\":\"{}\",\"floor_ft\":", f.class));
        json::number(&mut out, f.floor_ft);
        out.push_str(&format!(",\"floor_sfc\":{},\"ceiling_ft\":", f.floor_ft == 0.0));
        json::opt_number(&mut out, f.ceiling_ft);
        out.push_str(&format!(",\"ceiling_excluded\":{},\"hours_code\":", f.attr.ceiling_excluded));
        json::opt_string(&mut out, f.attr.hours_code.as_deref());
        out.push_str(",\"hours_remark\":");
        json::opt_string(&mut out, f.attr.hours_remark.as_deref());
        out.push_str(",\"label_lat\":");
        json::number(&mut out, round5(f.label.1));
        out.push_str(",\"label_lon\":");
        json::number(&mut out, round5(f.label.0));
        out.push_str(",\"lines\":[");
        for (l, line) in f.lines.iter().enumerate() {
            if l > 0 {
                out.push(',');
            }
            out.push('[');
            for (m, (x, y)) in line.iter().enumerate() {
                if m > 0 {
                    out.push(',');
                }
                out.push('[');
                json::number(&mut out, *y);
                out.push(',');
                json::number(&mut out, *x);
                out.push(']');
            }
            out.push(']');
        }
        out.push_str("]}");
    }
    out.push_str("]}");
    out
}
