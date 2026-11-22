//! Where an approach's missed approach starts and ends among its coded
//! legs, and where the route's sequencing stops for it: the planner reads
//! the CIFP's legs and asks this which of them are the missed approach,
//! the web which to show suspended at the missed approach point.
//!
//! The missed approach is the published procedure flown from the missed
//! approach point (AIM 5-4-21 a: "a missed approach procedure ... is
//! published on the approach chart", begun at the MAP). In the CIFP the
//! MAP is the leg whose waypoint description's fourth character is "M"
//! (ARINC 424-18 5.17), and the legs after it in the approach's record are
//! its missed approach, which ends in the hold at its clearance limit --
//! a leg flown as a hold, HA, HF or HM (ARINC 424-18 5.21, Attachment 5).
//! As a GPS navigator does, the route's sequencing is suspended at the MAP
//! (Garmin's SUSP) until the pilot goes on into the missed approach.

#[cfg(test)]
use crate::json;
use crate::json::Value;
use wingtip_core::ask::Ask;

/// The path terminators flown as a hold (ARINC 424-18 5.21): a hold to an
/// altitude (HA), to its fix once round (HF), or until told (HM).
const HOLD_PATHS: [&str; 3] = ["HA", "HF", "HM"];

/// An approach's coded legs split at its missed approach point: where
/// sequencing is suspended (the MAP's leg, its index), and the legs of the
/// missed approach, those after it up to and including the first that
/// holds. None suspended and none missed where no leg is the MAP; legs
/// coded past the hold are not the missed approach's.
#[derive(Debug, PartialEq)]
pub struct Missed {
    pub suspend_at: Option<usize>,
    pub missed: Vec<usize>,
}

/// The split, from each leg's path terminator and whether it is the MAP.
pub fn split(legs: &[(&str, bool)]) -> Missed {
    let Some(map) = legs.iter().position(|(_, is_map)| *is_map) else {
        return Missed { suspend_at: None, missed: Vec::new() };
    };
    let mut missed = Vec::new();
    for (i, (path, _)) in legs.iter().enumerate().skip(map + 1) {
        missed.push(i);
        if HOLD_PATHS.contains(path) {
            break;
        }
    }
    Missed { suspend_at: Some(map), missed }
}

/// - `procedure_missed`: `{"suspend_at": index or null, "missed": [index]}`,
///   from `{"legs": [{"path", "map"?}]}` in the order coded.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    if name != "procedure_missed" {
        return Err(format!("the engine has no rule called {name:?}"));
    }
    let legs = ask
        .list("legs")?
        .iter()
        .map(|leg| {
            let at = Ask::new(name, leg);
            Ok((at.str("path")?, at.opt_bool("map")?))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let found = split(&legs);
    let mut out = String::from("{\"suspend_at\":");
    out.push_str(&found.suspend_at.map_or_else(|| "null".to_string(), |i| i.to_string()));
    out.push_str(",\"missed\":[");
    let indexes: Vec<String> = found.missed.iter().map(usize::to_string).collect();
    out.push_str(&indexes.join(","));
    out.push_str("]}");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_missed_approach_runs_from_after_the_map_to_its_hold() {
        // KDLH's ILS 27 as coded: IF, TF to the FAF, TF to the MAP (RW27),
        // then CA, DF and the hold at the clearance limit (HM).
        let legs = [("IF", false), ("TF", false), ("TF", true), ("CA", false), ("DF", false), ("HM", false)];
        assert_eq!(split(&legs), Missed { suspend_at: Some(2), missed: vec![3, 4, 5] });
    }

    #[test]
    fn legs_past_the_hold_and_an_approach_with_no_map_are_not_missed() {
        let legs = [("TF", true), ("HA", false), ("TF", false)];
        assert_eq!(split(&legs).missed, vec![1]);
        assert_eq!(split(&[("IF", false), ("TF", false)]), Missed { suspend_at: None, missed: Vec::new() });
        // A MAP with nothing coded after it: suspended there, nothing to fly on.
        assert_eq!(split(&[("TF", true)]), Missed { suspend_at: Some(0), missed: Vec::new() });
    }

    #[test]
    fn asked_by_name() {
        let v = json::parse(r#"{"legs": [{"path": "TF", "map": true}, {"path": "CA"}, {"path": "HM"}]}"#).unwrap();
        assert_eq!(call("procedure_missed", &v).unwrap(), r#"{"suspend_at":0,"missed":[1,2]}"#);
        let v = json::parse(r#"{"legs": []}"#).unwrap();
        assert_eq!(call("procedure_missed", &v).unwrap(), r#"{"suspend_at":null,"missed":[]}"#);
        assert!(call("procedure_missed", &json::parse("{}").unwrap()).is_err());
    }
}
