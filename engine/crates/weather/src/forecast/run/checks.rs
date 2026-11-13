//! What the run is warned of: the advisory areas in force over it when it
//! is there, and the first point where the forecast it meets is under 14
//! CFR 91.155's VFR minimums or the pilot's own. Warned, never refused
//! (the owner's rule): the run flies on.

use super::{met::Met, zulu, FieldMet, Input, Meets, Sample};
use crate::forecast::awc::GAIRMET_SNAPSHOT_S;
use crate::forecast::route::{self, feet, miles};
use crate::geo;
use crate::json::Value;
use wingtip_core::sort::StableSort;
use wingtip_flight::vfr;

/// What an alert or an area is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    /// Forecast weather under 91.155's minimums, flown VFR.
    VfrMinimums,
    /// Forecast weather under the pilot's personal minimums.
    PilotMinimums,
    /// A SIGMET or convective SIGMET in force then (FAA-H-8083-28B 26.2.4).
    Sigmet,
    /// A G-AIRMET snapshot for then (FAA-H-8083-28B 26.3.1.1).
    Gairmet,
    /// The Storm Prediction Center's Day 1 convective outlook.
    Outlook,
}

impl Kind {
    pub fn word(self) -> &'static str {
        match self {
            Kind::VfrMinimums => "vfr_minimums",
            Kind::PilotMinimums => "pilot_minimums",
            Kind::Sigmet => "sigmet",
            Kind::Gairmet => "gairmet",
            Kind::Outlook => "outlook",
        }
    }
}

/// An advisory area the run is in at some time: what it is, in words, its
/// altitudes (ft MSL; none from the surface, none to no top), when it is in
/// force and its outline.
#[derive(Clone, Debug, PartialEq)]
pub struct Area {
    pub kind: Kind,
    pub words: String,
    pub source: String,
    pub low_ft: Option<f64>,
    pub high_ft: Option<f64>,
    pub valid_from: Option<f64>,
    pub valid_to: Option<f64>,
    pub coords: Vec<(f64, f64)>,
}

impl Area {
    fn holds(&self, s: &Sample) -> bool {
        self.valid_from.is_none_or(|f| f <= s.t)
            && self.valid_to.is_none_or(|t| s.t < t)
            && s.alt_ft.is_none_or(|a| self.low_ft.is_none_or(|l| l <= a) && self.high_ft.is_none_or(|h| a <= h))
            && geo::path_meets_polygon(&[(s.lat, s.lon)], &self.coords)
    }
}

/// What the run is warned of, when and where, the rule or product it is
/// held to (`source`) cited.
#[derive(Clone, Debug, PartialEq)]
pub struct Alert {
    pub t: f64,
    pub lat: f64,
    pub lon: f64,
    pub kind: Kind,
    pub words: String,
    pub source: String,
}

fn num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

fn text<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

/// A SIGMET's hazard in words (FAA-H-8083-28B 26.2.4.1.1's SIGMET criteria).
fn sigmet_words(a: &Value) -> String {
    let hazard = text(a, "hazard").unwrap_or("");
    if hazard.contains("CONVECTIVE") || text(a, "type").is_some_and(|t| t.to_uppercase().contains("CONVECTIVE")) {
        return "Convective SIGMET (thunderstorms)".to_owned();
    }
    let words = match hazard {
        "TURB" => "turbulence",
        "ICE" => "icing",
        "IFR" => "IFR conditions",
        "MTN OBSCN" => "mountains obscured",
        "ASH" => "volcanic ash",
        "" => "a hazard",
        other => other,
    };
    format!("SIGMET for {words}")
}

/// An SPC categorical outlook's label in words (SPC, "About the SPC
/// convective outlooks": general thunderstorms, then the marginal, slight,
/// enhanced, moderate and high risks of severe thunderstorms).
fn outlook_words(label: &str) -> String {
    let risk = match label {
        "TSTM" => return "Thunderstorms forecast (SPC general thunderstorms area)".to_owned(),
        "MRGL" => "marginal",
        "SLGT" => "slight",
        "ENH" => "enhanced",
        "MDT" => "moderate",
        "HIGH" => "high",
        other => other,
    };
    format!("SPC {risk} risk of severe thunderstorms")
}

/// Every advisory in force at some time of the run whose area it is in,
/// as the areas the run meets, in the products' order.
pub fn areas_met(input: &Input) -> Vec<Area> {
    let snapshot = GAIRMET_SNAPSHOT_S as f64;
    let sigmets = input.sigmets.iter().map(|a| Area {
        kind: Kind::Sigmet,
        words: sigmet_words(a),
        source: "AWC SIGMET".to_owned(),
        low_ft: num(a, "altitude_low_ft"),
        high_ft: num(a, "altitude_high_ft"),
        valid_from: num(a, "valid_from"),
        valid_to: num(a, "valid_to"),
        coords: route::points(a.get("coords")),
    });
    // A snapshot stands for the weather half the gap either side of its
    // time (awc.rs GAIRMET_SNAPSHOT_S); its floor from the freezing level
    // is not known here, so it is taken from the surface, the safer way.
    let gairmets = input.gairmets.iter().filter_map(|a| {
        let valid = num(a, "valid")?;
        Some(Area {
            kind: Kind::Gairmet,
            words: format!("G-AIRMET: {}", text(a, "hazard").unwrap_or("hazard")),
            source: format!("AWC G-AIRMET for {}", zulu(valid)),
            low_ft: num(a, "altitude_low_ft"),
            high_ft: num(a, "altitude_high_ft"),
            valid_from: Some(valid - snapshot),
            valid_to: Some(valid + snapshot),
            coords: route::points(a.get("coords")),
        })
    });
    let outlooks = input.outlooks.iter().map(|a| Area {
        kind: Kind::Outlook,
        words: outlook_words(text(a, "label").unwrap_or("")),
        source: "SPC Day 1 convective outlook".to_owned(),
        low_ft: None,
        high_ft: None,
        valid_from: num(a, "valid_from"),
        valid_to: num(a, "valid_to"),
        coords: route::points(a.get("coords")),
    });
    sigmets.chain(gairmets).chain(outlooks).filter(|a| a.coords.len() >= 3 && input.track.iter().any(|s| a.holds(s))).collect()
}

/// The indexes of the areas a sample is in.
pub fn areas_at(areas: &[Area], s: &Sample) -> Vec<usize> {
    areas.iter().enumerate().filter(|(_, a)| a.holds(s)).map(|(i, _)| i).collect()
}

/// Where the forecast is under 91.155's minimums at an altitude (ft MSL,
/// none on the ground), each a phrase. Simplified toward safety, and said
/// so: the airspace's class is not read here, so its visibility and the
/// distance below the clouds are Class C, D and E's (91.155(a): 3 sm and
/// 500 ft under 10,000 ft MSL; 5 sm and 1,000 ft at or above), never
/// Class G's day 1 sm; and a ceiling under 1,000 ft is held to 91.155(c)'s
/// surface-area floor everywhere, as the briefing holds the route. The
/// cloud distance is measured from the ceiling (BKN, OVC) alone, not from
/// a FEW or SCT base, which a TAF's figures here do not carry: a stated
/// simplification, not one toward safety.
pub fn under_vfr(m: &Met, alt_ft: Option<f64>) -> Vec<String> {
    let high = alt_ft.is_some_and(|a| a >= vfr::HIGH_FROM_MSL_FT);
    let (need_sm, below_ft) =
        if high { (vfr::HIGH_VISIBILITY_SM, vfr::HIGH_CLOUD_BELOW_FT) } else { (vfr::VISIBILITY_SM, vfr::CLOUD_BELOW_FT) };
    let mut out = Vec::new();
    if let Some(v) = m.visibility_sm.filter(|v| *v < need_sm) {
        out.push(format!("visibility {} sm, under {} sm", miles(v), miles(need_sm)));
    }
    if m.ceiling_unknown {
        out.push("a ceiling of unknown height".to_owned());
    } else if let Some(c) = m.ceiling_ft.filter(|c| *c < vfr::SURFACE_AREA_CEILING_FT) {
        out.push(format!("ceiling {} ft, under {} ft", feet(c), feet(vfr::SURFACE_AREA_CEILING_FT)));
    }
    if let (Some(a), Some(c), Some(g)) = (alt_ft, m.ceiling_ft, m.ground_ft) {
        let base = g + c;
        if a > base - below_ft && c >= vfr::SURFACE_AREA_CEILING_FT {
            out.push(format!("cloud base {} ft MSL, less than {} ft above {} ft", feet(base), feet(below_ft), feet(a)));
        }
    }
    out
}

/// Where the forecast is under the pilot's own minimums, each a phrase.
pub fn under_mine(m: &Met, mine: &super::Minimums) -> Vec<String> {
    let mut out = Vec::new();
    if let (Some(c), Some(min)) = (m.ceiling_ft, mine.ceiling_ft)
        && c < min
    {
        out.push(format!("ceiling {} ft, under your {} ft", feet(c), feet(min)));
    }
    if let (Some(v), Some(min)) = (m.visibility_sm, mine.visibility_sm)
        && v < min
    {
        out.push(format!("visibility {} sm, under your {} sm", miles(v), miles(min)));
    }
    out
}

const VFR_RULE: &str = "14 CFR 91.155";
const MINE_RULE: &str = "your personal minimums";

fn sourced(m: &Met, rule: &str) -> String {
    match &m.source {
        Some(s) => format!("{rule}; {}", s.words()),
        None => rule.to_owned(),
    }
}

/// The run's alerts in time order: each landing's and the departure's
/// forecast at its time under the minimums; then along the way, once as
/// each begins, the forecast under 91.155's minimums (flown VFR), under
/// the pilot's own, and each advisory area entered.
pub fn alerts(input: &Input, samples: &[Meets], fields: &[FieldMet], areas: &[Area]) -> Vec<Alert> {
    let mut out = Vec::new();
    for f in fields {
        let at = |kind, why: Vec<String>, rule| Alert {
            t: f.field.t,
            lat: f.field.lat,
            lon: f.field.lon,
            kind,
            words: format!("{} at {} ({}): forecast {}", f.field.ident, zulu(f.field.t), f.field.role.word(), why.join(", ")),
            source: sourced(&f.met, rule),
        };
        let vfr_why = if input.vfr { under_vfr(&f.met, None) } else { Vec::new() };
        if !vfr_why.is_empty() {
            out.push(at(Kind::VfrMinimums, vfr_why, VFR_RULE));
        }
        let mine = under_mine(&f.met, &input.minimums);
        if !mine.is_empty() {
            out.push(at(Kind::PilotMinimums, mine, MINE_RULE));
        }
    }
    let (mut was_vfr, mut was_mine, mut was_in): (bool, bool, Vec<usize>) = (false, false, Vec::new());
    for (s, m) in input.track.iter().zip(samples) {
        let at = |kind, words: String, source: String| Alert { t: s.t, lat: s.lat, lon: s.lon, kind, words, source };
        let vfr_why = if input.vfr { under_vfr(&m.met, s.alt_ft) } else { Vec::new() };
        if !vfr_why.is_empty() && !was_vfr {
            out.push(at(
                Kind::VfrMinimums,
                format!("At {} the forecast is under VFR minimums: {}", zulu(s.t), vfr_why.join(", ")),
                sourced(&m.met, VFR_RULE),
            ));
        }
        was_vfr = !vfr_why.is_empty();
        let mine = under_mine(&m.met, &input.minimums);
        if !mine.is_empty() && !was_mine {
            out.push(at(
                Kind::PilotMinimums,
                format!("At {} the forecast is under your minimums: {}", zulu(s.t), mine.join(", ")),
                sourced(&m.met, MINE_RULE),
            ));
        }
        was_mine = !mine.is_empty();
        for &i in m.areas.iter().filter(|i| !was_in.contains(i)) {
            let a = &areas[i];
            out.push(at(a.kind, format!("At {} the airplane enters: {}", zulu(s.t), a.words), a.source.clone()));
        }
        was_in.clone_from(&m.areas);
    }
    out.stable_sort_by(|a, b| a.t.total_cmp(&b.t));
    out
}
