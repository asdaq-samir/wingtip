//! The trip a track flew: the departure, then each field landed at in
//! turn (laps of one field's pattern one stop), the straight legs between
//! them (61.109(a)(5)(ii)'s "straight-line distance ... between the
//! takeoff and landing locations"), and whether it was cross-country
//! (14 CFR 61.1(b), "Cross-country time").

use super::ground::{self, Ground};
use super::Field;
use crate::pilot::currency::CROSS_COUNTRY_NM;
use wingtip_core::geo::distance_nm;
use wingtip_procedures::figures::debrief::Point;

#[derive(Clone, Debug, PartialEq)]
pub struct Trip {
    /// The idents in turn, "C81 KDLH"; a place off any field as lat/lon.
    pub route: String,
    pub distance_nm: f64,
    pub longest_leg_nm: f64,
    /// 61.1(b)(i): a landing at a point other than the departure.
    pub landed_elsewhere: bool,
    /// The farthest landing in a straight line from the original point of
    /// departure, and whether more than 50 nm ((ii), (vi)).
    pub farthest_nm: f64,
    pub over_50_nm: bool,
}

fn place_name(fields: &[Field], field: Option<usize>, p: &Point) -> String {
    match field {
        Some(f) => fields[f].ident.clone(),
        None => format!("{:.2}/{:.2}", p.lat, p.lon),
    }
}

/// Two places one stop: the same field, or, off the fields, within
/// ground's FIELD_NM.
fn same_place(a: (f64, f64, Option<usize>), b: (f64, f64, Option<usize>)) -> bool {
    match (a.2, b.2) {
        (Some(x), Some(y)) => x == y,
        _ => distance_nm(a.0, a.1, b.0, b.1) <= ground::FIELD_NM,
    }
}

pub fn trip(points: &[Point], g: &Ground, fields: &[Field]) -> Trip {
    let at = |i: usize, field: Option<usize>| (points[i].lat, points[i].lon, field);
    let mut stops: Vec<((f64, f64, Option<usize>), String)> = Vec::new();
    if let Some(t) = g.takeoffs.first() {
        stops.push((at(t.i, t.field), place_name(fields, t.field, &points[t.i])));
    }
    for l in &g.landings {
        let here = at(l.i, l.field);
        if !stops.last().is_some_and(|s| same_place(s.0, here)) {
            stops.push((here, place_name(fields, l.field, &points[l.i])));
        }
    }
    let legs: Vec<f64> = stops.windows(2).map(|w| distance_nm(w[0].0 .0, w[0].0 .1, w[1].0 .0, w[1].0 .1)).collect();
    let (landed_elsewhere, farthest_nm) = match g.takeoffs.first() {
        Some(t) => {
            let dep = at(t.i, t.field);
            (
                g.landings.iter().any(|l| !same_place(dep, at(l.i, l.field))),
                g.landings.iter().map(|l| distance_nm(dep.0, dep.1, points[l.i].lat, points[l.i].lon)).fold(0.0, f64::max),
            )
        }
        None => (false, 0.0),
    };
    Trip {
        route: stops.iter().map(|s| s.1.as_str()).collect::<Vec<_>>().join(" "),
        distance_nm: legs.iter().sum(),
        longest_leg_nm: legs.iter().copied().fold(0.0, f64::max),
        landed_elsewhere,
        farthest_nm,
        over_50_nm: farthest_nm > CROSS_COUNTRY_NM,
    }
}
