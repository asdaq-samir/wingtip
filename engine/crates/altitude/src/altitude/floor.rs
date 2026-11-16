//! The floor of each leg: under VFR the terrain and obstacles' with 14 CFR
//! 91.119's clearances, under IFR 91.177(a)'s minimum IFR altitude. The
//! planner reads the ground (USGS 3DEP by way of its grid and tiles), the
//! FAA's Digital Obstacle File and the towns (Census urban areas and
//! gazetteer places) and passes them in; the clearances are here.

use super::mountainous;
use super::track::{from_segment_nm, pieces, track_nm, Point};

/// 14 CFR 91.119(b): over a congested area, 1,000 ft above the highest
/// obstacle within a horizontal radius of 2,000 ft of the aircraft.
pub const CONGESTED_CLEARANCE_FT: f64 = 1000.0;
/// 14 CFR 91.119(c): 500 ft above the surface elsewhere; over open water
/// or sparsely populated areas, no closer than 500 ft to any person,
/// vessel, vehicle or structure -- at least 500 ft over a structure's top.
pub const OTHER_CLEARANCE_FT: f64 = 500.0;
/// The floor's own margin over the ground everywhere: the owner's for the
/// altitude plans ("every 500 ft below 3,000 AGL over a floor 1,000 ft
/// above the ground"), above 91.119(c)'s 500 and equal to (b)'s, as the
/// planner cannot tell a town's ground from a field's at every sample.
pub const PLANNING_GROUND_MARGIN_FT: f64 = 1000.0;
/// How far off the line an obstacle still counts for the VFR floor: wider
/// than 91.119(b)'s 2,000 ft, so the floor tolerates the airplane off its
/// line.
pub const CORRIDOR_HALF_WIDTH_NM: f64 = 5.0;
/// Feet in the hundred a floor is rounded up to, as a sectional's Maximum
/// Elevation Figure is.
pub const ROUND_FT: f64 = 100.0;

/// 14 CFR 91.177(a)(2): the highest obstacle within 4 nm of the course.
pub const IFR_OBSTACLE_RADIUS_NM: f64 = 4.0;
/// 91.177(a)(2)(ii): 1,000 ft above it ...
pub const IFR_CLEARANCE_FT: f64 = 1000.0;
/// ... and (i): 2,000 ft over a mountainous area Part 95 designates.
pub const IFR_MOUNTAINOUS_CLEARANCE_FT: f64 = 2000.0;
/// A leg is measured in pieces no longer than this, each flat on its own
/// (wingtip.ifr's PIECE_NM).
pub const IFR_PIECE_NM: f64 = 10.0;

fn round_up(ft: f64) -> f64 {
    (ft / ROUND_FT).ceil() * ROUND_FT
}

/// The ground along the route's direct line: each sample's distance from
/// the start, its highest and lowest ground (feet MSL), and whether it is
/// over a congested area -- None for every sample where the towns could
/// not be read.
pub struct Ground {
    pub along_nm: Vec<f64>,
    pub high_ft: Vec<f64>,
    pub low_ft: Vec<f64>,
    pub congested: Option<Vec<bool>>,
}

/// A DOF obstacle: where it stands, its top (feet MSL), its type (TOWER,
/// BLDG ...), and whether it is over or within 2,000 ft of a town.
pub struct Obstacle {
    pub at: Point,
    pub amsl_ft: f64,
    pub kind: Option<String>,
    pub congested: bool,
}

/// One leg's VFR floor and 91.119's own minimum under it (the floor is at
/// or above it: the ground takes the planner's 1,000 ft everywhere).
#[derive(Debug, Clone, PartialEq)]
pub struct VfrFloor {
    pub floor_ft: f64,
    /// The lowest ground under the leg: 3,000 ft above it is where 91.159
    /// begins to apply over the whole leg.
    pub lowest_ground_ft: f64,
    /// The ground or obstacle whose top plus its clearance is highest.
    pub highest_ft: f64,
    pub highest_is_obstacle: bool,
    pub obstacle_type: Option<String>,
    pub clearance_ft: f64,
    /// 91.119(b)'s congested area; None where the towns were not known
    /// and it took the 1,000 ft anyway.
    pub congested: Option<bool>,
}

/// The VFR floor of each piece of the route between consecutive
/// `breaks_nm` (along-track distances from `start`, 0 to its length): the
/// higher of the ground plus PLANNING_GROUND_MARGIN_FT and each obstacle's
/// top plus 91.119's clearance where it stands -- 1,000 ft over or within
/// 2,000 ft of a congested area, 500 elsewhere, 1,000 everywhere where the
/// towns are not known (the safer answer) -- rounded up to the next 100.
/// Each piece also sees one sample beyond either end, and obstacles the
/// corridor's half-width beyond, so what sits at a boundary counts for
/// both legs. Err where a piece has no ground under it.
pub fn vfr(start: Point, end: Point, breaks_nm: &[f64], ground: &Ground, obstacles: &[Obstacle]) -> Result<Vec<VfrFloor>, String> {
    let known = ground.congested.is_some();
    let clearance = |over_town: bool| if over_town || !known { CONGESTED_CLEARANCE_FT } else { OTHER_CLEARANCE_FT };
    let spacing = if ground.along_nm.len() > 1 { ground.along_nm[1] - ground.along_nm[0] } else { 0.0 };
    // Each obstacle placed on the line, the corridor's alone.
    let placed: Vec<(f64, &Obstacle)> = obstacles
        .iter()
        .filter_map(|o| {
            let (cross, along) = track_nm(o.at, start, end);
            (cross.abs() <= CORRIDOR_HALF_WIDTH_NM).then_some((along, o))
        })
        .collect();
    let mut floors = Vec::new();
    for w in breaks_nm.windows(2) {
        let (a, b) = (w[0], w[1]);
        let here: Vec<usize> =
            (0..ground.along_nm.len()).filter(|&i| ground.along_nm[i] >= a - spacing && ground.along_nm[i] <= b + spacing).collect();
        if here.is_empty() {
            return Err(format!("no ground between {a} and {b} nm"));
        }
        let ground_clearance = |i: usize| clearance(ground.congested.as_ref().is_some_and(|c| c.get(i).copied().unwrap_or(true)));
        // The ground where it needs most, the first such on a tie.
        let mut best = here[0];
        for &i in &here {
            if ground.high_ft[i] + ground_clearance(i) > ground.high_ft[best] + ground_clearance(best) {
                best = i;
            }
        }
        let ground_need = ground.high_ft[best] + ground_clearance(best);
        let mut bound = (ground.high_ft[best], false, None, ground_clearance(best));
        let mut tallest: Option<(f64, &Obstacle)> = None;
        for &(along, o) in &placed {
            if along >= a - CORRIDOR_HALF_WIDTH_NM && along <= b + CORRIDOR_HALF_WIDTH_NM {
                let need = o.amsl_ft + clearance(o.congested);
                if tallest.is_none_or(|(n, _)| need > n) {
                    tallest = Some((need, o));
                }
            }
        }
        // The obstacle where it needs more than the ground, the ground on
        // a tie: the ground is under the airplane the whole way.
        if let Some((need, o)) = tallest
            && need > ground_need
        {
            let kind = o.kind.as_deref().map(str::trim).filter(|k| !k.is_empty()).map(str::to_owned);
            bound = (o.amsl_ft, true, kind, clearance(o.congested));
        }
        let (highest, is_obstacle, kind, need) = bound;
        let top_ground = here.iter().map(|&i| ground.high_ft[i]).fold(f64::NEG_INFINITY, f64::max);
        let lowest_ground = here.iter().map(|&i| ground.low_ft[i]).fold(f64::INFINITY, f64::min);
        floors.push(VfrFloor {
            floor_ft: round_up((top_ground + PLANNING_GROUND_MARGIN_FT).max(highest + need)),
            lowest_ground_ft: lowest_ground,
            highest_ft: highest.round_ties_even(),
            highest_is_obstacle: is_obstacle,
            obstacle_type: kind,
            clearance_ft: need,
            congested: known.then_some(need == CONGESTED_CLEARANCE_FT),
        });
    }
    Ok(floors)
}

/// One leg's minimum IFR altitude and what it was found from.
#[derive(Debug, Clone, PartialEq)]
pub struct IfrFloor {
    pub floor_ft: f64,
    pub highest_ft: f64,
    pub highest_is_obstacle: bool,
    pub mountainous: bool,
}

/// Each leg's minimum IFR altitude (14 CFR 91.177(a)(2), for a course with
/// no altitude published for it in Parts 95 and 97): the highest obstacle
/// within 4 nm of its course -- the ground the planner found there
/// (`ground_ft`, its allowance for the tiles' pixels added) or a DOF
/// obstacle's top -- plus 1,000 ft, 2,000 over a mountainous area,
/// rounded up to the next 100 ft.
pub fn ifr(legs: &[(Point, Point, f64)], obstacles: &[(Point, f64)]) -> Vec<IfrFloor> {
    legs.iter()
        .map(|&(a, b, ground_ft)| {
            let parts = pieces(a, b, IFR_PIECE_NM);
            let tallest = obstacles
                .iter()
                .filter(|(at, _)| parts.iter().any(|&(p, q)| from_segment_nm(*at, p, q) <= IFR_OBSTACLE_RADIUS_NM))
                .map(|&(_, ft)| ft)
                .fold(f64::NEG_INFINITY, f64::max);
            let highest = ground_ft.max(tallest);
            let over = mountainous::crossed(a, b);
            let clearance = if over { IFR_MOUNTAINOUS_CLEARANCE_FT } else { IFR_CLEARANCE_FT };
            IfrFloor {
                floor_ft: round_up(highest + clearance),
                highest_ft: highest.round_ties_even(),
                highest_is_obstacle: tallest >= ground_ft,
                mountainous: over,
            }
        })
        .collect()
}

/// An airway segment's minimum IFR altitude (14 CFR 91.177(a)(1)): its
/// MEA, or its GNSS MEA where it publishes no other (a T route's).
pub fn published(mea_ft: Option<f64>, gnss_mea_ft: Option<f64>) -> Option<f64> {
    mea_ft.filter(|&f| f != 0.0).or(gnss_mea_ft.filter(|&f| f != 0.0))
}

/// The floor of a leg flown along a path other than its own straight
/// line -- a departure (SID), an arrival (STAR) or an approach flown in its
/// place (the planner's procedure paths): `floors`, the leg's own first,
/// then the floor under each piece of the path, read the same way. The
/// leg keeps the highest of them, the first on a tie (its own), and the
/// lowest ground under any of them, where they carry one (VFR's: 3,000 ft
/// above it is where 14 CFR 91.159 begins). The airplane is over every
/// piece of the path at its cruising altitude until it comes down, so the
/// ground under all of it must be cleared: 91.119's clearances under VFR,
/// 91.177(a)(2)'s under IFR. A published procedure's own altitudes
/// (91.177(a)(1), Part 97) can be lower, so this errs high, the safer side
/// (the aviation audit's AV-2, 2026-11-14). Returns the index of the
/// bounding floor and that lowest ground; None for no floors.
pub fn along_path(floors: &[(f64, Option<f64>)]) -> Option<(usize, Option<f64>)> {
    let first = floors.first()?;
    let mut bound = 0;
    for (i, f) in floors.iter().enumerate() {
        if f.0 > floors[bound].0 {
            bound = i;
        }
    }
    let lowest = floors.iter().filter_map(|f| f.1).fold(first.1, |low, g| Some(low.map_or(g, |l: f64| l.min(g))));
    Some((bound, lowest))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat(n: usize, ft: f64, congested: Option<bool>) -> Ground {
        Ground {
            along_nm: (0..n).map(|i| i as f64 * 2.0).collect(),
            high_ft: vec![ft; n],
            low_ft: vec![ft; n],
            congested: congested.map(|c| vec![c; n]),
        }
    }

    #[test]
    fn the_ground_takes_1000_ft_and_a_tower_91_119s_clearance_where_it_stands() {
        let (start, end) = ((45.0, -90.0), (45.0, -89.0));
        let ground = flat(20, 1000.0, Some(false));
        let tower = Obstacle { at: (45.01, -89.5), amsl_ft: 2200.0, kind: Some("TOWER ".into()), congested: false };
        let floors = vfr(start, end, &[0.0, 38.0], &ground, &[tower]).unwrap();
        // 2,200 + 500 (91.119(c)) over 1,000 + 1,000.
        assert_eq!(floors[0].floor_ft, 2700.0);
        assert!(floors[0].highest_is_obstacle);
        assert_eq!(floors[0].obstacle_type.as_deref(), Some("TOWER"));
        assert_eq!(floors[0].congested, Some(false));
        let town = Obstacle { at: (45.01, -89.5), amsl_ft: 2200.0, kind: None, congested: true };
        assert_eq!(vfr(start, end, &[0.0, 38.0], &ground, &[town]).unwrap()[0].floor_ft, 3200.0);
        // Towns unknown: 91.119(b)'s 1,000 ft, and said to be unknown.
        let unknown = flat(20, 1000.0, None);
        let floors = vfr(start, end, &[0.0, 38.0], &unknown, &[]).unwrap();
        assert_eq!((floors[0].floor_ft, floors[0].congested), (2000.0, None));
    }

    #[test]
    fn the_ifr_floor_is_1000_over_the_highest_within_4_nm_and_2000_over_mountains() {
        let (a, b) = ((41.0, -88.0), (41.0, -87.5));
        let near = ((41.05, -87.75), 2000.0); // 3 nm off
        let far = ((41.1, -87.75), 5000.0); // 6 nm off
        let floors = ifr(&[(a, b, 900.0)], &[near, far]);
        assert_eq!(floors[0].floor_ft, 3000.0);
        assert!(floors[0].highest_is_obstacle && !floors[0].mountainous);
        let rockies = ifr(&[((39.7, -105.5), (39.7, -105.0), 11040.0)], &[]);
        assert_eq!(rockies[0].floor_ft, 13100.0);
        assert!(rockies[0].mountainous);
    }

    #[test]
    fn a_leg_flown_along_a_path_keeps_the_highest_floor_under_it() {
        // The leg's own line over a valley (2,000), the arrival's pieces
        // over a ridge (6,500) and a lake (1,800): the ridge bounds it,
        // and the lowest ground is the lake's 600.
        let floors = [(2000.0, Some(900.0)), (6500.0, Some(4200.0)), (1800.0, Some(600.0))];
        assert_eq!(along_path(&floors), Some((1, Some(600.0))));
        // A tie keeps the leg's own; IFR's floors carry no lowest ground.
        assert_eq!(along_path(&[(3000.0, None), (3000.0, None)]), Some((0, None)));
        assert_eq!(along_path(&[]), None);
    }
}
