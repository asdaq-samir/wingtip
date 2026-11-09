//! The plan's sessions: what to practise, why (the currencies due and the
//! evidence it answers), where (the nearest field of those the host
//! looked up round the pilot's home that suits it: a lighted runway for
//! night landings, an instrument approach for approaches), how long, and
//! whether it may count toward a WINGS phase.
//!
//! WINGS (AC 61-91K, 10/30/24): "Pilots must complete all of the required
//! set of tasks for a phase of WINGS, three knowledge and flight
//! activities, within a 12-month period" (7.3.1); "a demonstration of
//! proficiency is always required for flight activities", to the ACS
//! (7.3.2); the activities answer accident causal factors among them
//! "positive aircraft control, basic flying skills, and takeoffs and
//! landings" (6), arranged in areas on FAASafety.gov. A session flown
//! with an authorized instructor to the ACS task may be accepted as one
//! of a phase's flight activities, which only FAASafety.gov's accredited
//! activity and the instructor's sign-off grant; so a session says "may
//! count", never that it does. Each new phase meets the flight review
//! (61.56(e); AC 61-91K 7.2).
//!
//! The minutes are the plan's suggestion of a session's length, not a
//! rule: a full-stop circuit with its taxi back is about ten minutes, and
//! there is the flight to the field and home.

use super::due::{Due, Status};
use super::evidence::{Evidence, Weak};
use crate::json::Value;

/// The most sessions a plan holds: a pilot looks and goes (docs/decisions/0012).
pub const MOST_SESSIONS: usize = 4;

/// A field near home, as the host found it in its data (NASR, the CIFP).
pub struct Place {
    pub ident: String,
    pub name: String,
    pub distance_nm: f64,
    pub lighted: bool,
    /// Its instrument approaches' names, a precision one (ILS, LPV's
    /// glidepath) marked.
    pub approaches: Vec<(String, bool)>,
}

pub fn places(name: &str, items: &[Value]) -> Result<Vec<Place>, String> {
    let mut out: Vec<Place> = items
        .iter()
        .map(|p| {
            let ident = p.get("ident").and_then(Value::as_str).ok_or_else(|| format!("{name}: a place has no \"ident\""))?;
            Ok(Place {
                ident: ident.to_owned(),
                name: p.get("name").and_then(Value::as_str).unwrap_or(ident).to_owned(),
                distance_nm: p.get("distance_nm").and_then(Value::as_f64).unwrap_or(0.0),
                lighted: matches!(p.get("lighted"), Some(Value::Bool(true))),
                approaches: p
                    .get("approaches")
                    .and_then(Value::as_array)
                    .unwrap_or(&[])
                    .iter()
                    .filter_map(|a| Some((a.get("name")?.as_str()?.to_owned(), matches!(a.get("precision"), Some(Value::Bool(true))))))
                    .collect(),
            })
        })
        .collect::<Result<_, String>>()?;
    out.sort_by(|a, b| a.distance_nm.total_cmp(&b.distance_nm));
    Ok(out)
}

/// What a field must have for a session.
#[derive(Clone, Copy)]
enum Needs {
    Any,
    Lighted,
    Approach,
    /// An approach with a glidepath, else any approach.
    Glidepath,
}

/// The nearest field that has what `needs`, and the approach to fly there.
fn nearest(places: &[Place], needs: Needs) -> Option<(&Place, Option<String>)> {
    let first = |p: &&Place| match needs {
        Needs::Any => true,
        Needs::Lighted => p.lighted,
        Needs::Approach | Needs::Glidepath => !p.approaches.is_empty(),
    };
    if let Needs::Glidepath = needs {
        if let Some(p) = places.iter().find(|p| p.approaches.iter().any(|a| a.1)) {
            return Some((p, p.approaches.iter().find(|a| a.1).map(|a| a.0.clone())));
        }
    }
    let p = places.iter().find(first)?;
    let approach = match needs {
        Needs::Approach | Needs::Glidepath => p.approaches.first().map(|a| a.0.clone()),
        _ => None,
    };
    Some((p, approach))
}

/// A WINGS note: the accident causal factor's area (AC 61-91K 6) and the
/// ACS task the session is flown to.
pub struct Wings {
    pub area: &'static str,
    pub acs: &'static str,
}

pub struct Session {
    pub key: &'static str,
    pub practise: String,
    pub why: Vec<String>,
    pub place: Option<(String, String, f64)>,
    pub approach: Option<String>,
    pub minutes: u32,
    pub instructor: bool,
    pub wings: Option<Wings>,
}

struct Template {
    key: &'static str,
    practise: String,
    needs: Option<Needs>,
    minutes: u32,
    instructor: bool,
    wings: Option<Wings>,
}

fn session(t: Template, why: Vec<String>, places: &[Place]) -> Session {
    let found = t.needs.and_then(|n| nearest(places, n));
    Session {
        key: t.key,
        practise: t.practise,
        why,
        place: found.as_ref().map(|(p, _)| (p.ident.clone(), p.name.clone(), p.distance_nm)),
        approach: found.and_then(|(_, a)| a),
        minutes: t.minutes,
        instructor: t.instructor,
        wings: t.wings,
    }
}

/// The session that restores or renews a currency due, None for those
/// a session does not answer (the medical).
fn for_due(d: &Due, missing: &str) -> Option<Template> {
    let t = |key, practise: &str, needs, minutes, instructor, wings| Template {
        key,
        practise: practise.to_owned(),
        needs,
        minutes,
        instructor,
        wings,
    };
    Some(match d.key {
        "flight_review" => t("flight_review", "Flight review with an instructor: at least an hour of ground and an hour of flight training (61.56(a)); a WINGS phase completed instead meets it (61.56(e))", None, 120, true, None),
        "solo" => t("solo", "Fly with your instructor for a new 90-day solo endorsement (61.87(p))", None, 60, true, None),
        "day_passengers" => t("day_passengers", "Three takeoffs and three landings (61.57(a))", Some(Needs::Any), 45, false, None),
        "night_passengers" => t("night_passengers", "Three takeoffs and three landings to a full stop, from 1 hour after sunset (61.57(b))", Some(Needs::Lighted), 60, false, None),
        "instrument" if d.check => t(
            "ipc",
            "Instrument proficiency check with an instructor (61.57(d))",
            Some(Needs::Approach),
            120,
            true,
            Some(Wings { area: "Basic flying skills", acs: "IR.VI.A" }),
        ),
        "instrument" => Template {
            key: "instrument",
            practise: format!("{missing}, with a view-limiting device and a safety pilot (61.57(c)(1); 91.109(c))"),
            needs: Some(Needs::Approach),
            minutes: 90,
            instructor: false,
            wings: None,
        },
        _ => return None,
    })
}

/// The session that practises a weak area.
fn for_weak(w: Weak) -> Template {
    let t = |practise: &str, needs, minutes, area, acs| Template {
        key: w.key(),
        practise: practise.to_owned(),
        needs: Some(needs),
        minutes,
        instructor: true,
        wings: Some(Wings { area, acs }),
    };
    match w {
        Weak::Unstable => t("Stabilized approaches: on speed, on the glidepath and on the centreline by 500 ft above the field, and a go-around where not (AC 61-98D 2.1.4)", Needs::Glidepath, 60, "Takeoffs and landings", "PA.IV.B"),
        Weak::ApproachDeviation => t("Approaches flown within full scale and at each step-down's altitude", Needs::Approach, 90, "Basic flying skills", "IR.VI.A"),
        Weak::Pattern => t("Traffic patterns at pattern altitude, entry to landing", Needs::Any, 45, "Takeoffs and landings", "PA.III.B"),
        Weak::Cruise => t("A cross-country leg by pilotage and dead reckoning, held to its altitude and course", Needs::Any, 90, "Positive aircraft control", "PA.VI.A"),
    }
}

/// What 61.57(c)(1)'s window still lacks, in words, from the currency answer.
pub fn instrument_missing(currency: &Value) -> String {
    let flown = currency.get("approachesInWindow").and_then(Value::as_f64).unwrap_or(0.0) as i64;
    let mut need = vec![if flown >= 6 { "Approaches".to_owned() } else { format!("{} approaches", 6 - flown) }];
    if !matches!(currency.get("holdingInWindow"), Some(Value::Bool(true))) {
        need.push("holding".to_owned());
    }
    if !matches!(currency.get("trackingInWindow"), Some(Value::Bool(true))) {
        need.push("intercepting and tracking courses".to_owned());
    }
    need.join(", ")
}

/// The plan's sessions: currencies lapsed, then those lapsing soon, then
/// the weak areas the most evidence shows, at most MOST_SESSIONS.
pub fn plan(due: &[Due], weak: &[(Weak, Vec<&Evidence>)], currency: &Value, places: &[Place]) -> Vec<Session> {
    let missing = instrument_missing(currency);
    let mut out: Vec<Session> = Vec::new();
    for wanted in [Status::Lapsed, Status::DueSoon] {
        for d in due.iter().filter(|d| d.status == wanted) {
            if let Some(t) = for_due(d, &missing) {
                out.push(session(t, vec![format!("due:{}", d.key)], places));
            }
        }
    }
    for (w, ev) in weak {
        out.push(session(for_weak(*w), ev.iter().map(|e| e.id.clone()).collect(), places));
    }
    out.truncate(MOST_SESSIONS);
    out
}
