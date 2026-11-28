//! METARs and SPECIs as sent -- the raw text a phone gets from ADS-B's
//! FIS-B with no internet -- decoded into the figures the planner reads
//! from the Aviation Weather Center's decoded feed (wingtip.weather's
//! `_parse_metars`): the wind, visibility, ceiling, weather, temperature
//! and dewpoint, altimeter and flight category. The groups are the
//! Federal Meteorological Handbook No. 1's (FMH-1, ch. 12, coding) and
//! WMO No. 306's for the reports from outside the US. services/planner/tests_wingtip/test_parsers.py
//! holds the decoder to the AWC's own decoding of every report in its
//! current cache and lists where they differ.

use wingtip_core::units::{HPA_PER_INHG, KT_PER_M_S, M_PER_SM};

pub(crate) use crate::visibility::statute_miles;

/// A wind group: "27015G25KT", "VRB03KT", "00000KT", "27015MPS".
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Wind {
    /// None where variable (VRB).
    pub dir_true_deg: Option<f64>,
    pub speed_kt: f64,
    pub gust_kt: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Layer {
    /// FEW, SCT, BKN, OVC, or VV for an obscured sky.
    pub cover: String,
    pub base_ft_agl: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct Metar {
    pub station: String,
    pub speci: bool,
    /// Day of the month, hour and minute, UTC ("021400Z").
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
    pub wind: Option<Wind>,
    /// A variable direction, "250V310": its two bounds, true, clockwise
    /// from the first (variable_direction).
    pub wind_variable_deg: Option<(f64, f64)>,
    pub visibility_sm: Option<f64>,
    /// Visibility at or past the most the report says ("P6SM", CAVOK, 9999).
    pub visibility_plus: bool,
    /// Visibility less than the figure ("M1/4SM": less than 1/4 sm, the
    /// least an automated station reports; FMH-1 chapter 12).
    pub visibility_minus: bool,
    pub layers: Vec<Layer>,
    pub weather: Vec<String>,
    pub temp_c: Option<f64>,
    pub dewpoint_c: Option<f64>,
    pub altimeter_inhg: Option<f64>,
    /// Whether the report gives the sky at all: a layer, clear, or CAVOK.
    pub sky_reported: bool,
}

/// Statute miles in a metre, for visibility given in metres.
const SM_PER_M: f64 = 1.0 / M_PER_SM;

pub(crate) fn wind(group: &str) -> Option<Wind> {
    // A report is ASCII; a group that is not is no group (and is not cut
    // inside a character).
    if !group.is_ascii() {
        return None;
    }
    let (body, factor) = if let Some(b) = group.strip_suffix("KT") {
        (b, 1.0)
    } else {
        let b = group.strip_suffix("MPS")?;
        (b, KT_PER_M_S)
    };
    if body.len() < 5 {
        return None;
    }
    let (dir, rest) = body.split_at(3);
    let dir_true_deg = match dir {
        "VRB" => None,
        d if d.bytes().all(|b| b.is_ascii_digit()) => Some(d.parse::<f64>().ok()?),
        _ => return None,
    };
    let (speed, gust) = match rest.split_once('G') {
        Some((s, g)) => (s, Some(g)),
        None => (rest, None),
    };
    let num = |s: &str| (!s.is_empty() && s.len() <= 3 && s.bytes().all(|b| b.is_ascii_digit())).then(|| s.parse::<f64>().ok()).flatten();
    let speed_kt = (num(speed)? * factor).round();
    // "000" is calm only with no speed; with one it is no direction at all.
    let dir_true_deg = dir_true_deg.filter(|&d| d != 0.0 || speed_kt == 0.0);
    let gust_kt = match gust {
        Some(g) => Some((num(g)? * factor).round()),
        None => None,
    };
    Some(Wind { dir_true_deg, speed_kt, gust_kt })
}

/// A sky group: "BKN012", "OVC250CB", "VV002", "SKC", "CLR", "NSC".
fn layer(group: &str) -> Option<Option<Layer>> {
    if !group.is_ascii() {
        return None;
    }
    if matches!(group, "SKC" | "CLR" | "NSC" | "NCD") {
        return Some(None);
    }
    let (cover, rest) = if let Some(r) = group.strip_prefix("VV") {
        ("VV", r)
    } else if group.len() >= 6 && ["FEW", "SCT", "BKN", "OVC"].contains(&&group[..3]) {
        (&group[..3], &group[3..])
    } else {
        return None;
    };
    let height = rest.get(..3)?;
    let tail = &rest[3..];
    if !(tail.is_empty() || tail == "CB" || tail == "TCU" || tail == "///") {
        return None;
    }
    let base_ft_agl = if height == "///" { None } else { Some(height.parse::<f64>().ok()? * 100.0) };
    Some(Some(Layer { cover: cover.to_string(), base_ft_agl }))
}

const DESCRIPTORS: [&str; 8] = ["MI", "PR", "BC", "DR", "BL", "SH", "TS", "FZ"];
const PHENOMENA: [&str; 22] =
    ["DZ", "RA", "SN", "SG", "IC", "PL", "GR", "GS", "UP", "BR", "FG", "FU", "VA", "DU", "SA", "HZ", "PY", "PO", "SQ", "FC", "SS", "DS"];

/// A present-weather group (FMH-1 ch. 12, present weather): an intensity or VC, then
/// descriptors and phenomena two letters at a time.
pub(crate) fn is_weather(group: &str) -> bool {
    let g = group.strip_prefix(['+', '-']).unwrap_or(group);
    let g = g.strip_prefix("VC").unwrap_or(g);
    if g.is_empty() || !g.len().is_multiple_of(2) || !g.is_ascii() {
        return false;
    }
    let pairs: Vec<&str> = (0..g.len()).step_by(2).map(|i| &g[i..i + 2]).collect();
    let mut seen_phenomenon = false;
    for (i, p) in pairs.iter().enumerate() {
        if PHENOMENA.contains(p) {
            seen_phenomenon = true;
        } else if !(DESCRIPTORS.contains(p) && !seen_phenomenon) {
            return false;
        }
        // "TS" or "SH" alone is weather; any other lone descriptor is not.
        if i == pairs.len() - 1 && !seen_phenomenon && !matches!(*p, "TS" | "SH") {
            return false;
        }
    }
    true
}

fn temperature(t: &str) -> Option<f64> {
    if t.is_empty() {
        return None;
    }
    let (sign, digits) = match t.strip_prefix('M') {
        Some(d) => (-1.0, d),
        None => (1.0, t),
    };
    (digits.len() == 2 && digits.bytes().all(|b| b.is_ascii_digit())).then(|| sign * digits.parse::<f64>().unwrap())
}

/// The remarks' tenths of a degree: "T00561033" is 5.6 over -3.3 (FMH-1
/// ch. 12, the hourly temperature and dewpoint remark), a stray ";" or
/// "$" after it aside.
fn tenths(group: &str) -> Option<(f64, Option<f64>)> {
    let g = group.trim_end_matches([';', '$', '=']).strip_prefix('T')?;
    if !(g.len() == 4 || g.len() == 8) || !g.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let read = |s: &str| {
        let v = s[1..].parse::<f64>().unwrap() / 10.0;
        if &s[..1] == "1" {
            -v
        } else {
            v
        }
    };
    Some((read(&g[..4]), (g.len() == 8).then(|| read(&g[4..]))))
}

/// The bounds of the flight categories with the visibility known (AIM
/// 7-1-7, "Categorical Ceiling and Visibility Conditions", and FAA-H-8083-
/// 28B 3.4.2.14's flight categories; the worse of the two decides): LIFR a ceiling under 500 ft or under a mile;
/// IFR under 1,000 or under 3; MVFR 1,000 to 3,000 ft or 3 to 5 miles
/// inclusive; else VFR. No ceiling (None) is no limit.
fn category_bounds(ceiling_ft: Option<f64>, visibility_sm: f64) -> &'static str {
    let c = ceiling_ft.unwrap_or(f64::INFINITY);
    let v = visibility_sm;
    if c < 500.0 || v < 1.0 {
        "LIFR"
    } else if c < 1000.0 || v < 3.0 {
        "IFR"
    } else if c <= 3000.0 || v <= 5.0 {
        "MVFR"
    } else {
        "VFR"
    }
}

/// The ceiling of a report's sky, ft above the ground, and whether it is
/// not known: the lowest broken, overcast or obscured layer -- FEW and SCT
/// are no ceiling (14 CFR 1.1, "ceiling": "the height above the earth's
/// surface of the lowest layer of clouds or obscuring phenomena that is
/// reported as 'broken', 'overcast', or 'obscuration'") -- each layer
/// (cover, base), lowest first as reports list them (FMH-1 ch. 9). An
/// obscured sky is a ceiling at its vertical visibility: a raw report
/// writes it VV002, the AWC's feed marks the layer OVX with its height as
/// the base in a METAR and gives it only as `vertical_visibility_ft` in a
/// TAF. Counting BKN and OVC alone left fog at the surface, the lowest
/// ceiling there is, as none at all.
///
/// The lowest such layer sent with no height ("BKN///", "OVC///",
/// "VV///": an automated station's sensor could not measure it, FMH-1
/// ch. 9; the AWC's data API sends the layer with no base) leaves the
/// ceiling not known, not absent: (None, true). One with no height above
/// a measured ceiling leaves it known. A vertical visibility given apart
/// is the obscuration from the surface, under every layer, so it settles
/// the ceiling.
pub fn sky_ceiling_of<'a>(
    layers: impl IntoIterator<Item = (&'a str, Option<f64>)>, vertical_visibility_ft: Option<f64>,
) -> (Option<f64>, bool) {
    let mut ceilings = layers.into_iter().filter(|(cover, _)| matches!(*cover, "BKN" | "OVC" | "OVX" | "VV")).peekable();
    if vertical_visibility_ft.is_none() && ceilings.peek().is_some_and(|(_, base)| base.is_none()) {
        return (None, true);
    }
    let lowest =
        ceilings.filter_map(|(_, base)| base).chain(vertical_visibility_ft).fold(None, |m: Option<f64>, b| Some(m.map_or(b, |m| m.min(b))));
    (lowest, false)
}

/// The ceiling (sky_ceiling_of), None where there is none or it is not
/// known.
pub fn ceiling_of<'a>(layers: impl IntoIterator<Item = (&'a str, Option<f64>)>, vertical_visibility_ft: Option<f64>) -> Option<f64> {
    sky_ceiling_of(layers, vertical_visibility_ft).0
}

/// A report's layers' ceiling and whether it is not known (sky_ceiling_of).
pub fn sky_ceiling(layers: &[Layer]) -> (Option<f64>, bool) {
    sky_ceiling_of(layers.iter().map(|l| (l.cover.as_str(), l.base_ft_agl)), None)
}

/// The flight category from a ceiling and a visibility, the one rule for
/// every report, forecast hour and route option (AIM 7-1-7's bounds,
/// category_bounds), where either may not be known:
/// - a ceiling of no height reported ("OVC///", `ceiling_unknown`) could
///   be at any height, so only a visibility under a mile -- LIFR whatever
///   the ceiling -- says it;
/// - with no visibility only a ceiling under 500 ft settles it, LIFR
///   whatever the visibility is; over that the visibility could still make
///   it worse (the METAR reader once took a missing
///   visibility as unlimited and called a 5,000 ft ceiling VFR, while the
///   forecast said none);
/// - `ceiling_ft` None with the ceiling known is no ceiling, no limit.
///
/// None where it is not settled: a category said then would be a guess.
pub fn flight_category_of(ceiling_ft: Option<f64>, ceiling_unknown: bool, visibility_sm: Option<f64>) -> Option<&'static str> {
    match (ceiling_unknown, visibility_sm) {
        (true, v) => v.is_some_and(|v| v < 1.0).then_some("LIFR"),
        (false, None) => ceiling_ft.is_some_and(|c| c < 500.0).then_some("LIFR"),
        (false, Some(v)) => Some(category_bounds(ceiling_ft, v)),
    }
}

/// A visibility in metres (WMO No. 306) in statute miles, as US reports
/// give it: 9999 is "10 km or more", which the AWC writes 6+. Below that,
/// the reportable value at or below it (statute_miles_down), except the
/// metric figures that stand for a US value (METRIC_EQUIVALENTS): a metric
/// report writes 1 sm as 1,600 m and 1/2 as 800, each 0.58% under the US
/// value's metres (1 sm is 1,609.344 m), and read bare 1,600 m was 0.994
/// sm, under 1 and so LIFR, and failed every 1 sm test.
pub fn metres_to_sm(metres: f64) -> f64 {
    if metres >= 9999.0 {
        6.0
    } else {
        metric_sm(metres)
    }
}

/// The metric figures that stand for a US reportable value, metres and
/// statute miles: 100, 200, 400, 800, 1,200, 1,600, 2,400, 3,200, 4,800
/// and 8,000 m are 1/16, 1/8, 1/4, 1/2, 3/4, 1, 1 1/2, 2, 3 and 5 sm, the pairs the metric conversions of
/// US minimums use. Only these are lifted to the US value: any other
/// figure, 4,000 m (2.485 sm) or 4,400 m (2.734 sm), is floored to the
/// value at or below it, never raised to 2 1/2 or 2 3/4, since a
/// visibility rounded up is more than was seen (FMH-1 6.5.2).
const METRIC_EQUIVALENTS: [(f64, f64); 10] = [
    (100.0, 0.0625),
    (200.0, 0.125),
    (400.0, 0.25),
    (800.0, 0.5),
    (1200.0, 0.75),
    (1600.0, 1.0),
    (2400.0, 1.5),
    (3200.0, 2.0),
    (4800.0, 3.0),
    (8000.0, 5.0),
];

/// Metres, any number of them ("18KM"), to the reportable value they stand
/// for (metres_to_sm), with no 10 km cap.
pub fn metric_sm(metres: f64) -> f64 {
    if let Some((_, sm)) = METRIC_EQUIVALENTS.iter().find(|(m, _)| (metres - m).abs() < 0.5) {
        return *sm;
    }
    statute_miles_down(metres * SM_PER_M)
}

/// The Federal Meteorological Handbook No. 1 (FCM-H1-2019), Table 6-1,
/// "Reportable Visibility Values", the manual column, statute miles, to
/// 15; past that every 5 (its note b). The automated column's values are
/// all in it. FAA JO 7900.5E carries the same table.
const REPORTABLE_SM: [f64; 38] = [
    0.0, 0.0625, 0.125, 0.1875, 0.25, 0.3125, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0, 1.125, 1.25, 1.375, 1.5, 1.625, 1.75, 1.875, 2.0, 2.25,
    2.5, 2.75, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 20.0, 25.0,
];

/// A visibility in statute miles to the reportable value at or below it
/// (REPORTABLE_SM): "If the actual visibility falls halfway between two
/// reportable values, the lower value shall be reported" (FMH-1 6.5.2),
/// and a visibility rounded up is more than was seen, so always down.
/// Sixteenths stop at 3/8: 0.7456 is 5/8, not 11/16, which no report
/// writes.
pub fn statute_miles_down(sm: f64) -> f64 {
    // A hair over each value, so a figure already on one (1.5, 0.0625)
    // stays on it and float noise does not drop it a step.
    const NOISE: f64 = 1e-9;
    let sm = sm + NOISE;
    if sm >= 25.0 {
        return (sm / 5.0).floor() * 5.0;
    }
    REPORTABLE_SM.iter().copied().take_while(|v| *v <= sm).last().unwrap_or(0.0)
}

mod parse;
pub use parse::*;

#[cfg(test)]
mod tests;
