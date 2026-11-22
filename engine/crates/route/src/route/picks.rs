//! What the pilot picked at the route's fields: the instrument procedures
//! (the address's `procedures`, the planner's PlanQuery.procedure_picks,
//! the web app's lib/procedures proceduresOf and proceduresParam, the
//! iPhone's ProcedurePick), the runways left from and landed on (the
//! planner's PlanQuery.departure_runways and landing_runways), and how a
//! procedure's fix sets its crossing altitudes (lib/procedures
//! altitudeLines).

use super::{all, normal, trim, upper_alnum};
use wingtip_flight::field::bare_field;

/// A procedure picked at a field: the field, the procedure's coded
/// identifier ("I08-Y"), its transition -- none for an approach from
/// vectors, or an arrival's or departure's common route alone -- and a fix
/// of it ATC sent the airplane direct to, the procedure flown from there.
/// An approach is `loaded` -- picked, not yet in the route flown -- until
/// the pilot activates it, as a GPS navigator loads one before it is
/// activated; activated, its missed approach is flown on from the missed
/// approach point only where the pilot unsuspended it (`missed`, AIM
/// 5-4-21; procedures' missed), else the route ends at the runway.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Pick {
    pub ident: String,
    pub id: String,
    pub transition: Option<String>,
    pub direct: Option<String>,
    pub loaded: bool,
    pub missed: bool,
}

/// The fifth piece of a pick: "L", loaded and not flown; "M", flown on
/// into its missed approach.
const LOADED: &str = "L";
const MISSED: &str = "M";

fn alnum(s: &str, min: usize, max: usize) -> bool {
    all(s, min, max, |c| c.is_ascii_alphanumeric())
}

fn procedure_id(s: &str, any_case: bool) -> bool {
    all(s, 1, 6, |c| if any_case { c.is_ascii_alphanumeric() || c == b'-' } else { upper_alnum(c) || c == b'-' })
}

/// The pick a piece of the address is, as the web app reads it, leaving
/// out what is not one: "KBUR:I08-Y:LAX", the field, the procedure and its
/// transition, after a fourth colon a fix flown direct to
/// ("KELD:I22::BXCMB"), and after a fifth "L" loaded or "M" its missed
/// approach flown ("KDLH:I27:::L"), each trimmed and uppercased. A transition or a
/// direct fix not of its form is dropped and the rest kept; a field or a
/// procedure not of its form is no pick.
fn lenient(part: &str) -> Option<Pick> {
    let mut pieces = part.split(':').map(normal);
    let ident = pieces.next().unwrap_or_default();
    let id = pieces.next().unwrap_or_default();
    let transition = pieces.next().unwrap_or_default();
    let direct = pieces.next().unwrap_or_default();
    let state = pieces.next().unwrap_or_default();
    if !all(&ident, 2, 5, upper_alnum) || !procedure_id(&id, false) {
        return None;
    }
    Some(Pick {
        ident,
        id,
        transition: all(&transition, 1, 5, upper_alnum).then_some(transition),
        direct: all(&direct, 2, 5, upper_alnum).then_some(direct),
        loaded: state == LOADED,
        missed: state == MISSED,
    })
}

/// Whether a piece is a pick exactly as the planner takes one,
/// "FIELD:PROCEDURE[:TRANSITION[:DIRECT[:STATE]]]", either case: a field
/// of two to five letters and figures, a procedure of one to six and "-",
/// a transition of one to five -- none where a direct fix of two to five
/// follows it -- and a state of "L" or "M", either before it empty.
fn exact(part: &str) -> bool {
    let pieces: Vec<&str> = part.split(':').collect();
    let ends = alnum(pieces[0], 2, 5) && pieces.get(1).is_some_and(|id| procedure_id(id, true));
    ends && match pieces.len() {
        2 => true,
        3 => alnum(pieces[2], 1, 5),
        4 => alnum(pieces[2], 0, 5) && alnum(pieces[3], 2, 5),
        5 => {
            let state = pieces[4].to_ascii_uppercase();
            alnum(pieces[2], 0, 5) && (pieces[3].is_empty() || alnum(pieces[3], 2, 5)) && (state == LOADED || state == MISSED)
        }
        _ => false,
    }
}

/// One piece of the address's `procedures`, trimmed.
pub struct Read {
    pub part: String,
    /// The pick it is as the web app reads it, or None.
    pub pick: Option<Pick>,
    /// It is a pick exactly as written, which the planner asks: where it is
    /// not, the planner answers a 422 naming it, and where it is, its pick
    /// is the one above.
    pub exact: bool,
}

/// The pieces of the address's `procedures`, "KBUR:I08-Y:LAX,KBUR:JANNY5",
/// each trimmed, the empty ones left out.
pub fn procedures_read(text: &str) -> Vec<Read> {
    text.split(',').map(trim).filter(|p| !p.is_empty()).map(|p| Read { part: p.to_owned(), pick: lenient(p), exact: exact(p) }).collect()
}

/// The picks for the address: "KBUR:I08-Y:LAX,C81:R24", a direct fix after
/// a fourth colon, the transition left empty where there is none
/// ("KELD:I22::BXCMB"), and a loaded one's "L" or a missed approach
/// flown's "M" after a fifth ("KDLH:I27:::L"); loaded is never flown, so
/// it is never both.
pub fn procedures_write(picks: &[Pick]) -> String {
    picks
        .iter()
        .map(|p| {
            let mut out = format!("{}:{}", p.ident, p.id);
            let state = if p.loaded { Some(LOADED) } else { p.missed.then_some(MISSED) };
            match (&p.transition, &p.direct, state) {
                (t, d, Some(state)) => {
                    out.push_str(&format!(":{}:{}:{state}", t.as_deref().unwrap_or(""), d.as_deref().unwrap_or("")));
                }
                (t, Some(d), None) => out.push_str(&format!(":{}:{d}", t.as_deref().unwrap_or(""))),
                (Some(t), None, None) => out.push_str(&format!(":{t}")),
                (None, None, None) => {}
            }
            out
        })
        .collect::<Vec<_>>()
        .join(",")
}

/// A runway picked at a field, "KSTL:30R": the field's FAA ident
/// (bare_field) and the runway's number and side, uppercased.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RunwayPick {
    pub field: String,
    pub runway: String,
}

/// A runway as the address writes it: one or two figures and L, R or C.
fn runway(s: &str) -> bool {
    let number = s.strip_suffix(['L', 'R', 'C']).unwrap_or(s);
    all(number, 1, 2, |c| c.is_ascii_digit())
}

/// The pieces of the planner's `runways` or `patterns`, "KSTL:30R,KMSN:36",
/// each trimmed, the empty ones left out, with the runway it picks, or
/// None where it is not "IDENT:RUNWAY" (a 422 naming it).
pub fn runways_read(text: &str) -> Vec<(String, Option<RunwayPick>)> {
    text.split(',')
        .map(trim)
        .filter(|p| !p.is_empty())
        .map(|p| {
            let (ident, number) = p.split_once(':').unwrap_or((p, ""));
            let number = super::upper(number);
            let pick = (alnum(ident, 2, 5) && runway(&number)).then(|| RunwayPick { field: bare_field(ident), runway: number });
            (p.to_owned(), pick)
        })
        .collect()
}

/// How a fix's crossing altitudes are set as an approach chart sets them
/// (the FAA's Aeronautical Chart User's Guide, terminal procedures): a
/// minimum altitude underlined, a maximum one overlined, a mandatory one
/// both.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Crossing {
    /// At the altitude: one line, under and over.
    At,
    /// Between two: the higher over the lower, each its own line.
    Between,
    AtOrAbove,
    AtOrBelow,
}

impl Crossing {
    pub fn key(self) -> &'static str {
        match self {
            Crossing::At => "at",
            Crossing::Between => "between",
            Crossing::AtOrAbove => "at_or_above",
            Crossing::AtOrBelow => "at_or_below",
        }
    }
}

/// One line of a fix's altitudes: the feet, underlined, overlined.
pub type Line = (f64, bool, bool);

/// A fix's crossing altitudes as the chart sets them, top line first, from
/// its minimum and maximum; None with neither.
pub fn altitude_lines(min_ft: Option<f64>, max_ft: Option<f64>) -> Option<(Crossing, Vec<Line>)> {
    match (min_ft, max_ft) {
        (Some(low), Some(high)) if low == high => Some((Crossing::At, vec![(low, true, true)])),
        (Some(low), Some(high)) => Some((Crossing::Between, vec![(high, false, true), (low, true, false)])),
        (Some(low), None) => Some((Crossing::AtOrAbove, vec![(low, true, false)])),
        (None, Some(high)) => Some((Crossing::AtOrBelow, vec![(high, false, true)])),
        (None, None) => None,
    }
}
