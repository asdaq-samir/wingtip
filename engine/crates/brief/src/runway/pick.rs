//! Which runway end is flown at a field, and its traffic pattern's rules
//! (apps/web/src/lib/pattern.ts, wingtip.pattern): the pilot's pick, else the end
//! most nearly into the wind (AC 90-66C 11.5), else the runway used most;
//! which side of the runway its pattern is flown (left unless the FAA says
//! right, 14 CFR 91.126(b)(1)); how to join it from the way the route
//! arrives (AC 90-66C 11.3 and Appendix A) and leave it (11.8); and how
//! high it is flown.

use super::performance::has;
use super::wind::{js_normalize, js_round, RunwayWind};
use wingtip_core::sort::StableSort;

/// A runway end: its ident as the data has it ("09") and its true
/// heading, None for one without (a helipad's).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct End {
    pub ident: String,
    pub heading_true_deg: Option<f64>,
    /// The threshold's displacement from the runway's end (NASR APT_RWY_END
    /// DISPLACED_THR_LEN), and the landing distance available where the
    /// airport declares one (LDA); None where not known or none.
    pub displaced_threshold_ft: Option<f64>,
    pub lda_ft: Option<f64>,
}

/// The runway a landing on `end` has: its declared landing distance
/// available, else the length less a displaced threshold, else the
/// length. The pavement behind a displaced threshold is not landed on from
/// this end (AIM 2-3-3: it "is available for takeoffs in either direction
/// and landings from the opposite direction"), and the LDA is the length "declared
/// available and suitable for ... landing" (AC 150/5300-13B, declared
/// distances). A takeoff has the whole length (`end` None).
pub fn available_ft(runway: &Runway, end: Option<&End>) -> Option<f64> {
    let Some(end) = end else { return runway.length_ft };
    let said = |x: Option<f64>| x.filter(|v| v.is_finite() && *v > 0.0);
    said(end.lda_ft).or_else(|| match (runway.length_ft, said(end.displaced_threshold_ft)) {
        (Some(length), Some(displaced)) => Some((length - displaced).max(0.0)),
        (length, _) => length,
    })
}

/// A field's runway, as much as the check reads of it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Runway {
    pub surface: Option<String>,
    pub length_ft: Option<f64>,
    pub closed: bool,
    pub ends: Vec<End>,
    pub wind: Option<RunwayWind>,
}

/// A runway end as painted: "9" for "09".
pub fn runway_number(ident: &str) -> &str {
    let stripped = ident.trim_start_matches('0');
    // Leading zeros, but not the last figure of a number all zeros.
    if stripped.len() < ident.len() && !stripped.starts_with(|c: char| c.is_ascii_digit()) {
        &ident[ident.len() - stripped.len() - 1..]
    } else {
        stripped
    }
}

/// Paved, asphalt or concrete (OurAirports' surface codes), where an
/// unpaved strip may be listed longer.
fn paved(r: &Runway) -> bool {
    r.surface.as_deref().is_some_and(|s| has(s, &["asp", "con", "bit", "pem", "paved"]))
}

/// Paved first, then the longer: the runway a field's traffic uses most,
/// as far as its data says.
fn most_used(a: &Runway, b: &Runway) -> std::cmp::Ordering {
    (paved(b) as i32).cmp(&(paved(a) as i32)).then_with(|| b.length_ft.unwrap_or(0.0).total_cmp(&a.length_ft.unwrap_or(0.0)))
}

/// The runway flown: its index in the field's runways, its end's index in
/// that runway's ends, and whether the reported wind chose it.
pub type Flown = (usize, usize, bool);

/// The runway end a pilot would take off from and land on (lib/pattern
/// runwayInUse): of the ends the reported wind favours, the one with the
/// most headwind -- AC 90-66C 11.5's runway most nearly into the wind,
/// calm, the one the field's last wind favoured -- or, with no wind
/// reported, the most used runway's first end. Only ends with a heading.
pub fn runway_in_use(runways: &[Runway]) -> Option<Flown> {
    let open: Vec<usize> =
        (0..runways.len()).filter(|&i| !runways[i].closed && runways[i].ends.iter().any(|e| e.heading_true_deg.is_some())).collect();
    let mut winded: Vec<usize> = open.iter().copied().filter(|&i| runways[i].wind.is_some()).collect();
    // A stable sort, as JavaScript's: equals keep the data's order.
    winded.stable_sort_by(|&a, &b| {
        let (wa, wb) = (runways[a].wind.as_ref().unwrap(), runways[b].wind.as_ref().unwrap());
        (wb.in_use as i32)
            .cmp(&(wa.in_use as i32))
            .then_with(|| wb.headwind_kt.total_cmp(&wa.headwind_kt))
            .then_with(|| most_used(&runways[a], &runways[b]))
    });
    for i in winded {
        let wind_end = &runways[i].wind.as_ref().unwrap().end;
        if let Some(j) = runways[i].ends.iter().position(|e| &e.ident == wind_end && e.heading_true_deg.is_some()) {
            return Some((i, j, true));
        }
    }
    let mut by_use = open;
    by_use.stable_sort_by(|&a, &b| most_used(&runways[a], &runways[b]));
    let longest = *by_use.first()?;
    let j = runways[longest].ends.iter().position(|e| e.heading_true_deg.is_some())?;
    Some((longest, j, false))
}

/// The runway end flown at a field (lib/pattern runwayFlown): the pilot's
/// pick where they made one (the end as painted, "24"), else
/// runway_in_use.
pub fn runway_flown(runways: &[Runway], picked: Option<&str>) -> Option<Flown> {
    if let Some(picked) = picked.filter(|p| !p.is_empty()) {
        for (i, runway) in runways.iter().enumerate().filter(|(_, r)| !r.closed) {
            if let Some(j) =
                runway.ends.iter().position(|e| runway_number(&e.ident) == runway_number(picked) && e.heading_true_deg.is_some())
            {
                let by_wind = runway.wind.as_ref().is_some_and(|w| w.end == runway.ends[j].ident);
                return Some((i, j, by_wind));
            }
        }
    }
    runway_in_use(runways)
}

/// A field's ident for matching, as lib/procedures sameField has it:
/// trimmed, in capitals, and a K before three letters or figures taken
/// off, so a stop typed UES is the planner's KUES.
pub fn bare_ident(ident: &str) -> String {
    let upper = ident.trim().to_uppercase();
    let rest =
        upper.strip_prefix('K').filter(|r| r.chars().count() == 3 && r.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
    rest.map_or(upper.clone(), str::to_owned)
}

/// The runways the pilot picked, by field, in the order they were made:
/// `pattern` the departure's runway out and every other field's runway
/// in, `takeoff` a stop's runway out ("24", as painted).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Picks {
    pub pattern: Vec<(String, String)>,
    pub takeoff: Vec<(String, String)>,
}

/// The end the pilot picked at `ident` for a takeoff or a landing, by the
/// field's ICAO or FAA ident alike (lib/pattern pickedEnd); None with no
/// pick, or an older address's "NONE".
pub fn picked_end<'a>(picks: Option<&'a Picks>, ident: &str, takeoff: bool, departure: bool) -> Option<&'a str> {
    let picks = picks?;
    let by_field = if takeoff && !departure { &picks.takeoff } else { &picks.pattern };
    let want = bare_ident(ident);
    let (_, end) = by_field.iter().find(|(field, _)| bare_ident(field) == want)?;
    (end != "NONE").then_some(end.as_str())
}

/// A runway end as both the FAA's and OurAirports' tables can be matched
/// on (wingtip.pattern end_key): trimmed, in capitals, as painted -- NASR
/// writes "09" where OurAirports may write "9", and either may write
/// "09L".
pub fn end_key(ident: &str) -> String {
    runway_number(&ident.trim().to_uppercase()).to_owned()
}

/// The FAA identifiers an airport may go by in NASR, which keys its
/// runways by its own (RFD, not KRFD): a K or P ICAO ident's last three
/// letters first, then the ident as given (wingtip.pattern faa_ids).
pub fn faa_ids(ident: &str) -> Vec<String> {
    let ident = ident.trim().to_uppercase();
    let chars: Vec<char> = ident.chars().collect();
    if chars.len() == 4 && matches!(chars[0], 'K' | 'P') {
        vec![chars[1..].iter().collect(), ident]
    } else {
        vec![ident]
    }
}

/// The true bearing from the runway to its downwind: off the left of the
/// landing direction for left traffic, the right for right -- every turn
/// to the left unless the FAA says right (14 CFR 91.126(b)(1)). An end
/// with no heading is taken as north's, as the web's always did.
pub fn pattern_side_deg(heading_true_deg: Option<f64>, traffic: &str) -> f64 {
    js_normalize(heading_true_deg.unwrap_or(0.0) + if traffic == "right" { 90.0 } else { -90.0 })
}

const POINTS: [&str; 8] = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

/// A true bearing as a pilot says a direction: "southwest".
pub fn compass_word(bearing_deg: f64) -> &'static str {
    POINTS[(js_round(js_normalize(bearing_deg) / 45.0) as i64).rem_euclid(8) as usize]
}

/// How far apart two directions are, 0 to 180, as the web's lib/geo
/// angleBetween works it.
fn angle_apart(a: f64, b: f64) -> f64 {
    let d = js_normalize(a - b);
    if d > 180.0 {
        360.0 - d
    } else {
        d
    }
}

/// How to join a pattern (lib/pattern entryFor): where the airplane comes
/// from as a direction from the field, whether that is the pattern's side
/// of the runway, and what to fly in a sentence or two.
#[derive(Clone, Debug, PartialEq)]
pub struct Entry {
    pub from: &'static str,
    pub pattern_side: bool,
    pub words: String,
}

/// How to join the pattern for the end `ident` (its true heading and its
/// traffic, "left" or "right") arriving on a true course of `course_deg`
/// (the hop's last leg): from the pattern's side, the 45° to the downwind
/// abeam midfield at pattern altitude (AC 90-66C 11.3); from the other,
/// AC 90-66C Appendix A's preferred entry (its Figure, "Preferred entry
/// from upwind leg side of airport (A)") -- over midfield at least 500 ft
/// above pattern altitude, FAA-H-8083-3C ch. 8: "cross over midfield at
/// least 500 feet above pattern altitude", down to it well clear (AC 11.2),
/// and back to the 45 -- or, where the pattern is not busy, across
/// midfield at pattern altitude straight onto the downwind (Appendix A's
/// alternate (B), "should not be used when the pattern is congested").
pub fn entry_for(ident: &str, heading_true_deg: Option<f64>, traffic: &str, course_deg: f64) -> Entry {
    let from_deg = (course_deg + 180.0) % 360.0;
    let pattern_side = angle_apart(from_deg, pattern_side_deg(heading_true_deg, traffic)) < 90.0;
    let downwind = format!("{traffic} downwind for runway {}", runway_number(ident));
    let from = compass_word(from_deg);
    let words = if pattern_side {
        format!("From the {from}, on the pattern's side: join the 45° to the {downwind}, abeam midfield at pattern altitude.")
    } else {
        format!(
            "From the {from}, across the field from the pattern: cross midfield at least 500 ft above pattern altitude, descend to it well clear, \
             and turn back to join the 45° to the {downwind}. With no traffic, crossing midfield at pattern altitude onto the downwind will do."
        )
    };
    Entry { from, pattern_side, words }
}

/// How to leave the pattern from an end (AC 90-66C 11.8): straight out, or
/// a 45° turn the pattern's way once past the departure end at pattern
/// altitude.
pub fn exit_for(traffic: &str) -> String {
    format!("Straight out, or a 45° {traffic} turn once past the departure end at pattern altitude.")
}

/// A field's traffic pattern above it where the FAA publishes none: AC
/// 90-66C Appendix A, Traffic Pattern Altitudes, item 1: "Propeller-driven
/// aircraft enter the traffic pattern at 1,000 feet above the airport
/// surface" (item 2's 1,500 is for large and turbine-powered airplanes,
/// which no profile here is), as wingtip.faa_data has it.
pub const PATTERN_AGL_FT: f64 = 1000.0;

/// How high the pattern is flown (wingtip.pattern pattern_at): above the
/// field, the FAA's own where it publishes one (APT_BASE's TPA, which the
/// host reads), else PATTERN_AGL_FT; above sea level, to the foot, where
/// the field's elevation is known; and whether it is the FAA's.
pub fn pattern_altitude(elevation_ft: Option<f64>, published_agl_ft: Option<f64>) -> (f64, Option<f64>, bool) {
    let agl = published_agl_ft.unwrap_or(PATTERN_AGL_FT);
    // Python's round, halves to even, as the planner has always given it.
    (agl, elevation_ft.map(|e| (e + agl).round_ties_even()), published_agl_ft.is_some())
}

/// The pattern altitude as a pilot sets it on the altimeter and the
/// planner flies it down to (the planner's routers.plan field_pattern_ft
/// before the move): the field's elevation and the pattern's height above
/// it (pattern_altitude) to the nearest hundred feet, halves to even as
/// Python's round. No rule sets the rounding -- AC 90-66C gives the height
/// above the field, the Chart Supplement a TPA in whole feet -- so it is a
/// simplification of at most 50 ft, for a figure read off an altimeter
/// marked in hundreds; the published TPA itself is pattern_altitude's.
pub fn pattern_altitude_flown(elevation_ft: Option<f64>, published_agl_ft: Option<f64>) -> Option<f64> {
    let agl = published_agl_ft.unwrap_or(PATTERN_AGL_FT);
    elevation_ft.map(|e| ((e + agl) / 100.0).round_ties_even() * 100.0)
}

/// A runway end as the map and the card take it (wingtip.pattern with_traffic):
/// its ident, its true heading (super::wind::end_heading_true_deg) and
/// which way its pattern is flown -- right where the FAA flags it (NASR's
/// RIGHT_HAND_TRAFFIC_PAT_FLAG, `right` the flagged ends as end_key gives
/// them), else left (14 CFR 91.126(b)(1)).
pub fn end_traffic(ident: Option<&str>, right: &[String]) -> &'static str {
    let key = end_key(ident.unwrap_or(""));
    if right.contains(&key) {
        "right"
    } else {
        "left"
    }
}
