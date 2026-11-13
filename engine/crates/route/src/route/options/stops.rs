//! The fuel stops along a way: the fields with 100LL on a long enough
//! paved runway near it, chained so every flight between landings lands
//! with the reserve (14 CFR 91.151), the fewest minutes or the fewest
//! landings, and among chains of as many landings the one with somewhere
//! to eat.

use super::ask::Field;
use super::grid::Grid;
use super::ways::line_minutes;
use crate::geo;
use std::cell::RefCell;
use wingtip_core::grid::Point;
use wingtip_core::sort::StableSort;

/// The fields with fuel looked at for a stop, nm off the way.
pub const STOP_FIELD_NM: f64 = 15.0;
/// Minutes on the ground at each stop: the owner's 30-minute turnaround
/// (2026-10-20), the flight crate's, as the nav log and the apps count it.
pub const TURNAROUND_MIN: f64 = wingtip_flight::flight::TURNAROUND_MIN;
/// How many minutes more a fuel stop in marginal weather costs than one
/// in the clear (three times that for the best weather's way): the
/// planner's own figure, half an hour's flying past one to a field in VFR.
pub const MARGINAL_STOP_MIN: f64 = 30.0;
/// How many minutes a fuel stop with somewhere to eat on the field or a
/// walk from it is worth, among chains of as many stops: never the price
/// of another landing (the owner's "try to find a fuel stop that also has
/// food while still maintaining min stops", 2026-10-27). The planner's
/// own figure, a third of an hour.
pub const FOOD_CREDIT_MIN: f64 = 20.0;
/// The shortest runway a stop is offered on, feet, paved: a suggestion a
/// pilot would turn down on sight -- a turf strip, a 1,800 ft runway --
/// is no help. Not a rule; the pilot still judges the field (14 CFR
/// 91.103(b)).
pub const MIN_RUNWAY_FT: f64 = 2500.0;
/// The way is sampled this often, nm, for each field's nearest point on it.
const SAMPLE_NM: f64 = 5.0;

#[derive(Clone, Debug)]
pub struct Stop {
    /// Minutes along the way to its nearest point.
    pub at: f64,
    /// Its miles off the way.
    pub off: f64,
    pub ident: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    /// The minutes more it costs to land at, its weather.
    pub dear: f64,
    pub food: bool,
}

pub struct Fuel<'a> {
    pub tas_kt: f64,
    pub burn_gph: f64,
    pub usable_gal: f64,
    pub taxi_gal: f64,
    pub reserve_gal: f64,
    /// The fields with fuel, the route's own left out; None where they
    /// could not be read.
    pub fields: Option<&'a [Field]>,
    /// Whether somewhere to eat is weighed.
    pub food: bool,
    /// The fields weighed whose places to eat were not read yet (ident,
    /// lat, lon), for the planner to read on the side.
    pub unread: RefCell<Vec<(String, f64, f64)>>,
}

impl Fuel<'_> {
    fn reach_gal(&self) -> f64 {
        self.usable_gal - self.taxi_gal - self.reserve_gal
    }
}

/// The fields to land at for fuel along `way`: those within STOP_FIELD_NM
/// of it in open cells, each flight landing with the reserve -- the fewest
/// minutes, TURNAROUND_MIN at each, or the fewest landings (`fewest`). Not
/// a field whose way in or out from the way crosses a closed cell, nor one
/// closed itself; one in marginal weather costing `marginal_stop_min`
/// more, so a field in the clear a little further on is landed at instead
/// (the owner's "Or even a different fuel stop to avoid weather?",
/// 2026-10-25). Some([]) where the tanks reach; None where no chain of
/// fields does (or no table of fields could be had).
pub fn stops(grid: &Grid, gs: &Vec<f64>, way: &[Point], fuel: &Fuel, fewest: bool, marginal_stop_min: f64) -> Option<Vec<Stop>> {
    let tas = fuel.tas_kt.max(1.0);
    let gph = fuel.burn_gph;
    let reach_gal = fuel.reach_gal();
    if fuel.usable_gal <= 0.0 || gph <= 0.0 || reach_gal <= 0.0 {
        return Some(Vec::new());
    }
    let mut along_nm = vec![0.0];
    let mut along_min = vec![0.0];
    for w in way.windows(2) {
        along_nm.push(along_nm.last().unwrap() + geo::distance_nm(w[0].0, w[0].1, w[1].0, w[1].1));
        along_min.push(along_min.last().unwrap() + line_minutes(grid, gs, w[0], w[1], 0.0, 0.0));
    }
    let total_min = *along_min.last().unwrap();
    if total_min / 60.0 * gph <= reach_gal {
        return Some(Vec::new());
    }
    let fields = fuel.fields?;
    // Only the fields round the way.
    let min_lat = way.iter().map(|p| p.0).fold(f64::INFINITY, f64::min);
    let max_lat = way.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max);
    let min_lon = way.iter().map(|p| p.1).fold(f64::INFINITY, f64::min);
    let max_lon = way.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max);
    // STOP_FIELD_NM and the tenth of a degree (6 nm) it always had beyond.
    let (s, w, n, e) = geo::corridor_bbox((min_lat, min_lon), (max_lat, max_lon), STOP_FIELD_NM + 6.0);
    let near: Vec<&Field> = fields.iter().filter(|f| f.lat >= s && f.lat <= n && f.lon >= w && f.lon <= e).collect();
    if near.is_empty() {
        return None;
    }
    // The way sampled every SAMPLE_NM, each field's nearest sample (the
    // first where two are as near).
    let mut samples: Vec<(f64, f64, f64)> = Vec::new();
    for (k, w) in way.windows(2).enumerate() {
        let seg = along_nm[k + 1] - along_nm[k];
        let n = 2usize.max((seg / SAMPLE_NM) as usize + 1);
        for i in 0..n {
            let t = if i == n - 1 { 1.0 } else { i as f64 / (n - 1) as f64 };
            samples.push((
                w[0].0 + (w[1].0 - w[0].0) * t,
                w[0].1 + (w[1].1 - w[0].1) * t,
                along_min[k] + (along_min[k + 1] - along_min[k]) * t,
            ));
        }
    }
    let mut found: Vec<(f64, f64, (f64, f64), &Field)> = near
        .iter()
        .map(|f| {
            let mut best = (f64::INFINITY, 0usize);
            for (i, s) in samples.iter().enumerate() {
                let d = geo::distance_nm(s.0, s.1, f.lat, f.lon);
                if d < best.0 {
                    best = (d, i);
                }
            }
            let s = samples[best.1];
            (s.2, best.0, (s.0, s.1), *f)
        })
        .collect();
    found.stable_sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut nodes = vec![Stop { at: 0.0, off: 0.0, ident: String::new(), name: String::new(), lat: 0.0, lon: 0.0, dear: 0.0, food: false }];
    for (at, off, on_way, f) in found {
        if off > STOP_FIELD_NM || !(0.0 < at && at < total_min) {
            continue;
        }
        let cell = grid.cell((f.lat, f.lon));
        if grid.closed[grid.at(cell)] >= 0 {
            continue;
        }
        // Its way in and out from the way: not through a storm or weather
        // under the minimums the way itself went round.
        if !grid.line_open(on_way, (f.lat, f.lon)) {
            continue;
        }
        if f.runway_ft < MIN_RUNWAY_FT {
            continue;
        }
        if fuel.food && f.food.is_none() && !fuel.unread.borrow().iter().any(|u| u.0 == f.ident) {
            fuel.unread.borrow_mut().push((f.ident.clone(), f.lat, f.lon));
        }
        nodes.push(Stop {
            at,
            off,
            ident: f.ident.clone(),
            name: f.name.clone(),
            lat: f.lat,
            lon: f.lon,
            dear: if grid.is_marginal(cell) { marginal_stop_min } else { 0.0 },
            food: fuel.food && f.food == Some(true),
        });
    }
    nodes.push(Stop { at: total_min, off: 0.0, ident: String::new(), name: String::new(), lat: 0.0, lon: 0.0, dear: 0.0, food: false });
    let count = nodes.len();
    let leg = |i: usize, j: usize| nodes[j].at - nodes[i].at + (nodes[i].off + nodes[j].off) / tas * 60.0;
    let mut best = vec![f64::INFINITY; count];
    let mut prev: Vec<Option<usize>> = vec![None; count];
    best[0] = 0.0;
    for j in 1..count {
        for i in 0..j {
            if !best[i].is_finite() {
                continue;
            }
            let minutes = leg(i, j);
            if minutes / 60.0 * gph > reach_gal {
                continue;
            }
            let landing = if j == count - 1 { 0.0 } else { (if fewest { 1e6 } else { 0.0 }) + TURNAROUND_MIN + nodes[j].dear };
            let cost = best[i] + minutes + landing;
            if cost < best[j] {
                best[j] = cost;
                prev[j] = Some(i);
            }
        }
    }
    if !best[count - 1].is_finite() {
        return None;
    }
    let mut chain = Vec::new();
    let mut at = prev[count - 1];
    while let Some(i) = at {
        if i == 0 {
            break;
        }
        chain.push(nodes[i].clone());
        at = prev[i];
    }
    chain.reverse();
    if fuel.food && !chain.is_empty() && !chain.iter().all(|n| n.food) {
        return Some(with_food(&nodes, chain.len(), tas, gph, reach_gal).unwrap_or(chain));
    }
    Some(chain)
}

/// The chain of exactly `landings` stops through `nodes` (the way's ends
/// first and last) costing least, a stop where there is somewhere to eat
/// costing FOOD_CREDIT_MIN less: as many landings as the best chain, the
/// meal taken where it is on the way or near it.
fn with_food(nodes: &[Stop], landings: usize, tas: f64, gph: f64, reach_gal: f64) -> Option<Vec<Stop>> {
    let count = nodes.len();
    let mut best = vec![vec![f64::INFINITY; landings + 1]; count];
    let mut prev: Vec<Vec<Option<(usize, usize)>>> = vec![vec![None; landings + 1]; count];
    best[0][0] = 0.0;
    for j in 1..count {
        let last = j == count - 1;
        for i in 0..j {
            let minutes = nodes[j].at - nodes[i].at + (nodes[i].off + nodes[j].off) / tas * 60.0;
            if minutes / 60.0 * gph > reach_gal {
                continue;
            }
            for k in 0..=landings {
                if !best[i][k].is_finite() {
                    continue;
                }
                let to = if last { k } else { k + 1 };
                if to > landings {
                    continue;
                }
                let landing = if last { 0.0 } else { TURNAROUND_MIN + nodes[j].dear - if nodes[j].food { FOOD_CREDIT_MIN } else { 0.0 } };
                let cost = best[i][k] + minutes + landing;
                if cost < best[j][to] {
                    best[j][to] = cost;
                    prev[j][to] = Some((i, k));
                }
            }
        }
    }
    if !best[count - 1][landings].is_finite() {
        return None;
    }
    let mut chain = Vec::new();
    let mut at = prev[count - 1][landings];
    while let Some((i, k)) = at {
        if i == 0 {
            break;
        }
        chain.push(nodes[i].clone());
        at = prev[i][k];
    }
    chain.reverse();
    Some(chain)
}
