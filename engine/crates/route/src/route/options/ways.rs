//! The ways over the grid: the quickest over open cells (Dijkstra, in
//! minutes), its turns straightened, its minutes, what it crosses, and
//! what it meets along it.

use super::grid::{Grid, CELL_DEG, PER_CELL};
use super::read::COARSE_MARGIN_FT;
use super::words::r1;
use crate::geo;
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use wingtip_core::grid::{straightened as straighten_turns, way_of, Cell, Costs, Point, Straighten, STEPS};

fn costs<'a>(grid: &'a Grid, gs: &'a Vec<f64>) -> Costs<'a> {
    Costs::new(grid.rows, grid.cols, &grid.closed, &grid.marginal, &grid.dear, &grid.offshore, gs, &grid.ends)
        .expect("the grid's own arrays are its size")
}

/// The minutes from a to b in a straight line, at each cell's best
/// groundspeed the way nearest the line's, marginal cells and those out
/// of glide of land the dearer (core's grid).
pub fn line_minutes(grid: &Grid, gs: &Vec<f64>, a: Point, b: Point, marginal_cost: f64, water_cost: f64) -> f64 {
    let nm = geo::distance_nm(a.0, a.1, b.0, b.1);
    if nm == 0.0 {
        return 0.0;
    }
    costs(grid, gs).minutes(&grid.line_cells(a, b), a, b, nm, marginal_cost, water_cost)
}

pub fn minutes_along(grid: &Grid, gs: &Vec<f64>, path: &[Point]) -> f64 {
    path.windows(2).map(|w| line_minutes(grid, gs, w[0], w[1], 0.0, 0.0)).sum()
}

#[derive(PartialEq)]
struct Spent(f64, usize);

impl Eq for Spent {}

impl Ord for Spent {
    fn cmp(&self, other: &Self) -> Ordering {
        // The least first, from a max-heap.
        other.0.total_cmp(&self.0).then_with(|| other.1.cmp(&self.1))
    }
}

impl PartialOrd for Spent {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// The quickest way over open cells from start's cell to end's (minutes),
/// marginal cells costing `marginal_cost` more of theirs, special-use
/// airspace its own and cells out of glide of land `water_cost` of their
/// share; with `closed_cost`, over closed cells too, each that much the
/// dearer. Dijkstra over the grid's eight ways out of each cell, a step's
/// minutes its miles at the cell's groundspeed that way, weighted by the
/// cell it enters.
pub fn way(
    grid: &Grid, gs: &[f64], start: Point, end: Point, marginal_cost: f64, closed_cost: Option<f64>, water_cost: f64,
) -> Option<Vec<Cell>> {
    let (rows, cols) = (grid.rows, grid.cols);
    let (s, e) = (grid.cell(start), grid.cell(end));
    // A step's miles hang on its row and its way alone: worked out once.
    let step_nm: Vec<[f64; 8]> = (0..rows)
        .map(|r| {
            let lat = grid.geom.lat0 + (r as f64 + 0.5) * CELL_DEG;
            let mut row = [0.0; 8];
            for (k, &(dr, dc)) in STEPS.iter().enumerate() {
                row[k] = geo::distance_nm(lat, 0.0, lat + dr as f64 * CELL_DEG, dc as f64 * CELL_DEG);
            }
            row
        })
        .collect();
    let n = rows * cols;
    let weight: Vec<f64> = (0..n)
        .map(|i| {
            let mut w = 1.0 + grid.dear[i] + if grid.marginal[i] >= 0 { marginal_cost } else { 0.0 } + water_cost * grid.offshore[i];
            if let Some(cc) = closed_cost
                && grid.closed[i] >= 0
            {
                w += cc;
            }
            w
        })
        .collect();
    let usable: Vec<bool> = (0..n)
        .map(|i| closed_cost.is_some() || grid.closed[i] < 0 || grid.ends.contains(&((i / cols) as i64, (i % cols) as i64)))
        .collect();
    let (source, target) = (grid.at(s), grid.at(e));
    let mut spent = vec![f64::INFINITY; n];
    let mut came = vec![usize::MAX; n];
    let mut heap = BinaryHeap::new();
    spent[source] = 0.0;
    heap.push(Spent(0.0, source));
    while let Some(Spent(d, here)) = heap.pop() {
        if d > spent[here] {
            continue;
        }
        if here == target {
            break;
        }
        if !usable[here] {
            continue;
        }
        let (r, c) = ((here / cols) as i64, (here % cols) as i64);
        for (k, &(dr, dc)) in STEPS.iter().enumerate() {
            let (r2, c2) = (r + dr, c + dc);
            if r2 < 0 || r2 >= rows as i64 || c2 < 0 || c2 >= cols as i64 {
                continue;
            }
            let next = r2 as usize * cols + c2 as usize;
            if !usable[next] {
                continue;
            }
            let cost = step_nm[r as usize][k] / gs[here * 8 + k] * 60.0 * weight[next];
            let g = d + cost;
            if g < spent[next] {
                spent[next] = g;
                came[next] = here;
                heap.push(Spent(g, next));
            }
        }
    }
    if !spent[target].is_finite() {
        return None;
    }
    let mut path = vec![target];
    while *path.last().unwrap() != source {
        path.push(came[*path.last().unwrap()]);
    }
    path.reverse();
    Some(path.into_iter().map(|i| ((i / cols) as i64, (i % cols) as i64)).collect())
}

/// The way's turns: from each point the farthest on along it a straight
/// line reaches over open cells -- over no more closed ones than the way
/// itself crossed, where it had to -- no more than `slower_min` slower.
pub fn straightened(grid: &Grid, gs: &Vec<f64>, points: &[Point], marginal_cost: f64, slower_min: f64, water_cost: f64) -> Vec<Point> {
    let leg_nm: Vec<f64> = points.windows(2).map(|w| geo::distance_nm(w[0].0, w[0].1, w[1].0, w[1].1)).collect();
    let from =
        |i: usize| -> Result<Vec<f64>, ()> { Ok(points.iter().map(|p| geo::distance_nm(points[i].0, points[i].1, p.0, p.1)).collect()) };
    let how = Straighten { marginal_cost, slower_min, water_cost };
    match straighten_turns(grid.geom, &costs(grid, gs), points, &leg_nm, from, &how) {
        Ok(turns) => turns.into_iter().map(|k| points[k]).collect(),
        Err(_) => points.to_vec(),
    }
}

/// The hazards a way through `points` crosses -- those that close a cell,
/// or (`marginal`) those that make one marginal -- in order, each once.
pub fn crossed(grid: &Grid, points: &[Point], marginal: bool) -> Vec<i64> {
    let over = if marginal { &grid.marginal } else { &grid.closed };
    let mut out = Vec::new();
    for w in points.windows(2) {
        for c in grid.line_cells(w[0], w[1]) {
            let h = over[grid.at(c)];
            if h >= 0 && !grid.ends.contains(&c) && !out.contains(&h) {
                out.push(h);
            }
        }
    }
    out
}

/// The miles of the line from `a` to `b` out of glide of dry land, read
/// at the water's own samples every half sample, not by its cells'
/// shares: a way along a shore cell's dry side is in glide though the
/// cell is partly far out.
fn far_nm(grid: &Grid, a: Point, b: Point) -> f64 {
    let nm = geo::distance_nm(a.0, a.1, b.0, b.1);
    let Some(far) = grid.far.as_ref() else { return 0.0 };
    if nm <= 0.0 {
        return 0.0;
    }
    let (rows, cols) = (grid.rows * PER_CELL, grid.cols * PER_CELL);
    let step = CELL_DEG / PER_CELL as f64;
    let n = 2usize.max((nm / (step * 60.0 / 2.0)).ceil() as usize + 1);
    let mut out = 0usize;
    for i in 0..n {
        let t = (i as f64 + 0.5) / n as f64;
        let r = (((a.0 + (b.0 - a.0) * t - grid.geom.lat0) / step) as i64).clamp(0, rows as i64 - 1) as usize;
        let c = (((a.1 + (b.1 - a.1) * t - grid.geom.lon0) / step) as i64).clamp(0, cols as i64 - 1) as usize;
        out += far[r * cols + c] as usize;
    }
    nm * out as f64 / n as f64
}

/// What a way meets, cell by cell in the order it flies them.
pub struct Along {
    /// The weather as runs: vfr, mvfr, ifr or storm, and its minutes.
    pub bands: Vec<(&'static str, f64)>,
    /// The mean wind along it, kt, positive a tailwind.
    pub tail_kt: f64,
    /// Its floor: the highest cell's ground with 91.119's 1,000 ft, ft.
    pub floor_ft: i64,
    /// Its miles out of glide of dry land.
    pub water_nm: i64,
}

/// The weather a cell is, for a way's strip: its closing hazard's kind,
/// else marginal, else VFR.
fn weather_of(kind: &str) -> &'static str {
    match kind {
        "storm" => "storm",
        "weather" | "sigmet" => "ifr",
        "marginal" => "mvfr",
        _ => "vfr",
    }
}

pub fn along(grid: &Grid, gs: &Vec<f64>, path: &[Point], tas_kt: f64) -> Along {
    let mut runs: Vec<(&'static str, f64)> = Vec::new();
    let (mut wind_min, mut total, mut floor, mut water) = (0.0, 0.0, 0.0f64, 0.0);
    for w in path.windows(2) {
        let (a, b) = (w[0], w[1]);
        let cells = grid.line_cells(a, b);
        let minutes = line_minutes(grid, gs, a, b, 0.0, 0.0);
        if cells.is_empty() || minutes <= 0.0 {
            continue;
        }
        let each = minutes / cells.len() as f64;
        water += far_nm(grid, a, b);
        let k = way_of(a, b);
        for c in cells {
            let at = grid.at(c);
            let h = grid.closed[at];
            let kind = if h >= 0 {
                weather_of(&grid.hazards[h as usize].kind)
            } else if grid.marginal[at] >= 0 {
                "mvfr"
            } else {
                "vfr"
            };
            match runs.last_mut() {
                Some(last) if last.0 == kind => last.1 += each,
                _ => runs.push((kind, each)),
            }
            wind_min += (gs[at * 8 + k] - tas_kt) * each;
            total += each;
            floor = floor.max(grid.floor[at]);
        }
    }
    Along {
        bands: runs.into_iter().map(|(k, m)| (k, r1(m))).collect(),
        tail_kt: if total > 0.0 { r1(wind_min / total) } else { 0.0 },
        // The highest ground with 91.119's 1,000 ft alone: the coarse
        // read's own margin is the planner's to keep, not the pilot's.
        floor_ft: ((0.0f64.max(floor - COARSE_MARGIN_FT) / 100.0).ceil() * 100.0) as i64,
        water_nm: water.round_ties_even() as i64,
    }
}
