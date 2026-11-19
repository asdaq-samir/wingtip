use super::*;

pub(super) fn turn_word(turn: Option<&str>) -> Option<&'static str> {
    match turn {
        Some("L") => Some("left"),
        Some("R") => Some("right"),
        _ => None,
    }
}

/// The altitude a missed approach's leg climbs to, as the plate says it.
pub(super) fn climb_words(leg: &MissedLeg) -> Option<String> {
    match (leg.min_ft, leg.max_ft) {
        (Some(low), Some(high)) if low == high => Some(format!("at {}", alt_ft(Some(low)))),
        (Some(low), Some(high)) => Some(format!("to between {} and {}", alt_ft(Some(low)), alt_ft(Some(high)))),
        (Some(low), None) => Some(format!("to {}", alt_ft(Some(low)))),
        (None, Some(high)) => Some(format!("at or below {}", alt_ft(Some(high)))),
        (None, None) => None,
    }
}

/// Legs flown on a heading, and held (ARINC 424-18 5.21): the rest on a
/// course.
pub(super) const HEADING_LEGS: [&str; 5] = ["VA", "VD", "VI", "VM", "VR"];
pub(super) const HOLD_LEGS: [&str; 3] = ["HM", "HA", "HF"];

/// A leg's fix, where it names one.
pub(super) fn leg_fix(leg: &MissedLeg) -> Option<&str> {
    leg.fix.as_deref().filter(|f| !f.is_empty())
}

/// Parts joined by spaces, the missing left out.
pub(super) fn spaced(parts: &[Option<String>]) -> String {
    parts.iter().flatten().filter(|p| !p.is_empty()).cloned().collect::<Vec<_>>().join(" ")
}

/// One leg of a missed approach in the plate's words, None for one these
/// do not say (an arc, a procedure turn): the plate says it.
pub(super) fn leg_words(leg: &MissedLeg) -> Option<String> {
    let turn = turn_word(leg.turn.as_deref());
    let climb = climb_words(leg);
    let dir =
        leg.course_deg.map(|c| format!("{} {}", if HEADING_LEGS.contains(&leg.path.as_str()) { "heading" } else { "course" }, bearing(c)));
    let fix = leg_fix(leg).map(fix_name);
    match leg.path.as_str() {
        "CA" | "VA" | "FA" => {
            // "Climb to 3,000 on heading 093°"; with a turn, "climbing left turn".
            if climb.is_none() && dir.is_none() {
                return None;
            }
            let start = turn.map_or_else(|| "climb".to_owned(), |t| format!("climbing {t} turn"));
            Some(spaced(&[Some(start), climb, dir.map(|d| format!("on {d}"))]))
        }
        "VI" | "CI" => {
            let dir = dir?;
            Some(format!("{} {dir} to intercept", turn.map_or_else(|| "fly".to_owned(), |t| format!("{t} turn to"))))
        }
        "VM" | "FM" => {
            let dir = dir?;
            Some(format!("{} {dir} for radar vectors", turn.map_or_else(|| "fly".to_owned(), |t| format!("{t} turn to"))))
        }
        "CF" | "TF" | "DF" => {
            let fix = fix?;
            let way = match (leg.path.as_str(), &dir) {
                ("DF", _) => format!("direct {fix}"),
                ("CF", Some(d)) => format!("on {d} to {fix}"),
                _ => format!("to {fix}"),
            };
            Some(spaced(&[turn.map(|t| format!("{t} turn")), Some(way), climb.map(|c| format!("climbing {c}"))]))
        }
        path if HOLD_LEGS.contains(&path) => {
            let fix = fix?;
            let parts: Vec<String> = [
                Some(format!("hold at {fix}")),
                turn.map(|t| format!("{t} turns")),
                leg.course_deg.map(|c| format!("{} inbound", bearing(c))),
            ]
            .into_iter()
            .flatten()
            .collect();
            Some(parts.join(", "))
        }
        _ => None,
    }
}

/// The missed approach as the plate's words say it, from its coded legs:
/// "Climb to 1,800 on course 079°, then right turn to heading 210° to
/// intercept, …, then hold at VTU, left turns, 131° inbound." Where a leg
/// is one these words do not say, the rest is the plate's; None with none,
/// or where the first is such a leg.
pub fn missed_words(legs: &[MissedLeg]) -> Option<String> {
    if legs.is_empty() {
        return None;
    }
    let mut parts: Vec<String> = Vec::new();
    for leg in legs {
        match leg_words(leg) {
            Some(words) => parts.push(words),
            None => {
                // Its first leg one these words do not say: all of it the plate's.
                if parts.is_empty() {
                    return None;
                }
                parts.push("as the plate shows".to_owned());
                break;
            }
        }
    }
    Some(format!("{}.", upper_first(&parts.join(", then "))))
}

/// A field's frequency, as its card lists it (OurAirports').
#[derive(Clone, Debug, PartialEq)]
pub struct Frequency {
    pub kind: Option<String>,
    pub description: Option<String>,
    pub mhz: Option<f64>,
}

impl Frequency {
    pub(super) fn kind_upper(&self) -> String {
        self.kind.as_deref().unwrap_or("").to_uppercase()
    }
}

/// The first of `kinds`, in their order, with a frequency (lib/frequencies
/// frequencyOf).
pub(super) fn frequency_of<'a>(frequencies: &'a [Frequency], kinds: &[&str]) -> Option<&'a Frequency> {
    kinds.iter().find_map(|k| frequencies.iter().find(|f| f.kind_upper() == *k && f.mhz.is_some()))
}

/// A frequency as the radio shows it: three places, one or two trailing
/// zeros dropped ("125.0", "119.15", "122.725").
pub(super) fn mhz_text(mhz: f64) -> String {
    let mut text = to_fixed(mhz, 3);
    for _ in 0..2 {
        if text.ends_with('0') {
            text.pop();
        }
    }
    text
}

/// The field's radio a briefing calls, in its order: the weather, approach
/// control, then the tower, or the CTAF at a field with none.
pub fn brief_frequencies(frequencies: &[Frequency]) -> Vec<String> {
    if frequencies.is_empty() {
        return vec![SEE_THE_PLATE.to_owned()];
    }
    let mut lines: Vec<String> = Vec::new();
    let say = |lines: &mut Vec<String>, name: &str, f: Option<&Frequency>| {
        if let Some(mhz) = f.and_then(|f| f.mhz) {
            lines.push(format!("{name} {}", mhz_text(mhz)));
        }
    };
    let weather = frequency_of(frequencies, &["ATIS", "AWOS", "ASOS"]);
    let weather_name = weather.and_then(|w| w.kind.as_deref()).unwrap_or("ATIS").to_uppercase();
    say(&mut lines, &weather_name, weather);
    match frequency_of(frequencies, &["APP", "APCH", "A/D", "APP/DEP"]) {
        Some(approach) => say(&mut lines, "Approach", Some(approach)),
        None => lines.push(format!("Approach: {SEE_THE_PLATE_LOWER}")),
    }
    match frequency_of(frequencies, &["TWR"]) {
        Some(tower) => say(&mut lines, "Tower", Some(tower)),
        None => {
            // The CTAF the field lists (AC 90-66C 9.6): the one so called,
            // else a UNICOM that is also the CTAF, else the UNICOM. MULTICOM's
            // 122.9, the fallback where none is listed, is a guess at this
            // field, so it is not briefed.
            let ctaf = frequency_of(frequencies, &["CTAF"])
                .or_else(|| {
                    frequencies.iter().find(|f| {
                        f.kind_upper().starts_with("UNIC")
                            && f.description.as_deref().unwrap_or("").to_uppercase().contains("CTAF")
                            && f.mhz.is_some()
                    })
                })
                .or_else(|| frequency_of(frequencies, &["UNIC", "UNICOM"]));
            say(&mut lines, "CTAF", ctaf);
        }
    }
    lines
}
