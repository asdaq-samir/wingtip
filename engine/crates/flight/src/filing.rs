//! The items of FAA Form 7233-4, the International Flight Plan, as AIM
//! Appendix 4 writes them: one copy for the web's lib/flightPlanForm and
//! the iPhone's FilingForm, which each wrote them before (#482 phase 1).
//! Which items a form has, and their labels, are each app's; how each is
//! written is here.

use crate::limits::is_flight_level;

/// Item 9's wake turbulence category L: a maximum certificated takeoff
/// weight of 15,500 lb or less (AIM Appendix 4, from FAA Order JO 7360.1).
pub const LIGHT_WAKE_MAX_LB: f64 = 15_500.0;

/// JavaScript's Math.round, half up, as the web wrote the figures.
fn js_round(v: f64) -> i64 {
    (v + 0.5).floor() as i64
}

/// Item 15's cruising speed: the true airspeed in knots, "N" and four
/// figures (AIM Appendix 4: "N0450").
pub fn speed(tas_kt: f64) -> String {
    format!("N{:04}", js_round(tas_kt).max(0))
}

/// Item 15's level: a flight level, "F" and three figures, at and above
/// 18,000 ft, where the altimeter is set to 29.92 (14 CFR 91.121(a)(2));
/// below it the altitude in hundreds of feet, "A" and three figures (AIM
/// Appendix 4: "F350", "A080").
pub fn level(ft: f64) -> String {
    format!("{}{:03}", if is_flight_level(ft) { "F" } else { "A" }, js_round(ft / 100.0).max(0))
}

/// Hours and minutes in four figures, HHMM (items 16 and 19), the minutes
/// rounded first (119.6 is "0200", not "0160"). The callers round the time
/// en route up and the endurance down, to err on the safe side of each.
pub fn duration(minutes: f64) -> String {
    let whole = js_round(minutes).max(0);
    format!("{:02}{:02}", whole / 60, whole % 60)
}

/// Item 9's wake turbulence category, "L", where the maximum takeoff
/// weight is known and light; None otherwise.
pub fn wake(max_takeoff_lb: Option<f64>) -> Option<&'static str> {
    max_takeoff_lb.filter(|lb| *lb <= LIGHT_WAKE_MAX_LB).map(|_| "L")
}

/// A procedure filed in item 15: its coded identifier and its enroute
/// transition's fix.
pub struct Procedure<'a> {
    pub id: &'a str,
    pub transition: Option<&'a str>,
}

/// Item 15's route between the departure and the destination: airways
/// between the fixes they are joined and left at, and DCT between two
/// fixes flown direct; a departure procedure first, with the fix its
/// transition leaves it at, and an arrival last, after the fix its
/// transition joins it at (AIM Appendix 4: "DALL3 EIC V18 MEI LGC4",
/// "FLACK DCT IRW"); DCT alone for a flight direct from one to the other.
pub fn route(stops: &[&str], is_airway: impl Fn(&str) -> bool, departure: Option<&Procedure>, arrival: Option<&Procedure>) -> String {
    let mut points: Vec<&str> = Vec::new();
    if let Some(d) = departure {
        points.push(d.id);
        if let Some(t) = d.transition.filter(|t| stops.first() != Some(t)) {
            points.push(t);
        }
    }
    points.extend_from_slice(stops);
    if let Some(a) = arrival {
        if let Some(t) = a.transition.filter(|t| stops.last() != Some(t)) {
            points.push(t);
        }
        points.push(a.id);
    }
    // A procedure, as an airway, is joined and left at its fixes.
    let joined = |w: &str| is_airway(w) || departure.is_some_and(|d| d.id == w) || arrival.is_some_and(|a| a.id == w);
    let mut words: Vec<&str> = Vec::new();
    for (i, point) in points.iter().enumerate() {
        if i > 0 && !joined(point) && !joined(points[i - 1]) {
            words.push("DCT");
        }
        words.push(point);
    }
    if words.is_empty() {
        "DCT".to_owned()
    } else {
        words.join(" ")
    }
}

/// An identifier with a figure in it (C81, 06A) is the FAA's own, with no
/// ICAO four-letter location indicator: filed as ZZZZ with its name in
/// item 18 (AIM Appendix 4), where a service takes only indicators.
pub fn needs_zzzz(ident: &str) -> bool {
    ident.chars().any(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aim_appendix_4s_examples() {
        assert_eq!(speed(450.0), "N0450");
        assert_eq!(speed(99.5), "N0100");
        assert_eq!(level(8_000.0), "A080");
        assert_eq!(level(17_999.0), "A180");
        assert_eq!(level(18_000.0), "F180");
        assert_eq!(duration(119.6), "0200");
        assert_eq!(route(&["FLACK", "IRW"], |_| false, None, None), "FLACK DCT IRW");
        let dall3 = Procedure { id: "DALL3", transition: None };
        let lgc4 = Procedure { id: "LGC4", transition: None };
        // AIM Appendix 4's own example, the arrival joined at MEI ...
        assert_eq!(route(&["EIC", "V18", "MEI"], |w| w == "V18", Some(&dall3), Some(&lgc4)), "DALL3 EIC V18 MEI LGC4");
        // ... and flown direct from MEI to LGC first, as FLACK DCT IRW is.
        assert_eq!(route(&["EIC", "V18", "MEI", "LGC"], |w| w == "V18", Some(&dall3), Some(&lgc4)), "DALL3 EIC V18 MEI DCT LGC LGC4");
        assert_eq!(wake(Some(15_500.0)), Some("L"));
        assert_eq!(wake(Some(15_501.0)), None);
    }
}
