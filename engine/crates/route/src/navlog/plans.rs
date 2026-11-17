//! The four altitude plans -- lowest, highest, fastest, economical -- over
//! the legal altitudes of each leg, and the route flown at each altitude
//! for the altitude wheel: the planner's wingtip.navlog altitude_profiles,
//! and wingtip.flight_plan's join_options and join_figures for a route with
//! stops. Which altitudes are legal (14 CFR 91.119, 91.159, 91.155, the
//! airspace and the service ceiling) is the altitude selection's; this
//! assembles the plans over them.

use super::climbs::{climb_fuel_penalty_gal, climb_penalty_min, with_climbs};
use super::legs::{leg_between, tailwind_kt, totals};
use super::{number, object, opt_number, py_round, py_sum, LegAir, Obj, Profile, R};
use crate::{json::Value, sort::StableSort};
use std::cell::RefCell;
use std::collections::HashMap;
use wingtip_flight::performance::Climber;

/// The plans, in the order the page lists them.
pub const PLAN_KINDS: [&str; 4] = ["lowest", "highest", "fastest", "economical"];

/// What a step costs the lowest and highest plans, in feet times miles: an
/// altitude change is only worth it when it lowers (or raises) the profile
/// by more than 1,000 ft over 10 nm, so neither plan zig-zags for a leg's
/// worth of slightly lower floor.
pub const STEP_PENALTY_FT_NM: f64 = 10_000.0;

/// Above 12,500 ft MSL, more than 30 minutes needs the crew's
/// supplemental oxygen (14 CFR 91.211(a)(1)): no plan goes there unless
/// the profile says the airplane carries it or is pressurised. The lowest
/// plan cannot reach it anyway; the other three are held under it.
pub const OXYGEN_CAP_FT: f64 = wingtip_flight::limits::OXYGEN_CREW_PAST_30_MIN_FT;

/// The altitudes each leg's plans may fly, from the altitude selection's
/// `segments` (one a leg, each with its legal `candidates_ft`): held under
/// the oxygen altitude where a leg has a choice -- a leg whose only legal
/// altitudes are above it keeps them, the alternative being no plan at
/// all. None where some leg has no legal altitude at all, or the segments
/// are not one a leg: then no plan can fly the route. With no airplane
/// (`profile` None) nothing says it carries oxygen: held under, the safer
/// side.
pub fn candidates(segments: &[Value], legs: usize, profile: Option<&Profile>) -> R<Option<Vec<Vec<f64>>>> {
    if segments.len() != legs {
        return Ok(None);
    }
    let mut out = Vec::with_capacity(legs);
    for s in segments {
        let options: Vec<f64> = match s.get("candidates_ft") {
            Some(Value::Array(items)) => {
                items.iter().map(|a| a.as_f64().ok_or("a segment's \"candidates_ft\" is not a list of feet")).collect::<Result<_, _>>()?
            }
            None | Some(Value::Null) => Vec::new(),
            Some(_) => return Err("a segment's \"candidates_ft\" is not a list".to_owned()),
        };
        if options.is_empty() {
            return Ok(None);
        }
        let held: Vec<f64> = if profile.is_some_and(|p| p.oxygen) {
            options.clone()
        } else {
            options.iter().copied().filter(|a| *a <= OXYGEN_CAP_FT).collect()
        };
        out.push(if held.is_empty() { options } else { held });
    }
    Ok(Some(out))
}

/// The legs flown at their altitudes, each worked out once in its air: by
/// the airplane, or with none (`profile` None) the legs' courses and
/// miles alone, with no climbs.
pub struct Flights<'a> {
    name: &'a str,
    fixes: &'a [Value],
    profile: Option<&'a Profile>,
    air: &'a [LegAir],
    pub climber: Option<Climber>,
    cache: RefCell<HashMap<(usize, u64), Obj>>,
}

impl<'a> Flights<'a> {
    pub fn new(name: &'a str, fixes: &'a [Value], profile: Option<&'a Profile>, air: &'a [LegAir]) -> R<Self> {
        if air.len() + 1 != fixes.len() {
            return Err(format!(
                "{name}: {} fixes make {} legs, and the air is given for {}",
                fixes.len(),
                fixes.len().saturating_sub(1),
                air.len()
            ));
        }
        Ok(Flights { name, fixes, profile, air, climber: profile.map(|p| Climber::new(&p.airplane)), cache: RefCell::new(HashMap::new()) })
    }

    /// Leg `i` flown at `altitude_ft`.
    pub fn leg_at(&self, i: usize, altitude_ft: f64) -> R<Obj> {
        let key = (i, altitude_ft.to_bits());
        if let Some(leg) = self.cache.borrow().get(&key) {
            return Ok(leg.clone());
        }
        let air = &self.air[i];
        let leg = leg_between(
            self.name,
            &self.fixes[i],
            &self.fixes[i + 1],
            altitude_ft,
            self.profile,
            air.at(self.name, i, altitude_ft)?,
            air.variation_deg,
        )?;
        self.cache.borrow_mut().insert(key, leg.clone());
        Ok(leg)
    }

    fn legs_flown(&self, altitudes: &[f64], start_ft: Option<f64>) -> R<Vec<Obj>> {
        let legs = altitudes.iter().enumerate().map(|(i, a)| self.leg_at(i, *a)).collect::<R<Vec<_>>>()?;
        match (self.profile, &self.climber) {
            (Some(profile), Some(climber)) => with_climbs(&legs, start_ft, profile, climber),
            _ => Ok(legs),
        }
    }
}

/// The altitude for each leg that minimises the summed leg and step costs:
/// dynamic programming over the legs, one state per legal altitude of the
/// leg. A step's cost is the leg's own, since a climb is flown in the air
/// of the leg it climbs to. Ties go to the lower altitude.
fn best_path(
    candidates: &[Vec<f64>], leg_cost: &dyn Fn(usize, f64) -> R<f64>, step_cost: &dyn Fn(usize, Option<f64>, f64) -> R<f64>,
) -> R<Vec<f64>> {
    // Per leg: each altitude's cost so far and the altitude before it.
    let mut best: Vec<Vec<(f64, f64, Option<f64>)>> = Vec::with_capacity(candidates.len());
    for (i, options) in candidates.iter().enumerate() {
        let mut layer: Vec<(f64, f64, Option<f64>)> = Vec::with_capacity(options.len());
        for &a in options {
            let entry = if i == 0 {
                (a, leg_cost(i, a)? + step_cost(i, None, a)?, None)
            } else {
                let mut chosen: Option<(f64, f64)> = None;
                for &(p, c, _) in &best[i - 1] {
                    let cost = c + leg_cost(i, a)? + step_cost(i, Some(p), a)?;
                    let better = match chosen {
                        None => true,
                        Some((bc, bp)) => cost < bc || (cost == bc && p < bp),
                    };
                    if better {
                        chosen = Some((cost, p));
                    }
                }
                let (cost, p) = chosen.ok_or("a leg before had no altitude")?;
                (a, cost, Some(p))
            };
            match layer.iter_mut().find(|(alt, _, _)| *alt == a) {
                // A dict's later value under the same key, its place kept.
                Some(slot) => *slot = entry,
                None => layer.push(entry),
            }
        }
        best.push(layer);
    }
    let last = best.last().ok_or("no legs")?;
    let mut pick = last[0];
    for &e in &last[1..] {
        if e.1 < pick.1 || (e.1 == pick.1 && e.0 < pick.0) {
            pick = e;
        }
    }
    let mut altitude = pick.0;
    let mut path = vec![altitude];
    for i in (1..candidates.len()).rev() {
        let prev = best[i].iter().find(|(alt, _, _)| *alt == altitude).and_then(|e| e.2).ok_or("the path back was lost")?;
        altitude = prev;
        path.push(altitude);
    }
    path.reverse();
    Ok(path)
}

/// Consecutive legs at one altitude, as one step each: where it starts,
/// where it ends, how far it runs.
fn steps(altitudes: &[f64], legs: &[Obj]) -> R<Vec<Value>> {
    let mut steps: Vec<Obj> = Vec::new();
    for (altitude, leg) in altitudes.iter().zip(legs) {
        let to = leg.get("to").cloned().unwrap_or(Value::Null);
        let distance = leg.num("distance_nm")?;
        match steps.last_mut() {
            Some(last) if last.num("altitude_ft")? == *altitude => {
                last.set("to", to);
                let run = last.num("distance_nm")?;
                last.set_num("distance_nm", py_round(run + distance, 1));
            }
            _ => {
                let from = leg.get("from").cloned().unwrap_or(Value::Null);
                steps.push(Obj(vec![
                    ("from".into(), from),
                    ("to".into(), to),
                    ("altitude_ft".into(), number(*altitude)),
                    ("distance_nm".into(), number(py_round(distance, 1))),
                ]));
            }
        }
    }
    Ok(steps.into_iter().map(Obj::value).collect())
}

mod plan;
pub use plan::*;
mod join;
pub use join::*;
