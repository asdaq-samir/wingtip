//! "When should I go?": the Go / No-Go asked again for each departure hour
//! the forecasts reach, and the hours it finds nothing against joined into
//! windows, the best first. Nothing here is a new rule about the weather,
//! the airspace or the airplane: each hour's findings are the Brief's own
//! (verdict::verdict_items, the IFR alternate's say in them, the risk
//! assessment), fed by the planner from the forecast for that hour, so an
//! hour this calls a go is one the Brief would call a go if the pilot
//! picked it as the departure time. What this adds is the hour's night,
//! worked out here from the sun (flight::sun: 14 CFR 1.1's night and
//! 61.57(b)'s night-passenger period, which the risk assessment reads), and
//! how the hours are summed up and the windows ranked.
//!
//! The decision stays the pilot in command's (14 CFR 91.3): an hour's
//! "go" is "nothing found against it", as the Brief's own line says it.

use super::frat;
use super::verdict::{self, Item};
use wingtip_core::sort::StableSort;
use wingtip_flight::sun;
use wingtip_flight::vfr;

/// The findings that need an airplane's figures, left out of an hour's
/// verdict when none is picked: the fuel, the runways' distances and
/// crosswind and the weight and balance (the web's AIRPLANE_ITEMS,
/// useFlightBriefing; the owner, 2026-11-08: "don't assume").
pub const AIRPLANE_ITEMS: [&str; 3] = ["fuel", "runways", "balance"];

/// How much better than the minimums an hour's weather is counted, at
/// most, when windows are ranked: past three times the ceiling and
/// visibility asked for, more sky is no better a reason to pick an hour.
/// The planner's own figure, for ranking only; no hour is judged by it.
pub const MARGIN_CAP: f64 = 3.0;

/// The findings that change by the hour (the weather and the TFRs and
/// special-use areas): one of them not known leaves the hour not known.
/// The rest -- the fuel's usable gallons, a runway with no length -- read
/// the same at any hour, and the Brief's own verdict says them.
const HOURLY_ITEMS: [&str; 2] = ["weather", "airspace"];

/// One departure hour as the planner gathered it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Hour {
    /// When the flight would leave, UNIX seconds.
    pub depart_s: f64,
    /// Whether the forecasts reach the whole flight: a TAF along the route
    /// says something about it from departure to arrival.
    pub reaches: bool,
    /// The nav log's time and fuel for this departure, None with no
    /// airplane picked (or no plan).
    pub ete_min: Option<f64>,
    pub fuel_gal: Option<f64>,
    /// Minutes on the ground at the stops, counted in the night's span.
    pub ground_min: f64,
    /// The worst ceiling and visibility the forecast gives along the route
    /// for this flight (the briefing's), for the margin.
    pub ceiling_ft: Option<f64>,
    pub visibility_sm: Option<f64>,
    /// The Go / No-Go's input for this hour, its risk left to this rule.
    pub verdict: verdict::Input,
    /// Under IFR, the alternate's check for this hour's ETA.
    pub alternate: Option<verdict::Alternates>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Input {
    /// The departure and the destination, (lat, lon): the night is judged
    /// along the straight line between them (sun::night_on_the_way).
    pub start: (f64, f64),
    pub end: (f64, f64),
    pub airplane: bool,
    /// The pilot's own ceiling (ft) and visibility (sm) minimums, each
    /// None until set; the margin is counted against 91.155's basic VFR
    /// minimums where one is not.
    pub ceiling_ft: Option<f64>,
    pub visibility_sm: Option<f64>,
    /// The risk assessment's input as the Go / No-Go sends it -- the
    /// pilot's currency, ticks, day and airplane's records -- whose
    /// briefing and nav log members are each hour's own; None where the
    /// assessment is not made (no briefing), as the Go / No-Go leaves it.
    pub risk: Option<frat::Input>,
    pub hours: Vec<Hour>,
}

/// An hour's say: "go", "caution", "no-go" or "unknown".
#[derive(Clone, Debug, PartialEq)]
pub struct Judged {
    pub depart_s: f64,
    pub verdict: &'static str,
    /// The one or two findings that decide it (for a go, the weather's).
    pub reasons: Vec<Item>,
    pub ete_min: Option<f64>,
    pub fuel_gal: Option<f64>,
    /// Any of the flight at night (14 CFR 1.1) or in 61.57(b)'s period.
    pub night: bool,
    pub night_passengers: bool,
    pub margin: Option<f64>,
}

/// A run of go hours, its first and last departure hour.
#[derive(Clone, Debug, PartialEq)]
pub struct Window {
    pub from_s: f64,
    /// The last departure hour in it (not its end).
    pub last_s: f64,
    pub hours: usize,
    /// The least margin of its hours, None where none is known.
    pub margin: Option<f64>,
    /// Its shortest ETE, and the hour that has it.
    pub ete_min: Option<f64>,
    pub quickest_s: f64,
}

pub struct Answer {
    pub hours: Vec<Judged>,
    /// Best first.
    pub windows: Vec<Window>,
}

/// How far the forecast's worst along the route is over the minimums, as
/// the lesser of the ceiling's and the visibility's ratios to them, held
/// to MARGIN_CAP. No ceiling forecast is sky clear or scattered: no
/// ceiling to count (14 CFR 1.1, "ceiling"), so the visibility's ratio
/// alone. None where the forecast gives neither.
pub fn margin(
    ceiling_ft: Option<f64>, visibility_sm: Option<f64>, own_ceiling_ft: Option<f64>, own_visibility_sm: Option<f64>,
) -> Option<f64> {
    if ceiling_ft.is_none() && visibility_sm.is_none() {
        return None;
    }
    // 91.155(c), (d): the basic VFR minimums in a surface area, the floor
    // every route is held to (flight::vfr), where the pilot set none or set
    // lower: a pilot's own minimums can only raise the bar, never take the
    // margin under the rule's.
    let c_min = own_ceiling_ft.filter(|c| *c > 0.0).map_or(vfr::SURFACE_AREA_CEILING_FT, |c| c.max(vfr::SURFACE_AREA_CEILING_FT));
    let v_min = own_visibility_sm.filter(|v| *v > 0.0).map_or(vfr::SURFACE_AREA_VISIBILITY_SM, |v| v.max(vfr::SURFACE_AREA_VISIBILITY_SM));
    let c = ceiling_ft.map_or(MARGIN_CAP, |c| c / c_min);
    let v = visibility_sm.map_or(MARGIN_CAP, |v| v / v_min);
    Some(c.min(v).min(MARGIN_CAP))
}

/// One hour: its night, its risk, the Go / No-Go's findings and what they
/// come to.
pub fn judge(input: &Input, hour: &Hour) -> Judged {
    // With no airplane the flight's length is not known, and is not
    // guessed: the night is judged at the departure alone.
    let minutes = if input.airplane { hour.ete_min.map_or(0.0, |e| e + hour.ground_min) } else { 0.0 };
    let night = sun::night_on_the_way(input.start, input.end, hour.depart_s, minutes);
    let night_passengers = sun::passenger_night_on_the_way(input.start, input.end, hour.depart_s, minutes);
    let mut v = hour.verdict.clone();
    // The risk assessment as the Go / No-Go makes it (app.routers.gonogo),
    // its briefing and nav log members this hour's.
    v.risk = input.risk.as_ref().map(|shared| {
        let w = &v.weather;
        let f = frat::Input {
            vfr_not_recommended: !w.vfr_not_recommended.is_empty(),
            under_minimums: w.under_minimums.clone(),
            tfr_on_route: !v.airspace.in_force.is_empty(),
            hazards: w.hazards.len() as i64,
            night,
            night_passengers: Some(night_passengers),
            fuel_margin_gal: if input.airplane { v.fuel.margin_gal } else { None },
            ..shared.clone()
        };
        let a = frat::assess(&f);
        (a.level.to_owned(), frat::risk_line(a.level, a.score))
    });
    let found = verdict::alternate_finding(hour.alternate.as_ref());
    let items: Vec<Item> = verdict::with_alternate(verdict::verdict_items(&v), found.as_ref().map(|(f, d)| (*f, d.as_str())))
        .into_iter()
        .filter(|i| input.airplane || !AIRPLANE_ITEMS.contains(&i.key.as_str()))
        .collect();
    let has = |f: &str| items.iter().any(|i| i.finding == f);
    let hourly_unknown = items.iter().any(|i| HOURLY_ITEMS.contains(&i.key.as_str()) && (i.finding == "unknown" || i.finding == "pending"));
    let (say, deciding): (&'static str, Vec<Item>) = if !hour.reaches {
        let why = Item {
            key: "weather".into(),
            label: "Weather".into(),
            tab: "enroute".into(),
            section: Some("Adverse Conditions".into()),
            finding: "unknown".into(),
            detail: "The forecasts do not reach this flight".into(),
        };
        ("unknown", vec![why])
    } else if has("stop") {
        ("no-go", items.iter().filter(|i| i.finding == "stop").take(2).cloned().collect())
    } else if hourly_unknown {
        let not_known =
            items.iter().filter(|i| HOURLY_ITEMS.contains(&i.key.as_str()) && (i.finding == "unknown" || i.finding == "pending"));
        ("unknown", not_known.take(2).cloned().collect())
    } else if has("caution") {
        ("caution", items.iter().filter(|i| i.finding == "caution").take(2).cloned().collect())
    } else {
        ("go", items.iter().filter(|i| i.key == "weather").take(1).cloned().collect())
    };
    Judged {
        depart_s: hour.depart_s,
        verdict: say,
        reasons: deciding,
        ete_min: if input.airplane { hour.ete_min } else { None },
        fuel_gal: if input.airplane { hour.fuel_gal } else { None },
        night,
        night_passengers,
        margin: margin(hour.ceiling_ft, hour.visibility_sm, input.ceiling_ft, input.visibility_sm),
    }
}

/// The runs of go hours, each hour an hour after the last, ranked: the
/// most margin over the minimums first (to a tenth), then the shortest
/// ETE, then the longest run, then the earliest.
pub fn windows(hours: &[Judged]) -> Vec<Window> {
    let mut out: Vec<Window> = Vec::new();
    let mut last: Option<f64> = None;
    for h in hours.iter().filter(|h| h.verdict == "go") {
        let joined = last.is_some_and(|l| (h.depart_s - l - 3600.0).abs() < 1.0);
        match out.last_mut() {
            Some(w) if joined => {
                w.last_s = h.depart_s;
                w.hours += 1;
                w.margin = match (w.margin, h.margin) {
                    (Some(a), Some(b)) => Some(a.min(b)),
                    (a, b) => a.or(b),
                };
                if h.ete_min.is_some_and(|e| w.ete_min.is_none_or(|q| e < q)) {
                    w.ete_min = h.ete_min;
                    w.quickest_s = h.depart_s;
                }
            }
            _ => out.push(Window {
                from_s: h.depart_s,
                last_s: h.depart_s,
                hours: 1,
                margin: h.margin,
                ete_min: h.ete_min,
                quickest_s: h.depart_s,
            }),
        }
        last = Some(h.depart_s);
    }
    let tenth = |m: Option<f64>| m.map_or(-1, |m| (m * 10.0).round() as i64);
    out.stable_sort_by(|a, b| {
        tenth(b.margin)
            .cmp(&tenth(a.margin))
            .then(a.ete_min.unwrap_or(f64::INFINITY).total_cmp(&b.ete_min.unwrap_or(f64::INFINITY)))
            .then(b.hours.cmp(&a.hours))
            .then(a.from_s.total_cmp(&b.from_s))
    });
    out
}

pub fn departure_window(input: &Input) -> Answer {
    let hours: Vec<Judged> = input.hours.iter().map(|h| judge(input, h)).collect();
    let windows = windows(&hours);
    Answer { hours, windows }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pilots_own_minimums_raise_the_margins_bar_never_lower_it() {
        // 14 CFR 91.155(c), (d): 1,000 ft and 3 sm. A 2,000 ft ceiling and
        // 6 sm against them is twice; against the pilot's 3,000 and 5,
        // 0.67; against minimums set lower than the rule's, still twice.
        assert_eq!(margin(Some(2000.0), Some(6.0), None, None), Some(2.0));
        assert!((margin(Some(2000.0), Some(6.0), Some(3000.0), Some(5.0)).unwrap() - 2.0 / 3.0).abs() < 1e-9);
        assert_eq!(margin(Some(2000.0), Some(6.0), Some(500.0), Some(1.0)), Some(2.0));
    }
}
