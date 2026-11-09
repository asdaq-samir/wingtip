//! What the pilot's own debriefed flights show, as evidence a coach can
//! point at: each a line from a debrief the engine made (route's
//! approach debrief, procedures' flight debrief), with the day and the
//! place, grouped into the weak areas a plan practises.
//!
//! The debriefs come in as the apps hold them, trimmed to what is read
//! here: an approach's profile and findings, a flight's legs and pattern
//! entries. Measured from GPS, as the debriefs themselves say: close to
//! what an instructor sees, not the panel's needles.

use crate::json::Value;
use crate::time::days_from_civil;

use crate::pilot::currency::day;

/// AC 61-98D 2.1.4: "the airplane should be stabilized by 1,000 feet
/// above airport elevation in instrument meteorological conditions (IMC)
/// and by 500 feet above airport elevation during straight-in approaches
/// in visual meteorological conditions (VMC)". A track does not say which
/// conditions it was flown in, so the lower gate is the one held: an
/// approach off its course or glidepath under 500 ft above the field is
/// unstable by either, and none is called unstable that the AC would not.
pub const STABLE_BY_FT: f64 = 500.0;

/// How far back a debrief still says something of the pilot's flying
/// today: half a year, the window 61.57(c)(1) itself looks back for
/// instrument skills. A coaching choice, not a rule.
pub const RECENT_DAYS: i64 = 183;

/// What a piece of evidence shows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Weak {
    /// Off the course or glidepath, or under a minimum, below the 500 ft gate.
    Unstable,
    /// Past full scale on the approach's course or glide slope, or under a
    /// fix's minimum altitude: the approach debrief's stop and caution findings.
    ApproachDeviation,
    /// A downwind flown off pattern altitude (ACS PA.III.B).
    Pattern,
    /// A leg's altitude or course not held (ACS PA.VI.A).
    Cruise,
}

impl Weak {
    pub const ALL: [Weak; 4] = [Weak::Unstable, Weak::ApproachDeviation, Weak::Pattern, Weak::Cruise];

    pub fn key(self) -> &'static str {
        match self {
            Weak::Unstable => "unstable_approach",
            Weak::ApproachDeviation => "approach_deviation",
            Weak::Pattern => "pattern_altitude",
            Weak::Cruise => "cruise_holding",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Weak::Unstable => "Stabilized approaches",
            Weak::ApproachDeviation => "Holding an approach's course and altitudes",
            Weak::Pattern => "Traffic pattern altitude",
            Weak::Cruise => "Holding altitude and course en route",
        }
    }

    /// The ACS tasks it is judged by: the Instrument Rating ACS
    /// (FAA-S-ACS-8C) area VI, Instrument Approach Procedures, and the
    /// Private Pilot ACS (FAA-S-ACS-6C) PA.III.B Traffic Patterns and
    /// PA.VI.A Pilotage and Dead Reckoning (lib/acs.json's editions).
    pub fn acs(self) -> &'static [&'static str] {
        match self {
            Weak::Unstable => &["IR.VI.A", "IR.VI.B", "PA.IV.B"],
            Weak::ApproachDeviation => &["IR.VI.A", "IR.VI.B"],
            Weak::Pattern => &["PA.III.B"],
            Weak::Cruise => &["PA.VI.A"],
        }
    }
}

/// One line of evidence: its id ("ev:3"), the day flown, where, what it
/// shows and the line itself.
pub struct Evidence {
    pub id: String,
    pub flown_on: String,
    pub day: i64,
    pub place: String,
    pub weak: Weak,
    pub text: String,
}

fn num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

fn list<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key).and_then(Value::as_array).unwrap_or(&[])
}

fn feet(n: f64) -> String {
    let n = n.round() as i64;
    if n.abs() >= 1000 {
        format!("{},{:03}", n / 1000, (n % 1000).abs())
    } else {
        n.to_string()
    }
}

/// An approach debriefed: the lowest point of its profile flown off
/// (past full scale, or under a minimum) under the 500 ft gate, and its
/// stop and caution findings as they were worded.
fn approach(d: &Value, mut add: impl FnMut(Weak, String)) {
    if let Some(elevation) = num(d, "elevation_ft") {
        let lowest_off = list(d, "profile")
            .iter()
            .filter(|p| matches!(p.get("off"), Some(Value::Bool(true))))
            .filter_map(|p| num(p, "alt_ft").map(|a| a - elevation))
            .filter(|h| *h > 0.0 && *h < STABLE_BY_FT)
            .fold(None, |low: Option<f64>, h| Some(low.map_or(h, |l| l.min(h))));
        if let Some(h) = lowest_off {
            add(
                Weak::Unstable,
                format!("Off the course or glidepath {} ft above the field, under the 500 ft gate (AC 61-98D 2.1.4)", feet(h)),
            );
        }
    }
    for f in list(d, "findings") {
        let tone = f.get("tone").and_then(Value::as_str).unwrap_or("");
        if let (true, Some(text)) = (tone == "stop" || tone == "caution", f.get("text").and_then(Value::as_str)) {
            add(Weak::ApproachDeviation, text.to_owned());
        }
    }
}

fn percent(share: Option<f64>) -> Option<String> {
    share.map(|s| format!("{}%", (s * 100.0).round() as i64))
}

/// A flight debriefed: each pattern entry flown off its altitude, each
/// leg not held.
fn flight(d: &Value, mut add: impl FnMut(Weak, String)) {
    for p in list(d, "patterns") {
        if matches!(p.get("ok"), Some(Value::Bool(false))) {
            let ident = p.get("ident").and_then(Value::as_str).unwrap_or("the field");
            let off = num(p, "off_ft").unwrap_or(0.0);
            add(
                Weak::Pattern,
                format!(
                    "At {ident} the downwind was {} ft {} pattern altitude",
                    feet(off.abs()),
                    if off >= 0.0 { "above" } else { "below" }
                ),
            );
        }
    }
    for l in list(d, "legs") {
        if matches!(l.get("ok"), Some(Value::Bool(false))) {
            let (from, to) = (l.get("from").and_then(Value::as_str).unwrap_or("?"), l.get("to").and_then(Value::as_str).unwrap_or("?"));
            let held: Vec<String> = [("altitude", num(l, "altitude_within")), ("course", num(l, "course_within"))]
                .iter()
                .filter_map(|(what, share)| percent(*share).map(|p| format!("{p} within {what}")))
                .collect();
            let said = if held.is_empty() { "not held to the plan".to_owned() } else { held.join(", ") };
            add(Weak::Cruise, format!("{from} to {to}: {said}"));
        }
    }
}

/// The evidence in the debriefs flown within RECENT_DAYS of `today`, the
/// newest first, each with its id.
pub fn evidence(name: &str, debriefs: &[Value], today: i64) -> Result<Vec<Evidence>, String> {
    let mut found: Vec<(i64, String, String, Weak, String)> = Vec::new();
    for d in debriefs {
        let flown_on = d.get("flown_on").and_then(Value::as_str).ok_or_else(|| format!("{name}: a debrief has no \"flown_on\""))?;
        let (y, m, dd) = day(name, flown_on)?;
        let on = days_from_civil(y, m, dd);
        if on > today || today - on > RECENT_DAYS {
            continue;
        }
        let place = d.get("place").and_then(Value::as_str).unwrap_or("").to_owned();
        let mut add = |weak, text| found.push((on, flown_on.to_owned(), place.clone(), weak, text));
        match d.get("kind").and_then(Value::as_str) {
            Some("approach") => approach(d, &mut add),
            Some("flight") => flight(d, &mut add),
            other => return Err(format!("{name}: a debrief's \"kind\" is \"approach\" or \"flight\", not {other:?}")),
        }
    }
    // Newest first, the order found kept within a day.
    found.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(found
        .into_iter()
        .enumerate()
        .map(|(i, (day, flown_on, place, weak, text))| Evidence { id: format!("ev:{}", i + 1), flown_on, day, place, weak, text })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    #[test]
    fn an_approach_off_under_the_500_ft_gate_is_unstable_and_one_off_above_it_is_not() {
        let d = parse(
            r#"[{"kind":"approach","flown_on":"2026-10-01","place":"KMSN","elevation_ft":887,
                "profile":[{"to_go_nm":2,"alt_ft":1500,"off":true},{"to_go_nm":1,"alt_ft":1300,"off":true},{"to_go_nm":0.5,"alt_ft":1380,"off":false}],
                "findings":[{"tone":"info","text":"Landed"}]}]"#,
        )
        .unwrap();
        let e = evidence("t", d.as_array().unwrap(), days_from_civil(2026, 11, 1)).unwrap();
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].weak, Weak::Unstable);
        // 1,300 - 887 = 413 ft above the field; 1,500 is 613, over the gate.
        assert!(e[0].text.contains("413 ft above the field"), "{}", e[0].text);
    }

    #[test]
    fn a_debrief_older_than_half_a_year_says_nothing() {
        let d = parse(r#"[{"kind":"flight","flown_on":"2026-01-01","patterns":[{"ident":"KJVL","off_ft":-200,"ok":false}]}]"#).unwrap();
        assert!(evidence("t", d.as_array().unwrap(), days_from_civil(2026, 11, 1)).unwrap().is_empty());
    }
}
