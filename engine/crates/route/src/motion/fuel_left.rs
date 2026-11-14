//! The fuel the plan leaves at a place along the route, in flight (the
//! aviation audit's AV-4): planning figures, as the nav log's fuel column
//! is, never the airplane's gauge.
//!
//! The tanks hold the fuel at the start less the start and taxi allowance
//! (the airplane's own `taxi_fuel_gal`; the same allowance the nav log's
//! fuel plan takes off for 14 CFR 91.151 and 91.167), and the legs burn
//! their own fuel from there. At a stop the plan refuels at, the tanks are
//! filled again (`full_gal`, else the start's fuel) and the allowance taken
//! again for the next start and taxi, and the burn is counted from that
//! stop: the figure after the first fuel stop no longer counts down from
//! the first tank. A place is reached with what the tanks hold arriving
//! there, before any refuelling at it. With no allowance known nothing is
//! taken off for it and the answer says so (`taxi_counted` false): no
//! other airplane's figure fills it (the owner, 2026-11-09).

use super::instruments::Leg;

/// The fuel aboard as the plan has it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Tanks {
    /// The fuel at the start, gallons; None, no fuel figures at all.
    pub start_gal: Option<f64>,
    /// What the tanks are filled to at a fuel stop; None, the start's.
    pub full_gal: Option<f64>,
    /// The start and taxi allowance, gallons; None where not known.
    pub taxi_gal: Option<f64>,
    /// The route's points the plan refuels at (indices into its points).
    pub refuel_at: Vec<usize>,
}

/// The fuel the legs burn up to `along_nm` miles along the route, each
/// leg's own burn spread over its miles (along::burnt_gal), a leg with no
/// fuel burning none.
pub fn burnt(legs: &[Leg], along_nm: f64) -> f64 {
    let legs: Vec<super::along::Leg> =
        legs.iter().map(|l| super::along::Leg { distance_nm: l.distance_nm, fuel_gal: l.fuel_gal.unwrap_or(0.0) }).collect();
    super::along::burnt_gal(&legs, along_nm)
}

/// The fuel the plan leaves at `along_nm` miles along the route: from the
/// last fuel stop passed before it (`places`, each point's miles along,
/// None where it is not on the line), else from the start.
pub fn fuel_at(tanks: &Tanks, legs: &[Leg], places: &[Option<f64>], along_nm: f64) -> Option<f64> {
    let start = tanks.start_gal?;
    let taxi = tanks.taxi_gal.unwrap_or(0.0);
    let last_stop = tanks
        .refuel_at
        .iter()
        .filter_map(|&k| places.get(k).copied().flatten())
        .filter(|&a| a < along_nm - 1e-9)
        .fold(None, |best: Option<f64>, a| Some(best.map_or(a, |b| b.max(a))));
    Some(match last_stop {
        None => start - taxi - burnt(legs, along_nm),
        Some(at) => tanks.full_gal.unwrap_or(start) - taxi - (burnt(legs, along_nm) - burnt(legs, at)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fuel_stop_fills_the_tanks_and_each_start_takes_its_allowance() {
        // Two 100 nm legs of 10 gal each, a fuel stop at the middle point,
        // 40 gal at the start and filled to 40 again, 1.4 gal to start and
        // taxi each time.
        let legs = [Leg { distance_nm: 100.0, fuel_gal: Some(10.0) }, Leg { distance_nm: 100.0, fuel_gal: Some(10.0) }];
        let places = [Some(0.0), Some(100.0), Some(200.0)];
        let tanks = Tanks { start_gal: Some(40.0), full_gal: None, taxi_gal: Some(1.4), refuel_at: vec![1] };
        let at = |nm: f64| fuel_at(&tanks, &legs, &places, nm).unwrap();
        assert!((at(50.0) - 33.6).abs() < 1e-9);
        // Arriving at the stop: before refuelling.
        assert!((at(100.0) - 28.6).abs() < 1e-9);
        // Past it, from full tanks less the second start and taxi.
        assert!((at(150.0) - 33.6).abs() < 1e-9);
        assert!((at(200.0) - 28.6).abs() < 1e-9);
        // With no stop the burn runs on from the first tank.
        let one_tank = Tanks { refuel_at: vec![], ..tanks.clone() };
        assert!((fuel_at(&one_tank, &legs, &places, 200.0).unwrap() - 18.6).abs() < 1e-9);
        // No allowance known: none taken off; no start fuel: no figure.
        let no_taxi = Tanks { taxi_gal: None, ..tanks.clone() };
        assert!((fuel_at(&no_taxi, &legs, &places, 50.0).unwrap() - 35.0).abs() < 1e-9);
        assert_eq!(fuel_at(&Tanks::default(), &legs, &places, 50.0), None);
    }
}
