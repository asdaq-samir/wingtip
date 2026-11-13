//! Forecast icing on an IFR route (#216, item 6): the icing severity the
//! Aviation Weather Center forecasts on each leg at the altitude it is
//! flown, and the layer the icing is in, read from the AWC's vertical
//! cross-sections along the leg -- the icing its Graphical Forecasts for
//! Aviation draw (AIM 7-1-4: "icing ... forecasts are available ... from the
//! surface up to 30,000 ft MSL"), which the AWC makes from its Current and
//! Forecast Icing Products (CIP, FIP). The planner fetches each leg's
//! section for the hour the airplane is on it (wingtip.icing_forecast); what
//! the section says for the flight is decided here.
//!
//! A section is `width` columns along the leg by `data_levels` levels up,
//! its `values` level-fastest (`values[level + column * data_levels]`, as
//! the AWC's own page reads them), each the AWC's severity category: 0
//! none, 1 trace, 2 light, 3 moderate, 4 heavy (the GFA's legend: "Trace,
//! Light, Mod, Heavy"), a negative value no forecast there. `sfc_hgt` is
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

/// The AWC's severity categories by their number (the GFA's legend; "heavy"
/// is the AWC's word where AIM 7-1-19's scale ends at "severe").
pub const SEVERITY: [&str; 5] = ["none", "trace", "light", "moderate", "heavy"];

type R<T> = Result<T, String>;

/// One leg's section as the AWC sends it.
struct Section<'a> {
    width: usize,
    levels: usize,
    values: &'a [Value],
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
        let v = self.values[level + column * self.levels].as_f64()?;
        (v >= 0.0).then(|| (v.round() as i64).clamp(0, 4) as u8)
    }
}

fn section<'a>(name: &str, v: &'a Value, levels_ft: &[f64]) -> R<Option<Section<'a>>> {
    let s = match v.get("section") {
        None | Some(Value::Null) => return Ok(None),
        Some(s) => s,
    };
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
    Ok(Some(Section { width, levels, values, ground_m }))
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

/// One leg: the worst at its altitude, the share of the leg in icing there,
/// and the layer icing is forecast in over the leg at any level.
fn leg(index: usize, altitude_ft: f64, s: Option<&Section>, levels_ft: &[f64], valid: Value) -> (Value, Option<u8>) {
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
    let share = if known == 0 { Value::Null } else { Value::Number((iced as f64 / known as f64 * 100.0).round() / 100.0) };
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
        let s = section(name, l, &levels_ft)?;
        let valid = l.get("valid_s").and_then(Value::as_f64).map_or(Value::Null, Value::Number);
        let (answer, worst) = leg(i, altitude_ft, s.as_ref(), &levels_ft, valid);
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

/// The rule `name` worked on `v`.
pub fn call(name: &str, v: &Value) -> R<String> {
    let answer = match name {
        "icing_forecast_route" => route(name, v)?,
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
    fn the_legs_are_said_by_their_numbers() {
        assert_eq!(numbers(&[1]), "2");
        assert_eq!(numbers(&[1, 2]), "2 and 3");
        assert_eq!(numbers(&[0, 1, 3]), "1, 2 and 4");
    }
}
