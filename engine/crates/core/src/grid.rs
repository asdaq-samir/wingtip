//! Route options' straight lines over the grid (wingtip.route_options): the
//! cells a line crosses, its minutes, and the loop that straightens a way
//! through cell centres into the fewest turns. Each gives exactly what the
//! Python it stood in for gave -- the same samples, the same sums in the
//! same order -- as the shared fixtures (services/planner/tests_wingtip/fixtures/native) hold it to.

use crate::sums::{pairwise, Neumaier};
use std::collections::{HashMap, HashSet};
use std::marker::PhantomData;

/// A grid's array, read an element at a time: a Vec here, numpy's own
/// memory in the planner, whatever the phone holds later.
pub trait Values<T: Copy> {
    fn at(&self, i: usize) -> T;
    fn count(&self) -> usize;
}

impl<T: Copy> Values<T> for Vec<T> {
    fn at(&self, i: usize) -> T {
        self[i]
    }

    fn count(&self) -> usize {
        self.len()
    }
}

pub type Cell = (i64, i64);
/// (latitude, longitude) in degrees.
pub type Point = (f64, f64);

/// Where the grid is: its corner, its cell's size in degrees, its size.
#[derive(Clone, Copy, Debug)]
pub struct Geom {
    pub lat0: f64,
    pub lon0: f64,
    pub cell: f64,
    pub rows: i64,
    pub cols: i64,
}

impl Geom {
    pub fn new(lat0: f64, lon0: f64, cell: f64, rows: i64, cols: i64) -> Option<Geom> {
        (rows >= 1 && cols >= 1 && cell > 0.0).then_some(Geom { lat0, lon0, cell, rows, cols })
    }
}

/// _Grid.line_cells: the line sampled a third of a cell apart with
/// numpy's linspace (i * (1 / (n - 1)), the last exactly 1), each sample's
/// cell truncated and clipped as astype(int) and np.clip do, a cell kept
/// where it differs from the one before.
pub fn line_cells(g: Geom, a: Point, b: Point) -> Vec<Cell> {
    let span = (b.0 - a.0).abs().max((b.1 - a.1).abs());
    let steps = std::cmp::max(2, (span / (g.cell / 3.0)) as i64 + 1);
    let step = 1.0 / (steps - 1) as f64;
    let (d_lat, d_lon) = (b.0 - a.0, b.1 - a.1);
    let mut out: Vec<Cell> = Vec::with_capacity(steps as usize);
    for i in 0..steps {
        let t = if i == steps - 1 { 1.0 } else { i as f64 * step + 0.0 };
        let r = (((a.0 + d_lat * t) - g.lat0) / g.cell) as i64;
        let c = (((a.1 + d_lon * t) - g.lon0) / g.cell) as i64;
        let cell = (r.clamp(0, g.rows - 1), c.clamp(0, g.cols - 1));
        if out.last() != Some(&cell) {
            out.push(cell);
        }
    }
    out
}

/// The eight ways out of a cell, (rows, columns): rows -1, 0, 1 by
/// columns -1, 0, 1 without (0, 0), as the planner's _STEPS had them. A
/// cell's eight groundspeeds (Costs' `gs`) are laid out in this order.
pub const STEPS: [(i64, i64); 8] = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)];

/// Where (rows, columns) is in STEPS; the first way for (0, 0), which is
/// none of them.
pub fn step_index(dr: i64, dc: i64) -> usize {
    STEPS.iter().position(|&s| s == (dr, dc)).unwrap_or(0)
}

/// The bearing, radians clockwise from true north, of a step of `d_lat`
/// degrees north and `d_lon` east taken at latitude `lat`, on a plane of
/// degrees with longitude shrunk by cos(lat): a degree of longitude is
/// cos(latitude) of one of latitude. The one copy for a grid step's course
/// (route options' groundspeeds) and a line's way (way_of).
pub fn flat_bearing(lat: f64, d_lat: f64, d_lon: f64) -> f64 {
    (d_lon * lat.to_radians().cos()).atan2(d_lat)
}

/// The way in STEPS nearest the line a -> b's bearing, on a plane of
/// degrees with longitude shrunk by the cosine of the mean latitude, each
/// part rounded as Python's round does (half to even). Its cosine and sine
/// cannot both round to 0, so the way is always one of the eight.
pub fn way_of(a: Point, b: Point) -> usize {
    let bearing = flat_bearing((a.0 + b.0) / 2.0, b.0 - a.0, b.1 - a.1);
    step_index(bearing.cos().round_ties_even() as i64, bearing.sin().round_ties_even() as i64)
}

/// The grid's costs: closed and marginal cells (negative where not), the
/// extra cost of dear and offshore cells, and the groundspeed eight ways
/// out of each cell; each the grid's size, rows by columns.
pub struct Costs<'a> {
    cols: usize,
    closed: &'a dyn Values<i64>,
    marginal: &'a dyn Values<i64>,
    dear: &'a dyn Values<f64>,
    offshore: &'a dyn Values<f64>,
    gs: &'a dyn Values<f64>,
    ends: &'a HashSet<Cell>,
}

impl<'a> Costs<'a> {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        rows: usize, cols: usize, closed: &'a dyn Values<i64>, marginal: &'a dyn Values<i64>, dear: &'a dyn Values<f64>,
        offshore: &'a dyn Values<f64>, gs: &'a dyn Values<f64>, ends: &'a HashSet<Cell>,
    ) -> Result<Costs<'a>, &'static str> {
        let n = rows * cols;
        if [closed.count(), marginal.count(), dear.count(), offshore.count()].iter().any(|&l| l != n) || gs.count() != n * 8 {
            return Err("the grid's arrays, each its size, groundspeeds eight ways");
        }
        Ok(Costs { cols, closed, marginal, dear, offshore, gs, ends })
    }

    fn at(&self, c: Cell) -> usize {
        c.0 as usize * self.cols + c.1 as usize
    }

    pub fn is_open(&self, c: Cell) -> bool {
        self.closed.at(self.at(c)) < 0 || self.ends.contains(&c)
    }

    pub fn is_marginal(&self, c: Cell) -> bool {
        self.marginal.at(self.at(c)) >= 0
    }

    /// _line_minutes: the way nearest the line's bearing (Python's round,
    /// half to even), each cell's rate averaged as np.mean does.
    pub fn minutes(&self, cells: &[Cell], a: Point, b: Point, nm: f64, marginal_cost: f64, water_cost: f64) -> f64 {
        if nm == 0.0 {
            return 0.0;
        }
        let k = way_of(a, b);
        let rates: Vec<f64> = cells
            .iter()
            .map(|&c| {
                let at = self.at(c);
                let m = if self.marginal.at(at) >= 0 { marginal_cost } else { 0.0 };
                (1.0 + self.dear.at(at) + m + water_cost * self.offshore.at(at)) / self.gs.at(at * 8 + k)
            })
            .collect();
        nm * (pairwise(&rates) / rates.len() as f64) * 60.0
    }
}

/// What straightening a way asks for beyond the grid.
pub struct Straighten {
    pub marginal_cost: f64,
    pub slower_min: f64,
    pub water_cost: f64,
}

#[derive(Debug)]
pub enum StraightError<E> {
    /// A leg's miles were not given for each pair of points.
    Legs,
    /// The caller's distances failed.
    Distances(E),
}

/// _straightened's turns, as indices into the points: from each turn the
/// farthest point on whose straight line crosses no more closed cells than
/// the way did, is no more than `slower_min` slower, and (with a marginal
/// cost) crosses no more marginal cells. `nm_from(i)` is the distance from
/// point i to the points after it (entries at or before i are not read),
/// asked for only where needed: the planner's are PROJ's own, so the miles
/// are the same wherever the engine runs.
pub fn straightened<E>(
    g: Geom, costs: &Costs, points: &[Point], leg_nm: &[f64], nm_from: impl FnMut(usize) -> Result<Vec<f64>, E>, how: &Straighten,
) -> Result<Vec<usize>, StraightError<E>> {
    Straightener::new(g, costs, points, leg_nm, nm_from, how.marginal_cost, how.water_cost)?.turns(how.slower_min)
}

/// One way's straightening, kept between passes at a growing `slower_min`
/// (route options try up to five until the turns are few enough): each
/// leg's cells and minutes, each turn's sums of the way on, each straight
/// line's closed and marginal cells and minutes, and each distance row
/// depend on the way alone, never on `slower_min`, so each is worked out
/// once and every pass reads the same numbers the one-pass loop did. The
/// turns are exactly `straightened`'s at each `slower_min`.
pub struct Straightener<'c, 'a, E, F: FnMut(usize) -> Result<Vec<f64>, E>> {
    g: Geom,
    costs: &'c Costs<'a>,
    points: &'c [Point],
    mc: f64,
    wc: f64,
    nm_from: F,
    legs: Vec<f64>,
    leg_closed: Vec<Vec<Cell>>,
    leg_marginal: Vec<usize>,
    /// From turn i: the way's closed cells as a set, minutes and marginal
    /// cells to each j.
    ahead: Vec<Option<Ahead>>,
    rows: Vec<Option<Vec<f64>>>,
    /// The line i -> j: None where it crosses more closed cells than the
    /// way (never a turn, whatever the pass); else its minutes and its
    /// marginal cells.
    lines: HashMap<(usize, usize), Option<(f64, usize)>>,
    /// The caller's distances' error, which only `nm_from` names.
    failed: PhantomData<fn() -> E>,
}

struct Ahead {
    crossed: Vec<usize>,
    spent: Vec<f64>,
    marginals: Vec<usize>,
}

impl<'c, 'a, E, F: FnMut(usize) -> Result<Vec<f64>, E>> Straightener<'c, 'a, E, F> {
    pub fn new(
        g: Geom, costs: &'c Costs<'a>, points: &'c [Point], leg_nm: &[f64], nm_from: F, mc: f64, wc: f64,
    ) -> Result<Self, StraightError<E>> {
        let n = points.len();
        if leg_nm.len() + 1 != n {
            return Err(StraightError::Legs);
        }
        let mut legs = Vec::with_capacity(n - 1);
        let mut leg_closed: Vec<Vec<Cell>> = Vec::with_capacity(n - 1);
        let mut leg_marginal = Vec::with_capacity(n - 1);
        for k in 0..n - 1 {
            let cells = line_cells(g, points[k], points[k + 1]);
            legs.push(costs.minutes(&cells, points[k], points[k + 1], leg_nm[k], mc, wc));
            leg_closed.push(cells.iter().copied().filter(|&c| !costs.is_open(c)).collect());
            leg_marginal.push(cells.iter().filter(|&&c| costs.is_marginal(c)).count());
        }
        let (ahead, rows) = ((0..n).map(|_| None).collect(), (0..n).map(|_| None).collect());
        let lines = HashMap::new();
        Ok(Straightener { g, costs, points, mc, wc, nm_from, legs, leg_closed, leg_marginal, ahead, rows, lines, failed: PhantomData })
    }

    /// The way's own from i to each j: its closed cells as a set (a turn's
    /// cell is on both its legs), its minutes as Python's sum() adds them,
    /// and its marginal cells.
    fn ahead_of(&self, i: usize) -> Ahead {
        let n = self.points.len();
        let mut a = Ahead { crossed: vec![0; n], spent: vec![0.0; n], marginals: vec![0; n] };
        let mut seen: HashSet<Cell> = HashSet::new();
        let mut sum = Neumaier::default();
        let mut count = 0usize;
        for j in i + 1..n {
            seen.extend(self.leg_closed[j - 1].iter().copied());
            sum.add(self.legs[j - 1]);
            count += self.leg_marginal[j - 1];
            a.crossed[j] = seen.len();
            a.spent[j] = sum.value();
            a.marginals[j] = count;
        }
        a
    }

    fn line(&mut self, i: usize, j: usize, crossed: usize) -> Result<Option<(f64, usize)>, StraightError<E>> {
        if let Some(&known) = self.lines.get(&(i, j)) {
            return Ok(known);
        }
        let (a, b) = (self.points[i], self.points[j]);
        let cells = line_cells(self.g, a, b);
        let shut = cells.iter().filter(|&&c| !self.costs.is_open(c)).count();
        let got = if shut <= crossed {
            if self.rows[i].is_none() {
                self.rows[i] = Some((self.nm_from)(i).map_err(StraightError::Distances)?);
            }
            let nm = self.rows[i].as_ref().unwrap()[j];
            let minutes = self.costs.minutes(&cells, a, b, nm, self.mc, self.wc);
            Some((minutes, cells.iter().filter(|&&c| self.costs.is_marginal(c)).count()))
        } else {
            None
        };
        self.lines.insert((i, j), got);
        Ok(got)
    }

    /// The turns at `slower_min`, as `straightened` gives them.
    pub fn turns(&mut self, slower_min: f64) -> Result<Vec<usize>, StraightError<E>> {
        let n = self.points.len();
        let mut out = vec![0usize];
        let mut i = 0usize;
        while i + 1 < n {
            if self.ahead[i].is_none() {
                self.ahead[i] = Some(self.ahead_of(i));
            }
            let ahead = self.ahead[i].take().unwrap();
            let mut j = n - 1;
            let mut failed = None;
            while j > i + 1 {
                match self.line(i, j, ahead.crossed[j]) {
                    Err(e) => {
                        failed = Some(e);
                        break;
                    }
                    Ok(Some((minutes, marginal)))
                        if minutes <= ahead.spent[j] + slower_min && (self.mc == 0.0 || marginal <= ahead.marginals[j]) =>
                    {
                        break;
                    }
                    Ok(_) => {}
                }
                j -= 1;
            }
            self.ahead[i] = Some(ahead);
            if let Some(e) = failed {
                return Err(e);
            }
            out.push(j);
            i = j;
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_line_along_a_row_crosses_each_cell_once() {
        let g = Geom::new(40.0, -100.0, 0.25, 4, 10).unwrap();
        let cells = line_cells(g, (40.125, -99.875), (40.125, -97.625));
        assert_eq!(cells, (0..10).map(|c| (0, c)).collect::<Vec<_>>());
    }

    #[test]
    fn a_line_off_the_grid_is_clipped_to_its_edge() {
        let g = Geom::new(40.0, -100.0, 0.25, 2, 2).unwrap();
        assert_eq!(line_cells(g, (39.0, -101.0), (39.0, -101.0)), vec![(0, 0)]);
        assert!(Geom::new(0.0, 0.0, 0.0, 1, 1).is_none());
    }

    #[test]
    fn a_line_takes_the_way_nearest_its_bearing() {
        // North is a row up, east a column on; north-east both; and the
        // index is where the way sits in STEPS, the gs layout's order.
        assert_eq!(STEPS[way_of((40.0, -100.0), (41.0, -100.0))], (1, 0));
        assert_eq!(STEPS[way_of((40.0, -100.0), (40.0, -99.0))], (0, 1));
        assert_eq!(STEPS[way_of((40.0, -100.0), (39.0, -101.3))], (-1, -1));
        assert_eq!(way_of((40.0, -100.0), (40.0, -100.0)), step_index(1, 0));
        assert_eq!((0..8).map(|k| step_index(STEPS[k].0, STEPS[k].1)).collect::<Vec<_>>(), (0..8).collect::<Vec<_>>());
    }

    #[test]
    fn a_kept_straightener_turns_as_a_fresh_one_at_each_pass() {
        // A way through a grid with a closed block and a marginal strip:
        // every pass of one Straightener gives the one-pass turns, and each
        // point's distances are asked for once in all.
        let g = Geom::new(40.0, -100.0, 0.25, 6, 12).unwrap();
        let n = 6 * 12;
        let closed: Vec<i64> = (0..n).map(|i| if (i / 12 == 2 || i / 12 == 3) && (4..7).contains(&(i % 12)) { 0 } else { -1 }).collect();
        let marginal: Vec<i64> = (0..n).map(|i| if i % 12 == 9 { 1 } else { -1 }).collect();
        let dear = vec![0.0; n];
        let offshore: Vec<f64> = (0..n).map(|i| if i / 12 == 0 { 0.5 } else { 0.0 }).collect();
        let gs: Vec<f64> = (0..n * 8).map(|k| 100.0 + (k % 8) as f64 * 3.0).collect();
        let ends = HashSet::new();
        let costs = Costs::new(6, 12, &closed, &marginal, &dear, &offshore, &gs, &ends).unwrap();
        let centre = |r: i64, c: i64| (40.0 + (r as f64 + 0.5) * 0.25, -100.0 + (c as f64 + 0.5) * 0.25);
        let path = [(1, 0), (1, 1), (1, 2), (1, 3), (0, 4), (0, 5), (0, 6), (1, 7), (2, 8), (3, 9), (4, 10), (4, 11)];
        let points: Vec<Point> = path.iter().map(|&(r, c)| centre(r, c)).collect();
        let flat = |a: Point, b: Point| ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt() * 60.0;
        let leg_nm: Vec<f64> = points.windows(2).map(|w| flat(w[0], w[1])).collect();
        let row = |i: usize| -> Result<Vec<f64>, ()> { Ok(points.iter().map(|&p| flat(points[i], p)).collect()) };
        for mc in [0.0, 0.5] {
            let asked = std::cell::Cell::new(vec![0usize; points.len()]);
            let counted = |i: usize| {
                let mut a = asked.take();
                a[i] += 1;
                asked.set(a);
                row(i)
            };
            let mut kept = Straightener::new(g, &costs, &points, &leg_nm, counted, mc, 1.0).unwrap();
            for slower in [0.0, 1.0, 3.0, 6.0, 12.0, 24.0] {
                let how = Straighten { marginal_cost: mc, slower_min: slower, water_cost: 1.0 };
                assert_eq!(kept.turns(slower).unwrap(), straightened(g, &costs, &points, &leg_nm, row, &how).unwrap(), "{mc} {slower}");
            }
            drop(kept);
            assert!(asked.take().iter().all(|&k| k <= 1));
        }
    }
}
