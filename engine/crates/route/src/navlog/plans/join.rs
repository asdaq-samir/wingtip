use super::*;

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
pub(super) fn weighed_wind(mine: &[&Obj], lengths: &[f64]) -> R<(f64, f64)> {
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
