//! A way's turns named for the pilot: moved onto a fix a pilot can load
//! where one near keeps the way as clear and nearly as quick, else named
//! as the pilot's own point off the nearest fix (wingtip.fixes.frd_near).

use super::ask::Fix;
use super::grid::Grid;
use super::ways::line_minutes;
use super::words::r1;
use crate::geo;
use crate::route::points::frd_ident;
use wingtip_core::grid::Point;
use wingtip_core::sort::StableSort;
use wingtip_core::wmm;

/// How far from a turn a fix is looked for to turn at instead, nm, and
/// how many minutes it may add: the planner's own figures, a fix a pilot
/// can load beating a point of their own off one for a few miles more.
pub const SNAP_NM: f64 = 8.0;
pub const SNAP_MIN: f64 = 3.0;
/// How far a dropped point is named from a fix, nm: further, from the
/// nearest of any kind (wingtip.fixes.NEAR_NM).
pub const NEAR_NM: f64 = 40.0;
/// The navaids whose courses are radials, turned to true by the station's
/// own variation, as its radials are set (AIM 1-1-3).
pub const RADIAL_KINDS: [&str; 4] = ["VORTAC", "VOR/DME", "VOR", "TACAN"];

/// The World Magnetic Model's decimal year of a Unix time.
pub fn decimal_year(t_s: f64) -> f64 {
    wmm::year_at(t_s)
}

/// An ident a route can take as a fix's: two to five letters or figures.
fn fix_like(ident: &str) -> bool {
    (2..=5).contains(&ident.len()) && ident.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
}

fn within(fixes: &[Fix], at: Point, nm: f64) -> impl Iterator<Item = &Fix> {
    let (s, w, n, e) = geo::box_around(at.0, at.1, nm);
    fixes.iter().filter(move |f| f.lat >= s && f.lat <= n && f.lon >= w && f.lon <= e && fix_like(&f.ident))
}

/// A point named as the pilot's own point (frd_ident) off the nearest fix
/// a pilot knows -- a navaid or a VFR waypoint charted on the sectional --
/// within `max_nm`, else the nearest fix of any kind there: its course
/// magnetic (a VOR's own variation, the model's at `year` for any other)
/// to the degree, its distance to a tenth of a mile; so it comes back to
/// within a few hundredths of a mile of where it was dropped. None with
/// no fix within `max_nm`.
pub fn frd_near(fixes: &[Fix], lat: f64, lon: f64, max_nm: f64, year: f64) -> Option<Named> {
    let around: Vec<(f64, &Fix)> = within(fixes, (lat, lon), max_nm)
        .map(|f| (geo::distance_nm(f.lat, f.lon, lat, lon), f))
        .filter(|(nm, _)| (0.05..=max_nm).contains(nm))
        .collect();
    if around.is_empty() {
        return None;
    }
    let known: Vec<&(f64, &Fix)> = around.iter().filter(|(_, f)| f.navaid || f.vfr).collect();
    let pool: Vec<&(f64, &Fix)> = if known.is_empty() { around.iter().collect() } else { known };
    let &&(nm, fix) = pool.iter().fold(None::<&&(f64, &Fix)>, |best, p| match best {
        Some(b) if b.0 <= p.0 => Some(b),
        _ => Some(p),
    })?;
    let radial = fix.navaid && RADIAL_KINDS.contains(&fix.kind.as_str()) && fix.mag_var.is_some();
    let variation = if radial { fix.mag_var.unwrap_or(0.0) } else { wmm::declination(fix.lat, fix.lon, year) };
    let course = (geo::py_mod(geo::bearing_deg(fix.lat, fix.lon, lat, lon) - variation, 360.0).round_ties_even() as i64).rem_euclid(360);
    let distance = r1(nm);
    let ident = frd_ident(&fix.ident, course as f64, distance);
    Some(Named { base: fix.ident.clone(), course_deg: course, distance_nm: distance, radial, ident })
}

/// The pilot's own point off a fix, as frd_near names it ("VPBNG/095/14.2"):
/// its fix, its course magnetic, its distance and whether the course is a
/// VOR's radial. What it is called in words is the planner's
/// (wingtip.fixes.frd_title).
pub struct Named {
    pub base: String,
    pub course_deg: i64,
    pub distance_nm: f64,
    pub radial: bool,
    pub ident: String,
}

/// (closed, marginal, offshore) cells a way through `points` crosses.
fn cost(grid: &Grid, points: &[Point]) -> (usize, usize, f64) {
    let (mut closed, mut marginal, mut offshore) = (0, 0, 0.0);
    for w in points.windows(2) {
        for c in grid.line_cells(w[0], w[1]) {
            closed += !grid.open(c) as usize;
            marginal += grid.is_marginal(c) as usize;
            offshore += grid.offshore[grid.at(c)];
        }
    }
    (closed, marginal, offshore)
}

/// The nearest fix within SNAP_NM of a turn -- a navaid, a VFR or GPS
/// waypoint -- that keeps the two legs either side of it over no more
/// closed, marginal or offshore cells than the turn's own, and no more
/// than SNAP_MIN slower; None where none does.
pub fn fix_for_turn<'a>(grid: &Grid, gs: &Vec<f64>, fixes: &'a [Fix], before: Point, turn: Point, after: Point) -> Option<&'a Fix> {
    let mut near: Vec<(f64, &Fix)> = within(fixes, turn, SNAP_NM).map(|f| (geo::distance_nm(turn.0, turn.1, f.lat, f.lon), f)).collect();
    if near.is_empty() {
        return None;
    }
    near.stable_sort_by(|a, b| a.0.total_cmp(&b.0));
    let own = cost(grid, &[before, turn, after]);
    let minutes = line_minutes(grid, gs, before, turn, 0.0, 0.0) + line_minutes(grid, gs, turn, after, 0.0, 0.0);
    for (nm, fix) in near {
        if nm > SNAP_NM {
            break;
        }
        let at = (fix.lat, fix.lon);
        let (closed, marginal, offshore) = cost(grid, &[before, at, after]);
        if closed > own.0 || marginal > own.1 || offshore > own.2 + 0.5 {
            continue;
        }
        if line_minutes(grid, gs, before, at, 0.0, 0.0) + line_minutes(grid, gs, at, after, 0.0, 0.0) > minutes + SNAP_MIN {
            continue;
        }
        return Some(fix);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use wingtip_core::time;

    fn fix(ident: &str, lat: f64, lon: f64, navaid: bool, kind: &str, mag_var: Option<f64>) -> Fix {
        Fix { ident: ident.into(), lat, lon, navaid, vfr: false, kind: kind.into(), mag_var }
    }

    #[test]
    fn a_point_is_named_off_the_nearest_navaid_by_its_radial() {
        // Due east of a VOR with 0 variation, 30 nm: the 090 radial.
        let vor = fix("ABC", 0.0, 0.0, true, "VOR", Some(0.0));
        let gps = fix("GPSFX", 0.0, 0.45, false, "fix", None);
        let named = frd_near(&[vor, gps], 0.0, 0.5, NEAR_NM, 2026.8).unwrap();
        assert_eq!(named.ident, "ABC/090/30");
        assert!(named.radial && named.course_deg == 90 && named.distance_nm == 30.0);
        assert!(frd_near(&[], 0.0, 0.5, NEAR_NM, 2026.8).is_none());
    }

    #[test]
    fn the_models_year_of_a_time() {
        // 2026-01-01T00:00Z is the year's first day.
        let y = decimal_year(time::days_from_civil(2026, 1, 1) as f64 * 86400.0);
        assert!((y - 2026.0).abs() < 0.01);
    }
}
