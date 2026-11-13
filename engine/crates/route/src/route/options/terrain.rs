//! A way round high ground for an airplane that cannot climb over it (was
//! wingtip.terrain_detour): the fields with fuel to fly by, in order, so
//! that every leg between them keeps clear of the ground at an altitude
//! the airplane can reach.
//!
//! The planner says when a route has no legal altitude because the terrain
//! under its straight line needs more than the airplane's service ceiling
//! allows; a pilot then goes round, by the passes and the low country:
//!
//! - the ground is the highest of PER_CELL by PER_CELL samples in each
//!   cell of a grid round the route, which the planner reads off the
//!   terrain tiles at the frame's samples (`terrain_way_frame`);
//! - a cell can be flown over where its highest ground, with the
//!   planner's 1,000 ft (at or above 14 CFR 91.119(b) and (c)) and the
//!   coarse read's margin, is under the highest VFR cruising altitude the
//!   airplane reaches either way (91.159's thousands plus 500 under its
//!   ceiling, the lower of the eastbound and westbound);
//! - the shortest way over such cells (A*), straightened where a straight
//!   line keeps to them, gives the turns; the fields with fuel near it are
//!   the stepping stones, the turns themselves where none will do.
//!
//! It only suggests: the route through them is planned as any route is,
//! its floor read along each leg at full resolution.

use super::ask::Reader;
use super::grid::{CELL_DEG, PER_CELL};
use super::read::{highest_cruise_ft, COARSE_MARGIN_FT, TERRAIN_MARGIN_FT};
use crate::geo;
use crate::json::{self, Value};
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};
use wingtip_core::grid::{Cell, Point};

/// How far round the route the grid reaches, degrees.
pub const REACH_DEG: f64 = 5.0;
/// The fields near the way round that may be flown by, nm from it.
pub const FIELD_NM: f64 = 40.0;
/// The longest leg between two of them looked at, nm: none in effect --
/// the planner adds fuel stops where the tanks do not reach, and a route
/// makes 8 stops at most (app.router_basics.MAX_STOPS).
pub const LEG_NM: f64 = 3000.0;
/// Miles added for each field flown by, so fewer turns win where near,
/// and more for a point of the pilot's own, so a field is had where one
/// will do.
pub const TURN_NM: f64 = 20.0;
pub const OWN_POINT_NM: f64 = 30.0;

pub struct Frame {
    pub lat0: f64,
    pub lon0: f64,
    pub rows: usize,
    pub cols: usize,
}

pub fn frame(start: Point, end: Point) -> Frame {
    let lat0 = start.0.min(end.0) - REACH_DEG;
    let lon0 = start.1.min(end.1) - REACH_DEG;
    let rows = ((start.0.max(end.0) + REACH_DEG - lat0) / CELL_DEG).ceil() as usize;
    let cols = ((start.1.max(end.1) + REACH_DEG - lon0) / CELL_DEG).ceil() as usize;
    Frame { lat0, lon0, rows: rows.max(1), cols: cols.max(1) }
}

struct Clear {
    f: Frame,
    clear: Vec<bool>,
}

impl Clear {
    fn cell(&self, p: Point) -> Cell {
        let r = ((p.0 - self.f.lat0) / CELL_DEG) as i64;
        let c = ((p.1 - self.f.lon0) / CELL_DEG) as i64;
        (r.clamp(0, self.f.rows as i64 - 1), c.clamp(0, self.f.cols as i64 - 1))
    }

    fn centre(&self, c: Cell) -> Point {
        (self.f.lat0 + (c.0 as f64 + 0.5) * CELL_DEG, self.f.lon0 + (c.1 as f64 + 0.5) * CELL_DEG)
    }

    fn is_clear(&self, c: Cell) -> bool {
        self.clear[c.0 as usize * self.f.cols + c.1 as usize]
    }

    /// Whether the straight line from a to b keeps to clear cells, `ends`
    /// excepted (a field in a high valley): its points a third of a cell
    /// apart.
    fn line_clear(&self, a: Point, b: Point, ends: &HashSet<Cell>) -> bool {
        let steps = 2usize.max(((b.0 - a.0).abs().max((b.1 - a.1).abs()) / (CELL_DEG / 3.0)) as usize + 1);
        (0..steps).all(|i| {
            let t = i as f64 / (steps - 1) as f64;
            let r = (((a.0 + (b.0 - a.0) * t - self.f.lat0) / CELL_DEG) as i64).clamp(0, self.f.rows as i64 - 1);
            let c = (((a.1 + (b.1 - a.1) * t - self.f.lon0) / CELL_DEG) as i64).clamp(0, self.f.cols as i64 - 1);
            self.is_clear((r, c)) || ends.contains(&(r, c))
        })
    }
}

#[derive(PartialEq)]
struct Open(f64, Cell);

impl Eq for Open {}

impl Ord for Open {
    fn cmp(&self, other: &Self) -> Ordering {
        // The least first, then the lowest cell, as Python's heap of
        // (cost, (row, column)) has them.
        other.0.total_cmp(&self.0).then_with(|| other.1.cmp(&self.1))
    }
}

impl PartialOrd for Open {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// The shortest way over clear cells from start's cell to end's (A*):
/// miles between cells' centres on the flat, a cell's width east and west
/// shrinking with the cosine of its latitude -- within a few tenths of a
/// percent of the geodesic over a few cells.
fn shortest(g: &Clear, start: Point, end: Point) -> Option<Vec<Cell>> {
    let (s, e) = (g.cell(start), g.cell(end));
    let ends: HashSet<Cell> = [s, e].into_iter().collect();
    let shrink: Vec<f64> = (0..g.f.rows).map(|r| (g.f.lat0 + (r as f64 + 0.5) * CELL_DEG).to_radians().cos()).collect();
    let cost = |a: Cell, b: Cell| {
        let dy = (a.0 - b.0) as f64 * CELL_DEG * 60.0;
        let dx = (a.1 - b.1) as f64 * CELL_DEG * 60.0 * shrink[((a.0 + b.0).div_euclid(2)) as usize];
        dx.hypot(dy)
    };
    let mut frontier = BinaryHeap::new();
    frontier.push(Open(0.0, s));
    let mut came: HashMap<Cell, Option<Cell>> = HashMap::from([(s, None)]);
    let mut spent: HashMap<Cell, f64> = HashMap::from([(s, 0.0)]);
    while let Some(Open(_, here)) = frontier.pop() {
        if here == e {
            let mut path = vec![here];
            while let Some(Some(prev)) = came.get(path.last().unwrap()) {
                path.push(*prev);
            }
            path.reverse();
            return Some(path);
        }
        for dr in -1..=1 {
            for dc in -1..=1 {
                if dr == 0 && dc == 0 {
                    continue;
                }
                let next = (here.0 + dr, here.1 + dc);
                if next.0 < 0 || next.0 >= g.f.rows as i64 || next.1 < 0 || next.1 >= g.f.cols as i64 {
                    continue;
                }
                if !g.is_clear(next) && !ends.contains(&next) {
                    continue;
                }
                let d = spent[&here] + cost(here, next);
                if d < *spent.get(&next).unwrap_or(&f64::INFINITY) {
                    spent.insert(next, d);
                    came.insert(next, Some(here));
                    frontier.push(Open(d + cost(next, e), next));
                }
            }
        }
    }
    None
}

/// A stepping stone on the way round: a field with fuel, or one of the
/// way's own turns, which the planner names as a point of the pilot's own.
pub struct Stone {
    pub field: Option<(String, String)>,
    pub at: Point,
}

pub struct Field {
    pub ident: String,
    pub name: String,
    pub at: Point,
}

/// The fields with fuel and the way's turns to fly by, in order, from
/// `start` to `end`, keeping every leg clear of the ground at an altitude
/// an airplane with this service ceiling can reach, the ground's height
/// read at the frame's samples (`heights_ft`, PER_CELL a cell's side, rows
/// from the south). Some([]) where the straight line is clear already;
/// None where there is no such way in reach.
pub fn way_round(start: Point, end: Point, ceiling_ft: f64, heights_ft: &[f64], fields: &[Field]) -> Result<Option<Vec<Stone>>, String> {
    let top = highest_cruise_ft(ceiling_ft);
    let f = frame(start, end);
    let width = f.cols * PER_CELL;
    if heights_ft.len() != f.rows * PER_CELL * width {
        return Err(format!("terrain_way_round: \"terrain_ft\" is not {} by {} heights", f.rows * PER_CELL, width));
    }
    let mut clear = vec![false; f.rows * f.cols];
    for r in 0..f.rows {
        for c in 0..f.cols {
            let mut highest = f64::NEG_INFINITY;
            for i in 0..PER_CELL {
                highest = heights_ft[(r * PER_CELL + i) * width + c * PER_CELL..][..PER_CELL].iter().copied().fold(highest, f64::max);
            }
            clear[r * f.cols + c] = highest + TERRAIN_MARGIN_FT + COARSE_MARGIN_FT <= top;
        }
    }
    let g = Clear { f, clear };
    let ends: HashSet<Cell> = [g.cell(start), g.cell(end)].into_iter().collect();
    if g.line_clear(start, end, &ends) {
        return Ok(Some(Vec::new()));
    }
    let Some(path) = shortest(&g, start, end) else { return Ok(None) };
    // The fields with fuel near that way are the stepping stones.
    let way: Vec<Point> = path.iter().map(|&c| g.centre(c)).collect();
    let every = 1usize.max(way.len() / 200);
    let picked: Vec<&Field> =
        fields.iter().filter(|fd| way.iter().step_by(every).any(|p| geo::distance_nm(p.0, p.1, fd.at.0, fd.at.1) <= FIELD_NM)).collect();
    // And the way's own turns, where a straight line from one to the next
    // keeps clear, so a chain is always there.
    let mut points = vec![start];
    if path.len() > 2 {
        points.extend(path[1..path.len() - 1].iter().map(|&c| g.centre(c)));
    }
    points.push(end);
    let mut turns = Vec::new();
    let mut i = 0;
    while i + 1 < points.len() {
        let mut j = points.len() - 1;
        while j > i + 1 && !g.line_clear(points[i], points[j], &ends) {
            j -= 1;
        }
        if j < points.len() - 1 {
            turns.push(points[j]);
        }
        i = j;
    }
    let mut nodes: Vec<Point> = vec![start];
    nodes.extend(picked.iter().map(|fd| fd.at));
    let fields_end = nodes.len();
    nodes.extend(turns.iter().copied());
    nodes.push(end);
    let count = nodes.len();
    // The shortest chain whose every leg keeps clear (Dijkstra), a few
    // miles added for each stone flown by.
    let mut best = vec![f64::INFINITY; count];
    let mut prev: Vec<Option<usize>> = vec![None; count];
    best[0] = 0.0;
    let mut frontier = BinaryHeap::new();
    frontier.push(Open(0.0, (0, 0)));
    while let Some(Open(spent, (here, _))) = frontier.pop() {
        let here = here as usize;
        if here == count - 1 {
            break;
        }
        if spent > best[here] {
            continue;
        }
        for next in 1..count {
            if next == here {
                continue;
            }
            let leg = geo::distance_nm(nodes[here].0, nodes[here].1, nodes[next].0, nodes[next].1);
            if leg > LEG_NM {
                continue;
            }
            let add = if next == count - 1 {
                0.0
            } else if next < fields_end {
                TURN_NM
            } else {
                TURN_NM + OWN_POINT_NM
            };
            let d = spent + leg + add;
            if d >= best[next] {
                continue;
            }
            let mut open = ends.clone();
            open.insert(g.cell(nodes[here]));
            open.insert(g.cell(nodes[next]));
            if !g.line_clear(nodes[here], nodes[next], &open) {
                continue;
            }
            best[next] = d;
            prev[next] = Some(here);
            frontier.push(Open(d, (next as i64, 0)));
        }
    }
    if !best[count - 1].is_finite() {
        return Ok(None);
    }
    let mut chain = Vec::new();
    let mut at = prev[count - 1];
    while let Some(n) = at {
        if n == 0 {
            break;
        }
        chain.push(n);
        at = prev[n];
    }
    chain.reverse();
    Ok(Some(
        chain
            .into_iter()
            .map(|n| {
                if n < fields_end {
                    let fd = picked[n - 1];
                    Stone { field: Some((fd.ident.clone(), fd.name.clone())), at: fd.at }
                } else {
                    Stone { field: None, at: nodes[n] }
                }
            })
            .collect(),
    ))
}

pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let r = Reader { name };
    let point = |key: &str| -> Result<Point, String> { r.point(v.get(key).ok_or_else(|| format!("{name}: \"{key}\" is missing"))?) };
    let (start, end) = (point("start")?, point("end")?);
    let f = frame(start, end);
    if name == "terrain_way_frame" {
        let mut out = String::from("{\"lat0\":");
        json::number(&mut out, f.lat0);
        out.push_str(",\"lon0\":");
        json::number(&mut out, f.lon0);
        out.push_str(&format!(",\"rows\":{},\"cols\":{},\"cell_deg\":", f.rows, f.cols));
        json::number(&mut out, CELL_DEG);
        out.push_str(&format!(",\"per_cell\":{PER_CELL},\"top_ft\":"));
        json::number(&mut out, highest_cruise_ft(r.num(v, "ceiling_ft")?));
        // The fields wanted: those within FIELD_NM of the grid.
        let (s, w, n, e) =
            geo::corridor_bbox((f.lat0, f.lon0), (f.lat0 + f.rows as f64 * CELL_DEG, f.lon0 + f.cols as f64 * CELL_DEG), FIELD_NM);
        out.push_str(",\"data_box\":[");
        for (i, x) in [s, w, n, e].iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            json::number(&mut out, *x);
        }
        out.push_str("]}");
        return Ok(out);
    }
    let heights: Vec<f64> = r
        .opt_list(v, "terrain_ft")?
        .ok_or_else(|| format!("{name}: \"terrain_ft\" is missing"))?
        .iter()
        .map(|x| x.as_f64().unwrap_or(0.0))
        .collect();
    let fields: Vec<Field> = r
        .opt_list(v, "fields")?
        .unwrap_or(&[])
        .iter()
        .map(|fd| Ok(Field { ident: r.text(fd, "ident")?, name: r.text(fd, "name")?, at: (r.num(fd, "lat")?, r.num(fd, "lon")?) }))
        .collect::<Result<_, String>>()?;
    let found = way_round(start, end, r.num(v, "ceiling_ft")?, &heights, &fields)?;
    let Some(stones) = found else { return Ok("null".to_owned()) };
    let mut out = String::from("[");
    for (i, s) in stones.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"ident\":");
        json::opt_string(&mut out, s.field.as_ref().map(|f| f.0.as_str()));
        out.push_str(",\"name\":");
        json::opt_string(&mut out, s.field.as_ref().map(|f| f.1.as_str()));
        out.push_str(",\"lat\":");
        json::number(&mut out, s.at.0);
        out.push_str(",\"lon\":");
        json::number(&mut out, s.at.1);
        out.push('}');
    }
    out.push(']');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A ridge 12,000 ft high across the straight line at 1 to 2 degrees
    /// east, from 1 degree south to 3 north; low ground elsewhere.
    fn ridge(f: &Frame) -> Vec<f64> {
        let (rows, cols) = (f.rows * PER_CELL, f.cols * PER_CELL);
        let step = CELL_DEG / PER_CELL as f64;
        let mut out = vec![500.0; rows * cols];
        for r in 0..rows {
            let lat = f.lat0 + (r as f64 + 0.5) * step;
            for c in 0..cols {
                let lon = f.lon0 + (c as f64 + 0.5) * step;
                if lon > 1.0 && lon < 2.0 && lat > -1.0 && lat < 3.0 {
                    out[r * cols + c] = 12000.0;
                }
            }
        }
        out
    }

    fn field(ident: &str, lat: f64, lon: f64) -> Field {
        Field { ident: ident.into(), name: format!("{ident} FIELD"), at: (lat, lon) }
    }

    #[test]
    fn the_highest_cruise_either_way_under_the_ceiling() {
        // A PA-28-140's 10,950 ft: 9,500 east, 10,500 west, the lower kept.
        assert_eq!(highest_cruise_ft(10_950.0), 9_500.0);
        assert_eq!(highest_cruise_ft(13_500.0), 12_500.0);
        // Never into Class A (14 CFR 71.33).
        assert_eq!(highest_cruise_ft(25_000.0), 16_500.0);
    }

    #[test]
    fn round_a_ridge_by_the_field_at_its_end() {
        let (start, end) = ((0.0, 0.0), (0.0, 3.0));
        let heights = ridge(&frame(start, end));
        let fields = vec![field("SOUTH", -1.6, 1.5), field("NORTH", 3.6, 1.5), field("ONRIDGE", 0.0, 1.5)];
        let way = way_round(start, end, 10_950.0, &heights, &fields).unwrap().unwrap();
        let idents: Vec<&str> = way.iter().map(|s| s.field.as_ref().map_or("", |f| f.0.as_str())).collect();
        assert_eq!(idents, vec!["SOUTH"]);
    }

    #[test]
    fn a_clear_line_needs_no_way_round() {
        let (start, end) = ((0.0, 0.0), (0.0, 3.0));
        let f = frame(start, end);
        let flat = vec![0.0; f.rows * PER_CELL * f.cols * PER_CELL];
        assert!(way_round(start, end, 10_950.0, &flat, &[]).unwrap().unwrap().is_empty());
    }
}
