//! Whether a flight needs a fuel stop, and the figures its stops are
//! looked for by: the planner's routers.plan worst_burn_per_nm and the
//! arithmetic of its fuel_stops_of, moved here so the rule is the
//! engine's. Which fields are suggested is route options' (`fuel_stops`,
//! options/fuel.rs), which the planner asks with these figures.

use super::{number, object, Obj, R};
use crate::geo::distance_nm;
use crate::json::Value;
use wingtip_flight::{flight, sun};

/// The most fuel a mile any stretch of `over_nm` of the legs takes, legs
/// given as (miles, gallons): their climb, and their headwinds where those
/// blow hardest. The flight's average hid them, and a stop picked on it
/// fell short where the winds were against it (KMTO-KUCP, 2026-10-23:
/// 0.072 gal/nm on average, 0.078 on that leg). None with no legs, no
/// miles, or a leg whose fuel is not known. A stretch runs from each leg's
/// start; one longer than the route is the route.
pub fn worst_burn_per_nm(legs: &[(f64, Option<f64>)], over_nm: f64) -> Option<f64> {
    if legs.is_empty() || legs.iter().any(|(_, f)| f.is_none()) {
        return None;
    }
    let (mut d, mut f) = (vec![0.0], vec![0.0]);
    for (miles, fuel) in legs {
        d.push(d[d.len() - 1] + miles);
        f.push(f[f.len() - 1] + fuel.unwrap_or(0.0));
    }
    let total = d[d.len() - 1];
    if total <= 0.0 {
        return None;
    }
    let span = over_nm.min(total);
    let mut worst: Option<f64> = None;
    for i in 0..d.len() {
        // The first point at or past the stretch's end (numpy's
        // searchsorted, left), the last point at most.
        let target = d[i] + span - 1e-9;
        let end = d.iter().position(|x| *x >= target).unwrap_or(d.len() - 1).min(d.len() - 1);
        let stretch = d[end] - d[i];
        if stretch >= span - 1e-6 && stretch > 0.0 {
            let rate = (f[end] - f[i]) / stretch;
            worst = Some(worst.map_or(rate, |w: f64| w.max(rate)));
        }
    }
    worst
}

/// What a flight's fuel stops are looked for by, from its totals (the
/// nav log's, with its fuel check: `fuel_margin_gal`, `usable_fuel_gal`,
/// `distance_nm`, `fuel_gal`, `ete_min`, `taxi_gal`, `reserve_gal`,
/// `rules`, `night`) and its legs: None where the fuel check passes or
/// any figure it needs is not known (no airplane, an unflyable leg).
///
/// Each stop's flight as its nav log will fly it, so that a chain kept
/// never asks for another stop: at the worst burn a mile over a tankful's
/// stretch (worst_burn_per_nm), on the miles the route flies for each
/// straight one (the detour), and held to the night's reserve (14 CFR
/// 91.151(a)(2), 45 minutes, for the day's 30 of 91.151(a)(1)) where any of
/// the trip under VFR -- its stops' turnarounds counted -- is in the dark
/// (sun::night_on_the_way): one long flight day at both ends was not, and
/// its stops' flights landing after dark are. Under IFR the reserve is
/// 91.167(a)(3)'s already.
pub struct Need {
    pub fuel_per_nm: f64,
    pub min_per_nm: f64,
    pub usable_gal: f64,
    pub taxi_gal: f64,
    pub reserve_gal: f64,
}

pub fn fuel_stop_need(totals: &Obj, legs: &[(f64, Option<f64>)], start: (f64, f64), end: (f64, f64), depart_s: f64) -> R<Option<Need>> {
    let (margin, usable, distance) = (totals.opt("fuel_margin_gal")?, totals.opt("usable_fuel_gal")?, totals.opt("distance_nm")?);
    let (fuel, ete) = (totals.opt("fuel_gal")?, totals.opt("ete_min")?);
    let (Some(margin), Some(usable), Some(distance), Some(fuel), Some(ete)) = (margin, usable, distance, fuel, ete) else {
        return Ok(None);
    };
    if margin >= 0.0 || usable == 0.0 || distance == 0.0 {
        return Ok(None);
    }
    let taxi = totals.opt("taxi_gal")?.unwrap_or(0.0);
    let mut reserve = totals.opt("reserve_gal")?.unwrap_or(0.0);
    let straight = distance_nm(start.0, start.1, end.0, end.1);
    let detour = if straight != 0.0 { (distance / straight).max(1.0) } else { 1.0 };
    let stops_needed = (fuel / (usable - taxi - reserve).max(1.0)).ceil();
    let ifr = totals.text("rules") == Some("ifr");
    if !ifr && !totals.truthy("night") && sun::night_on_the_way(start, end, depart_s, ete + stops_needed * flight::TURNAROUND_MIN) {
        reserve = reserve * flight::reserve_min(false, true) / flight::reserve_min(false, false);
    }
    let per_nm = fuel / distance;
    let worst = worst_burn_per_nm(legs, (usable - taxi - reserve) / per_nm).filter(|w| *w != 0.0).unwrap_or(per_nm);
    Ok(Some(Need {
        fuel_per_nm: worst.max(per_nm) * detour,
        min_per_nm: ete / distance * detour,
        usable_gal: usable,
        taxi_gal: taxi,
        reserve_gal: reserve,
    }))
}

impl Need {
    pub fn value(&self) -> Value {
        object(vec![
            ("fuel_per_nm", number(self.fuel_per_nm)),
            ("min_per_nm", number(self.min_per_nm)),
            ("usable_gal", number(self.usable_gal)),
            ("taxi_gal", number(self.taxi_gal)),
            ("reserve_gal", number(self.reserve_gal)),
        ])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_worst_stretch_is_the_headwind_leg_not_the_average() {
        // 100 nm at 0.07 gal/nm, then 50 nm at 0.1: over 50 nm the worst is
        // the second leg's 0.1, where the average is 0.08.
        let legs = [(100.0, Some(7.0)), (50.0, Some(5.0))];
        assert!((worst_burn_per_nm(&legs, 50.0).unwrap() - 0.1).abs() < 1e-12);
        // Over the whole route it is the average.
        assert!((worst_burn_per_nm(&legs, 1000.0).unwrap() - 12.0 / 150.0).abs() < 1e-12);
        assert_eq!(worst_burn_per_nm(&[(10.0, None)], 5.0), None);
        assert_eq!(worst_burn_per_nm(&[], 5.0), None);
        assert_eq!(worst_burn_per_nm(&[(0.0, Some(1.0))], 5.0), None);
    }
}
