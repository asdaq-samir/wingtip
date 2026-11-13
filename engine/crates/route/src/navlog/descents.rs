//! The descents flown on the legs: the planner's wingtip.navlog
//! with_descents, and where a flight landing by an instrument approach
//! comes down to (approach_end).

use super::descent_phase::{self, Segment};
use super::{number, object, opt_number, py_round, Obj, Profile, R};
use crate::geo::destination;
use crate::json::Value;
use crate::motion::profile::DESCENT_FT_PER_NM;

fn toc_along(leg: &Obj) -> R<Option<f64>> {
    match leg.get("toc") {
        Some(t @ Value::Object(_)) => Ok(Some(Obj::read("navlog", t)?.num("along_nm")?)),
        _ => Ok(None),
    }
}

/// Where a flight's descent ends: at the pattern altitude of the field it
/// lands at, or at the altitude an approach's fix is crossed at, that fix
/// `before_nm` short of the legs' end.
#[derive(Clone, Debug, Default)]
pub struct End {
    pub altitude_ft: Option<f64>,
    pub before_nm: f64,
    pub fix: Option<String>,
}

/// The legs with their tops of descent: where to leave each level to be
/// down, at three to one (DESCENT_FT_PER_NM, a ~3 degree path, AIM 2-1-2's
/// VASI angle), at the end's altitude where the legs end -- the pattern
/// altitude of the field they land at, None for legs that end in the air
/// -- and at a lower leg's altitude by the fix it starts at, where a plan
/// steps down. With an approach (`end.fix`), the descent is to the
/// altitude its fix is crossed at, `end.before_nm` short of the legs' end,
/// the rest flown down the approach as charted. A descent that would
/// start before the climb ahead of it has topped out starts at the top
/// instead, steeper. The leg a descent starts on says where (`tod`: the
/// miles, minutes and gallons into the leg, the altitude left and the one
/// descended to, whether that is the pattern's, the fix, and the rate),
/// and its top of climb (`toc`) is placed too: `fixes`, the fixes the legs
/// run between, give both a latitude and longitude.
///
/// A leg marked `start_at` (a pilot's Start At at the fix it starts from,
/// lower than the leg before it) is not reached by that fix: its descent
/// begins at the fix and runs on from there at three to one, so the leg
/// before it stays at its level to the fix and carries the top of descent
/// at its end (the rate at its ground speed). Where a level-off further
/// on needs the descent to start sooner, it does, as without the mark.
///
/// With an airplane whose profile gives a descent speed and fuel flow
/// (`profile`), each descent is flown as its own phase at them
/// (descent_phase): the legs' times and fuel are the descent's over the
/// miles descended, and its rows state its figures. Without them the
/// descent is flown at the cruise's ground speed and burn, as a handbook's
/// cruise figures would fly it, and its top of descent says so
/// (`descent_at_cruise`) for the app to ask for them.
pub fn with_descents(legs: &[Obj], fixes: &[Obj], end: &End, profile: Option<&Profile>) -> R<Vec<Obj>> {
    let mut out: Vec<Obj> = legs
        .iter()
        .map(|l| {
            let mut l = l.clone();
            let toc = l.get("toc").cloned().unwrap_or(Value::Null);
            l.set("toc", toc);
            l.set("tod", Value::Null);
            l
        })
        .collect();
    if out.is_empty() {
        return Ok(out);
    }
    if fixes.len() < out.len() {
        return Err(format!("{} legs run between {} fixes", out.len(), fixes.len()));
    }
    let distances = out.iter().map(|l| l.num("distance_nm")).collect::<R<Vec<f64>>>()?;
    let altitudes = out.iter().map(|l| l.num("altitude_ft")).collect::<R<Vec<f64>>>()?;
    let mut ends = Vec::with_capacity(out.len());
    let mut run = 0.0;
    for d in &distances {
        run += d;
        ends.push(run);
    }
    let starts: Vec<f64> = ends.iter().zip(&distances).map(|(e, d)| e - d).collect();
    let ft_per_nm = DESCENT_FT_PER_NM;
    let last = *ends.last().unwrap_or(&0.0);

    // Backward from the end: the highest each leg's end can be and still
    // make every level-off after it, and the level-off that binds -- its
    // altitude, where along the legs it is, whether it is the pattern's,
    // and the fix. The stretch after the level-off at the end: none down
    // to a pattern, an approach's from its fix in, flown at or below the
    // fix's altitude.
    type Binds = (f64, f64, bool, Option<String>);
    let level_off = last - end.before_nm.max(0.0).min(last);
    let mut flat_nm = last - level_off;
    let (mut limit_ft, mut binds): (f64, Option<Binds>) = match end.altitude_ft {
        None => (f64::INFINITY, None),
        Some(ft) => (ft, Some((ft, level_off, end.fix.is_none(), end.fix.clone()))),
    };
    // Each descent: where it starts, its leg, the altitude it leaves, and
    // the level-off it binds to.
    let mut tods: Vec<(f64, usize, f64, Binds)> = Vec::new();
    for i in (0..out.len()).rev() {
        let (altitude, distance) = (altitudes[i], distances[i]);
        let flat = flat_nm.min(distance);
        flat_nm -= flat;
        if altitude > limit_ft {
            // On this leg, or at its start where it cannot have started
            // sooner: the first leg, or one climbed to.
            let down_nm = (altitude - limit_ft) / ft_per_nm;
            if (down_nm < distance - flat || i == 0 || altitudes[i - 1] < altitude)
                && let Some(b) = &binds
            {
                tods.push((starts[i].max(ends[i] - flat - down_nm), i, altitude, b.clone()));
            }
        }
        limit_ft += (distance - flat) * ft_per_nm;
        if i > 0 && out[i].truthy("start_at") && altitudes[i - 1] > altitude {
            // Start At: the leg's own level binds nothing before its fix.
            // The descent to it begins at the fix, unless a level-off
            // further on has the leg before it come down sooner. It is the
            // leg before's top of descent, at its very end, so this leg
            // keeps its own for a descent further on (to the pattern, say).
            let from_ft = altitudes[i - 1];
            if from_ft <= limit_ft {
                let level_at = starts[i] + (from_ft - altitude) / ft_per_nm;
                tods.push((ends[i - 1], i - 1, from_ft, (altitude, level_at, false, None)));
            }
        } else if altitude <= limit_ft {
            limit_ft = altitude;
            binds = Some((altitude, starts[i], false, None));
            flat_nm = 0.0;
        }
    }

    // Each climb's ground, from the start of a leg it climbs on to its
    // top, and the tops in order.
    let mut climbs = Vec::new();
    let mut tops = Vec::new();
    for (i, leg) in out.iter().enumerate() {
        let toc = toc_along(leg)?;
        if leg.truthy("climb_min") {
            climbs.push((starts[i], starts[i] + toc.unwrap_or(distances[i])));
        }
        if let Some(along) = toc {
            tops.push((starts[i] + along, i));
        }
    }
    let mut flown = Vec::new();
    for (at, i, from_ft, (to_ft, level_at, pattern, fix)) in tods.into_iter().rev() {
        let (mut at, mut i) = (at, i);
        if climbs.iter().any(|(a, b)| *a <= at && at < *b) {
            match tops.iter().find(|(t, _)| *t >= at) {
                Some((t, j)) => (at, i) = (*t, *j),
                None => continue,
            }
        }
        let leg = &out[i];
        let gs = leg.opt("groundspeed_kt")?.unwrap_or(0.0);
        if leg.has("tod") || gs == 0.0 || !leg.has("ete_min") || from_ft <= to_ft || level_at - at < 0.05 {
            continue;
        }
        // What is flown after the top of descent: the rest of the leg's
        // line at its ground speed, and what is flown at the leg's end
        // beyond its line (flown_at_end), its procedure and a hold there.
        let (end_min, end_gal) = flown_at_end(leg)?;
        let rest_min = (ends[i] - at) / gs * 60.0 + end_min;
        let at_fix = &fixes[i];
        let (lat, lon) = destination(at_fix.num("lat")?, at_fix.num("lon")?, leg.num("true_course_deg")?, at - starts[i]);
        let fuel = leg
            .opt("fuel_gal")?
            .map(|f| py_round((f - (ends[i] - at) / gs * leg.num("fuel_burn_gph").unwrap_or(f64::NAN) - end_gal).max(0.0), 2));
        let ete = leg.num("ete_min")?;
        // The ground speed's share of three to one, or what is left where
        // the descent starts late, to the nearest 50 fpm.
        let fpm = ((from_ft - to_ft) / ((level_at - at) / gs * 60.0) / 50.0).round_ties_even() * 50.0;
        let tod = object(vec![
            ("along_nm", number(py_round(at - starts[i], 1))),
            ("ete_min", number(py_round((ete - rest_min).max(0.0), 1))),
            ("fuel_gal", opt_number(fuel)),
            ("altitude_ft", number(from_ft)),
            ("to_ft", number(to_ft)),
            ("pattern", Value::Bool(pattern)),
            ("fix", fix.map(Value::String).unwrap_or(Value::Null)),
            ("fpm", number(fpm)),
            ("lat", number(lat)),
            ("lon", number(lon)),
        ]);
        out[i].set("tod", tod);
        flown.push(Segment { at, level_at, from_ft, to_ft, leg: i });
    }
    // Each descent flown as its own phase where the airplane has its
    // figures, else on the cruise's and its top of descent says so.
    descent_phase::fly(&mut out, &starts, &ends, &flown, profile)?;
    for (i, leg) in out.iter_mut().enumerate() {
        if let Some(along) = toc_along(leg)? {
            let (lat, lon) = destination(fixes[i].num("lat")?, fixes[i].num("lon")?, leg.num("true_course_deg")?, along);
            let mut toc = Obj::read("navlog", leg.get("toc").unwrap_or(&Value::Null))?;
            toc.set_num("lat", lat);
            toc.set_num("lon", lon);
            leg.set("toc", toc.value());
        }
    }
    Ok(out)
}

/// The minutes and gallons a leg flies beyond its own line, counted at
/// its end and so after any top of descent on it: a procedure's miles more
/// (`procedure`'s `more_min`, `more_gal`: the planner's with_procedures,
/// a traffic pattern's entry and legs to land, AIM 4-3-3 and AC 90-66C, an
/// arrival or an approach, or the pattern out of the field), and a hold at
/// the leg's end (`hold` with `at_end`, hold_on_leg). The planner adds them
/// to the leg's `ete_min` and `fuel_gal` before the descent is placed, so
/// a top of descent worked back from the leg's total took them into the
/// minutes and gallons flown to it, about 2 to 3 minutes a pattern early
/// (navlog-fit.spec, 2026-11-12). A departure's pattern is flown at the
/// leg's start, but its minutes are counted at the end too, as a top of
/// climb's are (with_climbs places the climb before the procedure is
/// added) and as the apps show a procedure's miles on the row that ends
/// the leg: the leg's time to its end is exact either way, and a top of
/// descent on a leg that also departs by a pattern -- a flight of one leg
/// -- is put that many minutes sooner than flown, never later.
pub(super) fn flown_at_end(leg: &Obj) -> R<(f64, f64)> {
    let mut minutes = 0.0;
    let mut gallons = 0.0;
    if let Some(p @ Value::Object(_)) = leg.get("procedure") {
        let p = Obj::read("navlog", p)?;
        minutes += p.opt("more_min")?.unwrap_or(0.0);
        gallons += p.opt("more_gal")?.unwrap_or(0.0);
    }
    if let Some(h @ Value::Object(_)) = leg.get("hold") {
        let h = Obj::read("navlog", h)?;
        if h.truthy("at_end") {
            minutes += h.opt("minutes")?.unwrap_or(0.0);
            gallons += h.opt("gal")?.unwrap_or(0.0);
        }
    }
    Ok((minutes, gallons))
}

/// One of an instrument approach's fixes as the planner draws it from the
/// FAA's CIFP (wingtip.procedures): the chart's lowest altitude for it and
/// its highest (ARINC 424-18 5.29, as the plate prints them, AIM 5-4-5),
/// and whether it is the missed approach's.
pub struct ApproachFix {
    pub ident: String,
    pub lat: f64,
    pub lon: f64,
    pub min_ft: Option<f64>,
    pub max_ft: Option<f64>,
    pub missed: bool,
}

/// Where a flight landing by an instrument approach comes down to: the
/// altitude its first fix with one under the cruise (`cruise_ft`) is
/// crossed at, the fix, and the fix's distance from the field. The first
/// fix is the transition's initial approach fix, or from vectors the
/// intermediate fix; a plan cruising at or under its altitude comes down
/// to the next fix lower, the final approach fix's, say, as the approach
/// steps down. The altitude is the chart's lowest for the fix, or its
/// highest where it is crossed at or below one. The route runs to the
/// field, not to the fix: the descent ends where the route is the fix's
/// own distance out, and the approach is flown from there as charted.
/// None where no fix is under the cruise: down to the pattern.
pub fn approach_end(fixes: &[ApproachFix], cruise_ft: Option<f64>, field: (f64, f64)) -> Option<End> {
    fixes
        .iter()
        .filter(|f| !f.missed)
        .filter_map(|f| f.min_ft.or(f.max_ft).map(|ft| (f, ft)))
        .find(|(_, ft)| *ft != 0.0 && cruise_ft.is_none_or(|c| *ft < c))
        .map(|(f, ft)| End {
            altitude_ft: Some(ft),
            before_nm: crate::geo::distance_nm(f.lat, f.lon, field.0, field.1),
            fix: Some(f.ident.clone()),
        })
}
