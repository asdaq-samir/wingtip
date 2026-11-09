//! An ATC instruction heard in flight, read into its items in the order
//! they were said: what the ATC copilot's card shows and the readback is
//! checked against (readback.rs, AIM 4-4-7 b.2: "Read back altitudes,
//! altitude restrictions, and vectors in the same sequence as they are
//! given").
//!
//! The clearance reader (clearance.rs) gives the clearance's own items:
//! its limit and route, the altitude to maintain and to expect, the
//! frequency and the code. This adds what is said to an airplane already
//! flying: a heading or a turn (a vector), a direct, a hold (AIM 5-3-8:
//! the fix, the direction from it, the radial or course, the turns, the
//! time to expect further clearance), the altimeter setting, an approach
//! cleared or expected and a runway assigned. Every figure is as heard;
//! nothing here is checked against what the airplane can do, and nothing
//! is set: the pilot reads the card and decides (14 CFR 91.3, 91.123(a)
//! "When a pilot is uncertain of an ATC clearance, that pilot shall
//! immediately request clarification from ATC").

mod json;
mod parts;

pub use json::items_json;
use parts::{altimeter_of, approach_at, approach_kind, approach_start, hold_at, runway_at};

use crate::clearance::{self, direct_of, frequency_of, tokens, Clearance, Token};

/// One part of an instruction.
#[derive(Clone, Debug, PartialEq)]
pub enum Item {
    /// An altitude assigned: climb, descend or maintain it, "at or above"
    /// and the like kept.
    Altitude {
        ft: i64,
        verb: &'static str,
        limit: Option<String>,
    },
    /// An altitude to expect, and when ("one zero minutes after
    /// departure").
    Expect {
        ft: i64,
        min: Option<i64>,
    },
    /// A vector: a heading to fly, which way to turn to it, or a turn by
    /// so many degrees. "Fly runway heading" has no figure.
    Heading {
        deg: Option<i64>,
        turn: Option<&'static str>,
        by_deg: Option<i64>,
    },
    /// Direct to a place, as words to find.
    Direct {
        said: String,
    },
    /// A clearance's limit and route (clearance.rs), the places as said.
    Route {
        limit: Option<String>,
        places: Vec<String>,
        as_filed: bool,
    },
    /// Cleared into Class B airspace (14 CFR 91.131(a)(1)).
    ClassB,
    /// A hold (AIM 5-3-8's clearance items): the fix, the direction
    /// from it, the radial, course or bearing it is on, the turns where
    /// not right, as published, the expect further clearance time.
    Hold {
        fix: String,
        direction: Option<String>,
        on: Option<(&'static str, i64)>,
        turns: Option<&'static str>,
        published: bool,
        efc: Option<String>,
    },
    Frequency {
        mhz: String,
        facility: Option<String>,
    },
    Squawk {
        code: String,
    },
    /// The altimeter setting, inches of mercury written with two places.
    Altimeter {
        inhg: String,
    },
    /// An approach cleared, or to expect: its kind ("ILS", "RNAV (GPS)
    /// Z", "Visual") and runway.
    Approach {
        name: String,
        runway: Option<String>,
        cleared: bool,
    },
    /// A runway assigned, and for what: "land", "takeoff", "option",
    /// "hold short", "line up and wait".
    Runway {
        runway: String,
        what: Option<&'static str>,
    },
}

impl Item {
    /// Its kind as the apps name it.
    pub fn kind(&self) -> &'static str {
        match self {
            Item::Altitude { .. } => "altitude",
            Item::Expect { .. } => "expect",
            Item::Heading { .. } => "heading",
            Item::Direct { .. } => "direct",
            Item::Route { .. } => "route",
            Item::ClassB => "class_b",
            Item::Hold { .. } => "hold",
            Item::Frequency { .. } => "frequency",
            Item::Squawk { .. } => "squawk",
            Item::Altimeter { .. } => "altimeter",
            Item::Approach { .. } => "approach",
            Item::Runway { .. } => "runway",
        }
    }
}

pub(super) fn word(toks: &[Token], k: usize) -> Option<&str> {
    toks.get(k).map(|t| t.word.as_str())
}

pub(super) fn num(toks: &[Token], k: usize) -> Option<&str> {
    toks.get(k).and_then(|t| t.num.as_deref())
}

/// A heading's whole degrees, 1 to 360, magnetic and said in three
/// figures (AIM 4-2-10: "(Magnetic bearing) 360 three six zero"): north
/// is 360, so 0 was misheard.
pub(super) fn degrees(n: &str) -> Option<i64> {
    if n.contains('.') {
        return None;
    }
    n.parse::<i64>().ok().filter(|d| (1..=360).contains(d))
}

/// The instruction in what was heard, its items in the order said.
pub fn read(text: &str) -> Vec<Item> {
    let toks = tokens(text);
    let c = clearance::read(text);
    let mut said: Vec<(usize, Item)> = Vec::new();
    let at = |pred: &dyn Fn(&Token) -> bool| toks.iter().position(pred).unwrap_or(toks.len());
    let used_runway_at = &mut Vec::<usize>::new();

    // The clearance reader's altitude, with its verb: "climb and
    // maintain", "descend to", "maintain".
    if let Some(ft) = c.maintain_ft {
        let k = at(&|t| ["climb", "descend", "maintain", "cruise"].contains(&t.word.as_str()));
        let verb = match word(&toks, k) {
            Some("climb") => "climb",
            Some("descend") => "descend",
            Some("cruise") => "cruise",
            _ => "maintain",
        };
        said.push((k, Item::Altitude { ft, verb, limit: c.maintain_limit.clone() }));
    }
    if let Some(ft) = c.expect_ft {
        let k = (0..toks.len()).find(|&k| toks[k].word == "expect" && num(&toks, k + 1).is_some()).unwrap_or(toks.len());
        said.push((k, Item::Expect { ft, min: c.expect_min }));
    }
    if let Some(mhz) = &c.frequency {
        let k = at(&|t| t.num.as_deref().and_then(frequency_of).as_deref() == Some(mhz.as_str()));
        said.push((k, Item::Frequency { mhz: mhz.clone(), facility: c.facility.clone() }));
    }
    if let Some(code) = &c.squawk {
        let k = at(&|t| ["squawk", "transponder", "code"].contains(&t.word.as_str()));
        said.push((k, Item::Squawk { code: code.clone() }));
    }
    let direct = direct_of(text);
    route_items(&toks, &c, direct.as_deref(), &mut said);
    if let Some(place) = direct {
        let k = at(&|t| t.word == "direct");
        said.push((k, Item::Direct { said: place }));
    }

    let mut i = 0;
    while i < toks.len() {
        let w = toks[i].word.as_str();
        if w == "heading" {
            // "Turn left heading two seven zero", "fly heading zero niner
            // zero", "fly runway heading" (no figure).
            let turn = turn_before(&toks, i);
            let deg = num(&toks, i + 1).and_then(degrees);
            let runway = i > 0 && word(&toks, i - 1) == Some("runway");
            if deg.is_some() || runway {
                said.push((turn.map_or(i, |(k, _)| k), Item::Heading { deg, turn: turn.map(|(_, t)| t), by_deg: None }));
            }
        } else if w == "turn" && matches!(word(&toks, i + 1), Some("left") | Some("right")) && word(&toks, i + 3) == Some("degrees") {
            // "Turn right two zero degrees".
            if let Some(by) = num(&toks, i + 2).and_then(degrees) {
                let turn = if word(&toks, i + 1) == Some("left") { "left" } else { "right" };
                said.push((i, Item::Heading { deg: None, turn: Some(turn), by_deg: Some(by) }));
            }
        } else if w == "hold" && word(&toks, i + 1) != Some("short") {
            if let Some((item, used)) = hold_at(&toks, i) {
                said.push((i, item));
                i += used;
                continue;
            }
        } else if w == "altimeter" {
            let n = (i + 1..(i + 4).min(toks.len())).find_map(|k| toks[k].num.as_deref());
            if let Some(inhg) = n.and_then(altimeter_of) {
                said.push((i, Item::Altimeter { inhg }));
            }
        } else if let Some(kind) = approach_kind(w) {
            if let Some((item, used, runway_k)) = approach_at(&toks, i, kind) {
                if let Some(k) = runway_k {
                    used_runway_at.push(k);
                }
                said.push((approach_start(&toks, i), item));
                i += used;
                continue;
            }
        }
        i += 1;
    }
    // A runway assigned outside an approach: to land, take off, hold
    // short or line up and wait on (AIM 4-4-7 b.4 has it read back).
    for k in 0..toks.len() {
        if toks[k].word != "runway" || used_runway_at.contains(&(k + 1)) || word(&toks, k + 1) == Some("heading") {
            continue;
        }
        if let Some((runway, _)) = runway_at(&toks, k + 1) {
            let near = |w: &str| toks[k.saturating_sub(5)..(k + 6).min(toks.len())].iter().any(|t| t.word == w);
            let what = if near("short") {
                Some("hold short")
            } else if near("land") {
                Some("land")
            } else if near("takeoff") || (near("take") && near("off")) {
                Some("takeoff")
            } else if near("option") {
                Some("option")
            } else if near("wait") {
                Some("line up and wait")
            } else {
                None
            };
            let start = (k.saturating_sub(4)..k).find(|&j| toks[j].word == "cleared" || toks[j].word == "hold").unwrap_or(k);
            said.push((start, Item::Runway { runway, what }));
        }
    }
    said.sort_by_key(|(k, _)| *k);
    said.into_iter().map(|(_, item)| item).collect()
}

/// "Turn left" up to three words before a heading, where it began.
fn turn_before(toks: &[Token], i: usize) -> Option<(usize, &'static str)> {
    (i.saturating_sub(3)..i).rev().find_map(|k| match toks[k].word.as_str() {
        "left" => Some((if k > 0 && toks[k - 1].word == "turn" { k - 1 } else { k }, "left")),
        "right" => Some((if k > 0 && toks[k - 1].word == "turn" { k - 1 } else { k }, "right")),
        _ => None,
    })
}

/// The clearance's limit and route as one item, the direct's place left
/// to its own item; Class B's clearance its own.
fn route_items(toks: &[Token], c: &Clearance, direct: Option<&str>, said: &mut Vec<(usize, Item)>) {
    let k = toks.iter().position(|t| t.word == "cleared" || t.word == "clear").unwrap_or(0);
    if c.class_b {
        said.push((k, Item::ClassB));
    }
    let places: Vec<String> = c
        .route
        .iter()
        .filter_map(|item| match item {
            clearance::Item::Places(s) => Some(s.clone()),
            clearance::Item::Airway(a) => Some(a.clone()),
            clearance::Item::Procedure { name, number, .. } => Some(format!("{name} {number}")),
            _ => None,
        })
        .filter(|p| direct.is_none_or(|d| !p.eq_ignore_ascii_case(d)))
        .collect();
    if c.limit.is_some() || c.as_filed || !places.is_empty() {
        said.push((k, Item::Route { limit: c.limit.clone(), places, as_filed: c.as_filed }));
    }
}
