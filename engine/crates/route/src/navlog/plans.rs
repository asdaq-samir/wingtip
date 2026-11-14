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

/// The plans' input read once: the fixes, the candidates, where the first
/// climb starts.
pub struct Plan<'a> {
    pub flights: Flights<'a>,
    pub candidates: Vec<Vec<f64>>,
    /// The departure field's elevation, where the climbs start; None
    /// starts level at the first leg's altitude.
    pub departure_elevation_ft: Option<f64>,
}

impl Plan<'_> {
    /// The route flown at `target` where each leg may fly it, else at the
    /// leg's own legal altitude nearest it, the lower on a tie: the
    /// altitude wheel's pick (the owner's, 2026-10-20), every leg legal.
    pub fn nearest(&self, target: f64) -> Vec<f64> {
        self.candidates
            .iter()
            .map(|options| {
                if options.contains(&target) {
                    return target;
                }
                let mut best = options[0];
                for &a in &options[1..] {
                    let (d, bd) = ((a - target).abs(), (best - target).abs());
                    if d < bd || (d == bd && a < best) {
                        best = a;
                    }
                }
                best
            })
            .collect()
    }

    /// The legs flown at `target` (`nearest`), with their climbs.
    pub fn legs_at(&self, target: f64) -> R<Vec<Obj>> {
        self.flights.legs_flown(&self.nearest(target), self.departure_elevation_ft)
    }

    /// The lowest, highest, fastest and most economical ways to fly the
    /// fixes, each as a per-leg altitude plan, and the route flown at each
    /// altitude any leg may fly (`by_altitude`).
    ///
    /// Lowest and highest are the lowest (highest) profile overall, allowed
    /// to step only where the change is worth STEP_PENALTY_FT_NM -- under a
    /// Class B shelf near the departure and up again past it, say, not for
    /// a single leg's slightly different floor. Fastest is the plan with the
    /// least time, the winds aloft at every legal altitude of every leg
    /// tried and each climb charged at climb_penalty_min. Economical is the
    /// plan that burns the least fuel, climb and cruise: the same winds,
    /// each climb charged at climb_fuel_penalty_gal. Every leg is flown at
    /// its altitude's own true airspeed and fuel flow: faster in thinner
    /// air at the same power, and burning less where full throttle no
    /// longer makes the cruise power. All four pay for the initial climb
    /// from the departure field -- from the lowest altitude anyone could
    /// fly, without one -- so their totals compare like for like.
    ///
    /// With no airplane, the lowest and highest alone -- the band's, which
    /// no airplane changes -- their times, fuel, climbs and winds along
    /// null: the fastest and the most economical are an airplane's.
    pub fn plans(&self) -> R<Value> {
        let f = &self.flights;
        let Some(profile) = f.profile else { return self.band_plans() };
        let climber = f.climber.as_ref().ok_or("an airplane with no climb")?;
        let start_ft = match self.departure_elevation_ft {
            Some(e) => e,
            None => self.candidates.iter().flatten().copied().fold(f64::INFINITY, f64::min),
        };
        let from = |prev: Option<f64>| prev.unwrap_or(start_ft);
        let climb_step = |i: usize, prev: Option<f64>, a: f64| climb_penalty_min(from(prev), a, profile, climber, Some(&f.leg_at(i, a)?));
        let fuel_step =
            |i: usize, prev: Option<f64>, a: f64| climb_fuel_penalty_gal(from(prev), a, profile, climber, Some(&f.leg_at(i, a)?));
        let fixed_step = |_: usize, prev: Option<f64>, a: f64| Ok(if prev.is_some_and(|p| p != a) { STEP_PENALTY_FT_NM } else { 0.0 });
        let minutes = |i: usize, a: f64| Ok(f.leg_at(i, a)?.opt("ete_min")?.unwrap_or(f64::INFINITY));
        let gallons = |i: usize, a: f64| Ok(f.leg_at(i, a)?.opt("fuel_gal")?.unwrap_or(f64::INFINITY));
        let low = |i: usize, a: f64| Ok(a * f.leg_at(i, a)?.num("distance_nm")?);
        let high = |i: usize, a: f64| Ok(-a * f.leg_at(i, a)?.num("distance_nm")?);
        let paths = [
            best_path(&self.candidates, &low, &fixed_step)?,
            best_path(&self.candidates, &high, &fixed_step)?,
            best_path(&self.candidates, &minutes, &climb_step)?,
            best_path(&self.candidates, &gallons, &fuel_step)?,
        ];

        // The plans' own legs carry their climbs, so the times and fuel
        // compared are the climbs' included; the legs are the truth. With no
        // climb fuel flow in the profile, no economical plan: its climbs'
        // fuel is not known, and none is assumed (the owner, 2026-11-09).
        let mut plans = Vec::with_capacity(4);
        for (kind, altitudes) in PLAN_KINDS.iter().zip(&paths).take(if climber.burn_known() { 4 } else { 3 }) {
            let legs = f.legs_flown(altitudes, self.departure_elevation_ft)?;
            let t = totals(&legs)?;
            let climb_min = py_round(py_sum(legs.iter().map(|l| l.opt("climb_min")).collect::<R<Vec<_>>>()?.into_iter().flatten()), 1);
            let tailwind = tailwind_kt(&legs)?;
            let plan = object(vec![
                ("steps", Value::Array(steps(altitudes, &legs)?)),
                // Only where a leg had no legal altitude under the cap, or
                // the profile says oxygen or a pressurised cabin.
                ("needs_oxygen", Value::Bool(altitudes.iter().any(|a| *a > OXYGEN_CAP_FT))),
                ("ete_min", t.get("ete_min").cloned().unwrap_or(Value::Null)),
                ("fuel_gal", t.get("fuel_gal").cloned().unwrap_or(Value::Null)),
                ("climb_penalty_min", number(climb_min)),
                ("tailwind_kt", opt_number(tailwind)),
                ("unflyable_legs", t.get("unflyable_legs").cloned().unwrap_or(Value::Null)),
                ("legs_without_wind", t.get("legs_without_wind").cloned().unwrap_or(Value::Null)),
                ("legs", Value::Array(legs.into_iter().map(Obj::value).collect())),
                ("totals", t),
            ]);
            plans.push((kind.to_string(), plan));
        }

        Ok(object(vec![("plans", Value::Object(plans)), ("by_altitude", Value::Array(self.by_altitude()?))]))
    }

    /// The lowest and highest plans with no airplane: each leg's altitude
    /// as an airplane's plans pick them (STEP_PENALTY_FT_NM), its legs'
    /// courses and miles, and nothing an airplane would make of them.
    fn band_plans(&self) -> R<Value> {
        let f = &self.flights;
        let fixed_step = |_: usize, prev: Option<f64>, a: f64| Ok(if prev.is_some_and(|p| p != a) { STEP_PENALTY_FT_NM } else { 0.0 });
        let low = |i: usize, a: f64| Ok(a * f.leg_at(i, a)?.num("distance_nm")?);
        let high = |i: usize, a: f64| Ok(-a * f.leg_at(i, a)?.num("distance_nm")?);
        let paths = [best_path(&self.candidates, &low, &fixed_step)?, best_path(&self.candidates, &high, &fixed_step)?];
        let mut plans = Vec::with_capacity(2);
        for (kind, altitudes) in PLAN_KINDS.iter().zip(&paths) {
            let legs = f.legs_flown(altitudes, self.departure_elevation_ft)?;
            let t = totals(&legs)?;
            let plan = object(vec![
                ("steps", Value::Array(steps(altitudes, &legs)?)),
                ("needs_oxygen", Value::Bool(altitudes.iter().any(|a| *a > OXYGEN_CAP_FT))),
                ("ete_min", Value::Null),
                ("fuel_gal", Value::Null),
                ("climb_penalty_min", Value::Null),
                ("tailwind_kt", Value::Null),
                ("unflyable_legs", t.get("unflyable_legs").cloned().unwrap_or(Value::Null)),
                ("legs_without_wind", t.get("legs_without_wind").cloned().unwrap_or(Value::Null)),
                ("legs", Value::Array(legs.into_iter().map(Obj::value).collect())),
                ("totals", t),
            ]);
            plans.push((kind.to_string(), plan));
        }
        Ok(object(vec![("plans", Value::Object(plans)), ("by_altitude", Value::Array(self.by_altitude()?))]))
    }

    /// The route flown at each altitude any leg may fly, for the altitude
    /// wheel's figures; `everywhere` says whether every leg flies it. With
    /// no airplane, its times, fuel and wind along null.
    fn by_altitude(&self) -> R<Vec<Value>> {
        let mut all: Vec<f64> = self.candidates.iter().flatten().copied().collect();
        all.stable_sort_by(f64::total_cmp);
        all.dedup();
        let mut by_altitude = Vec::with_capacity(all.len());
        for target in all {
            let legs = self.legs_at(target)?;
            let t = totals(&legs)?;
            by_altitude.push(object(vec![
                ("altitude_ft", number(target)),
                ("ete_min", t.get("ete_min").cloned().unwrap_or(Value::Null)),
                ("fuel_gal", t.get("fuel_gal").cloned().unwrap_or(Value::Null)),
                ("tailwind_kt", opt_number(tailwind_kt(&legs)?)),
                ("everywhere", Value::Bool(self.nearest(target).iter().all(|a| *a == target))),
            ]));
        }
        Ok(by_altitude)
    }
}

/// The plans of a route with stops: each the same plan flown on every hop,
/// its steps in turn and its costs summed -- the tailwind weighed by each
/// hop's length (`lengths`). One hop's as they are; none where a hop's
/// plans could not be made.
pub fn join_options(by_hop: &[Vec<Obj>], lengths: &[f64]) -> R<Vec<Value>> {
    if by_hop.len() == 1 {
        return Ok(by_hop[0].iter().cloned().map(Obj::value).collect());
    }
    if by_hop.iter().any(Vec::is_empty) {
        return Ok(Vec::new());
    }
    let mut joined = Vec::with_capacity(4);
    for kind in PLAN_KINDS {
        // With no airplane a hop's plans are the lowest and highest alone.
        if by_hop.iter().all(|options| options.iter().all(|o| o.text("kind") != Some(kind))) {
            continue;
        }
        let mine = by_hop
            .iter()
            .map(|options| options.iter().find(|o| o.text("kind") == Some(kind)).ok_or_else(|| format!("a hop has no {kind} plan")))
            .collect::<R<Vec<&Obj>>>()?;
        let total = |key: &str| -> R<Value> {
            let values = mine.iter().map(|o| o.opt(key)).collect::<R<Vec<_>>>()?;
            Ok(if values.iter().any(Option::is_none) { Value::Null } else { number(py_round(py_sum(values.into_iter().flatten()), 1)) })
        };
        let (tailwind, weight) = weighed_wind(&mine, lengths)?;
        let mut steps = Vec::new();
        for o in &mine {
            if let Some(Value::Array(s)) = o.get("steps") {
                steps.extend(s.iter().cloned());
            }
        }
        let count = |key: &str| -> R<f64> {
            Ok(py_sum(mine.iter().map(|o| o.opt(key)).collect::<R<Vec<_>>>()?.into_iter().map(|v| v.unwrap_or(0.0))))
        };
        joined.push(object(vec![
            ("kind", Value::String(kind.to_owned())),
            ("steps", Value::Array(steps)),
            ("ete_min", total("ete_min")?),
            ("fuel_gal", total("fuel_gal")?),
            (
                "climb_penalty_min",
                if mine.iter().all(|o| o.has("climb_penalty_min")) {
                    number(py_round(count("climb_penalty_min")?, 1))
                } else {
                    Value::Null
                },
            ),
            ("tailwind_kt", if weight != 0.0 { number(py_round(tailwind / weight, 1)) } else { Value::Null }),
            ("unflyable_legs", number(count("unflyable_legs")?)),
            ("legs_without_wind", number(count("legs_without_wind")?)),
            ("needs_oxygen", Value::Bool(mine.iter().any(|o| o.truthy("needs_oxygen")))),
        ]));
    }
    Ok(joined)
}

/// The wind summed times each hop's length, and the lengths summed, over
/// the hops that had a wind.
fn weighed_wind(mine: &[&Obj], lengths: &[f64]) -> R<(f64, f64)> {
    let mut winds = Vec::new();
    for (o, n) in mine.iter().zip(lengths) {
        if let Some(t) = o.opt("tailwind_kt")? {
            winds.push((t, *n));
        }
    }
    Ok((py_sum(winds.iter().map(|(t, n)| t * n)), py_sum(winds.iter().map(|(_, n)| *n))))
}

/// A route with stops' figures at each altitude (`by_altitude`), from each
/// hop's: every altitude any hop offers, each hop at it or, where it does
/// not offer it, at its own nearest (the lower on a tie), as a pilot who
/// picks it flies that hop; times and fuel summed, the wind weighed by
/// each hop's length. One hop's as they are.
///
/// A hop with no legal altitude to offer (a pilot's own altitude flown on
/// it, legal or not, with its cautions) leaves the others' altitudes on
/// the profile's ruler, which went blank for the whole route (the owner's
/// C81 - KEVU - KGCK - KABQ at 6,000 ft, its last hop with none over the
/// Sangre de Cristos); their times and fuel unknown, as that hop's are,
/// and none of them flown everywhere.
pub fn join_figures(by_hop: &[Vec<Obj>], lengths: &[f64]) -> R<Vec<Value>> {
    if by_hop.len() == 1 {
        return Ok(by_hop[0].iter().cloned().map(Obj::value).collect());
    }
    if by_hop.iter().all(Vec::is_empty) {
        return Ok(Vec::new());
    }
    let gap = by_hop.iter().any(Vec::is_empty);
    let offered: Vec<&Vec<Obj>> = by_hop.iter().filter(|f| !f.is_empty()).collect();
    let offered_nm: Vec<f64> = by_hop.iter().zip(lengths).filter(|(f, _)| !f.is_empty()).map(|(_, n)| *n).collect();
    let mut all = offered.iter().flat_map(|f| f.iter().map(|x| x.num("altitude_ft"))).collect::<R<Vec<f64>>>()?;
    all.stable_sort_by(f64::total_cmp);
    all.dedup();
    let mut joined = Vec::with_capacity(all.len());
    for target in all {
        let mut mine: Vec<&Obj> = Vec::with_capacity(offered.len());
        for figures in &offered {
            let mut best = &figures[0];
            for f in &figures[1..] {
                let (a, b) = (f.num("altitude_ft")?, best.num("altitude_ft")?);
                let (d, bd) = ((a - target).abs(), (b - target).abs());
                if d < bd || (d == bd && a < b) {
                    best = f;
                }
            }
            mine.push(best);
        }
        let total = |key: &str| -> R<Value> {
            let values = mine.iter().map(|o| o.opt(key)).collect::<R<Vec<_>>>()?;
            Ok(if gap || values.iter().any(Option::is_none) {
                Value::Null
            } else {
                number(py_round(py_sum(values.into_iter().flatten()), 1))
            })
        };
        let (tailwind, weight) = weighed_wind(&mine, &offered_nm)?;
        let everywhere = !gap && mine.iter().all(|f| f.truthy("everywhere") && f.num("altitude_ft").ok() == Some(target));
        joined.push(object(vec![
            ("altitude_ft", number(target)),
            ("ete_min", total("ete_min")?),
            ("fuel_gal", total("fuel_gal")?),
            ("tailwind_kt", if weight != 0.0 { number(py_round(tailwind / weight, 1)) } else { Value::Null }),
            ("everywhere", Value::Bool(everywhere)),
        ]));
    }
    Ok(joined)
}
