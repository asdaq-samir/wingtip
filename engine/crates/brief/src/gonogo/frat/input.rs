use super::*;

/// The pilot's currency from their logbook: the dates the last days each
/// holds, "yyyy-mm-dd" (None not known).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Currency {
    pub flights: f64,
    pub total_hours: f64,
    pub day_passengers_until: Option<String>,
    pub night_passengers_until: Option<String>,
    pub instrument_current_until: Option<String>,
    /// The first day of an instrument currency not begun yet (approaches
    /// flown this month count from next month, 61.57(c)(1)).
    pub instrument_current_from: Option<String>,
    pub ipc_needed_after: Option<String>,
    pub flight_review_until: Option<String>,
    pub medical_expires_on: Option<String>,
}

/// The airplane's VOR check (91.171) as the input has it: no airplane of
/// the pilot's own (a stock profile, the web's undefined), one with none
/// recorded (null), or the check's last good day and whether its error
/// was within limits.
#[derive(Clone, Debug, Default, PartialEq)]
pub enum VorCheck {
    #[default]
    Absent,
    None,
    Checked {
        good_through: String,
        within_limit: bool,
    },
}

/// The web's FratInput.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Input {
    pub vfr_not_recommended: bool,
    pub under_minimums: Vec<String>,
    pub tfr_on_route: bool,
    /// SIGMETs and G-AIRMETs along the route during the flight.
    pub hazards: i64,
    pub night: bool,
    /// Whether any of the flight is in 61.57(b)'s night-passenger period,
    /// an hour after sunset to an hour before sunrise (flight::sun's
    /// passenger_night_on_the_way); None where the caller did not work it
    /// out, when `night` stands for it.
    pub night_passengers: Option<bool>,
    /// Whether any of the flight is in 14 CFR 91.209(a)'s period for
    /// lighted position lights, sunset to sunrise (flight::sun's
    /// lights_on_the_way); None where the caller did not work it out, when
    /// `night` stands for it.
    pub lights: Option<bool>,
    /// The nav log's fuel margin, gallons; below zero the tanks do not
    /// hold the fuel and its reserve.
    pub fuel_margin_gal: Option<f64>,
    pub ifr: bool,
    pub vor_check: VorCheck,
    pub inspections: Option<Inspections>,
    pub squawks: Option<Vec<Squawk>>,
    pub currency: Option<Currency>,
    /// The day of the flight, "yyyy-mm-dd", to read the dates on.
    pub day: String,
    /// The self checks ticked, by key.
    pub ticked: Vec<String>,
}

/// What the briefing, the nav log and the logbook raise.
pub(super) fn found(f: &Input) -> Vec<Factor> {
    let day = f.day.as_str();
    let mut factors = Vec::new();
    if f.vfr_not_recommended {
        factors.push(factor("vnr", "VFR flight not recommended", "The briefing (AIM 7-1-5)", HIGH_FROM, false));
    }
    if let Some(first) = f.under_minimums.first() {
        factors.push(factor("minimums", "Under your personal minimums", first.clone(), HIGH_FROM, false));
    }
    if f.tfr_on_route {
        factors.push(factor("tfr", "A TFR on the route when you get there", "Route round it, or go another time", HIGH_FROM, false));
    }
    if f.hazards > 0 {
        let s = if f.hazards == 1 { "" } else { "s" };
        factors.push(factor(
            "hazards",
            format!("{} SIGMET or G-AIRMET{s} along the route", f.hazards),
            "Adverse conditions",
            (2 * f.hazards).min(6),
            false,
        ));
    }
    if f.night {
        factors.push(factor("night", "At night", "PAVE: environment", 3, false));
    }
    // Under IFR by VOR, a check within 30 days (91.171): without one, by
    // GPS alone -- a caution, not a stop.
    if f.ifr {
        let good = match &f.vor_check {
            VorCheck::Absent => true,
            VorCheck::None => false,
            VorCheck::Checked { good_through, within_limit } => *within_limit && good_through.as_str() >= day,
        };
        if !good {
            factors.push(factor("vor", "No VOR check in the last 30 days", "91.171: to navigate IFR by VOR", 2, false));
        }
    }
    if let Some(i) = &f.inspections {
        factors.extend(inspection_factors(i, day, f.ifr));
    }
    if let Some(s) = &f.squawks {
        // An open squawk deferred for day flight grounds a flight after
        // sunset, not only at 1.1's night: 91.209(a) wants the position
        // lights lit from sunset, and the deferral's "day" is read as
        // ending there, erring toward the squawk.
        factors.extend(squawk_factors(s, f.night || f.lights.unwrap_or(false), f.ifr));
    }
    if f.fuel_margin_gal.is_some_and(|m| m < 0.0) {
        factors.push(factor("fuel", "The tanks do not hold the fuel and its reserve", if f.ifr { "91.167" } else { "91.151" }, 0, true));
    }
    if let Some(c) = f.currency.as_ref().filter(|c| c.flights > 0.0) {
        let before = |d: &Option<String>| given(d).is_some_and(|d| d < day);
        let lapsed = |d: &Option<String>| given(d).is_none_or(|d| d < day);
        if before(&c.flight_review_until) {
            factors.push(factor("review", "Your flight review has lapsed", "61.56", 0, true));
        }
        if before(&c.medical_expires_on) {
            factors.push(factor("medical", "Your medical has expired", "61.23", 0, true));
        }
        // Under IFR: instrument currency (61.57(c)), or after six months
        // more lapsed only a proficiency check (61.57(d)).
        // Not current yet where the currency begins after the flight's day.
        let not_yet = given(&c.instrument_current_from).is_some_and(|d| d > day);
        if f.ifr && (lapsed(&c.instrument_current_until) || not_yet) {
            let ipc = before(&c.ipc_needed_after);
            factors.push(if ipc {
                factor("instrument", "Instrument currency lapsed: a proficiency check is needed", "61.57(d)", 0, true)
            } else {
                factor("instrument", "Not instrument current", "61.57(c): 6 approaches, holding, tracking", 0, true)
            });
        }
        if lapsed(&c.day_passengers_until) {
            factors.push(factor(
                "recent", "Not three takeoffs and landings in the last 90 days",
                "61.57(a)(1): same category and class; no passengers, and rusty", 3, false,
            ));
        }
        if f.night_passengers.unwrap_or(f.night) && lapsed(&c.night_passengers_until) {
            // 61.57(b) binds from an hour after sunset to an hour before
            // sunrise, its own window (`night_passengers`), not 14 CFR
            // 1.1's night: where civil twilight lasts all night (Alaska in
            // summer) there is no 1.1 night but there is this period.
            // Without the window worked out, 1.1's night stands for it.
            factors.push(factor(
                "recent-night", "Not three night takeoffs and landings to a full stop in the last 90 days",
                "61.57(b): needed from 1 h after sunset to 1 h before sunrise", 3, false,
            ));
        }
        if c.total_hours < 100.0 {
            factors.push(factor("low-time", "Under 100 hours in your logbook", "PAVE: pilot", 2, false));
        }
    }
    factors
}

pub struct Assessment {
    pub score: i64,
    /// "low", "caution" or "high".
    pub level: &'static str,
    /// What raised it, the briefing's and the logbook's first, then the
    /// self checks ticked, in their own order.
    pub factors: Vec<Factor>,
}

/// The whole assessment: the factors found and the ones ticked, their
/// points, and the level they make.
pub fn assess(f: &Input) -> Assessment {
    let mut factors = found(f);
    for c in SELF_CHECKS.iter().filter(|c| f.ticked.iter().any(|t| t == c.key)) {
        factors.push(Factor {
            key: c.key.into(),
            label: c.label.into(),
            why: Some(c.why.into()),
            points: c.points,
            stop: c.stop,
            group: Some(c.group.into()),
        });
    }
    let score = factors.iter().map(|x| x.points).sum();
    let level = if factors.iter().any(|x| x.stop) || score >= HIGH_FROM {
        "high"
    } else if score >= CAUTION_FROM {
        "caution"
    } else {
        "low"
    };
    Assessment { score, level, factors }
}

/// An assessment in a few words: "Raised · 8 points".
pub fn risk_line(level: &str, score: i64) -> String {
    format!("{} · {score} point{}", level_name(level), if score == 1 { "" } else { "s" })
}

/// A factor's mark as the web's RiskAssessment draws it beside what the
/// briefing, the nav log and the logbook raised: a stop where it makes the
/// flight unlawful or is high on its own, else a caution. A self check
/// gets none: the page ticks it, and draws no mark (RiskAssessment.tsx).
pub fn mark(f: &Factor) -> Option<&'static str> {
    if f.group.is_some() {
        None
    } else if f.stop || f.points >= HIGH_FROM {
        Some("stop")
    } else {
        Some("caution")
    }
}

pub fn factor_json(out: &mut String, f: &Factor) {
    out.push_str("{\"key\":");
    json::string(out, &f.key);
    out.push_str(",\"label\":");
    json::string(out, &f.label);
    out.push_str(",\"why\":");
    json::opt_string(out, f.why.as_deref());
    out.push_str(&format!(",\"points\":{},\"stop\":{}", f.points, f.stop));
    if let Some(group) = &f.group {
        out.push_str(",\"group\":");
        json::string(out, group);
    }
    out.push_str(",\"finding\":");
    json::opt_string(out, mark(f));
    out.push('}');
}

pub fn factors_json(factors: &[Factor]) -> String {
    let mut out = String::from("[");
    for (i, f) in factors.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        factor_json(&mut out, f);
    }
    out.push(']');
    out
}

/// The assessment as POST /api/go-no-go's `risk` answers it, JSON: its
/// points, level, line and what to do, and every factor with its mark.
pub fn assessment_json(a: &Assessment) -> String {
    let mut out = format!("{{\"score\":{},\"level\":\"{}\",\"line\":", a.score, a.level);
    json::string(&mut out, &risk_line(a.level, a.score));
    out.push_str(",\"words\":");
    json::opt_string(&mut out, level_words(a.level));
    out.push_str(",\"factors\":");
    out.push_str(&factors_json(&a.factors));
    out.push('}');
    out
}

/// The self checks as the Brief's Risk page lists them, in order, JSON:
/// each its key, group, label, why, points and stop, with no mark.
pub fn self_checks_json() -> String {
    let checks: Vec<Factor> = SELF_CHECKS
        .iter()
        .map(|c| Factor {
            key: c.key.into(),
            label: c.label.into(),
            why: Some(c.why.into()),
            points: c.points,
            stop: c.stop,
            group: Some(c.group.into()),
        })
        .collect();
    factors_json(&checks)
}
