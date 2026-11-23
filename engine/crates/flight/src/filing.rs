//! The items of FAA Form 7233-4, the International Flight Plan, as AIM
//! Appendix 4 writes them: one copy for the web's lib/flightPlanForm and
//! the iPhone's FilingForm, which each wrote them before (#482 phase 1).
//! Which items a form has, and their labels, are each app's; how each is
//! written is here.

use crate::limits::is_flight_level;
use wingtip_core::text::js_round;
use wingtip_core::time::parse_date;

/// Item 9's wake turbulence category L: a maximum certificated takeoff
/// weight of 15,500 lb or less (AIM Appendix 4, from FAA Order JO 7360.1).
pub const LIGHT_WAKE_MAX_LB: f64 = 15_500.0;

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

/// A pilot's own point off a fix, as the route writes it ("VPBNG/095/14.2",
/// the route crate's frd_ident), in the form item 15 takes a fix, radial
/// and distance: the fix, three figures of course and three of whole
/// miles, "VPBNG095014" -- AIM Appendix 4's "IRW12503" among a route's
/// "fixes in the following formats", and the packed form the planner reads
/// back (route::points). Filed with its strokes, the point read as
/// something else: in item 15 an oblique stroke brings in "the next speed
/// and altitude" or a delay ("/DHH+MM"). The point the weather-avoiding
/// ways turn at is one (the UI audit's A8). Anything else is as it was.
fn filed_point(point: &str) -> String {
    let parts: Vec<&str> = point.split('/').collect();
    let [base, course, nm] = parts[..] else { return point.to_owned() };
    let fix = (2..=5).contains(&base.len()) && base.bytes().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit());
    match (fix, course.parse::<i64>(), nm.parse::<f64>()) {
        (true, Ok(c), Ok(d)) if course.len() == 3 && (0..=360).contains(&c) && d > 0.0 && d <= 999.0 => {
            format!("{base}{:03}{:03}", c % 360, js_round(d))
        }
        _ => point.to_owned(),
    }
}

/// Item 15's route between the departure and the destination: airways
/// between the fixes they are joined and left at, and DCT between two
/// fixes flown direct; a departure procedure first, with the fix its
/// transition leaves it at, and an arrival last, after the fix its
/// transition joins it at (AIM Appendix 4: "DALL3 EIC V18 MEI LGC4",
/// "FLACK DCT IRW"); DCT alone for a flight direct from one to the other.
/// A pilot's own point is filed as a fix, radial and distance (filed_point).
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
    let mut words: Vec<String> = Vec::new();
    for (i, point) in points.iter().enumerate() {
        if i > 0 && !joined(point) && !joined(points[i - 1]) {
            words.push("DCT".to_owned());
        }
        words.push(filed_point(point));
    }
    if words.is_empty() {
        "DCT".to_owned()
    } else {
        words.join(" ")
    }
}

/// Whether a field is filed as ZZZZ with its name in item 18 (DEP/,
/// DEST/, ALTN/): AIM Appendix 4 asks for ZZZZ where the field has no ICAO
/// location indicator, so it is decided by NASR's own ICAO_ID
/// (APT_BASE.csv), `icao_id`: empty where NASR lists none (IL11, and BGTL
/// though its ident has no figure), a four-letter one where it does (Z13
/// is PFZK, 7AK is PAUT: no ZZZZ though the ident has a figure). Only where
/// the caller has no NASR row for the field (None) is the identifier read
/// instead: one with a figure in it (C81, 06A) is the FAA's own and has
/// none.
pub fn needs_zzzz(ident: &str, icao_id: Option<&str>) -> bool {
    match icao_id {
        Some(icao) => icao.trim().is_empty(),
        None => ident.chars().any(|c| c.is_ascii_digit()),
    }
}

/// Item 19's endurance in whole minutes: the fuel aboard at the cruise
/// burn, to the minute below (the safe side, as `duration` says); None
/// where the burn is not a positive figure.
pub fn endurance_minutes(fuel_gal: f64, burn_gph: f64) -> Option<i64> {
    (burn_gph > 0.0 && fuel_gal >= 0.0 && fuel_gal.is_finite()).then(|| (fuel_gal / burn_gph * 60.0).floor() as i64)
}

/// Item 16's total estimated elapsed time in whole minutes, "from
/// departure to destination in hours (H) and minutes (M), format HHMM"
/// (AIM Appendix 4, 8): the nav log's minutes to the minute above, the
/// safe side of a time that starts search and rescue's clock (`duration`).
/// None where the time is not a figure.
pub fn eet_minutes(ete_min: f64) -> Option<i64> {
    (ete_min.is_finite() && ete_min >= 0.0).then(|| ete_min.ceil() as i64)
}

/// A leg as item 19's endurance reads it: the phase the nav log flew it
/// in ("climb", "descent"; none for the cruise) and its fuel flow.
pub struct BurnLeg<'a> {
    pub phase: Option<&'a str>,
    pub burn_gph: Option<f64>,
}

/// The fuel flow item 19's endurance is worked at: "fuel endurance time in
/// hours and minutes" (AIM Appendix 4, item 19 E/; FAA Form 7233-1 block
/// 12, the usable fuel on board in hours and minutes) is how long the fuel
/// lasts flown as the flight is flown, at cruise. So the cruise legs'
/// burn, never a climb's (which read short) or a descent's (which read
/// long, the unsafe way); where the plan steps between altitudes, the
/// highest of their burns, the shorter endurance. With no leg flown at
/// cruise (a hop climbed and descended whole), the airplane's own cruise
/// burn, `cruise_burn_gph`; None where neither is a positive figure.
pub fn endurance_burn_gph(legs: &[BurnLeg], cruise_burn_gph: Option<f64>) -> Option<f64> {
    let positive = |b: &f64| b.is_finite() && *b > 0.0;
    legs.iter()
        .filter(|l| l.phase.is_none_or(|p| p.is_empty() || p == "cruise"))
        .filter_map(|l| l.burn_gph.filter(positive))
        .reduce(f64::max)
        .or(cruise_burn_gph.filter(positive))
}

/// Item 18's date of flight, "DOF/YYMMDD", where the flight is not on the
/// day it is filed (AIM Appendix 4, TBL 4-1); None on the same day, or for
/// a day not written "YYYY-MM-DD". Both days are UTC's.
pub fn date_of_flight(depart: &str, today: &str) -> Option<String> {
    fn day(d: &str) -> Option<&str> {
        d.get(..10).filter(|d| parse_date(d).is_some())
    }
    let (d, t) = (day(depart)?, day(today)?);
    (d != t).then(|| format!("DOF/{}{}{}", &d[2..4], &d[5..7], &d[8..10]))
}

/// Whether item 15's route takes a T or a Q route, the RNAV routes (AIM
/// 5-3-4), which ask for G and R in item 10a and PBN/C2 in item 18 where
/// the airplane has them (AIM Appendix 4, TBL 4-13).
pub fn rnav_route(airways: &[&str]) -> bool {
    airways.iter().any(|w| w.starts_with('T') || w.starts_with('Q'))
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
        // A pilot's own point as a fix, radial and distance, as AIM
        // Appendix 4's IRW12503, never with the strokes item 15 reads as a
        // speed and altitude: three figures of whole miles.
        assert_eq!(route(&["FLACK", "VPBNG/095/14.2", "IRW"], |_| false, None, None), "FLACK DCT VPBNG095014 DCT IRW");
        assert_eq!(route(&["DLH/000/30"], |_| false, None, None), "DLH000030");
        assert_eq!(route(&["DLH/360/2.5"], |_| false, None, None), "DLH000003");
        assert_eq!(route(&["LEXOR/N0467F380"], |_| false, None, None), "LEXOR/N0467F380");
        assert_eq!(wake(Some(15_500.0)), Some("L"));
        assert_eq!(wake(Some(15_501.0)), None);
    }

    #[test]
    fn eet_rounds_up_and_endurance_is_at_the_cruise_burn() {
        assert_eq!(eet_minutes(119.2), Some(120));
        assert_eq!(eet_minutes(120.0), Some(120));
        assert_eq!(eet_minutes(f64::NAN), None);
        let leg = |phase: Option<&'static str>, burn: f64| BurnLeg { phase, burn_gph: Some(burn) };
        // A first leg climbed whole at 13 gph, then the cruise at 9.5 and
        // 10, and the descent at 6: the cruise's highest, 10.
        let legs = [leg(Some("climb"), 13.0), leg(None, 9.5), leg(None, 10.0), leg(Some("descent"), 6.0)];
        assert_eq!(endurance_burn_gph(&legs, Some(8.4)), Some(10.0));
        // No leg at cruise: the airplane's own cruise burn.
        assert_eq!(endurance_burn_gph(&legs[..1], Some(8.4)), Some(8.4));
        assert_eq!(endurance_burn_gph(&[], None), None);
    }

    #[test]
    fn endurance_date_of_flight_and_rnav_routes() {
        assert_eq!(endurance_minutes(40.0, 9.0), Some(266));
        assert_eq!(endurance_minutes(40.0, 0.0), None);
        assert_eq!(date_of_flight("2026-11-09T14:00:00.000Z", "2026-11-08T22:00:00.000Z").as_deref(), Some("DOF/261109"));
        assert_eq!(date_of_flight("2026-11-08T14:00:00Z", "2026-11-08T01:00:00Z"), None);
        assert!(rnav_route(&["V191", "T263"]));
        assert!(!rnav_route(&["V191", "J34"]));
    }

    #[test]
    fn zzzz_goes_by_nasrs_icao_id() {
        // NASR 2026-10-29's APT_BASE: IL11 and BGTL list no ICAO_ID, Z13
        // lists PFZK and 7AK PAUT.
        assert!(needs_zzzz("IL11", Some("")));
        assert!(needs_zzzz("BGTL", Some("")));
        assert!(!needs_zzzz("Z13", Some("PFZK")));
        assert!(!needs_zzzz("7AK", Some("PAUT")));
        assert!(!needs_zzzz("MSN", Some("KMSN")));
        // No NASR row: the identifier, a figure in it the FAA's own.
        assert!(needs_zzzz("C81", None));
        assert!(!needs_zzzz("KMSN", None));
    }
}
