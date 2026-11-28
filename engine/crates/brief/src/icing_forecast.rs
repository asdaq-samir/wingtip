//! Forecast icing on an IFR route (#216, item 6): the icing severity
//! forecast on each leg at the altitude it is flown, and the layer the icing
//! is in, read from a vertical section along the leg (AIM 7-1-4: "icing ...
//! forecasts are available ... from the surface up to 30,000 ft MSL"). The
//! planner samples each leg's section out of the NWS's Current Icing
//! Product analysis and its In-Flight Icing forecast grids, which the
//! weather service keeps (wingtip.icing_forecast; NWS SCN 26-87 and 25-80);
//! what the section says for the flight is decided here, and which stored
//! hours a leg is read off and how they merge (`icing_forecast_hours`, a
//! leg's `hours`): the nearest its middle and every other within an hour,
//! each point and level the worst of them (the owner, 2026-11-27, "Grids,
//! worst of nearby hours").
//!
//! A section is `width` columns along the leg by `data_levels` levels up,
//! its `values` level-fastest (`values[level + column * data_levels]`, as
//! the AWC's own page reads them), each the severity category: 0 none, 1
//! trace, 2 light, 3 moderate, 4 severe (GRIB2 code table 4.228, "none,
//! trace, light, moderate, and severe", as NWS SCN 26-87 gives the CIP's
//! and the IFI's; AIM 7-1-19's scale ends at severe too), a negative value
//! no forecast there. `sfc_hgt` is
//! the ground under each column in metres; a level under it is ground, not
//! air, and is not read.
//!
//! **At the altitude flown**: the levels either side of it (the one at it
//! where there is one), the worse of the two, so an altitude between the
//! section's levels -- 1,000 ft apart up to 25,000 ft, 2,000 above -- is
//! never read as the clearer. Any icing there, trace or worse, is a
//! caution: AIM 7-1-19 has even trace icing as the pilot's cue that "the
//! pilot should consider exiting the icing conditions before they become
//! worse", and most light airplanes' manuals prohibit flight into known
//! icing, a limitation 14 CFR 91.9(a) binds. A forecast is not a report:
//! the line says it is the forecast's.

use crate::figures::words::{feet, grouped};
use crate::json::{self, Value};
use wingtip_core::sort::StableSort;
use wingtip_core::units::FT_PER_M;

/// The severity categories by their number (GRIB2 code table 4.228 as the
/// NWS's CIP and IFI give them; AIM 7-1-19's scale).
pub const SEVERITY: [&str; 5] = ["none", "trace", "light", "moderate", "severe"];

type R<T> = Result<T, String>;

/// One leg's section as the planner samples it off a stored hour.
struct Section<'a> {
    width: usize,
    levels: usize,
    /// The categories, level-fastest; NaN where a value is not a number.
    values: Vec<f64>,
    ground_m: Option<&'a [Value]>,
}

impl Section<'_> {
    /// The category at `level` over `column`; None where there is no
    /// forecast there or the level is under the ground.
    fn at(&self, column: usize, level: usize, levels_ft: &[f64]) -> Option<u8> {
        if let Some(ground) = self.ground_m.and_then(|g| g.get(column)).and_then(Value::as_f64)
            && levels_ft[level] < ground * FT_PER_M
        {
            return None;
        }
        let v = self.values[level + column * self.levels];
        (v >= 0.0).then(|| (v.round() as i64).clamp(0, 4) as u8)
    }
}

fn parse<'a>(name: &str, s: &'a Value, levels_ft: &[f64]) -> R<Section<'a>> {
    let count = |key: &str| s.get(key).and_then(Value::as_f64).filter(|n| *n >= 0.0 && n.fract() == 0.0).map(|n| n as usize);
    let width = count("width").ok_or_else(|| format!("{name}: a section's \"width\" is missing"))?;
    let levels = count("data_levels").ok_or_else(|| format!("{name}: a section's \"data_levels\" is missing"))?;
    let values = s.get("values").and_then(Value::as_array).ok_or_else(|| format!("{name}: a section's \"values\" are missing"))?;
    if levels != levels_ft.len() {
        return Err(format!("{name}: a section has {levels} levels, and \"levels_ft\" {}", levels_ft.len()));
    }
    if values.len() != width * levels {
        return Err(format!("{name}: a section of {width} by {levels} has {} values", values.len()));
    }
    let ground_m = s.get("sfc_hgt").and_then(Value::as_array).filter(|g| g.len() == width);
    Ok(Section { width, levels, values: values.iter().map(|v| v.as_f64().unwrap_or(f64::NAN)).collect(), ground_m })
}

/// A member there and not null.
fn present(v: Option<&Value>) -> Option<&Value> {
    v.filter(|s| !matches!(s, Value::Null))
}

/// A leg's section, and, where the leg sends the stored hours near it
/// (`hours`, the nearest first, as `icing_forecast_hours` picks them), the
/// nearest hour's own beside it.
///
/// The hours merge as the owner chose (2026-11-27, "Grids, worst of nearby
/// hours"; the review that day found the IFI alone a category or two under
/// the AWC's sections on some legs): each point and level the worst
/// category of every hour sent, so a leg is never read under the worst the
/// store holds near it. An hour whose grid could not be read (null) is
/// left out; with the nearest hour's gone the leg is unchecked, never
/// clear. The ground is the nearest hour's section's.
fn sections<'a>(name: &str, v: &'a Value, levels_ft: &[f64]) -> R<(Option<Section<'a>>, Option<Section<'a>>)> {
    let Some(hours) = present(v.get("hours")) else {
        return Ok((present(v.get("section")).map(|s| parse(name, s, levels_ft)).transpose()?, None));
    };
    let hours = hours.as_array().ok_or_else(|| format!("{name}: a leg's \"hours\" are not a list"))?;
    let Some(first) = present(hours.first()) else { return Ok((None, None)) };
    let nearest = parse(name, first, levels_ft)?;
    let mut worst = Section { width: nearest.width, levels: nearest.levels, values: nearest.values.clone(), ground_m: nearest.ground_m };
    for other in hours[1..].iter().filter(|h| !matches!(h, Value::Null)) {
        let other = parse(name, other, levels_ft)?;
        if other.width != worst.width {
            return Err(format!("{name}: a leg's hours are {} and {} columns wide", worst.width, other.width));
        }
        // f64::max keeps the number where one side is none (NaN).
        worst.values.iter_mut().zip(&other.values).for_each(|(w, o)| *w = w.max(*o));
    }
    Ok((Some(worst), Some(nearest)))
}

/// The levels read for an altitude: the highest at or under it and the
/// lowest at or over it, one where it is on a level; the lowest or the
/// highest alone off either end.
fn levels_for(altitude_ft: f64, levels_ft: &[f64]) -> Vec<usize> {
    let under = levels_ft.iter().rposition(|l| *l <= altitude_ft);
    let over = levels_ft.iter().position(|l| *l >= altitude_ft);
    let mut out: Vec<usize> = [under, over].into_iter().flatten().collect();
    out.dedup();
    out
}

fn obj(members: Vec<(&str, Value)>) -> Value {
    Value::Object(members.into_iter().map(|(k, v)| (k.to_owned(), v)).collect())
}

fn severity_value(s: Option<u8>) -> Value {
    s.map_or(Value::Null, |s| Value::String(SEVERITY[s as usize].to_owned()))
}

/// The worst category at the altitude over the leg, and the columns iced
/// there and known (`(iced, known)`; known 0 where no column is).
fn at_altitude(s: &Section, altitude_ft: f64, levels_ft: &[f64]) -> (Option<u8>, (usize, usize)) {
    let read = levels_for(altitude_ft, levels_ft);
    let (mut known, mut iced, mut worst): (usize, usize, Option<u8>) = (0, 0, None);
    for column in 0..s.width {
        let here = read.iter().filter_map(|l| s.at(column, *l, levels_ft)).max();
        if let Some(c) = here {
            known += 1;
            if c > 0 {
                iced += 1;
            }
            worst = Some(worst.map_or(c, |w| w.max(c)));
        }
    }
    (worst, (iced, known))
}

/// The share of the leg in icing, to a hundredth; None where no column is
/// known.
fn share_of((iced, known): (usize, usize)) -> Option<f64> {
    (known > 0).then(|| (iced as f64 / known as f64 * 100.0).round() / 100.0)
}

/// One leg: the worst at its altitude, the share of the leg in icing there,
/// and the layer icing is forecast in over the leg at any level. `own`, the
/// nearest hour's section where `s` merges the hours near it: the share is
/// its own, as its grid gives it, not raised by the merging -- unless it
/// has no icing at the altitude while the merged section has, when the
/// merged share goes with the severity it found (a share of none beside a
/// severity is no answer).
fn leg(index: usize, altitude_ft: f64, s: Option<&Section>, own: Option<&Section>, levels_ft: &[f64], valid: Value) -> (Value, Option<u8>) {
    let Some(s) = s else {
        return (
            obj(vec![
                ("index", Value::Number(index as f64)),
                ("altitude_ft", Value::Number(altitude_ft)),
                ("severity", Value::Null),
                ("share", Value::Null),
                ("layer", Value::Null),
                ("valid_s", valid),
            ]),
            None,
        );
    };
    let (worst, merged) = at_altitude(s, altitude_ft, levels_ft);
    let mut share = share_of(merged);
    // Whether the nearest hour has icing at all is its count of iced
    // columns, not its share rounded: one column in two hundred rounds to
    // none yet is icing of its own, and its share stands.
    if let Some(own) = own
        && worst.is_some_and(|c| c > 0)
        && let (_, counted @ (iced, _)) = at_altitude(own, altitude_ft, levels_ft)
        && iced > 0
    {
        share = share_of(counted);
    }
    let (mut bottom, mut top): (Option<f64>, Option<f64>) = (None, None);
    for column in 0..s.width {
        for (level, ft) in levels_ft.iter().enumerate() {
            if s.at(column, level, levels_ft).is_some_and(|c| c > 0) {
                bottom = Some(bottom.map_or(*ft, |b| b.min(*ft)));
                top = Some(top.map_or(*ft, |t| t.max(*ft)));
            }
        }
    }
    let layer = match (bottom, top) {
        (Some(b), Some(t)) => obj(vec![("bottom_ft", Value::Number(b)), ("top_ft", Value::Number(t))]),
        _ => Value::Null,
    };
    let share = share.map_or(Value::Null, Value::Number);
    (
        obj(vec![
            ("index", Value::Number(index as f64)),
            ("altitude_ft", Value::Number(altitude_ft)),
            ("severity", severity_value(worst)),
            ("share", share),
            ("layer", layer),
            ("valid_s", valid),
        ]),
        worst,
    )
}

/// "2", "2 and 3", "1, 2 and 4": the legs by their numbers from 1.
fn numbers(legs: &[usize]) -> String {
    let words: Vec<String> = legs.iter().map(|i| (i + 1).to_string()).collect();
    match words.as_slice() {
        [] => String::new(),
        [one] => one.clone(),
        [rest @ .., last] => format!("{} and {last}", rest.join(", ")),
    }
}

/// The route: each leg, the worst forecast at an altitude flown and the
/// legs it is on, the legs left unchecked, and the Go / No-Go's line.
fn route(name: &str, v: &Value) -> R<Value> {
    let levels_ft: Vec<f64> = v
        .get("levels_ft")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{name}: \"levels_ft\" is missing"))?
        .iter()
        .map(|l| l.as_f64().ok_or_else(|| format!("{name}: a level is not a number")))
        .collect::<R<_>>()?;
    if levels_ft.windows(2).any(|w| w[0] >= w[1]) {
        return Err(format!("{name}: \"levels_ft\" do not climb"));
    }
    let legs = v.get("legs").and_then(Value::as_array).ok_or_else(|| format!("{name}: \"legs\" are missing"))?;
    let mut out = Vec::new();
    let mut found: Vec<(usize, f64, u8)> = Vec::new();
    let mut unchecked = Vec::new();
    for (i, l) in legs.iter().enumerate() {
        let altitude_ft =
            l.get("altitude_ft").and_then(Value::as_f64).ok_or_else(|| format!("{name}: leg {i}'s \"altitude_ft\" is missing"))?;
        let (s, own) = sections(name, l, &levels_ft)?;
        let valid = l.get("valid_s").and_then(Value::as_f64).map_or(Value::Null, Value::Number);
        let (answer, worst) = leg(i, altitude_ft, s.as_ref(), own.as_ref(), &levels_ft, valid);
        match worst {
            None => unchecked.push(Value::Number(i as f64)),
            Some(c) => found.push((i, altitude_ft, c)),
        }
        out.push(answer);
    }
    let worst = found.iter().map(|f| f.2).max().filter(|c| *c > 0);
    let (worst_value, line) = match worst {
        None => (Value::Null, Value::Null),
        Some(c) => {
            let on: Vec<usize> = found.iter().filter(|f| f.2 == c).map(|f| f.0).collect();
            let mut at: Vec<f64> = found.iter().filter(|f| f.2 == c).map(|f| f.1).collect();
            at.stable_sort_by(f64::total_cmp);
            at.dedup();
            let altitudes = match at.as_slice() {
                [one] => feet(*one),
                [rest @ .., last] => format!("{} and {}", rest.iter().map(|a| grouped(*a)).collect::<Vec<_>>().join(", "), feet(*last)),
                [] => String::new(),
            };
            let legs_word = if on.len() == 1 { "leg" } else { "legs" };
            (
                obj(vec![
                    ("severity", Value::String(SEVERITY[c as usize].to_owned())),
                    ("altitudes_ft", Value::Array(at.iter().map(|a| Value::Number(*a)).collect())),
                    ("legs", Value::Array(on.iter().map(|i| Value::Number(*i as f64)).collect())),
                ]),
                Value::String(format!("Forecast icing, {}, at {altitudes} on {legs_word} {}", SEVERITY[c as usize], numbers(&on))),
            )
        }
    };
    Ok(obj(vec![("legs", Value::Array(out)), ("worst", worst_value), ("unchecked", Value::Array(unchecked)), ("line", line)]))
}

/// How far past the stored cycle's last hour, or before its first, a leg is
/// still read from it:
/// the stored hours are an hour apart, and each stands for the half hour
/// either side of it.
const HALF_HOUR_S: f64 = 1800.0;

/// How near a leg's middle another stored hour is read beside the nearest:
/// the hours either side of it (the owner, 2026-11-27, "Grids, worst of
/// nearby hours").
const NEAR_S: f64 = 3600.0;

/// The stored hours a leg whose middle is at `middle_s` is read off, the
/// nearest first -- the CIP's analysis where it and an IFI hour are as
/// near, the earliest for a time just before them all -- then every other within
/// NEAR_S of it in the order stored; none for a time more than half an
/// hour past the last or before the first, as each hour stands for the
/// half hour either side of it and no further.
fn hours_for(times: &[(f64, bool)], middle_s: f64) -> Vec<usize> {
    let last = times.iter().map(|t| t.0).fold(f64::NEG_INFINITY, f64::max);
    let first = times.iter().map(|t| t.0).fold(f64::INFINITY, f64::min);
    if times.is_empty() || middle_s > last + HALF_HOUR_S || middle_s < first - HALF_HOUR_S {
        return Vec::new();
    }
    let mut nearest = 0;
    for (i, (t, cip)) in times.iter().enumerate() {
        let (best, best_cip) = times[nearest];
        let (d, best_d) = ((t - middle_s).abs(), (best - middle_s).abs());
        if d < best_d || (d == best_d && *cip && !best_cip) {
            nearest = i;
        }
    }
    let near = (0..times.len()).filter(|i| *i != nearest && (times[*i].0 - middle_s).abs() < NEAR_S);
    std::iter::once(nearest).chain(near).collect()
}

/// `icing_forecast_hours`: which stored hours each leg is read off, by
/// index, for the planner to sample and send back as the leg's `hours`.
fn hours(name: &str, v: &Value) -> R<Value> {
    let stored = v.get("hours").and_then(Value::as_array).ok_or_else(|| format!("{name}: \"hours\" are missing"))?;
    let times: Vec<(f64, bool)> = stored
        .iter()
        .map(|h| {
            let t = h.get("valid_s").and_then(Value::as_f64).ok_or_else(|| format!("{name}: an hour's \"valid_s\" is missing"))?;
            Ok((t, h.get("source").and_then(Value::as_str) == Some("cip")))
        })
        .collect::<R<_>>()?;
    let middles = v.get("middles_s").and_then(Value::as_array).ok_or_else(|| format!("{name}: \"middles_s\" are missing"))?;
    let legs = middles
        .iter()
        .map(|m| {
            let m = m.as_f64().ok_or_else(|| format!("{name}: a middle is not a number"))?;
            Ok(Value::Array(hours_for(&times, m).into_iter().map(|i| Value::Number(i as f64)).collect()))
        })
        .collect::<R<_>>()?;
    Ok(obj(vec![("legs", Value::Array(legs))]))
}

/// The rule `name` worked on `v`.
pub fn call(name: &str, v: &Value) -> R<String> {
    let answer = match name {
        "icing_forecast_route" => route(name, v)?,
        "icing_forecast_hours" => hours(name, v)?,
        _ => return Err(format!("the engine has no rule called {name:?}")),
    };
    let mut out = String::new();
    json::value(&mut out, &answer);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const LEVELS: [f64; 4] = [3000.0, 4000.0, 5000.0, 6000.0];

    #[test]
    fn an_altitude_between_levels_reads_both() {
        assert_eq!(levels_for(4500.0, &LEVELS), vec![1, 2]);
        assert_eq!(levels_for(4000.0, &LEVELS), vec![1]);
        assert_eq!(levels_for(2000.0, &LEVELS), vec![0]);
        assert_eq!(levels_for(9000.0, &LEVELS), vec![3]);
    }

    #[test]
    fn a_leg_reads_the_nearest_hour_first_then_those_within_an_hour() {
        // 13Z IFI, 14Z IFI, 14Z CIP, 15Z IFI; a middle at 14:10Z.
        let t = |h: f64| h * 3600.0;
        let stored = [(t(13.0), false), (t(14.0), false), (t(14.0), true), (t(15.0), false)];
        // 13Z is 70 minutes off, 15Z 50.
        assert_eq!(hours_for(&stored, t(14.0) + 600.0), vec![2, 1, 3]);
        // On the hour: the CIP's, then the IFI's same hour; 13Z and 15Z are
        // an hour off, not within it.
        assert_eq!(hours_for(&stored, t(14.0)), vec![2, 1]);
        // Half an hour past the last is still read; a second more is not.
        assert_eq!(hours_for(&stored, t(15.5)), vec![3]);
        assert!(hours_for(&stored, t(15.5) + 1.0).is_empty());
        // Half an hour before the first is read off it; a second more, or
        // hours before them all, is not.
        assert_eq!(hours_for(&stored, t(12.5)), vec![0]);
        assert!(hours_for(&stored, t(12.5) - 1.0).is_empty());
        assert!(hours_for(&stored, t(10.0)).is_empty());
        assert!(hours_for(&[], t(10.0)).is_empty());
    }

    #[test]
    fn the_legs_are_said_by_their_numbers() {
        assert_eq!(numbers(&[1]), "2");
        assert_eq!(numbers(&[1, 2]), "2 and 3");
        assert_eq!(numbers(&[0, 1, 3]), "1, 2 and 4");
    }
}
