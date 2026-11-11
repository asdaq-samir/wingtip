//! Where no altitude is legal: the one flown anyway, at the owner's "I
//! don't want to put hard limits on anything. A warning tick or a label
//! is enough" (2026-10-23), and why none is, in a pilot's words. Moved
//! from app.planning (#482 phase 3); the selection is select's answer
//! with the planner's own members (`airspace_transits`, `special_use`).

use super::cruising::{self, LOW_STEP_FT};
use super::floor::IFR_CLEARANCE_FT;
use crate::figures::words::{grouped, to_fixed};
use crate::flight::{is_eastbound, lowest_vfr_cruising_altitude};
use crate::json::Value;

fn num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

fn list<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key).and_then(Value::as_array).unwrap_or(&[])
}

fn is_ifr(selection: &Value) -> bool {
    selection.get("rules").and_then(Value::as_str) == Some("ifr")
}

/// The altitude a route with no legal one is flown at anyway: the lowest
/// that keeps the terrain and obstacles' floor everywhere along it (14 CFR
/// 91.119, or 91.177(a) under IFR) on the course's own altitudes --
/// 91.159's thousands plus 500 under VFR (any 500 ft under 3,000 ft above
/// the ground), 91.179(b)(1)'s thousands under IFR -- whatever stops it
/// there (the airplane's ceiling, the clouds, Class B), for the cautions
/// to say. None where no floor is known.
pub fn anyway(selection: &Value) -> Option<f64> {
    let mut segments: Vec<&Value> = list(selection, "segments").iter().filter(|s| num(s, "floor_ft").is_some()).collect();
    if segments.is_empty() && num(selection, "floor_ft").is_some() {
        segments.push(selection);
    }
    if segments.is_empty() {
        return None;
    }
    let course = num(selection, "course_magnetic_deg").or_else(|| num(segments[0], "course_magnetic_deg")).unwrap_or(0.0);
    let floor = segments.iter().filter_map(|s| num(s, "floor_ft")).fold(f64::NEG_INFINITY, f64::max);
    if is_ifr(selection) {
        // 91.179(b)(1): odd thousands eastbound, even westbound.
        let mut thousands = (floor / 1000.0).ceil() as i64;
        if thousands.rem_euclid(2) != i64::from(is_eastbound(course)) {
            thousands += 1;
        }
        return Some((thousands * 1000) as f64);
    }
    let rule_from = segments.iter().filter_map(|s| num(s, "hemispheric_rule_from_ft")).reduce(f64::min);
    if rule_from.is_some_and(|r| floor < r) {
        // Under 3,000 ft above the ground any 500 ft is a cruising altitude.
        return Some((floor / LOW_STEP_FT).ceil() * LOW_STEP_FT);
    }
    Some(lowest_vfr_cruising_altitude(floor, course))
}

/// Why no plan has an altitude, in three parts.
pub struct NoAltitude {
    /// Where along the route it fails.
    pub title: String,
    /// All of it in a few words, for the one line under the route.
    pub brief: String,
    /// The reasons there as short sentences.
    pub reasons: Vec<String>,
    /// What to do about it.
    pub advice: String,
    /// Class B is what stops it, for the page to offer a clearance or a
    /// way round.
    pub class_b: bool,
}

impl NoAltitude {
    /// The whole as one message, for /api/plan's 422.
    pub fn detail(&self) -> String {
        let reasons = self.reasons.join(" ");
        format!("{}. {}{}", self.title, if reasons.is_empty() { String::new() } else { reasons + " " }, self.advice)
    }
}

/// A waypoint round the Class B, as the planner's class_b_detours finds it.
pub struct Via {
    pub ident: String,
    pub added_nm: f64,
}

/// The Class B a leg is stuck under, as a pilot says it ("Chicago Class
/// B"): of the route's Class B transits, the one nearest the leg's
/// middle; "Class B airspace" where none is named.
fn class_b_over(selection: &Value, segment: &Value) -> String {
    let middle = (num(segment, "from_nm").unwrap_or(0.0) + num(segment, "to_nm").unwrap_or(0.0)) / 2.0;
    let near =
        list(selection, "airspace_transits").iter().filter(|t| t.get("class").and_then(Value::as_str) == Some("B")).min_by(|a, b| {
            let off = |t: &Value| (num(t, "along_track_nm").unwrap_or(0.0) - middle).abs();
            off(a).total_cmp(&off(b))
        });
    let Some(name) = near.and_then(|t| t.get("name")).and_then(Value::as_str) else {
        return "Class B airspace".to_owned();
    };
    name.split_whitespace()
        .map(|w| {
            if w.chars().count() > 1 {
                let mut c = w.chars();
                let first = c.next().map(|f| f.to_uppercase().collect::<String>()).unwrap_or_default();
                first + &c.as_str().to_lowercase()
            } else {
                w.to_owned()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Why no plan has an altitude: a headline saying where along the route
/// it fails, the reasons there -- the terrain's floor, the first altitude
/// above it on that course, what stops the climb -- and what to do.
/// `between`, the hop of a route with stops it fails on (the distances
/// are from its start); `via`, the best waypoint round a Class B; `place`,
/// where it binds by the route's own points ("540 nm past KDLH"), else
/// how far along.
pub fn no_altitude(selection: &Value, between: Option<(&str, &str)>, via: Option<&Via>, place: Option<&str>) -> NoAltitude {
    let ifr = is_ifr(selection);
    let kind = if ifr { "IFR" } else { "legal VFR" };
    // Prohibited airspace is closed whatever the rules or the altitude:
    // nobody flies in it without its using agency's authorization (14 CFR
    // 73.83), which an ATC clearance is not.
    let prohibited: Vec<&str> = list(selection, "special_use")
        .iter()
        .filter(|a| a.get("type").and_then(Value::as_str) == Some("P"))
        .filter_map(|a| a.get("name").and_then(Value::as_str))
        .collect();
    if let Some(first) = prohibited.first() {
        return NoAltitude {
            title: "The route crosses prohibited airspace".to_owned(),
            brief: format!("{first} is prohibited airspace"),
            reasons: prohibited.iter().map(|n| format!("{n} is closed to every altitude.")).collect(),
            advice: "Plan around it.".to_owned(),
            class_b: false,
        };
    }
    let stuck = list(selection, "segments").iter().find(|s| list(s, "candidates_ft").is_empty());
    let course = stuck.and_then(|s| num(s, "course_magnetic_deg")).or_else(|| num(selection, "course_magnetic_deg"));
    let (floor, top) = (stuck.and_then(|s| num(s, "floor_ft")), stuck.and_then(|s| num(s, "band_ceiling_ft")));
    let (Some(stuck), Some(course), Some(floor), Some(top)) = (stuck, course, floor, top) else {
        return NoAltitude {
            title: match between {
                Some((a, b)) => format!("No {kind} cruising altitude fits {a} to {b} in this aircraft"),
                None => format!("No {kind} cruising altitude fits this route in this aircraft"),
            },
            brief: format!("No {} altitude fits this aircraft", if ifr { "IFR" } else { "VFR" }),
            reasons: Vec::new(),
            advice: "Set a cruise altitude of your own to plan it anyway.".to_owned(),
            class_b: false,
        };
    };
    let (from_nm, to_nm) = (num(stuck, "from_nm").unwrap_or(0.0), num(stuck, "to_nm").unwrap_or(0.0));
    let place = place.map_or_else(|| format!("{} nm along", grouped((from_nm + to_nm) / 2.0)), str::to_owned);
    let title = format!(
        "No {kind} cruising altitude {}-{} nm {}",
        to_fixed(from_nm, 0),
        to_fixed(to_nm, 0),
        match between {
            Some((a, b)) => format!("out of {a} toward {b}"),
            None => "along the route".to_owned(),
        }
    );
    let heading = if matches!(stuck.get("eastbound"), Some(Value::Bool(true))) { "eastbound" } else { "westbound" };
    if ifr {
        // The minimum IFR altitude there (14 CFR 91.177(a)(2)) and the
        // first IFR altitude over it by the direction of flight
        // (91.179(b)), against the aircraft's service ceiling.
        let first = cruising::legal_ifr(floor, None, course).first().copied().unwrap_or(floor);
        let minimum = match stuck.get("airway").filter(|a| matches!(a, Value::Object(_))) {
            // On an airway the minimum is its published MEA (91.177(a)(1)),
            // not (a)(2)'s 4 nm rule, which applies only where Part 95 and
            // 97 prescribe none.
            Some(airway) => {
                let kind = if num(airway, "mea_ft").is_some_and(|m| m != 0.0) { "MEA" } else { "GNSS MEA" };
                let of = airway.get("id").and_then(Value::as_str).filter(|s| !s.is_empty()).map_or("the airway".to_owned(), str::to_owned);
                format!("The {kind} of {of} there is {} ft (14 CFR 91.177(a)(1)).", grouped(floor))
            }
            None => {
                let clearance = num(stuck, "obstacle_clearance_ft").filter(|&c| c != 0.0).unwrap_or(IFR_CLEARANCE_FT);
                let over = if matches!(stuck.get("mountainous"), Some(Value::Bool(true))) { " over a mountainous area" } else { "" };
                format!(
                    "The minimum IFR altitude there is {} ft: {} ft over the highest obstacle within 4 nm{over} (14 CFR 91.177(a)(2)).",
                    grouped(floor),
                    grouped(clearance)
                )
            }
        };
        return NoAltitude {
            title,
            brief: format!("Ceiling {} ft: the minimum IFR altitude {place} is {}", grouped(top), grouped(floor)),
            reasons: vec![
                minimum,
                format!("The first {heading} IFR altitude above that is {} ft.", grouped(first)),
                format!("The aircraft's service ceiling stops at {} ft.", grouped(top)),
            ],
            advice: "Route around the high ground, plan it in an aircraft that climbs higher, or set a cruise altitude of your own to plan it anyway.".to_owned(),
            class_b: false,
        };
    }
    // The first altitude the band would have taken: the band's own rule,
    // any 500 ft under 3,000 ft above the ground, the course's own
    // thousands plus 500 over it.
    let rule_from = num(stuck, "hemispheric_rule_from_ft");
    let first =
        cruising::legal_vfr(floor, None, course, rule_from).first().copied().unwrap_or_else(|| lowest_vfr_cruising_altitude(floor, course));
    let under_rule = rule_from.is_some_and(|r| first < r);
    let first_line = if under_rule {
        format!("The lowest altitude above that is {} ft.", grouped(first))
    } else {
        format!("The first {heading} VFR altitude above that is {} ft.", grouped(first))
    };
    let mut advice = "Route around the high ground, or set a cruise altitude of your own to plan it anyway.".to_owned();
    let mut class_b = false;
    let need = format!("terrain {place} needs {}", grouped(first));
    let mut brief = format!("Clouds at {} ft: {need}", grouped(top));
    let stops;
    if Some(top) == num(stuck, "service_ceiling_ft") {
        stops = format!("The aircraft's service ceiling stops at {} ft.", grouped(top));
        brief = format!("Ceiling {} ft: {need}", grouped(top));
    } else if Some(top) == num(stuck, "airspace_ceiling_ft") {
        // The Class B by name, and what it takes (14 CFR 91.131(a)(1)).
        let bravo = format!("The {}", class_b_over(selection, stuck));
        stops = if top <= 0.0 {
            format!("{bravo} reaches the ground there; going through it needs a clearance.")
        } else {
            format!("{bravo} over it starts at {} ft; going into it needs a clearance.", grouped(top))
        };
        brief = if top <= 0.0 { format!("Class B to the ground {place}") } else { format!("Class B at {} ft: {need}", grouped(top)) };
        class_b = true;
        advice = match via {
            Some(via) => format!("Fly via {} ({} nm further) to stay out of it", via.ident, to_fixed(via.added_nm, 0)),
            None => "Add a stop to route around it".to_owned(),
        } + ", or plan it with a Class B clearance.";
    } else {
        stops = format!("The cloud base stops at {} ft.", grouped(top));
    }
    if top <= 0.0 {
        // Airspace from the ground up leaves no altitude whatever the
        // terrain: the floor and the first altitude over it were noise.
        return NoAltitude { title, brief, reasons: vec![stops], advice, class_b };
    }
    NoAltitude {
        title,
        brief,
        reasons: vec![format!("The terrain and obstacles there need {} ft.", grouped(floor)), first_line, stops],
        advice,
        class_b,
    }
}
