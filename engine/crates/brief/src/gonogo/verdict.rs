//! The Brief's Go / No-Go (every app asks it, put together by brief.rs's
//! `gonogo_brief`; apps/web/src/lib/verdict.ts asks it by name): each tab's own
//! finding about the flight in one list, each a row that opens where it
//! was found -- the weather, the airspace on the route, the altitude, the
//! fuel, the runways, the loading and the risk -- and one line over them
//! saying what they come to. What the pilot reads first on opening the
//! Brief, as a flight service briefer opens with adverse conditions and
//! whether VFR is recommended (AIM 7-1-5(b)(1), (b)(2)). The findings are
//! the planner's; the decision is the pilot in command's (14 CFR 91.3),
//! and the line says so.
//!
//! A finding (lib/findings) is "ok", "caution", "stop", "unknown" or
//! "pending". Strings are taken as JavaScript takes them: one empty or
//! absent is not said.

use super::{said, strings};
use crate::figures::words::{js_num, one};
use crate::json;

/// The worst first (lib/findings worstOf): a stop over a caution over not
/// known over still pending over nothing found.
pub const WORST_FIRST: [&str; 4] = ["stop", "caution", "unknown", "pending"];

pub fn worst_of(findings: &[&str]) -> &'static str {
    WORST_FIRST.iter().find(|f| findings.contains(f)).copied().unwrap_or("ok")
}

/// The risk assessment's level as a finding.
pub fn risk_finding(level: &str) -> &'static str {
    match level {
        "low" => "ok",
        "caution" => "caution",
        "high" => "stop",
        // RISK_FINDING[level] of a level it does not have: undefined, as
        // no finding the worst-of reads.
        _ => "",
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Weather {
    /// The section was not sent, or not what it decides by (its lists):
    /// nothing was checked, so nothing is said to be clear. A missing
    /// figure is "unknown", as the fuel's is, never "ok" (14 CFR 91.103:
    /// the pilot is to become familiar with all available information).
    pub missing: bool,
    /// The briefing is still being fetched, or failed (its words).
    pub pending: bool,
    pub failed: Option<String>,
    /// AIM 7-1-5's "VFR flight not recommended", its reasons.
    pub vfr_not_recommended: Vec<String>,
    /// Under the pilot's own minimums (minimums).
    pub under_minimums: Vec<String>,
    /// Under IFR, icing possible at an altitude flown (icing), in a line.
    pub icing: Option<String>,
    /// The SIGMETs and G-AIRMETs along the route, by name.
    pub hazards: Vec<String>,
    /// The sources that did not answer, by name.
    pub unchecked: Vec<String>,
    /// The worst the forecast says along the route, in words.
    pub worst: Option<String>,
    /// The terminal weather alerts in force now at the route's airports,
    /// each in its words with its airport ("ATL: Runway 27L arrival
    /// microburst alert 40 kt, 3 mile final to runway"): the FAA's ITWS,
    /// as its controllers relay them (AIM 4-3-7).
    pub terminal_alerts: Vec<String>,
    /// The Command Center's programs at the route's airports, in words
    /// ("Ground stop at EWR"): a ground stop or delay program holds IFR
    /// flights to the airport (FAA JO 7210.3, chapter 17), so they are a
    /// finding only under IFR (`ifr`).
    pub flow_programs: Vec<String>,
    /// The flight is planned IFR.
    pub ifr: bool,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Airspace {
    /// Not sent, as Weather's.
    pub missing: bool,
    pub pending: bool,
    /// tfr.faa.gov did not answer.
    pub unchecked: bool,
    /// TFRs the route goes through while in force when it gets there.
    pub in_force: Vec<String>,
    /// TFRs near the route that are not.
    pub near: f64,
    /// Special-use areas the legs cross, (name, when) as their times of
    /// use read for the pass (pass_times::sua_when).
    pub special_use: Vec<(String, String)>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Altitude {
    /// Not sent, as Weather's.
    pub missing: bool,
    pub pending: bool,
    /// No VFR altitude fits, in a line.
    pub problem: Option<String>,
    /// A pilot's own altitude's broken rules.
    pub cautions: Vec<String>,
    /// The altitude flown, as the FL chip says it.
    pub flown: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Fuel {
    pub pending: bool,
    /// The least the tanks hold over the fuel and its reserve, any flight
    /// of the route; None where the usable fuel is not known.
    pub margin_gal: Option<f64>,
    pub required_gal: Option<f64>,
    pub reserve_min: Option<f64>,
    /// Under IFR: the reserve is 14 CFR 91.167's, not 91.151's.
    pub ifr: bool,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Runways {
    /// Not sent, as Weather's.
    pub missing: bool,
    pub pending: bool,
    /// Not worked out: no POH tables for this airplane.
    pub worked: bool,
    pub short: Vec<String>,
    pub crosswind: Vec<String>,
    /// Fields whose distances were read past the POH's table -- higher,
    /// hotter, heavier or a stronger tailwind than it goes -- so the
    /// figures are the table's edge, shorter than the airplane will need.
    pub beyond: Vec<String>,
    /// Fields whose distances could not be held against the runway: its
    /// length or the field's elevation is not known.
    pub unchecked: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Balance {
    pub pending: bool,
    pub worked: bool,
    pub problems: Vec<String>,
    pub takeoff: Option<String>,
}

/// The web's VerdictInput: each tab's say, and the risk assessment's
/// (level, line), None while the briefing is awaited.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Input {
    pub weather: Weather,
    pub airspace: Airspace,
    pub altitude: Altitude,
    pub fuel: Fuel,
    pub runways: Runways,
    pub balance: Balance,
    pub risk: Option<(String, String)>,
}

/// One tab's finding, and where it is shown in full: a tab of the
/// planning panel and a section of it by its title.
#[derive(Clone, Debug, PartialEq)]
pub struct Item {
    pub key: String,
    pub label: String,
    pub tab: String,
    pub section: Option<String>,
    pub finding: String,
    pub detail: String,
}

fn item(key: &str, label: &str, tab: &str, section: &str, (finding, detail): (&str, String)) -> Item {
    Item { key: key.into(), label: label.into(), tab: tab.into(), section: Some(section.into()), finding: finding.into(), detail }
}

mod findings;
use findings::*;
mod items;
pub use items::*;
