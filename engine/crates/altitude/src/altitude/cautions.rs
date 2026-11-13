//! What is wrong with an altitude the pilot set, in a pilot's words: a
//! warning, never a refusal, at the owner's "I don't want to put hard
//! limits on anything. A warning tick or a label is enough" (2026-10-23).
//! Moved from wingtip.planning's (then app.planning's) own_altitude_caution, floor_caution,
//! oxygen_caution and prohibited_caution (#482 phase 1); the selection is
//! select's answer with the planner's own members (`special_use`).

use crate::figures::words::grouped;
use crate::json::Value;
use wingtip_flight::limits::{CLASS_A_FLOOR_FT, OXYGEN_CREW_FT, OXYGEN_CREW_PAST_30_MIN_FT, OXYGEN_EVERYONE_FT};

fn as_bool(v: &Value) -> Option<bool> {
    match v {
        Value::Bool(b) => Some(*b),
        _ => None,
    }
}

fn num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

/// A member as Python's truthiness read it, as the planner did.
fn truthy(v: &Value, key: &str) -> bool {
    match v.get(key) {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => *n != 0.0,
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Object(o)) => !o.is_empty(),
    }
}

fn list<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key).and_then(Value::as_array).unwrap_or(&[])
}

/// The DOF's own abbreviations of an obstacle's type (its TYPE column), in
/// words; the rest are words already ("TOWER", "WINDMILL") and are said in
/// lower case.
fn obstacle_words(kind: &str) -> String {
    match kind {
        "T-L TWR" => "transmission line tower".into(),
        "BLDG" => "building".into(),
        "BLDG-TWR" => "building tower".into(),
        "CTRL TWR" => "control tower".into(),
        "GEN UTIL" => "utility structure".into(),
        "ELEC SYS" => "electrical structure".into(),
        "MET" => "meteorological tower".into(),
        other => other.to_lowercase(),
    }
}

/// What a leg flown at `altitude` breaks of 14 CFR 91.119 under VFR, in a
/// pilot's words: the rule, what the floor rests on and how far under it
/// the leg is. Against the rule's own figure -- the obstacle's top and
/// its clearance, 1,000 ft within 2,000 ft over a congested area
/// (91.119(b)), 500 ft elsewhere (91.119(c)) -- not the floor rounded up
/// to the next 100 ft: 2,480 ft over a 1,480 ft tower keeps 91.119(c). A
/// segment without those says the floor alone. None where the leg keeps it.
pub fn floor(segment: &Value, altitude: f64) -> Option<String> {
    let floor = num(segment, "floor_ft");
    let (Some(highest), Some(clearance)) = (num(segment, "highest_ft"), num(segment, "obstacle_clearance_ft")) else {
        return floor
            .filter(|f| altitude < *f)
            .map(|f| format!("Under the {} ft the terrain and obstacles need (14 CFR 91.119)", grouped(f)));
    };
    let need = highest + clearance;
    if altitude >= need {
        return None;
    }
    let kind = segment.get("obstacle_type").and_then(Value::as_str).filter(|k| !k.is_empty());
    // "an 800 ft tower", "an 11,000 ft ...": the article as the figure is said.
    let figure = grouped(highest);
    let article = if figure.starts_with('8') || figure.starts_with("11,") || figure.starts_with("18,") { "an" } else { "a" };
    let what = if truthy(segment, "highest_is_obstacle") {
        format!("{article} {figure} ft {}", kind.map_or_else(|| "obstacle".to_owned(), obstacle_words))
    } else {
        format!("the ground at {figure} ft")
    };
    let short = grouped(need - altitude);
    // 91.119(b) over a congested area, and where the towns could not be
    // read (congested null), since the planner then took its 1,000 ft.
    if clearance >= 1000.0 {
        let place = if truthy(segment, "congested") { "over a congested area" } else { "where a congested area could not be ruled out" };
        return Some(format!(
            "{short} ft under the {} ft 14 CFR 91.119(b) asks {place}: {} ft over the highest obstacle within 2,000 ft, here {what}",
            grouped(need),
            grouped(clearance)
        ));
    }
    Some(format!("{short} ft under the {} ft 14 CFR 91.119(c) asks: {} ft over {what}", grouped(need), grouped(clearance)))
}

/// What 14 CFR 91.211(a) asks of a flight up to `highest_ft` in an
/// airplane with no pressurised cabin, its cabin at the altitude flown:
/// over 12,500 ft MSL the crew's oxygen for any of it past 30 minutes
/// ((a)(1)), over 14,000 ft for all of it ((a)(2)), over 15,000 ft every
/// occupant's ((a)(3)). None where the profile carries oxygen or a
/// pressurised cabin, as the nav log's plans hold (navlog::plans::
/// OXYGEN_CAP_FT, the same 12,500 ft).
pub fn oxygen(highest_ft: Option<f64>, profile: Option<&Value>) -> Vec<String> {
    let carried = profile.is_some_and(|p| truthy(p, "supplemental_oxygen") || truthy(p, "pressurized"));
    let Some(highest) = highest_ft.filter(|h| *h > OXYGEN_CREW_PAST_30_MIN_FT && !carried) else {
        return Vec::new();
    };
    vec![if highest > OXYGEN_EVERYONE_FT {
        "Over 15,000 ft MSL: oxygen for the crew the whole time there and for every occupant (14 CFR 91.211(a)(2), (3))"
    } else if highest > OXYGEN_CREW_FT {
        "Over 14,000 ft MSL: oxygen for the crew the whole time there (14 CFR 91.211(a)(2))"
    } else {
        "Over 12,500 ft MSL: oxygen for the crew for any of it past 30 minutes (14 CFR 91.211(a)(1))"
    }
    .to_owned()]
}

/// Prohibited airspace on the way, as a warning: nobody flies in it
/// without its using agency's authorization (14 CFR 73.83), which an ATC
/// clearance is not.
pub fn prohibited(selection: &Value) -> Vec<String> {
    list(selection, "special_use")
        .iter()
        .filter(|a| a.get("type").and_then(Value::as_str) == Some("P"))
        .map(|a| format!("Through {}, prohibited airspace (14 CFR 73.83)", a.get("name").and_then(Value::as_str).unwrap_or("")))
        .collect()
}

/// Each reason once, in the order first found.
fn add(reasons: &mut Vec<String>, found: Vec<String>) {
    for r in found {
        if !reasons.contains(&r) {
            reasons.push(r);
        }
    }
}

/// What a pilot's own altitude for a hop breaks.
pub struct Caution {
    /// The last leg's altitude, as the planner gave it.
    pub altitude_ft: f64,
    pub reasons: Vec<String>,
}

/// What is wrong with an altitude the pilot set for a hop -- the whole
/// route's Custom one, or a waypoint's own -- against the band the
/// planner worked out for each of its legs: under the terrain and
/// obstacles' floor (14 CFR 91.119, `floor`), off the hemispheric rule
/// more than 3,000 ft above the ground (91.159(a)), into Class B without
/// the clearance planned for (91.131), over the airplane's service
/// ceiling, inside the cloud clearance under a forecast base (91.155), in
/// Class A (71.33(a), 91.135) or past 91.211(a)'s oxygen heights. Under
/// IFR (the selection's `rules`): under the minimum IFR altitude
/// (91.177(a)(1), the MEA on an airway; (a)(2) off one), off the thousands the direction of flight takes
/// (91.179(b)(1)), over the ceiling and past 91.211. The pilot may have
/// reasons the planner cannot see -- ATC may assign otherwise -- so it
/// says why rather than stopping them. None when nothing is.
pub fn own_altitude(selection: &Value, legs: &[Value], profile: Option<&Value>) -> Option<Caution> {
    let ifr = selection.get("rules").and_then(Value::as_str) == Some("ifr");
    let mut reasons: Vec<String> = Vec::new();
    let mut altitude = None;
    for (leg, segment) in legs.iter().zip(list(selection, "segments")) {
        let alt = num(leg, "altitude_ft").unwrap_or(0.0);
        altitude = Some(alt);
        let east = segment.get("eastbound").and_then(as_bool);
        let ceiling = num(segment, "service_ceiling_ft");
        let mut found = Vec::new();
        if ifr {
            if let Some(floor) = num(segment, "floor_ft").filter(|f| alt < *f) {
                let airway = segment.get("airway").filter(|a| matches!(a, Value::Object(_)));
                if let Some(airway) = airway {
                    // 91.177(a)(1): on an airway the minimum is the one
                    // Part 95 publishes for it, the MEA (or, where it has
                    // only that, the GNSS MEA), which the selection puts
                    // in `floor_ft`; the 4 nm rule of (a)(2) applies only
                    // "if no applicable minimum altitude is prescribed".
                    // The MEA, never the MOCA: (a)(1) lets a flight within
                    // 22 nm of the VOR fly down to the MOCA, which the
                    // caution does not offer -- simplified toward the
                    // higher, safer figure.
                    let kind = if num(airway, "mea_ft").is_some_and(|m| m != 0.0) { "MEA" } else { "GNSS MEA" };
                    let id = airway.get("id").and_then(Value::as_str).filter(|s| !s.is_empty());
                    found.push(match id {
                        Some(id) => format!("Under the {} ft {kind} of {id} (14 CFR 91.177(a)(1))", grouped(floor)),
                        None => format!("Under the {} ft {kind} of the airway (14 CFR 91.177(a)(1))", grouped(floor)),
                    });
                } else {
                    // 91.177(a)(2): off an airway, 1,000 ft over the
                    // highest obstacle within 4 nm (2,000 over Part 95's
                    // mountainous areas, which the selection's own
                    // clearance carries).
                    let clearance = num(segment, "obstacle_clearance_ft").unwrap_or(1000.0);
                    found.push(format!(
                        "Under the {} ft minimum IFR altitude: {} ft over the highest obstacle within 4 nm (14 CFR 91.177(a)(2))",
                        grouped(floor),
                        grouped(clearance)
                    ));
                }
            }
            if let Some(east) = east {
                // 91.179(b)(1): odd thousands eastbound (0-179 magnetic),
                // even westbound.
                let thousands = (alt / 1000.0).floor();
                if alt.rem_euclid(1000.0) != 0.0 || thousands.rem_euclid(2.0) != if east { 1.0 } else { 0.0 } {
                    found.push(format!(
                        "{} under IFR flies {} thousands, unless ATC assigns otherwise (14 CFR 91.179)",
                        if east { "Eastbound" } else { "Westbound" },
                        if east { "odd" } else { "even" }
                    ));
                }
            }
            if let Some(c) = ceiling.filter(|c| alt > *c) {
                found.push(format!("Over the aircraft's {} ft service ceiling", grouped(c)));
            }
        } else {
            found.extend(floor(segment, alt));
            // 91.159(a): more than 3,000 ft above the surface, odd thousands
            // plus 500 eastbound (a magnetic course of 0-179), even thousands
            // plus 500 westbound (180-359). Said once for the route, naming
            // the legal altitudes either side of the one set, not once per
            // leg with each leg's own height of the rule: six amber lines
            // "Westbound above 3,670 / 3,662 / 3,817 ... ft" pushed the
            // Profile's graph under the fold (the FPL audit's A8,
            // 2026-11-08). The words name the rule's own height, 3,000 ft
            // above the ground, which each leg's figure is.
            if let (Some(rule_from), Some(east)) = (num(segment, "hemispheric_rule_from_ft"), east) {
                let base = if east { 1500.0 } else { 500.0 };
                if alt > rule_from && (alt - base).rem_euclid(2000.0) != 0.0 {
                    let below = ((alt - base) / 2000.0).floor() * 2000.0 + base;
                    let floor_ft = num(segment, "floor_ft").unwrap_or(0.0);
                    // A VFR cruise under Class A (71.33: 18,000 ft MSL),
                    // and not under the ground's own floor (91.119).
                    let legal: Vec<String> =
                        [below, below + 2000.0].into_iter().filter(|ft| *ft >= floor_ft && *ft < CLASS_A_FLOOR_FT).map(grouped).collect();
                    let fly = if legal.is_empty() { String::new() } else { format!(": fly {} ft", legal.join(" or ")) };
                    found.push(format!(
                        "{} more than 3,000 ft above the ground flies {} thousands plus 500{fly} (14 CFR 91.159)",
                        if east { "Eastbound" } else { "Westbound" },
                        if east { "odd" } else { "even" }
                    ));
                }
            }
            if let Some(shelf) = num(segment, "airspace_ceiling_ft").filter(|s| alt >= *s) {
                found.push(format!("Into Class B from {} ft: it needs a clearance (14 CFR 91.131)", grouped(shelf.max(0.0))));
            }
            if let Some(c) = ceiling.filter(|c| alt > *c) {
                found.push(format!("Over the aircraft's {} ft service ceiling", grouped(c)));
            }
            if let Some(clouds) = num(segment, "cloud_ceiling_ft").filter(|c| alt > *c) {
                found.push(format!("Inside the cloud clearance under {} ft (14 CFR 91.155)", grouped(clouds)));
            }
        }
        add(&mut reasons, found);
    }
    let highest = legs.iter().filter_map(|l| num(l, "altitude_ft")).reduce(f64::max);
    if !ifr && highest.is_some_and(|h| h >= CLASS_A_FLOOR_FT) {
        // 14 CFR 71.33(a): Class A from 18,000 ft MSL; 91.135: IFR there.
        reasons.push("At or over 18,000 ft MSL: Class A, flown under IFR with a clearance alone (14 CFR 71.33, 91.135)".to_owned());
    }
    reasons.extend(oxygen(highest, profile));
    let altitude_ft = altitude?;
    (!reasons.is_empty()).then_some(Caution { altitude_ft, reasons })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json;

    fn v(text: &str) -> Value {
        json::parse(text).unwrap()
    }

    #[test]
    fn oxygen_by_91_211s_three_heights() {
        assert!(oxygen(Some(12500.0), None).is_empty());
        assert!(oxygen(Some(14000.0), None)[0].contains("(a)(1)"));
        assert!(oxygen(Some(15000.0), None)[0].ends_with("(14 CFR 91.211(a)(2))"));
        assert!(oxygen(Some(15500.0), None)[0].contains("(3)"));
        assert!(oxygen(Some(15500.0), Some(&v(r#"{"pressurized": true}"#))).is_empty());
    }

    #[test]
    fn the_article_goes_with_the_figure_said() {
        let seg = v(
            r#"{"floor_ft": 1800, "highest_ft": 800, "highest_is_obstacle": true, "obstacle_type": "ANTENNA", "obstacle_clearance_ft": 1000, "congested": null}"#,
        );
        assert_eq!(
            floor(&seg, 1500.0).unwrap(),
            "300 ft under the 1,800 ft 14 CFR 91.119(b) asks where a congested area could not be ruled out: 1,000 ft over the highest obstacle within 2,000 ft, here an 800 ft antenna"
        );
    }

    /// 91.159(a)(2): "On a magnetic course of 180 degrees through 359
    /// degrees, any even thousand foot MSL altitude + 500 feet (such as
    /// 4,500, 6,500, or 8,500)", more than 3,000 ft above the surface.
    /// Legs whose own height of the rule differs (the FPL audit's six
    /// lines) give one line, naming 4,500 and 6,500 for 5,500 set.
    #[test]
    fn the_hemispheric_rule_is_one_line_naming_the_legal_altitudes() {
        let selection = |east: bool| {
            let segs: Vec<String> = [3670, 3662, 3817]
                .iter()
                .map(|from| format!(r#"{{"floor_ft": 2600, "eastbound": {east}, "hemispheric_rule_from_ft": {from}}}"#))
                .collect();
            v(&format!(r#"{{"segments": [{}]}}"#, segs.join(",")))
        };
        let legs = vec![v(r#"{"altitude_ft": 5500}"#); 3];
        let west = own_altitude(&selection(false), &legs, None).unwrap();
        assert_eq!(
            west.reasons,
            vec!["Westbound more than 3,000 ft above the ground flies even thousands plus 500: fly 4,500 or 6,500 ft (14 CFR 91.159)"]
        );
        // 5,500 is (a)(1)'s own eastbound: nothing to say.
        assert!(own_altitude(&selection(true), &legs, None).is_none());
        // Under the rule's height (3,000 ft above the surface), any altitude.
        let low = vec![v(r#"{"altitude_ft": 3500}"#); 3];
        assert!(own_altitude(&selection(false), &low, None).is_none());
    }
}
