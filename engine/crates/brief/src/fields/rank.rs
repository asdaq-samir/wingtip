//! The ranking itself: each field's course, heading and reach, its best
//! runway end, and the order.

use std::cmp::Ordering;
use wingtip_core::sort::StableSort;

use super::{reasons, Airplane, Answer, EndPick, Field, Mode, Own, Ranked, Reach, Ring};
use crate::figures::debrief::AIRBORNE_KT;
use crate::figures::glide::{ground_nm, Glide, AIRBORNE_AGL_FT, ARRIVE_AGL_FT};
use crate::flight;
use crate::geo::{angle_between, bearing_deg, destination, distance_nm};
use crate::runway::performance::end_fit;
use crate::runway::wind::headwind_kt;

/// The ring's directions, every this many degrees.
const RING_STEP_DEG: usize = 10;

/// The fields ranked from `own`, the best first, at most `limit`.
pub fn best_fields(mode: Mode, own: &Own, airplane: Option<&Airplane>, fields: Vec<Field>, limit: usize) -> Answer {
    // A closed field is no landing site, a glide's or a diversion's
    // (wingtip_flight::field, NASR ARPT_STATUS; decision 0043).
    let fields: Vec<Field> = fields.into_iter().filter(|f| wingtip_flight::field::is_open(f.status.as_deref())).collect();
    let glide = if mode == Mode::Glide { airplane.and_then(|a| a.glide) } else { None };
    // The ground under the airplane as the map's ring takes it: the
    // nearest field's elevation, as near as the page knows the ground.
    let ground_ft = fields
        .iter()
        .filter(|f| f.elevation_ft.is_some())
        .min_by(|a, b| distance_nm(own.lat, own.lon, a.lat, a.lon).total_cmp(&distance_nm(own.lat, own.lon, b.lat, b.lon)))
        .and_then(|f| f.elevation_ft);
    let airborne = own.speed_kt.is_none_or(|kt| kt >= AIRBORNE_KT);
    // A glide with no best-glide speed is worked only in still air: a
    // headwind's loss needs the glide's airspeed, and the still-air reach
    // into one would be too far. With a wind aloft it is then no glide, and
    // the fields are ranked nearest first (needs_airplane), never guessed.
    let calm = own.wind.is_none_or(|w| w.kt <= 0.0);
    let glide = glide.filter(|g| g.best_glide_kias.is_some() || calm);
    let ring = match (glide, own.altitude_ft, ground_ft) {
        (Some(g), Some(alt), Some(ground)) if airborne && alt - ground >= AIRBORNE_AGL_FT => Some(ring_of(own, &g, alt, alt - ground)),
        _ => None,
    };
    let tas = match mode {
        Mode::Glide => glide.zip(own.altitude_ft).and_then(|(g, alt)| g.tas_kt(alt)),
        Mode::Diversion => airplane.and_then(|a| a.cruise_tas_kt),
    };
    let mut ranked: Vec<Ranked> =
        fields.into_iter().map(|field| one(mode, own, airplane, glide.filter(|_| ring.is_some()), tas, field)).collect();
    ranked.stable_sort_by(|a, b| order(mode, glide.is_some(), a, b));
    ranked.truncate(limit);
    Answer { mode, ring, needs_airplane: mode == Mode::Glide && glide.is_none(), fields: ranked }
}

/// The glide's reach all round, wind corrected.
fn ring_of(own: &Own, g: &Glide, altitude_ft: f64, agl_ft: f64) -> Ring {
    let still = agl_ft / 1000.0 * g.nm_per_1000_ft();
    let tas = g.tas_kt(altitude_ft);
    let points = (0..360)
        .step_by(RING_STEP_DEG)
        .map(|deg| {
            let nm = match (own.wind, tas) {
                (Some(w), Some(tas)) => ground_nm(still, tas, deg as f64, w.from_deg, w.kt),
                _ => still,
            };
            destination(own.lat, own.lon, deg as f64, nm)
        })
        .collect();
    Ring { nm_per_1000_ft: g.nm_per_1000_ft(), agl_ft, still_air_nm: still, tas_kt: tas, points }
}

fn one(mode: Mode, own: &Own, airplane: Option<&Airplane>, glide: Option<Glide>, tas: Option<f64>, field: Field) -> Ranked {
    let distance = distance_nm(own.lat, own.lon, field.lat, field.lon);
    let course = bearing_deg(own.lat, own.lon, field.lat, field.lon);
    // The heading into the wind aloft, at the airspeed flown there; in
    // still air the course itself (flight's wind triangle).
    let triangle = tas.and_then(|tas| match own.wind {
        Some(w) if w.kt > 0.0 => flight::wind_triangle(course, tas, w.from_deg, w.kt).map(|(_, th, gs)| (th, gs)),
        _ => Some((course, tas)),
    });
    let heading_true = triangle.map(|(th, _)| th);
    let gs = triangle.map(|(_, gs)| gs);
    let (reach, reach_nm, arrive) = match (mode, glide, own.altitude_ft, field.elevation_ft) {
        (Mode::Glide, Some(g), Some(alt), Some(elevation)) => reach_of(&g, own, alt, alt - elevation, distance, course),
        _ => (Reach::Unknown, None, None),
    };
    let end = best_end(airplane, &field, course);
    let mut ranked = Ranked {
        distance_nm: distance,
        course_deg: course,
        heading_true_deg: heading_true,
        heading_mag_deg: heading_true.zip(own.variation_deg).map(|(h, v)| (h - v).rem_euclid(360.0)),
        groundspeed_kt: gs,
        ete_min: gs.filter(|gs| *gs > 0.0).map(|gs| distance / gs * 60.0),
        reach,
        reach_nm,
        arrive_agl_ft: arrive,
        end,
        reasons: vec![],
        field,
    };
    ranked.reasons = reasons::of(mode, &ranked);
    ranked
}

/// How a glide meets a field `distance_nm` off along `course_deg`, from
/// `agl_ft` over it: the tier, the reach over the ground that way, and
/// the height over the field on arrival (the height lost in proportion to
/// the distance, the glide's angle over the ground being steady).
fn reach_of(g: &Glide, own: &Own, altitude_ft: f64, agl_ft: f64, distance_nm: f64, course_deg: f64) -> (Reach, Option<f64>, Option<f64>) {
    if agl_ft <= 0.0 {
        return (Reach::Beyond, Some(0.0), None);
    }
    let still = agl_ft / 1000.0 * g.nm_per_1000_ft();
    let tas = g.tas_kt(altitude_ft);
    let reach = match (own.wind, tas) {
        (Some(w), Some(tas)) => ground_nm(still, tas, course_deg, w.from_deg, w.kt),
        _ => still,
    };
    if reach <= 0.0 {
        return (Reach::Beyond, Some(0.0), None);
    }
    let arrive = agl_ft - distance_nm * agl_ft / reach;
    let tier = if arrive >= ARRIVE_AGL_FT {
        Reach::Within
    } else if arrive >= 0.0 {
        Reach::Low
    } else {
        Reach::Beyond
    };
    (tier, Some(reach), Some(arrive))
}

/// The end to land on: one the POH's distance fits, then the crosswind
/// within the demonstrated, then the most headwind (AC 90-66C 11.5, the
/// end most nearly into the wind), then the one most nearly straight in
/// from the course flown there, then the longest.
fn best_end(airplane: Option<&Airplane>, field: &Field, course_deg: f64) -> Option<EndPick> {
    let mut best: Option<EndPick> = None;
    for (index, runway) in field.runways.iter().enumerate().filter(|(_, r)| !r.closed) {
        for end in &runway.ends {
            let fit = end_fit(
                airplane.and_then(|a| a.landing.as_ref()),
                airplane.and_then(|a| a.demonstrated_crosswind_kt),
                runway,
                end.heading_true_deg,
                field.wind.as_ref(),
                &field.report,
                None,
                Some(end),
            );
            let headwind = match (field.wind.and_then(|w| w.dir_true_deg), field.wind.and_then(|w| w.speed_kt), end.heading_true_deg) {
                (Some(d), Some(kt), Some(h)) => Some(headwind_kt(d, kt, h)),
                _ => None,
            };
            let pick = EndPick {
                runway: index,
                end: end.ident.clone(),
                heading_true_deg: end.heading_true_deg,
                surface: runway.surface.clone(),
                headwind_kt: headwind,
                fit,
            };
            if best.as_ref().is_none_or(|b| better_end(&pick, b, course_deg) == Ordering::Less) {
                best = Some(pick);
            }
        }
    }
    best
}

fn better_end(a: &EndPick, b: &EndPick, course_deg: f64) -> Ordering {
    let straight_in = |e: &EndPick| e.heading_true_deg.map_or(180.0, |h| angle_between(h, course_deg));
    a.fit
        .short
        .cmp(&b.fit.short)
        .then(a.fit.crosswind_over.cmp(&b.fit.crosswind_over))
        .then(b.headwind_kt.unwrap_or(0.0).round().total_cmp(&a.headwind_kt.unwrap_or(0.0).round()))
        .then(straight_in(a).total_cmp(&straight_in(b)))
        .then(b.fit.length_ft.unwrap_or(0.0).total_cmp(&a.fit.length_ft.unwrap_or(0.0)))
}

/// How much the runway counts against a field: none to land on or one
/// shorter than the POH's distance 2, one close to it, past the
/// demonstrated crosswind or not known 1.
fn runway_cost(r: &Ranked) -> u8 {
    match &r.end {
        None => 2,
        Some(e) if e.fit.short => 2,
        Some(e) if e.fit.close || e.fit.crosswind_over || e.fit.length_ft.is_none() => 1,
        Some(_) => 0,
    }
}

/// How much the weather counts against a field for a diversion: the
/// METAR's flight category (AIM 7-1-7's), IFR 1 and LIFR 2.
fn weather_cost(r: &Ranked) -> u8 {
    match r.field.flight_category.as_deref() {
        Some("LIFR") => 2,
        Some("IFR") => 1,
        _ => 0,
    }
}

/// How much who may land there counts against a field for a diversion:
/// a private or a military-only field 1, as much as an IFR report, its
/// owner's or the service's permission standing with no emergency (14 CFR
/// 91.3(b) is for one), so of fields otherwise alike a public or
/// joint-use one comes first. Never in a glide.
fn use_cost(r: &Ranked) -> u8 {
    u8::from(!r.field.usage.public_use())
}

/// How far short of a field the glide comes, nm.
fn short_of(r: &Ranked) -> f64 {
    r.distance_nm - r.reach_nm.unwrap_or(0.0)
}

fn order(mode: Mode, glides: bool, a: &Ranked, b: &Ranked) -> Ordering {
    match mode {
        // No glide figures: nearest first, and nothing else guessed.
        Mode::Glide if !glides => a.distance_nm.total_cmp(&b.distance_nm),
        // Beyond the glide, the nearest miss first: downwind a farther
        // field can be the nearer thing to reaching.
        Mode::Glide if a.reach == Reach::Beyond && b.reach == Reach::Beyond => short_of(a).total_cmp(&short_of(b)),
        Mode::Glide => a.reach.cmp(&b.reach).then(runway_cost(a).cmp(&runway_cost(b))).then(a.distance_nm.total_cmp(&b.distance_nm)),
        Mode::Diversion => (runway_cost(a) + weather_cost(a) + use_cost(a))
            .cmp(&(runway_cost(b) + weather_cost(b) + use_cost(b)))
            .then(a.ete_min.unwrap_or(a.distance_nm).total_cmp(&b.ete_min.unwrap_or(b.distance_nm))),
    }
}
