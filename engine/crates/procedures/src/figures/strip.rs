//! The flight's fuel figure, and the fuel in the tanks along the route: one
//! answer for every app, so each says the same fuel. The iPhone's
//! FiguresStrip and Android's Figures show the figure in the strip at the
//! sheet's foot; the web's strip shows the Track there instead since
//! 2b759e3ce (the owner, 2026-11-21: "replace Fuel with Track at the bottom
//! figures"), and the web's fuel is the timeline's tank gauges (`tanks`)
//! and the nav log, its flights short still read from here. The figure is
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
/// the fuel and its reserve (14 CFR 91.151, 91.167) more than is on board
/// as the flight leaves (navlog_fuel_plan's `on_board_gal`: the pilot's own
/// fuel, else full), not more than the tanks could hold.
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

/// The fuel in the tanks at a point (`tanks`): gallons, whether it is
/// under what the flight is held to there, and, where the tanks are filled
/// (the departure, a field landed at), what they hold as the airplane leaves.
#[derive(Clone, Debug, PartialEq)]
pub struct TankAt {
    pub gal: f64,
    pub low: bool,
    pub leaves_gal: Option<f64>,
}

/// The fuel in the tanks at each point, gallons, and whether it is under
/// what the flight it is on is held to: at the departure the fuel on board
/// at engine start (full, `usable_gal`, unless the pilot set their own),
/// the start, taxi and takeoff allowance and each leg's burn taken from
/// them after; at each field landed at, the fuel on landing, the tanks then
/// fuelled for the next flight (flight::tanks_leaving: full unless the
/// pilot set what to, a figure under what is left keeping what is left,
/// `leaves_gal`), its own start and taxi taken again, as the planner checks
/// each flight (wingtip.planning.route_totals). None at a point past a leg
/// whose burn is not known, until the next fill. Below empty it is
/// negative, the gallons short, not 0: a 0 read as landing on fumes where
/// the airplane cannot reach the point at all (the owner, 2026-11-20:
/// "Instead of showing 0 gal, can you show negative gal"); it is low then
/// too. A start over the usable fuel is kept as set (warn, never limit).
///
/// `reserves_gal` is each flight's own reserve, in order -- the first the
/// departure's flight, the next the one from the first field landed at --
/// as the planner holds each flight to its own (flight_fuel's
/// `reserve_gal`): 30 minutes by day (14 CFR 91.151(a)(1)), 45 at night
/// (91.151(a)(2)) or under IFR (91.167(a)(3)), by that flight's own times
/// and rules. A point is low against the reserve of the flight that lands
/// or passes there, so a day flight after a night one is not held to the
/// night's 45 minutes. A flight with no reserve given (None, or past the
/// list's end) is held to the strictest of those given, the safer answer.
/// The departure is low where what is on board, less the start and taxi,
/// is under its flight's reserve: no flight from there lands with it. The
/// route's last point, its destination, is held to `alternate_gal` more,
/// the fuel on to an IFR alternate (91.167(a)(2)), as the planner's fuel
/// check counts it; 0 under VFR or with no alternate filed.
pub fn tanks(points: &[TankPoint], usable_gal: f64, taxi_gal: f64, reserves_gal: &[Option<f64>], alternate_gal: f64) -> Vec<Option<TankAt>> {
    let strictest = reserves_gal.iter().flatten().fold(0.0_f64, |a, b| a.max(*b));
    let reserve_of = |flight: usize| reserves_gal.get(flight).copied().flatten().unwrap_or(strictest);
    let last = points.len().saturating_sub(1);
    // What the flight under way left with, less its start and taxi; NaN
    // where a leg's burn is not known, until the next fill.
    let mut level = usable_gal - taxi_gal;
    let mut flight = 0;
    points
        .iter()
        .enumerate()
        .map(|(i, p)| {
            if p.departure {
                let start = tanks_leaving(usable_gal, p.fill_gal, None);
                level = start - taxi_gal;
                return Some(TankAt { gal: start, low: level < reserve_of(flight), leaves_gal: Some(start) });
            }
            level -= p.fuel_gal.unwrap_or(f64::NAN);
            let gal = level;
            let held = reserve_of(flight) + if i == last { alternate_gal } else { 0.0 };
            let mut at = gal.is_finite().then_some(TankAt { gal, low: gal < held, leaves_gal: None });
            if p.refuel {
                let leaves = tanks_leaving(usable_gal, p.fill_gal, gal.is_finite().then_some(gal));
                level = leaves - taxi_gal;
                if let Some(at) = at.as_mut().filter(|_| leaves.is_finite()) {
                    at.leaves_gal = Some(leaves);
                }
                flight += 1;
            }
            at
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn leg(gal: f64, refuel: bool, fill_gal: Option<f64>) -> TankPoint {
        TankPoint { departure: false, fuel_gal: Some(gal), refuel, fill_gal }
    }

    fn departure(fill_gal: Option<f64>) -> TankPoint {
        TankPoint { departure: true, fuel_gal: None, refuel: false, fill_gal }
    }

    /// Each point's gallons and whether it is low.
    fn walk(points: &[TankPoint], reserves: &[Option<f64>], alternate: f64) -> Vec<Option<(f64, bool)>> {
        tanks(points, 40.0, 1.5, reserves, alternate).into_iter().map(|t| t.map(|t| ((t.gal * 1e9).round() / 1e9, t.low))).collect()
    }

    #[test]
    fn a_point_past_empty_reads_the_gallons_short() {
        // 40 usable, 1.5 taxi: 38.5 left before the legs, 30 burned to the
        // stop, 20 more to the end with no fuel bought: 11.5 short.
        let at = walk(&[departure(None), leg(30.0, false, None), leg(20.0, false, None)], &[Some(7.5)], 0.0);
        assert_eq!(at[1], Some((8.5, false)));
        assert_eq!(at[2], Some((-11.5, true)));
    }

    #[test]
    fn the_pilots_own_fuel_at_the_start_and_at_a_stop() {
        // 30 on board of 40 at engine start, 1.5 taxi, 20 burned: 8.5 on
        // landing; no fuel bought there (0), 1.5 taxi and 5 more: 2 left.
        let at = walk(&[departure(Some(30.0)), leg(20.0, true, Some(0.0)), leg(5.0, false, None)], &[Some(7.5)], 0.0);
        assert_eq!(at[0], Some((30.0, false)));
        assert_eq!(at[1], Some((8.5, false)));
        assert_eq!(at[2], Some((2.0, true)));
        // Full at the start, 18.5 on landing: fuelled to 25 there, 25 less
        // 1.5 and 5, 18.5; to 5, under the 18.5 left, keeps it, 12, and
        // says it leaves with the 18.5. More than the tanks hold is kept.
        let route = |fill| [departure(None), leg(20.0, true, Some(fill)), leg(5.0, false, None)];
        assert_eq!(walk(&route(25.0), &[Some(7.5)], 0.0)[2], Some((18.5, false)));
        assert_eq!(walk(&route(5.0), &[Some(7.5)], 0.0)[2], Some((12.0, false)));
        let kept = tanks(&route(5.0), 40.0, 1.5, &[Some(7.5)], 0.0);
        assert_eq!(kept[1].as_ref().and_then(|t| t.leaves_gal), Some(18.5));
        assert_eq!(walk(&[departure(Some(50.0))], &[Some(7.5)], 0.0)[0], Some((50.0, false)));
    }

    #[test]
    fn each_flight_is_held_to_its_own_reserve() {
        // At 10 gph, a night flight's 45 minutes (14 CFR 91.151(a)(2)) are
        // 7.5 gal and a day flight's 30 (91.151(a)(1)) 5 gal. 40 usable,
        // 1.5 taxi: the night flight lands with 18.5; filled, the day flight
        // after it lands with 40 - 1.5 - 32 = 6.5, under the night's 7.5
        // but over its own 5: not low.
        let route = [departure(None), leg(20.0, true, None), leg(32.0, false, None)];
        assert_eq!(walk(&route, &[Some(7.5), Some(5.0)], 0.0)[2], Some((6.5, false)));
        // The other way round, the night flight second is low at 6.5.
        assert_eq!(walk(&route, &[Some(5.0), Some(7.5)], 0.0)[2], Some((6.5, true)));
        // A flight whose reserve is not given is held to the strictest given.
        assert_eq!(walk(&route, &[Some(7.5), None], 0.0)[2], Some((6.5, true)));
        assert_eq!(walk(&route, &[Some(7.5)], 0.0)[2], Some((6.5, true)));
    }

    #[test]
    fn the_departure_is_low_with_too_little_on_board() {
        // 8 gal on board, 1.5 taxi: 6.5 to fly, under a 7.5 gal reserve.
        assert_eq!(walk(&[departure(Some(8.0))], &[Some(7.5)], 0.0)[0], Some((8.0, true)));
        assert_eq!(walk(&[departure(Some(9.0))], &[Some(7.5)], 0.0)[0], Some((9.0, false)));
    }

    #[test]
    fn under_ifr_the_destination_is_held_to_the_alternate_too() {
        // 14 CFR 91.167(a): to the destination, on to the alternate (3 gal
        // here, (a)(2)) and 45 minutes after (7.5 gal, (a)(3)). Landing with
        // 8.5 is over the reserve but under the two together: low.
        let route = [departure(None), leg(30.0, false, None)];
        assert_eq!(walk(&route, &[Some(7.5)], 0.0)[1], Some((8.5, false)));
        assert_eq!(walk(&route, &[Some(7.5)], 3.0)[1], Some((8.5, true)));
        // A stop on the way is not the destination: held to the reserve.
        let via = [departure(None), leg(30.0, true, None), leg(30.0, false, None)];
        assert_eq!(walk(&via, &[Some(7.5), Some(7.5)], 3.0)[1], Some((8.5, false)));
    }
}
