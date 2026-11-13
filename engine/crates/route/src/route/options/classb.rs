//! A leg and Class B airspace (was the planner's wingtip.airspace
//! class_b_entered and _detour_through): whether a straight leg flown at
//! an altitude enters Class B, and the named fixes to fly through that
//! keep both legs out of it, best first -- the pilot's "Avoid Class B".
//!
//! 14 CFR 91.131(a)(1): no one may operate an aircraft within a Class B
//! area without an ATC clearance. A shelf whose floor is above the leg's
//! altitude is passed under, one whose ceiling is below it passed over.
//! The planner reads the shelves from the FAA's Class Airspace shapefile
//! and leaves out the Class B a flight takes off from or lands in (its
//! surface area holds an end: the clearance is had anyway).

use super::ask::Reader;
use super::grid::Area;
use crate::geo;
use crate::json::{self, Value};
use std::collections::HashMap;
use wingtip_core::grid::Point;
use wingtip_core::sort::StableSort;

/// Kept from Class B airspace a route is bent round, as a pilot keeps a
/// margin from its edge rather than skimming it: a mile, in degrees of the
/// chart (the shapefile's own longitude and latitude).
pub const DETOUR_MARGIN_NM: f64 = 1.0;
/// A detour no longer than the route by more than this is offered.
pub const DETOUR_MAX_ADDED_NM: f64 = 40.0;
/// What a fix that is not a VFR waypoint costs in the ranking, in miles:
/// a VFR pilot flies to the magenta flags on the sectional by eye, and a
/// GPS fix only where it saves more than this.
pub const DETOUR_NON_VFR_NM: f64 = 10.0;
/// How many ways round a pilot is offered to choose from.
pub const DETOUR_CHOICES: usize = 5;
/// The edge index's cells, degrees.
const INDEX_DEG: f64 = 0.05;

/// A Class B shelf: its floor and ceiling, ft MSL, and its outline.
pub struct Shelf {
    pub floor_ft: f64,
    pub ceiling_ft: Option<f64>,
    pub area: Area,
}

/// The shelves' edges by the cells of a coarse grid, so a leg is tested
/// against the few near it: round Atlanta the shapefile's arcs are tens of
/// thousands of points.
struct Edges {
    by_cell: HashMap<(i64, i64), Vec<(Point, Point)>>,
}

fn cell_of(p: Point) -> (i64, i64) {
    ((p.0 / INDEX_DEG).floor() as i64, (p.1 / INDEX_DEG).floor() as i64)
}

impl Edges {
    fn new<'a>(areas: impl Iterator<Item = &'a Area>) -> Edges {
        let mut by_cell: HashMap<(i64, i64), Vec<(Point, Point)>> = HashMap::new();
        for area in areas {
            for ring in &area.rings {
                let n = ring.len();
                for i in 0..n {
                    let (a, b) = (ring[i], ring[(i + 1) % n]);
                    let (r0, c0) = cell_of((a.0.min(b.0), a.1.min(b.1)));
                    let (r1, c1) = cell_of((a.0.max(b.0), a.1.max(b.1)));
                    for r in r0..=r1 {
                        for c in c0..=c1 {
                            by_cell.entry((r, c)).or_default().push((a, b));
                        }
                    }
                }
            }
        }
        Edges { by_cell }
    }

    /// Whether a segment comes within `margin` degrees of an edge.
    fn near(&self, a: Point, b: Point, margin: f64) -> bool {
        let (r0, c0) = cell_of((a.0.min(b.0) - margin, a.1.min(b.1) - margin));
        let (r1, c1) = cell_of((a.0.max(b.0) + margin, a.1.max(b.1) + margin));
        let cells = ((r1 - r0 + 1) * (c1 - c0 + 1)) as usize;
        let check = |edges: &Vec<(Point, Point)>| edges.iter().any(|&(p, q)| segment_distance(a, b, p, q) <= margin);
        if cells > self.by_cell.len() {
            return self.by_cell.iter().any(|(&(r, c), edges)| (r0..=r1).contains(&r) && (c0..=c1).contains(&c) && check(edges));
        }
        for r in r0..=r1 {
            for c in c0..=c1 {
                if let Some(edges) = self.by_cell.get(&(r, c))
                    && check(edges)
                {
                    return true;
                }
            }
        }
        false
    }
}

fn orient(a: Point, b: Point, c: Point) -> f64 {
    (b.1 - a.1) * (c.0 - a.0) - (b.0 - a.0) * (c.1 - a.1)
}

fn point_segment(p: Point, a: Point, b: Point) -> f64 {
    let (dx, dy) = (b.1 - a.1, b.0 - a.0);
    let len = dx * dx + dy * dy;
    let t = if len > 0.0 { (((p.1 - a.1) * dx + (p.0 - a.0) * dy) / len).clamp(0.0, 1.0) } else { 0.0 };
    ((a.1 + dx * t - p.1).powi(2) + (a.0 + dy * t - p.0).powi(2)).sqrt()
}

/// The least distance between two segments on the chart, degrees: 0 where
/// they cross.
fn segment_distance(a: Point, b: Point, p: Point, q: Point) -> f64 {
    let (d1, d2, d3, d4) = (orient(a, b, p), orient(a, b, q), orient(p, q, a), orient(p, q, b));
    if ((d1 > 0.0) != (d2 > 0.0)) && ((d3 > 0.0) != (d4 > 0.0)) {
        return 0.0;
    }
    point_segment(p, a, b).min(point_segment(q, a, b)).min(point_segment(a, p, q)).min(point_segment(b, p, q))
}

/// Whether a straight leg flown at `altitude_ft` enters Class B: a shelf
/// whose floor is at or under it and whose ceiling is at or over it, and
/// whose outline the leg goes into (14 CFR 91.131: an ATC clearance
/// before entering). Under a shelf or over the top, it does not.
pub fn entered(start: Point, end: Point, shelves: &[Shelf], altitude_ft: f64) -> bool {
    shelves.iter().any(|s| {
        s.floor_ft <= altitude_ft
            && s.ceiling_ft.is_none_or(|c| altitude_ft <= c)
            && (s.area.contains(start.0, start.1)
                || s.area.contains(end.0, end.1)
                || Edges::new(std::iter::once(&s.area)).near(start, end, 0.0))
    })
}

/// A fix a detour may fly through, as the planner reads it.
pub struct Fix {
    pub ident: String,
    pub lat: f64,
    pub lon: f64,
    pub vfr: bool,
    pub kind: String,
}

pub struct Detour {
    pub ident: String,
    pub kind: String,
    pub added_nm: f64,
}

/// Named fixes to fly through so that neither leg enters the Class B
/// whose floor is under `below_ft` -- the lowest altitude the route can
/// fly there, so a shelf above it is passed under -- kept DETOUR_MARGIN_NM
/// from its edge: the ones adding the least distance first, a VFR
/// waypoint (VPBNG, on the sectional) before a GPS fix, at most
/// DETOUR_CHOICES, none adding more than DETOUR_MAX_ADDED_NM.
pub fn detours(start: Point, end: Point, shelves: &[Shelf], below_ft: f64, fixes: &[Fix]) -> Vec<Detour> {
    let blocking: Vec<&Area> = shelves.iter().filter(|s| s.floor_ft < below_ft).map(|s| &s.area).collect();
    if blocking.is_empty() {
        return Vec::new();
    }
    // The fixes round the blocking airspace, as far as a detour may add.
    let (mut s, mut w, mut n, mut e) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
    for a in &blocking {
        let b = a.bounds();
        (s, w, n, e) = (s.min(b.0), w.min(b.1), n.max(b.2), e.max(b.3));
    }
    // A degree of longitude as cos(latitude) of one of latitude, which the
    // same pad either way had short of the miles east and west.
    let (s, w, n, e) = geo::corridor_bbox((s, w), (n, e), DETOUR_MAX_ADDED_NM);
    let edges = Edges::new(blocking.iter().copied());
    let margin = DETOUR_MARGIN_NM / 60.0;
    let inside = |p: Point| blocking.iter().any(|a| a.contains(p.0, p.1));
    // Either end inside it: every leg from it is inside unless it crosses
    // an edge, which the edges catch.
    let ends_in = inside(start) || inside(end);
    let direct = geo::distance_nm(start.0, start.1, end.0, end.1);
    let mut ranked: Vec<(f64, Detour)> = Vec::new();
    for f in fixes {
        if !(f.lat >= s && f.lat <= n && f.lon >= w && f.lon <= e) {
            continue;
        }
        let added = geo::distance_nm(start.0, start.1, f.lat, f.lon) + geo::distance_nm(f.lat, f.lon, end.0, end.1) - direct;
        if added > DETOUR_MAX_ADDED_NM {
            continue;
        }
        let via = (f.lat, f.lon);
        if ends_in || inside(via) || edges.near(start, via, margin) || edges.near(via, end, margin) {
            continue;
        }
        let rank = added + if f.vfr { 0.0 } else { DETOUR_NON_VFR_NM };
        ranked.push((
            rank,
            Detour {
                ident: f.ident.clone(),
                kind: if f.kind.is_empty() { "Fix".into() } else { f.kind.clone() },
                added_nm: super::words::r1(added),
            },
        ));
    }
    ranked.stable_sort_by(|a, b| a.0.total_cmp(&b.0).then_with(|| a.1.ident.cmp(&b.1.ident)));
    ranked.into_iter().take(DETOUR_CHOICES).map(|(_, d)| d).collect()
}

fn shelves(r: &Reader, v: &Value) -> Result<Vec<Shelf>, String> {
    r.opt_list(v, "shelves")?
        .unwrap_or(&[])
        .iter()
        .map(|s| {
            Ok(Shelf {
                floor_ft: r.opt_num(s, "floor_ft_msl")?.unwrap_or(0.0),
                ceiling_ft: r.opt_num(s, "ceiling_ft_msl")?,
                area: r.rings(s, "rings")?,
            })
        })
        .collect()
}

pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let r = Reader { name };
    let point = |key: &str| -> Result<Point, String> { r.point(v.get(key).ok_or_else(|| format!("{name}: \"{key}\" is missing"))?) };
    let (start, end) = (point("start")?, point("end")?);
    let shelves = shelves(&r, v)?;
    if name == "class_b_entered" {
        return Ok(entered(start, end, &shelves, r.num(v, "altitude_ft")?).to_string());
    }
    let fixes: Vec<Fix> = r
        .opt_list(v, "fixes")?
        .unwrap_or(&[])
        .iter()
        .map(|f| {
            Ok(Fix {
                ident: r.text(f, "ident")?,
                lat: r.num(f, "lat")?,
                lon: r.num(f, "lon")?,
                vfr: r.flag(f, "vfr")?,
                kind: r.text(f, "kind")?,
            })
        })
        .collect::<Result<_, String>>()?;
    let mut out = String::from("[");
    for (i, d) in detours(start, end, &shelves, r.num(v, "below_ft")?, &fixes).iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"ident\":");
        json::string(&mut out, &d.ident);
        out.push_str(",\"kind\":");
        json::string(&mut out, &d.kind);
        out.push_str(",\"added_nm\":");
        json::number(&mut out, d.added_nm);
        out.push('}');
    }
    out.push(']');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    // A square of Class B, a tenth of a degree across each way, on the line
    // from (0, 0) north to (1, 0): Midway to Duluth over O'Hare.
    fn core(floor: f64, ceiling: f64) -> Shelf {
        Shelf {
            floor_ft: floor,
            ceiling_ft: Some(ceiling),
            area: Area { rings: vec![vec![(0.4, -0.1), (0.4, 0.1), (0.6, 0.1), (0.6, -0.1)]] },
        }
    }

    fn fix(ident: &str, lat: f64, lon: f64, vfr: bool) -> Fix {
        Fix { ident: ident.into(), lat, lon, vfr, kind: if vfr { "VFR waypoint".into() } else { "GPS waypoint".into() } }
    }

    fn idents(ways: &[Detour]) -> Vec<&str> {
        ways.iter().map(|w| w.ident.as_str()).collect()
    }

    #[test]
    fn the_detour_is_the_shortest_way_round_out_of_the_class_b() {
        let fixes = [fix("VPFAR", 0.5, -0.6, true), fix("VPMID", 0.5, 0.0, true), fix("VPNEAR", 0.5, -0.2, true)];
        let ways = detours((0.0, 0.0), (1.0, 0.0), &[core(0.0, 10000.0)], 10000.0, &fixes);
        assert_eq!(idents(&ways), vec!["VPNEAR", "VPFAR"]);
        assert_eq!(ways[0].kind, "VFR waypoint");
        assert!(ways[0].added_nm > 0.0 && ways[0].added_nm < 5.0);
        // A mile's margin: a fix just outside the edge has its legs within it.
        assert!(detours((0.0, 0.0), (1.0, 0.0), &[core(0.0, 10000.0)], 10000.0, &[fix("VPEDGE", 0.5, -0.105, true)]).is_empty());
        // A shelf over the altitude flown is passed under.
        assert!(detours((0.0, 0.0), (1.0, 0.0), &[core(3000.0, 10000.0)], 2500.0, &fixes).is_empty());
    }

    #[test]
    fn a_vfr_waypoint_comes_before_a_gps_fix_that_saves_less_than_ten_miles_and_a_handful_at_most() {
        let fixes = [fix("GPSNR", 0.5, -0.15, false), fix("VPOUT", 0.5, -0.25, true)];
        assert_eq!(idents(&detours((0.0, 0.0), (1.0, 0.0), &[core(0.0, 10000.0)], 10000.0, &fixes)), vec!["VPOUT", "GPSNR"]);
        assert!(detours((0.0, 0.0), (1.0, 0.0), &[core(0.0, 10000.0)], 10000.0, &[fix("VPGONE", 0.5, -3.0, true)]).is_empty());
        let many: Vec<Fix> = (0..DETOUR_CHOICES + 3).map(|i| fix(&format!("VP{i:03}"), 0.5, -0.2 - i as f64 * 0.01, true)).collect();
        assert_eq!(detours((0.0, 0.0), (1.0, 0.0), &[core(0.0, 10000.0)], 10000.0, &many).len(), DETOUR_CHOICES);
    }

    #[test]
    fn a_leg_enters_class_b_only_between_its_floor_and_ceiling() {
        let shelf = [core(3600.0, 10000.0)];
        let through = ((0.0, 0.0), (1.0, 0.0));
        assert!(entered(through.0, through.1, &shelf, 4500.0));
        assert!(entered(through.0, through.1, &shelf, 3600.0));
        assert!(!entered(through.0, through.1, &shelf, 3500.0));
        assert!(!entered(through.0, through.1, &shelf, 10500.0));
        // Beside it, not through it.
        assert!(!entered((0.0, 0.5), (1.0, 0.5), &shelf, 4500.0));
    }
}
