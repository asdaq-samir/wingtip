//! What a runway asks of the airplane (apps/web/src/lib/takeoffLanding.ts and
//! lib/runwayFit.ts): the field's pressure and density altitude, the POH's
//! short-field distances over a 50 ft obstacle, and how one runway end
//! suits the airplane today -- the crosswind on it against the most the
//! POH demonstrates, and the distance needed against the runway's length,
//! what 14 CFR 91.103(b) asks a pilot to know. The Brief's runway check
//! (crate::gonogo::runways) and FPL's runway chips go by the same sums.

use super::pick::{available_ft, End, Runway};
use super::wind::{crosswind_kt, headwind_kt, js_round, steady_or_gust_kt};
use crate::flight;
use crate::gonogo::calls::{runway, table, In};
use crate::json::{self, Value};

/// The field's pressure altitude from its elevation and the altimeter
/// setting reported: a thousand feet for every inch under 29.92
/// (FAA-H-8083-25C, chapter 11); the elevation itself without one (none,
/// or 0, as JavaScript's falsy 0).
pub fn pressure_altitude_ft(elevation_ft: f64, altimeter_in_hg: Option<f64>) -> f64 {
    match altimeter_in_hg {
        Some(a) if a != 0.0 && !a.is_nan() => elevation_ft + (flight::STANDARD_INHG - a) * 1000.0,
        _ => elevation_ft + 0.0,
    }
}

/// Density altitude: the height in the standard atmosphere whose air is
/// as thin as the field's, from its pressure altitude and temperature --
/// worked out from the atmosphere itself rather than the 120 ft a degree
/// rule of thumb. What an airplane performs as if it were at
/// (FAA-H-8083-25C, chapter 11). The engine's standard atmosphere
/// (flight), the one the nav log's cruise and climb are flown in.
pub fn density_altitude_ft(pressure_alt_ft: f64, temp_c: f64) -> f64 {
    flight::density_altitude_ft(flight::density_ratio(pressure_alt_ft, temp_c))
}

/// A POH's short-field table (the profile's ShortField): its pressure
/// altitudes and temperatures, its weights heaviest first, for each weight
/// the ground roll's and the total over a 50 ft obstacle's grids (rows the
/// altitudes, columns the temperatures), and the ground roll's share more
/// on dry grass, per cent.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ShortField {
    pub pressure_altitudes_ft: Vec<f64>,
    pub temperatures_c: Vec<f64>,
    pub weights_lb: Vec<f64>,
    pub ground_roll_ft: Vec<Vec<Vec<f64>>>,
    pub total_50ft_ft: Vec<Vec<Vec<f64>>>,
    pub grass_ground_roll_pct: f64,
    pub headwind_kt_per_10pct: Option<f64>,
    pub tailwind_kt_per_10pct: Option<f64>,
    pub tailwind_max_kt: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Distances {
    pub ground_roll_ft: f64,
    pub total_ft: f64,
    /// What could not be had from the table: beyond its altitudes or
    /// temperatures (where its edge is taken), heavier than its heaviest
    /// weight (where that weight's is taken), a tailwind past the POH's figures, or no wind correction in the airplane's profile.
    pub caveats: Vec<&'static str>,
}

impl Distances {
    /// Read past the POH's table, so the figures are its edge's rather
    /// than the airplane's: every caveat is one. The distance is then not
    /// one a runway can be judged against with the confidence 14 CFR
    /// 91.103(b) asks for, so the check says so rather than "within".
    pub fn beyond(&self) -> bool {
        !self.caveats.is_empty()
    }
}

struct At {
    i: usize,
    f: f64,
    beyond: bool,
}

/// A value between table points, its edge where it is beyond them.
fn at(points: &[f64], value: f64) -> At {
    let n = points.len();
    if value <= points[0] {
        return At { i: 0, f: 0.0, beyond: value < points[0] };
    }
    if value >= points[n - 1] {
        return At { i: n - 2, f: 1.0, beyond: value > points[n - 1] };
    }
    let mut i = 0;
    while points[i + 1] < value {
        i += 1;
    }
    At { i, f: (value - points[i]) / (points[i + 1] - points[i]), beyond: false }
}

fn bilinear(grid: &[Vec<f64>], row: &At, col: &At) -> f64 {
    let g = |r: usize, c: usize| grid[r][c];
    let top = g(row.i, col.i) + (g(row.i, col.i + 1) - g(row.i, col.i)) * col.f;
    let bottom = g(row.i + 1, col.i) + (g(row.i + 1, col.i + 1) - g(row.i + 1, col.i)) * col.f;
    top + (bottom - top) * row.f
}

/// A POH's short-field distances at a pressure altitude, temperature and
/// weight: read between the table's altitudes and temperatures, and
/// between its weights (a weight under the lightest table taken at that
/// table, which is the longer); then its notes -- a tenth less for every
/// 9 kt of headwind, a tenth more for every 2 kt of tailwind up to 10 --
/// and on dry grass the ground roll's share more.
pub fn short_field(table: &ShortField, pressure_alt_ft: f64, temp_c: f64, weight_lb: f64, headwind_kt: f64, grass: bool) -> Distances {
    let mut caveats = Vec::new();
    let row = at(&table.pressure_altitudes_ft, pressure_alt_ft);
    let col = at(&table.temperatures_c, temp_c);
    if row.beyond {
        caveats.push("the field is higher than the table goes");
    }
    if col.beyond {
        caveats.push("the temperature is beyond the table's");
    }
    // Weights heaviest first; read between the two either side. An
    // airplane heavier than the heaviest table is read at that table,
    // which is shorter than it will need: the POH gives no figures past
    // its maximum weight (FAA-H-8083-25C, chapter 11, performance charts
    // are valid only within their stated conditions), so it is a caveat.
    let weights = &table.weights_lb;
    if weights.iter().copied().fold(f64::NEG_INFINITY, f64::max) < weight_lb {
        caveats.push("the airplane is heavier than the table's heaviest weight");
    }
    let read = |grids: &[Vec<Vec<f64>>]| -> f64 {
        let values: Vec<f64> = grids.iter().map(|g| bilinear(g, &row, &col)).collect();
        if weights.len() == 1 || weight_lb >= weights[0] {
            return values[0];
        }
        for k in 0..weights.len() - 1 {
            if weight_lb >= weights[k + 1] {
                let f = (weights[k] - weight_lb) / (weights[k] - weights[k + 1]);
                return values[k] + (values[k + 1] - values[k]) * f;
            }
        }
        values[values.len() - 1]
    };
    let mut roll = read(&table.ground_roll_ft);
    let mut total = read(&table.total_50ft_ft);
    // The POH's own notes to its charts for the wind -- the Cessna 172S's
    // (figures 5-5 and 5-11): "Decrease distances 10% for each 9 knots
    // headwind. For operation with tail winds up to 10 knots, increase
    // distances by 10% for each 2 knots." -- as the profile's table
    // carries them. A table without them has no correction: no credit for
    // a headwind, and a tailwind said, never another airplane's notes.
    let factor = if headwind_kt >= 0.0 {
        match table.headwind_kt_per_10pct.filter(|k| *k > 0.0) {
            Some(per) => 1.0 - 0.1 * (headwind_kt / per),
            None => 1.0,
        }
    } else {
        match table.tailwind_kt_per_10pct.filter(|k| *k > 0.0) {
            Some(per) => 1.0 + 0.1 * (-headwind_kt / per),
            None => {
                caveats.push("the wind correction is not in this airplane's profile");
                1.0
            }
        }
    };
    if table.tailwind_max_kt.is_some_and(|max| -headwind_kt > max) {
        caveats.push("the POH gives no figures for a tailwind this strong");
    }
    roll *= factor;
    total *= factor;
    if grass {
        let added = (table.grass_ground_roll_pct / 100.0) * roll;
        roll += added;
        total += added;
    }
    // Up to the next 5 ft, never down: a distance a runway is checked
    // against reads long rather than short.
    Distances { ground_roll_ft: (roll / 5.0).ceil() * 5.0, total_ft: (total / 5.0).ceil() * 5.0, caveats }
}

pub(crate) fn has(text: &str, words: &[&str]) -> bool {
    let text = text.to_lowercase();
    words.iter().any(|w| text.contains(w))
}

/// The words of a soft surface: turf, grass, dirt or gravel, as
/// OurAirports writes them and as NASR APT_RWY's SURFACE_TYPE_CODE codes
/// them (TURF, DIRT, GRVL; a combined "ASPH-TURF" is soft in part).
pub(crate) const SOFT: [&str; 6] = ["turf", "grass", "grs", "dirt", "gravel", "grvl"];

/// A runway with a soft surface (SOFT), for the POH's correction to the
/// ground roll on dry grass.
pub fn soft_surface(runway: Option<&Runway>) -> bool {
    runway.and_then(|r| r.surface.as_deref()).is_some_and(|s| has(s, &SOFT))
}

/// The air a field's distances are worked out in: its pressure altitude
/// from the altimeter reported (a standard 29.92 without one) and the
/// temperature reported, else a standard day's at its elevation.
/// (pressure altitude, temperature).
pub fn field_air(elevation_ft: f64, altimeter_in_hg: Option<f64>, temp_c: Option<f64>) -> (f64, f64) {
    (pressure_altitude_ft(elevation_ft, altimeter_in_hg), temp_c.unwrap_or_else(|| flight::isa_temp_c(elevation_ft)))
}

/// One runway end's short-field distance over a 50 ft obstacle, at the
/// weight (the table's heaviest, the longest distance, where none is
/// known), with the headwind on that end (a tailwind negative) and the
/// correction for a soft surface; and whether it is longer than the
/// runway -- false where the runway or its length is not known, which the
/// caller must tell from a fit (its length_ft is None) and never read as
/// "within" (14 CFR 91.103(b): the runway lengths are among what a pilot
/// must know).
pub fn end_distance(
    table: &ShortField, runway: Option<&Runway>, available_ft: Option<f64>, air: (f64, f64), weight_lb: Option<f64>, headwind_kt: f64,
) -> (Distances, bool) {
    let heaviest = table.weights_lb.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let d = short_field(table, air.0, air.1, weight_lb.unwrap_or(heaviest), headwind_kt, soft_surface(runway));
    // Against the runway available (pick::available_ft), a landing's past
    // any displaced threshold, not the whole length.
    let over = available_ft.is_some_and(|length| d.total_ft > length);
    (d, over)
}

/// "Close": a runway with less than 15 per cent to spare over the
/// distance needed. For a landing it is the FAA's margin: "an additional
/// safety margin of at least 15 percent should be added to actual landing
/// distance" (SAFO 19001, Landing Performance Assessments at Time of
/// Arrival, 2019, for part 91 airplane operators among others; it replaced
/// SAFO 06012). For a takeoff the FAA gives no such figure, so the same 15
/// per cent is a design margin there, held to the landing's.
pub const DISTANCE_MARGIN: f64 = 1.15;

/// A wind as a METAR reports it: true, in knots, each None where it is not
/// reported.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct FitWind {
    pub dir_true_deg: Option<f64>,
    pub speed_kt: Option<f64>,
    pub gust_kt: Option<f64>,
}

/// How one runway end suits the airplane (lib/runwayFit endFit).
#[derive(Clone, Debug, PartialEq)]
pub struct EndFit {
    /// The crosswind on the end, its gusts' where they are more, knots.
    pub crosswind_kt: f64,
    /// Past the most the POH demonstrates (not a limitation, but beyond
    /// what was flown).
    pub crosswind_over: bool,
    /// The distance over a 50 ft obstacle, and the runway's length.
    pub needed_ft: Option<f64>,
    pub length_ft: Option<f64>,
    /// Longer than the runway; or within its margin (DISTANCE_MARGIN).
    pub short: bool,
    pub close: bool,
    /// The distance or the runway's length is not known, so whether it
    /// fits is not either: never taken as fitting (14 CFR 91.103(b) asks
    /// for both).
    pub unknown: bool,
    /// The distance was read past the POH's table (Distances::beyond).
    pub beyond: bool,
}

/// JavaScript's truth of a number: there, and not 0 or NaN.
fn said(kt: Option<f64>) -> Option<f64> {
    kt.filter(|k| *k != 0.0 && !k.is_nan())
}

/// The air an end is flown in: the field's elevation, and the altimeter
/// setting and temperature reported, each None where not.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct FieldReport {
    /// None where the field's elevation is not known: its distances are
    /// then not worked out (no sea-level guess, which reads short at a
    /// high field).
    pub elevation_ft: Option<f64>,
    pub altimeter_in_hg: Option<f64>,
    pub temp_c: Option<f64>,
}

/// How one runway end (its true heading, None for a helipad's) suits the
/// airplane today for a takeoff or a landing: the POH's short-field
/// `table` for it (None where the profile has none) and its demonstrated
/// crosswind, the weight (None, the table's heaviest), the field's air and
/// the reported wind. `landing_end` is the end landed on, whose displaced
/// threshold or declared LDA shortens the runway (pick::available_ft);
/// None for a takeoff, which has the whole length.
#[allow(clippy::too_many_arguments)]
pub fn end_fit(
    table: Option<&ShortField>, demonstrated_kt: Option<f64>, runway: &Runway, heading_true_deg: Option<f64>, wind: Option<&FitWind>,
    field: &FieldReport, weight_lb: Option<f64>, landing_end: Option<&End>,
) -> EndFit {
    // Along and across the end (wingtip.runway_wind.components_kt): none with
    // no wind. A variable one (VRB, reported with no direction, AIM 7-1-28)
    // may blow straight across, so all of it, gusts included, is
    // crosswind, as the minimums' best crosswind takes it: a VRB15G25
    // showed 0 kt across and never passed the demonstrated crosswind (the
    // aviation check, 2026-10-27). It gives no headwind.
    let dir = heading_true_deg.and(wind.and_then(|w| w.dir_true_deg));
    let across = |kt: Option<f64>| match (said(kt), heading_true_deg, dir) {
        (Some(kt), Some(h), Some(d)) => crosswind_kt(d, kt, h),
        (Some(kt), Some(_), None) => kt.abs(),
        _ => 0.0,
    };
    let headwind = match (dir, said(wind.and_then(|w| w.speed_kt)), heading_true_deg) {
        (Some(d), Some(speed), Some(h)) => headwind_kt(d, speed, h),
        _ => 0.0,
    };
    // Judged unrounded against the demonstrated crosswind, rounded for the
    // page only (wind::crosswind_shown; the aviation audit's AV-10).
    let judged = steady_or_gust_kt(across(wind.and_then(|w| w.speed_kt)), Some(across(wind.and_then(|w| w.gust_kt))));
    let crosswind = super::wind::crosswind_shown(judged, js_round(judged), demonstrated_kt);
    let length_ft = available_ft(runway, landing_end);
    // No elevation, no distance: a field taken as at sea level needs less
    // runway than it will, the higher it is (FAA-H-8083-25C, chapter 11).
    let distances = table.zip(field.elevation_ft).map(|(t, elevation_ft)| {
        let air = field_air(elevation_ft, field.altimeter_in_hg, field.temp_c);
        end_distance(t, Some(runway), length_ft, air, weight_lb, js_round(headwind)).0
    });
    let needed_ft = distances.as_ref().map(|d| js_round(d.total_ft));
    let short = matches!((needed_ft, length_ft), (Some(n), Some(l)) if n > l);
    let close = !short && matches!((needed_ft, length_ft), (Some(n), Some(l)) if n * DISTANCE_MARGIN > l);
    EndFit {
        crosswind_kt: crosswind,
        crosswind_over: demonstrated_kt.is_some_and(|d| judged > d),
        needed_ft,
        length_ft,
        short,
        close,
        unknown: needed_ft.is_none() || length_ft.is_none(),
        beyond: distances.as_ref().is_some_and(Distances::beyond),
    }
}

/// `{"aircraft"?: {"takeoff"?, "landing"?, "crosswind"?: {"demonstrated_kt"?}},
/// "runway", "end": {"heading_true_deg"?}, "wind"?: {"dir_true_deg"?,
/// "speed_kt"?, "gust_kt"?}, "elevation_ft"? (null: not known, no distance), "altimeter_in_hg"?, "temp_c"?,
/// "weight_lb"?, "kind": "takeoff"|"landing"}`. A landing's end is the
/// "end" given, its `displaced_threshold_ft` and `lda_ft` its own or, where
/// it names its `ident`, the runway's end of that ident's.
pub(crate) fn end_fit_rule(i: In, v: &Value) -> Result<String, String> {
    let aircraft = i.obj(v, "aircraft")?;
    let takeoff = i.str(v, "kind")? == "takeoff";
    let t = match aircraft.map(|a| i.obj(a, if takeoff { "takeoff" } else { "landing" })).transpose()?.flatten() {
        Some(t) => Some(table(i, t)?),
        None => None,
    };
    let demonstrated = match aircraft.map(|a| i.obj(a, "crosswind")).transpose()?.flatten() {
        Some(c) => i.opt_num(c, "demonstrated_kt")?,
        None => None,
    };
    let r = runway(i, i.obj(v, "runway")?.map_or_else(|| i.err("runway", "is missing"), Ok)?)?;
    let end = i.obj(v, "end")?;
    let heading = match end {
        Some(e) => i.opt_num(e, "heading_true_deg")?,
        None => None,
    };
    let landing_end = match end.filter(|_| !takeoff) {
        None => None,
        Some(e) => {
            let named = i.opt_str(e, "ident")?.and_then(|id| r.ends.iter().find(|x| x.ident == id).cloned()).unwrap_or_default();
            Some(End {
                displaced_threshold_ft: i.opt_num(e, "displaced_threshold_ft")?.or(named.displaced_threshold_ft),
                lda_ft: i.opt_num(e, "lda_ft")?.or(named.lda_ft),
                ..named
            })
        }
    };
    let wind = match i.obj(v, "wind")? {
        Some(w) => Some(FitWind {
            dir_true_deg: i.opt_num(w, "dir_true_deg")?,
            speed_kt: i.opt_num(w, "speed_kt")?,
            gust_kt: i.opt_num(w, "gust_kt")?,
        }),
        None => None,
    };
    let field = FieldReport {
        elevation_ft: i.opt_num(v, "elevation_ft")?,
        altimeter_in_hg: i.opt_num(v, "altimeter_in_hg")?,
        temp_c: i.opt_num(v, "temp_c")?,
    };
    let f = end_fit(t.as_ref(), demonstrated, &r, heading, wind.as_ref(), &field, i.opt_num(v, "weight_lb")?, landing_end.as_ref());
    let mut out = String::from("{\"crosswind_kt\":");
    json::number(&mut out, f.crosswind_kt);
    out.push_str(&format!(",\"crosswind_over\":{},\"needed_ft\":", f.crosswind_over));
    json::opt_number(&mut out, f.needed_ft);
    out.push_str(",\"length_ft\":");
    json::opt_number(&mut out, f.length_ft);
    out.push_str(&format!(",\"short\":{},\"close\":{},\"unknown\":{},\"beyond\":{}}}", f.short, f.close, f.unknown, f.beyond));
    Ok(out)
}
