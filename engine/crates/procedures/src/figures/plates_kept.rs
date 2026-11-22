//! Which of the FAA's terminal procedures (the d-TPP) a flight keeps on the
//! device for flying with no signal (Keep for the Air): each field's role in
//! the flight decides which of its charts are kept, and the airplane's own
//! figures how far off the route a field is still one it may divert to.
//!
//! The diversion range is the distance the airplane covers on the reserve
//! the rules make it carry past its destination, at its own cruise:
//! 14 CFR 91.167(a)(3), "Fly after that for 45 minutes at normal cruising
//! speed", under IFR; 91.151(a) asks 30 minutes by day and 45 at night
//! under VFR. That reserve is the fuel a diversion is flown on when the
//! destination cannot be had, so a field within it is one the flight may
//! end at. The 45 minutes are kept by day under VFR too: more plates kept,
//! never fewer (a simplification toward the safe side). Where the
//! airplane's usable fuel and burn are given and its whole tanks reach less
//! far than that, the tanks' reach is the range instead. With no cruise
//! speed there is no range: no stock airplane's speed stands in (the
//! owner, 2026-11-09), and the shell asks for the airplane instead.

use crate::flight::reserve_min;
use crate::json::{self, Value};

/// A field's part in the flight, in the order one counts over another
/// where a field is two (a stop that is also the alternate is kept as a
/// stop).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Role {
    Departure,
    Destination,
    Stop,
    Alternate,
    Diversion,
}

impl Role {
    fn read(word: &str) -> Option<Role> {
        Some(match word {
            "departure" => Role::Departure,
            "destination" => Role::Destination,
            "stop" => Role::Stop,
            "alternate" => Role::Alternate,
            "diversion" => Role::Diversion,
            _ => return None,
        })
    }

    fn word(self) -> &'static str {
        match self {
            Role::Departure => "departure",
            Role::Destination => "destination",
            Role::Stop => "stop",
            Role::Alternate => "alternate",
            Role::Diversion => "diversion",
        }
    }

    /// Whether a chart of the d-TPP's `kind` (its metafile's chart_code) is
    /// kept for a field of this role:
    ///
    /// - the departure, the destination and each stop, every chart: the
    ///   departure procedures (DP, ODP) and the takeoff minimums (MIN) to
    ///   leave by (the d-TPP's Takeoff Minimums and (Obstacle) Departure
    ///   Procedures pages), the
    ///   arrivals (STR) and approaches (IAP) to come in by, and the
    ///   diagram (APD), hot spots (HOT) and land-and-hold-short (LAH) on
    ///   the ground; the departure's approaches too, for a return to it
    ///   after takeoff;
    /// - the alternate (91.169(a)(2)), what an arrival there needs: its
    ///   approaches, its alternate and takeoff minimums, the diagram, hot
    ///   spots and land-and-hold-short;
    /// - a field within diversion range, its approaches, its minimums and
    ///   its diagram: an arrival not planned, by approach.
    fn keeps(self, kind: &str) -> bool {
        match self {
            Role::Departure | Role::Destination | Role::Stop => true,
            Role::Alternate => matches!(kind, "IAP" | "MIN" | "APD" | "HOT" | "LAH"),
            Role::Diversion => matches!(kind, "IAP" | "MIN" | "APD"),
        }
    }
}

/// How the diversion range was found.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Basis {
    /// The reserve's 45 minutes at the airplane's cruise.
    Reserve,
    /// The airplane's whole tanks, which reach less far than the reserve.
    Tanks,
    /// No cruise speed: no range.
    NoAirplane,
}

/// The reserve the range is flown on, minutes: 91.167(a)(3)'s 45, which is
/// 91.151(a)(2)'s by night too and more than its 30 by day.
pub fn reserve_minutes() -> f64 {
    reserve_min(true, false)
}

/// The diversion range, nm, from the airplane's true airspeed and, where
/// given, its usable fuel and cruise burn; None with no airspeed.
pub fn diversion_range_nm(tas_kt: Option<f64>, usable_gal: Option<f64>, burn_gph: Option<f64>) -> (Option<f64>, Basis) {
    let Some(tas) = tas_kt.filter(|t| t.is_finite() && *t > 0.0) else {
        return (None, Basis::NoAirplane);
    };
    let reserve = reserve_minutes() / 60.0 * tas;
    let tanks = usable_gal.filter(|u| *u >= 0.0).zip(burn_gph.filter(|b| *b > 0.0)).map(|(u, b)| u / b * tas);
    match tanks {
        Some(reach) if reach < reserve => (Some(reach), Basis::Tanks),
        _ => (Some(reserve), Basis::Reserve),
    }
}

fn opt_num(v: &Value, key: &str, rule: &str) -> Result<Option<f64>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{rule}: \"{key}\" is not a number")),
    }
}

/// A field asked about: its ident, its role, how far it is off the route
/// (a diversion's), and its charts as the planner lists them.
struct Asked<'a> {
    ident: &'a str,
    role: Role,
    off_nm: Option<f64>,
    charts: &'a [Value],
}

fn read_field(v: &Value) -> Result<Asked<'_>, String> {
    let ident = v.get("ident").and_then(Value::as_str).ok_or("plates_kept: a field has no \"ident\"")?;
    let role = v.get("role").and_then(Value::as_str).and_then(Role::read).ok_or_else(|| {
        format!("plates_kept: {ident}'s \"role\" is departure, destination, stop, alternate or diversion")
    })?;
    Ok(Asked { ident, role, off_nm: opt_num(v, "off_nm", "plates_kept")?, charts: v.get("charts").and_then(Value::as_array).unwrap_or(&[]) })
}

/// The fields whose plates are kept, each once in its first role, the
/// route's own in the order given and then the diversions within
/// `range_nm`, nearest the route first; each with the charts its role
/// keeps. None of a field with no chart kept.
fn kept<'a>(fields: &'a [Asked<'a>], range_nm: Option<f64>) -> Vec<(&'a Asked<'a>, Role, Vec<&'a Value>)> {
    let mut order: Vec<&Asked> = fields.iter().filter(|f| f.role != Role::Diversion).collect();
    order.sort_by_key(|f| f.role);
    let mut diversions: Vec<&Asked> = fields
        .iter()
        .filter(|f| f.role == Role::Diversion && matches!((f.off_nm, range_nm), (Some(off), Some(range)) if off <= range))
        .collect();
    diversions.sort_by(|a, b| a.off_nm.partial_cmp(&b.off_nm).unwrap_or(std::cmp::Ordering::Equal));
    order.extend(diversions);
    let mut seen: Vec<&str> = Vec::new();
    let mut out = Vec::new();
    for field in order {
        if seen.iter().any(|s| s.eq_ignore_ascii_case(field.ident)) {
            continue;
        }
        seen.push(field.ident);
        let charts: Vec<&Value> =
            field.charts.iter().filter(|c| c.get("kind").and_then(Value::as_str).is_some_and(|k| field.role.keeps(k))).collect();
        if !charts.is_empty() {
            out.push((field, field.role, charts));
        }
    }
    out
}

fn range_json(out: &mut String, range: Option<f64>, basis: Basis) {
    out.push_str("\"range_nm\":");
    json::opt_number(out, range);
    out.push_str(",\"reserve_min\":");
    json::number(out, reserve_minutes());
    out.push_str(",\"basis\":");
    json::string(
        out,
        match basis {
            Basis::Reserve => "reserve",
            Basis::Tanks => "tanks",
            Basis::NoAirplane => "no_airplane",
        },
    );
}

/// The rules `diversion_range_nm` (`{"tas_kt"?, "usable_gal"?,
/// "burn_gph"?}` to `{"range_nm", "reserve_min", "basis"}`) and
/// `plates_kept` (`{"range_nm"?, "fields": [{"ident", "role", "off_nm"?,
/// "charts": [{"kind", ...}]}]}` to `[{"ident", "role", "off_nm",
/// "charts"}]`).
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    match name {
        "diversion_range_nm" => {
            let rule = "diversion_range_nm";
            let (range, basis) = diversion_range_nm(opt_num(v, "tas_kt", rule)?, opt_num(v, "usable_gal", rule)?, opt_num(v, "burn_gph", rule)?);
            let mut out = String::from("{");
            range_json(&mut out, range, basis);
            out.push('}');
            Ok(out)
        }
        "plates_kept" => {
            let fields = v.get("fields").and_then(Value::as_array).ok_or("plates_kept: \"fields\" is a list")?;
            let asked = fields.iter().map(read_field).collect::<Result<Vec<_>, _>>()?;
            let mut out = String::from("[");
            for (i, (field, role, charts)) in kept(&asked, opt_num(v, "range_nm", "plates_kept")?).into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str("{\"ident\":");
                json::string(&mut out, field.ident);
                out.push_str(",\"role\":");
                json::string(&mut out, role.word());
                out.push_str(",\"off_nm\":");
                json::opt_number(&mut out, field.off_nm);
                out.push_str(",\"charts\":[");
                for (j, chart) in charts.iter().enumerate() {
                    if j > 0 {
                        out.push(',');
                    }
                    json::value(&mut out, chart);
                }
                out.push_str("]}");
            }
            out.push(']');
            Ok(out)
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_range_is_45_minutes_at_cruise_91_167_a_3() {
        // 120 kt for 45 minutes is 90 nm.
        assert_eq!(diversion_range_nm(Some(120.0), None, None), (Some(90.0), Basis::Reserve));
    }

    #[test]
    fn tanks_that_reach_less_far_than_the_reserve_set_the_range() {
        // 6 gal at 8 gph is 45 minutes: 90 nm at 120 kt, the reserve's own.
        assert_eq!(diversion_range_nm(Some(120.0), Some(6.0), Some(8.0)), (Some(90.0), Basis::Reserve));
        // 5 gal at 8 gph is 37.5 minutes: 75 nm.
        assert_eq!(diversion_range_nm(Some(120.0), Some(5.0), Some(8.0)), (Some(75.0), Basis::Tanks));
    }

    #[test]
    fn no_cruise_speed_is_no_range_never_a_stock_airplanes() {
        assert_eq!(diversion_range_nm(None, Some(53.0), Some(10.0)), (None, Basis::NoAirplane));
        assert_eq!(diversion_range_nm(Some(0.0), None, None), (None, Basis::NoAirplane));
    }

    #[test]
    fn a_diversion_keeps_only_its_approaches_minimums_and_diagram() {
        for kind in ["IAP", "MIN", "APD"] {
            assert!(Role::Diversion.keeps(kind));
        }
        for kind in ["DP", "ODP", "STR", "HOT", "LAH"] {
            assert!(!Role::Diversion.keeps(kind));
        }
        assert!(Role::Alternate.keeps("HOT") && !Role::Alternate.keeps("DP"));
        assert!(Role::Departure.keeps("DP") && Role::Departure.keeps("IAP"));
    }
}
