use super::*;

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
        let climb_step = |i: usize, prev: Option<f64>, a: f64| climb_penalty_min(from(prev), a, profile, climber, Some(&*f.leg_at(i, a)?));
        let fuel_step =
            |i: usize, prev: Option<f64>, a: f64| climb_fuel_penalty_gal(from(prev), a, profile, climber, Some(&*f.leg_at(i, a)?));
        let minutes = |i: usize, a: f64| Ok(f.leg_at(i, a)?.opt("ete_min")?.unwrap_or(f64::INFINITY));
        let gallons = |i: usize, a: f64| Ok(f.leg_at(i, a)?.opt("fuel_gal")?.unwrap_or(f64::INFINITY));
        let [lowest, highest] = self.band_paths()?;
        let paths =
            [lowest, highest, best_path(&self.candidates, &minutes, &climb_step)?, best_path(&self.candidates, &gallons, &fuel_step)?];

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
            let flown = [member(&t, "ete_min"), member(&t, "fuel_gal"), number(climb_min), opt_number(tailwind)];
            plans.push((kind.to_string(), plan_object(altitudes, legs, t, flown)?));
        }

        Ok(object(vec![("plans", Value::Object(plans)), ("by_altitude", Value::Array(self.by_altitude()?))]))
    }

    /// The lowest and highest plans with no airplane: each leg's altitude
    /// as an airplane's plans pick them (STEP_PENALTY_FT_NM), its legs'
    /// courses and miles, and nothing an airplane would make of them.
    pub(super) fn band_plans(&self) -> R<Value> {
        let paths = self.band_paths()?;
        let mut plans = Vec::with_capacity(2);
        for (kind, altitudes) in PLAN_KINDS.iter().zip(&paths) {
            let legs = self.flights.legs_flown(altitudes, self.departure_elevation_ft)?;
            let t = totals(&legs)?;
            let flown = [Value::Null, Value::Null, Value::Null, Value::Null];
            plans.push((kind.to_string(), plan_object(altitudes, legs, t, flown)?));
        }
        Ok(object(vec![("plans", Value::Object(plans)), ("by_altitude", Value::Array(self.by_altitude()?))]))
    }

    /// The lowest and highest profiles overall, each allowed to step only
    /// where the change is worth STEP_PENALTY_FT_NM: the band's two plans,
    /// which an airplane's plans and the plans with none both start from.
    fn band_paths(&self) -> R<[Vec<f64>; 2]> {
        let f = &self.flights;
        let fixed_step = |_: usize, prev: Option<f64>, a: f64| Ok(if prev.is_some_and(|p| p != a) { STEP_PENALTY_FT_NM } else { 0.0 });
        let low = |i: usize, a: f64| Ok(a * f.leg_at(i, a)?.num("distance_nm")?);
        let high = |i: usize, a: f64| Ok(-a * f.leg_at(i, a)?.num("distance_nm")?);
        Ok([best_path(&self.candidates, &low, &fixed_step)?, best_path(&self.candidates, &high, &fixed_step)?])
    }

    /// The route flown at each altitude any leg may fly, for the altitude
    /// wheel's figures; `everywhere` says whether every leg flies it. With
    /// no airplane, its times, fuel and wind along null.
    pub(super) fn by_altitude(&self) -> R<Vec<Value>> {
        let mut all: Vec<f64> = self.candidates.iter().flatten().copied().collect();
        all.stable_sort_by(f64::total_cmp);
        all.dedup();
        let mut by_altitude = Vec::with_capacity(all.len());
        for target in all {
            let legs = self.legs_at(target)?;
            let t = totals(&legs)?;
            by_altitude.push(object(vec![
                ("altitude_ft", number(target)),
                ("ete_min", member(&t, "ete_min")),
                ("fuel_gal", member(&t, "fuel_gal")),
                ("tailwind_kt", opt_number(tailwind_kt(&legs)?)),
                ("everywhere", Value::Bool(self.nearest(target).iter().all(|a| *a == target))),
            ]));
        }
        Ok(by_altitude)
    }
}

/// Member `key` of the totals, null where they have none.
fn member(totals: &Value, key: &str) -> Value {
    totals.get(key).cloned().unwrap_or(Value::Null)
}

/// One plan as the planner sends it: its steps, whether it needs oxygen,
/// `flown` (its ete_min, fuel_gal, climb_penalty_min and tailwind_kt: an
/// airplane's figures, all null with none), and its legs and totals.
fn plan_object(altitudes: &[f64], legs: Vec<Obj>, t: Value, flown: [Value; 4]) -> R<Value> {
    let [ete_min, fuel_gal, climb_penalty_min, tailwind_kt] = flown;
    Ok(object(vec![
        ("steps", Value::Array(steps(altitudes, &legs)?)),
        // Only where a leg had no legal altitude under the cap, or
        // the profile says oxygen or a pressurised cabin.
        ("needs_oxygen", Value::Bool(altitudes.iter().any(|a| *a > OXYGEN_CAP_FT))),
        ("ete_min", ete_min),
        ("fuel_gal", fuel_gal),
        ("climb_penalty_min", climb_penalty_min),
        ("tailwind_kt", tailwind_kt),
        ("unflyable_legs", member(&t, "unflyable_legs")),
        ("legs_without_wind", member(&t, "legs_without_wind")),
        ("legs", Value::Array(legs.into_iter().map(Obj::value).collect())),
        ("totals", t),
    ]))
}
