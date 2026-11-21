//! The flight's fuel figure in the strip at the sheet's foot (the web's
//! FlightLine, the iPhone's FiguresStrip, Android's Figures): one answer
//! for the three, so the strip says the same fuel on each. The figure is
//! the fuel required to the next landing -- the tanks are filled at each
//! stop (the planner's wingtip.planning.route_totals) -- less what a flight
//! under way has burnt; red where the tanks do not hold it on any flight
//! of the route. Before the nav log's totals are in, an estimate from the
//! airplane's book alone.

use crate::flight::{reserve_min, tanks_leaving};

/// One flight between two landings, as the planner's totals give it.
#[derive(Clone, Debug, PartialEq)]
pub struct Hop {
    pub departure: String,
    pub destination: String,
    pub fuel_required_gal: Option<f64>,
    pub fuel_margin_gal: Option<f64>,
}

/// A flight the tanks do not hold the fuel and its reserve for: which hop
/// (None for a route with no stops), its idents as sent ("C81 → KMSN", ""
/// with no stops), and by how much. An app names the hop's two ends from
/// `hop` with its own point names, as a pilot's own point is "@lat,lon"
/// in the idents and named only on the device (the 2026-11-14 audit's
/// CODE-13).
#[derive(Clone, Debug, PartialEq)]
pub struct Short {
    pub hop: Option<usize>,
    pub name: String,
    pub short_gal: f64,
}

/// The strip's fuel: the fuel required to the landing of hop `hop` (the
/// first where the route has stops; the whole route's where it has none),
/// less `burnt_gal` where a flight is under way, never below nothing; and
/// the flights the tanks fall short on, a fuel margin under nothing being
/// the fuel and its reserve (14 CFR 91.151, 91.167) more than they hold.
pub fn fuel_figure(
    required_gal: Option<f64>, margin_gal: Option<f64>, hops: &[Hop], hop: usize, burnt_gal: Option<f64>,
) -> (Option<f64>, Vec<Short>) {
    let planned = match hops.get(hop.min(hops.len().saturating_sub(1))) {
        Some(h) => h.fuel_required_gal,
        None => required_gal,
    };
    let required = planned.map(|p| match burnt_gal {
        Some(b) => (p - b).max(0.0),
        None => p,
    });
    let flights: Vec<(Option<usize>, String, Option<f64>)> = if hops.is_empty() {
        vec![(None, String::new(), margin_gal)]
    } else {
        hops.iter().enumerate().map(|(i, h)| (Some(i), format!("{} → {}", h.departure, h.destination), h.fuel_margin_gal)).collect()
    };
    let short =
        flights.into_iter().filter_map(|(hop, name, m)| m.filter(|m| *m < 0.0).map(|m| Short { hop, name, short_gal: -m })).collect();
    (required, short)
}

/// The reserve an estimate carries, minutes: the most the rules ask --
/// night VFR (14 CFR 91.151(a)(2)) and IFR (91.167(a)(3)), 45 minutes --
/// as whether the flight is either is not known before the nav log, so an
/// estimate is never short.
pub fn estimate_reserve_min() -> f64 {
    reserve_min(true, false).max(reserve_min(false, true))
}

/// The figures from the airplane's book alone, before the nav log's: at
/// cruise speed with no wind the time over the course's distance,
/// minutes; the fuel at the cruise burn over that time; and the fuel
/// required, that with the airplane's own start and taxi allowance
/// (`taxi_fuel_gal`, its profile's; left out where it has none, never a
/// stock airplane's) and the estimate's reserve at the cruise burn. None
/// where the book gives no speed (or no burn, for the fuel).
pub fn estimate(
    distance_nm: f64, cruise_tas_kt: Option<f64>, fuel_burn_gph: Option<f64>, taxi_fuel_gal: Option<f64>,
) -> (Option<f64>, Option<f64>, Option<f64>) {
    let minutes = cruise_tas_kt.filter(|t| *t > 0.0).map(|t| distance_nm / t * 60.0);
    let burn = fuel_burn_gph.filter(|b| *b > 0.0);
    let trip = minutes.zip(burn).map(|(m, b)| m / 60.0 * b);
    let required = trip.zip(burn).map(|(t, b)| t + taxi_fuel_gal.unwrap_or(0.0) + estimate_reserve_min() / 60.0 * b);
    (minutes, trip, required)
}

/// One point of the route as the tanks are walked along it: the fuel its
/// leg burns to get there (None where not known, which leaves the tanks
/// unknown from there to the next fill), whether the tanks are filled
/// on landing there (a field stopped at, not a fix), and the pilot's own
/// figure for the tanks as the airplane leaves it (`fill_gal`: at the
/// departure the fuel on board at engine start, at a stop what it is
/// fuelled to; None, full), as flight::tanks_leaving reads it.
#[derive(Clone, Debug, PartialEq)]
pub struct TankPoint {
    pub departure: bool,
    pub fuel_gal: Option<f64>,
    pub refuel: bool,
    pub fill_gal: Option<f64>,
}

/// The fuel in the tanks at each point, gallons, and whether it is under
/// the reserve: at the departure the fuel on board at engine start (full,
/// `usable_gal`, unless the pilot set their own), the start, taxi and
/// takeoff allowance and each leg's burn taken from them after; at each
/// field landed at, the fuel on landing, the tanks then fuelled for the
/// next flight (flight::tanks_leaving: full unless the pilot set what to),
/// its own start and taxi taken again, as the planner checks each flight
/// (wingtip.planning.route_totals). None at a point past a leg whose burn is
/// not known, until the next fill. Below empty it is negative, the gallons
/// short, not 0: a 0 read as landing on fumes where the airplane cannot
/// reach the point at all (the owner, 2026-11-20: "Instead of showing 0
/// gal, can you show negative gal"); it is low then too. A start over the
/// usable fuel is kept as set (warn, never limit).
pub fn tanks(points: &[TankPoint], usable_gal: f64, taxi_gal: f64, reserve_gal: f64) -> Vec<Option<(f64, bool)>> {
    // What the flight under way left with, less its start and taxi; NaN
    // where a leg's burn is not known, until the next fill.
    let mut level = usable_gal - taxi_gal;
    points
        .iter()
        .map(|p| {
            if p.departure {
                let start = tanks_leaving(usable_gal, p.fill_gal, None);
                level = start - taxi_gal;
                return Some((start, false));
            }
            level -= p.fuel_gal.unwrap_or(f64::NAN);
            let gal = level;
            let at = gal.is_finite().then_some((gal, gal < reserve_gal));
            if p.refuel {
                level = tanks_leaving(usable_gal, p.fill_gal, gal.is_finite().then_some(gal)) - taxi_gal;
            }
            at
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_point_past_empty_reads_the_gallons_short() {
        let leg = |gal: f64, refuel: bool| TankPoint { departure: false, fuel_gal: Some(gal), refuel, fill_gal: None };
        let departure = TankPoint { departure: true, fuel_gal: None, refuel: false, fill_gal: None };
        // 40 usable, 1.5 taxi: 38.5 left before the legs, 30 burned to the
        // stop, 20 more to the end with no fuel bought: 11.5 short.
        let at = tanks(&[departure, leg(30.0, false), leg(20.0, false)], 40.0, 1.5, 7.5);
        assert_eq!(at[1], Some((8.5, false)));
        assert_eq!(at[2], Some((-11.5, true)));
    }

    #[test]
    fn the_pilots_own_fuel_at_the_start_and_at_a_stop() {
        let leg = |gal: f64, refuel: bool, fill: Option<f64>| TankPoint { departure: false, fuel_gal: Some(gal), refuel, fill_gal: fill };
        let departure = |fill| TankPoint { departure: true, fuel_gal: None, refuel: false, fill_gal: fill };
        // 30 on board of 40 at engine start, 1.5 taxi, 20 burned: 8.5 on
        // landing; no fuel bought there (0), 1.5 taxi and 5 more: 2 left.
        let at = tanks(&[departure(Some(30.0)), leg(20.0, true, Some(0.0)), leg(5.0, false, None)], 40.0, 1.5, 7.5);
        assert_eq!(at[0], Some((30.0, false)));
        assert_eq!(at[1], Some((8.5, false)));
        assert_eq!(at[2], Some((2.0, true)));
        // Full at the start, 18.5 on landing: fuelled to 25 there, 25 less
        // 1.5 and 5, 18.5; to 5, under the 18.5 left, keeps it, 12. More
        // than the tanks hold is kept as set.
        let to = |fill| tanks(&[departure(None), leg(20.0, true, Some(fill)), leg(5.0, false, None)], 40.0, 1.5, 7.5)[2];
        assert_eq!(to(25.0), Some((18.5, false)));
        assert_eq!(to(5.0), Some((12.0, false)));
        assert_eq!(tanks(&[departure(Some(50.0))], 40.0, 1.5, 7.5)[0], Some((50.0, false)));
    }
}
