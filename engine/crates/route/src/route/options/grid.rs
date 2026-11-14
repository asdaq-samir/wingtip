//! The cells round a route (route options' cost grid): where each is,
//! what closes it and what makes it marginal, what is dearer to cross,
//! its ground and its share out of glide of dry land. Its frame -- where
//! the cells are -- is worked out from the route's ends alone, so the
//! planner can read the ground and the shores at the cells' samples
//! before it asks for the ways (`frame`).

use crate::geo;
use std::collections::HashSet;
use wingtip_core::flat::Flat;
use wingtip_core::grid::{line_cells, Cell, Geom, Point};

/// The grid's cells, degrees: about 15 nm, as the terrain way round's.
pub const CELL_DEG: f64 = 0.25;
/// Samples a cell's side for the ground and the water: five, so the
/// highest of 25 points is the cell's ground (the terrain tiles' coarse
/// zoom is about 0.02 degrees a pixel, so five a quarter-degree side
/// reads every few pixels).
pub const PER_CELL: usize = 5;
/// How far round the route the grid reaches, a share of its length,
/// nm at least and at most: room to go round a line of storms.
pub const REACH_SHARE: f64 = 0.3;
pub const REACH_MIN_NM: f64 = 60.0;
pub const REACH_MAX_NM: f64 = 180.0;

/// Where the cells are round a route from `start` to `end` and the
/// pilot's own points `via`: the straight line's reach every way, round
/// every point -- a point outside the grid was clamped to its edge, and
/// the route read against cells it never flew (the audit of 2026-10-24).
/// The box is core's corridor_bbox round all of them, so the reach east
/// and west is measured at the box's poleward edge, a via point's too,
/// not at the mean of the ends' latitudes.
pub fn frame(start: Point, end: Point, via: &[Point]) -> Geom {
    let length = geo::distance_nm(start.0, start.1, end.0, end.1);
    let reach = REACH_MAX_NM.min(REACH_MIN_NM.max(length * REACH_SHARE));
    let points: Vec<Point> = [start, end].into_iter().chain(via.iter().copied()).collect();
    let min_lat = points.iter().map(|p| p.0).fold(f64::INFINITY, f64::min);
    let max_lat = points.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max);
    let min_lon = points.iter().map(|p| p.1).fold(f64::INFINITY, f64::min);
    let max_lon = points.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max);
    let (lat0, lon0, north, east) = geo::corridor_bbox((min_lat, min_lon), (max_lat, max_lon), reach);
    let rows = ((north - lat0) / CELL_DEG).ceil() as i64;
    let cols = ((east - lon0) / CELL_DEG).ceil() as i64;
    Geom { lat0, lon0, cell: CELL_DEG, rows: rows.max(1), cols: cols.max(1) }
}

/// What closes a cell or marks it, said once for every cell it covers.
#[derive(Clone, Debug, PartialEq)]
pub struct Hazard {
    pub kind: String,
    pub name: String,
}

pub struct Grid {
    pub geom: Geom,
    pub rows: usize,
    pub cols: usize,
    /// Each row's and each column's centre, degrees.
    pub lats: Vec<f64>,
    pub lons: Vec<f64>,
    /// The hazard (an index into `hazards`) that closes each cell, -1 open.
    pub closed: Vec<i64>,
    /// The hazard that makes each cell marginal, -1 none.
    pub marginal: Vec<i64>,
    /// What costs more to cross, for every way: special-use airspace.
    pub dear: Vec<f64>,
    /// The special-use areas (hazards) over each cell that a way is told
    /// it crosses but may fly: restricted, MOA, warning and alert areas
    /// (special_use.rs). A cell may lie in more than one.
    pub special: Vec<Vec<i64>>,
    /// Each cell's share out of glide of dry land, 0 to 1.
    pub offshore: Vec<f64>,
    /// Every water sample, PER_CELL a cell's side, true out of glide;
    /// None where the shores were not read.
    pub far: Option<Vec<bool>>,
    /// Each cell's floor, ft: its highest ground with 91.119's 1,000 ft
    /// and the coarse read's margin.
    pub floor: Vec<f64>,
    pub hazards: Vec<Hazard>,
    /// The route's own ends' cells, open whatever closes them: a field in
    /// a high valley or under its own weather is still flown from.
    pub ends: HashSet<Cell>,
}

impl Grid {
    pub fn new(start: Point, end: Point, via: &[Point]) -> Grid {
        let geom = frame(start, end, via);
        let (rows, cols) = (geom.rows as usize, geom.cols as usize);
        let n = rows * cols;
        let mut grid = Grid {
            geom,
            rows,
            cols,
            lats: (0..rows).map(|r| geom.lat0 + (r as f64 + 0.5) * CELL_DEG).collect(),
            lons: (0..cols).map(|c| geom.lon0 + (c as f64 + 0.5) * CELL_DEG).collect(),
            closed: vec![-1; n],
            marginal: vec![-1; n],
            dear: vec![0.0; n],
            special: vec![Vec::new(); n],
            offshore: vec![0.0; n],
            far: None,
            floor: vec![0.0; n],
            hazards: Vec::new(),
            ends: HashSet::new(),
        };
        grid.ends = [grid.cell(start), grid.cell(end)].into_iter().collect();
        grid
    }

    /// (south, west, north, east), degrees.
    pub fn bbox(&self) -> (f64, f64, f64, f64) {
        let g = self.geom;
        (g.lat0, g.lon0, g.lat0 + self.rows as f64 * CELL_DEG, g.lon0 + self.cols as f64 * CELL_DEG)
    }

    pub fn at(&self, c: Cell) -> usize {
        c.0 as usize * self.cols + c.1 as usize
    }

    pub fn cell(&self, p: Point) -> Cell {
        let r = ((p.0 - self.geom.lat0) / CELL_DEG) as i64;
        let c = ((p.1 - self.geom.lon0) / CELL_DEG) as i64;
        (r.clamp(0, self.rows as i64 - 1), c.clamp(0, self.cols as i64 - 1))
    }

    pub fn centre(&self, c: Cell) -> Point {
        (self.lats[c.0 as usize], self.lons[c.1 as usize])
    }

    /// The index of a hazard, the same one for the same words.
    pub fn hazard(&mut self, kind: &str, name: &str) -> i64 {
        if let Some(i) = self.hazards.iter().position(|h| h.kind == kind && h.name == name) {
            return i as i64;
        }
        self.hazards.push(Hazard { kind: kind.to_owned(), name: name.to_owned() });
        self.hazards.len() as i64 - 1
    }

    /// The cells `at` closed by a hazard, where nothing closed them first.
    pub fn close(&mut self, at: &[usize], kind: &str, name: &str) {
        if at.is_empty() {
            return;
        }
        let h = self.hazard(kind, name);
        for &i in at {
            if self.closed[i] < 0 {
                self.closed[i] = h;
            }
        }
    }

    /// The cells `at` in a special-use area a way may cross, said once.
    pub fn mark_special(&mut self, at: &[usize], kind: &str, name: &str) {
        if at.is_empty() {
            return;
        }
        let h = self.hazard(kind, name);
        for &i in at {
            if !self.special[i].contains(&h) {
                self.special[i].push(h);
            }
        }
    }

    /// The cells `at` marked marginal by a hazard, where nothing marked
    /// them first.
    pub fn mark(&mut self, at: &[usize], kind: &str, name: &str) {
        if at.is_empty() {
            return;
        }
        let h = self.hazard(kind, name);
        for &i in at {
            if self.marginal[i] < 0 {
                self.marginal[i] = h;
            }
        }
    }

    /// The cells within `nm` of a point, measured only in the box that can
    /// hold them: core's box_around a tenth wider and a cell beyond, a box
    /// that holds the whole circle wherever the grid can be. A field's weather asked of the whole grid was a long
    /// route's second and a half (2026-10-27).
    pub fn near(&self, lat: f64, lon: f64, nm: f64) -> Vec<usize> {
        let (s, w, n, e) = geo::box_around(lat, lon, 1.1 * nm);
        let (r0, c0) = self.cell((s - CELL_DEG, w - CELL_DEG));
        let (r1, c1) = self.cell((n + CELL_DEG, e + CELL_DEG));
        let mut out = Vec::new();
        for r in r0..=r1 {
            for c in c0..=c1 {
                if geo::distance_nm(lat, lon, self.lats[r as usize], self.lons[c as usize]) <= nm {
                    out.push(self.at((r, c)));
                }
            }
        }
        out
    }

    pub fn open(&self, c: Cell) -> bool {
        self.closed[self.at(c)] < 0 || self.ends.contains(&c)
    }

    pub fn is_marginal(&self, c: Cell) -> bool {
        self.marginal[self.at(c)] >= 0
    }

    /// The cells a straight line crosses, in order (core's grid).
    pub fn line_cells(&self, a: Point, b: Point) -> Vec<Cell> {
        line_cells(self.geom, a, b)
    }

    pub fn line_open(&self, a: Point, b: Point) -> bool {
        self.line_cells(a, b).into_iter().all(|c| self.open(c))
    }

    /// The cells an area holds, or comes within `margin_nm` of, the same
    /// miles every way (AIM 7-1-27's 20 nm round a convective SIGMET, the
    /// planner's mile round a prohibited area or a TFR): the area's box
    /// padded by core's corridor_bbox, each cell's distance to its edges
    /// measured in miles on a flat frame about the cell.
    pub fn in_area(&self, area: &Area, margin_nm: f64) -> Vec<usize> {
        let (s, w, n, e) = area.bounds();
        let (s, w, n, e) = geo::corridor_bbox((s, w), (n, e), margin_nm);
        let (r0, c0) = self.cell((s - CELL_DEG, w - CELL_DEG));
        let (r1, c1) = self.cell((n + CELL_DEG, e + CELL_DEG));
        let mut out = Vec::new();
        for r in r0..=r1 {
            for c in c0..=c1 {
                let (lat, lon) = (self.lats[r as usize], self.lons[c as usize]);
                if area.contains(lat, lon) || (margin_nm > 0.0 && area.edge_distance_nm(lat, lon) <= margin_nm) {
                    out.push(self.at((r, c)));
                }
            }
        }
        out
    }
}

/// An area on the chart as the FAA's and the AWC's data draw it: rings of
/// (lat, lon), the first its outline, any others its holes or further
/// parts, a point inside where an odd number of rings hold it -- as
/// shapely's contains_xy over a polygon made valid with buffer(0).
#[derive(Clone, Debug, Default)]
pub struct Area {
    pub rings: Vec<Vec<Point>>,
}

impl Area {
    pub fn bounds(&self) -> (f64, f64, f64, f64) {
        let mut b = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
        for p in self.rings.iter().flatten() {
            b = (b.0.min(p.0), b.1.min(p.1), b.2.max(p.0), b.3.max(p.1));
        }
        b
    }

    pub fn contains(&self, lat: f64, lon: f64) -> bool {
        let mut inside = false;
        for ring in &self.rings {
            let n = ring.len();
            if n < 3 {
                continue;
            }
            let mut j = n - 1;
            for i in 0..n {
                let (yi, xi) = ring[i];
                let (yj, xj) = ring[j];
                if (yi > lat) != (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi {
                    inside = !inside;
                }
                j = i;
            }
        }
        inside
    }

    /// The least distance from a point to the area's edges, nm, on core's
    /// flat frame about the point (a minute of latitude a mile, of
    /// longitude cos(latitude) of one): a margin of a mile or 20 is well
    /// inside the 15 to 30 nm the frame holds to within 1%.
    pub fn edge_distance_nm(&self, lat: f64, lon: f64) -> f64 {
        let flat = Flat::about(lat, lon);
        let mut best = f64::INFINITY;
        for ring in &self.rings {
            let n = ring.len();
            for i in 0..n {
                let (ax, ay) = flat.nm(ring[i].0, ring[i].1);
                let (bx, by) = flat.nm(ring[(i + 1) % n].0, ring[(i + 1) % n].1);
                let (dx, dy) = (bx - ax, by - ay);
                let len = dx * dx + dy * dy;
                let t = if len > 0.0 { (-(ax * dx + ay * dy) / len).clamp(0.0, 1.0) } else { 0.0 };
                let (px, py) = (ax + dx * t, ay + dy * t);
                best = best.min((px * px + py * py).sqrt());
            }
        }
        best
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bbox_grid() -> Grid {
        Grid::new((42.2, -88.0), (39.8, -104.7), &[])
    }

    #[test]
    fn the_cells_near_a_point_are_the_whole_grids_measure_in_its_box() {
        // near() measures only the box round the point: the same cells as
        // measuring every one, for points on, off and at the grid's edge.
        for (start, end) in [((42.2, -88.0), (39.8, -104.7)), ((25.8, -80.3), (47.5, -122.3)), ((61.2, -150.0), (64.8, -147.9))] {
            let grid = Grid::new(start, end, &[]);
            let mut seed = 7u64;
            let mut next = || {
                seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                (seed >> 11) as f64 / (1u64 << 53) as f64
            };
            for _ in 0..40 {
                let lat = grid.geom.lat0 - 0.5 + next() * (grid.rows as f64 * CELL_DEG + 1.0);
                let lon = grid.geom.lon0 - 0.5 + next() * (grid.cols as f64 * CELL_DEG + 1.0);
                for nm in [20.0, 10.0, 30.0] {
                    let mut whole = Vec::new();
                    for r in 0..grid.rows {
                        for c in 0..grid.cols {
                            if geo::distance_nm(lat, lon, grid.lats[r], grid.lons[c]) <= nm {
                                whole.push(r * grid.cols + c);
                            }
                        }
                    }
                    assert_eq!(grid.near(lat, lon, nm), whole);
                }
            }
        }
    }

    #[test]
    fn an_area_holds_its_inside_and_its_margin() {
        let area = Area { rings: vec![vec![(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0)]] };
        assert!(area.contains(0.5, 0.5));
        assert!(!area.contains(1.5, 0.5));
        // Half a degree north of the top edge: 30 nm. And half a degree
        // east of the side at 60 N, half that: a mile is a mile every way.
        assert!((area.edge_distance_nm(1.5, 0.5) - 30.0).abs() < 1e-9);
        let north = Area { rings: vec![vec![(59.0, 0.0), (59.0, 1.0), (61.0, 1.0), (61.0, 0.0)]] };
        let east = north.edge_distance_nm(60.0, 1.5);
        assert!((east - 15.0).abs() < 1e-6, "{east}");
        let grid = bbox_grid();
        assert!(grid.rows > 0 && grid.cols > 0);
    }
}
