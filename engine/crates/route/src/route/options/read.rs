//! What closes a cell, marks it or makes it dearer, and each cell's best
//! groundspeed each way: the planner's data read onto the grid.

use super::ask::{Advisory, Airspace, Report, Station};
use super::grid::{Grid, PER_CELL};
use super::words::g;
use crate::geo;
use wingtip_core::grid::STEPS;
use wingtip_flight::{flight, limits, vfr};
use wingtip_weather::forecast::field::TAF_VICINITY_NM;
use wingtip_weather::metar;

/// The planner's 1,000 ft over the ground (wingtip.terrain), at or above
/// 14 CFR 91.119(b)'s 1,000 ft over a congested area and (c)'s 500 ft
/// elsewhere.
pub const TERRAIN_MARGIN_FT: f64 = 1000.0;
/// The terrain tiles at the coarse zoom read are an average of the ground
/// they cover; the peaks in a cell stand higher than its pixels say.
pub const COARSE_MARGIN_FT: f64 = 1000.0;
/// AIM 7-1-27, Thunderstorm Flying: "avoid by at least 20 miles any
/// thunderstorm identified as severe or giving an intense radar echo" --
/// kept for every one forecast or reported, as a light airplane has no
/// radar to tell which.
pub const STORM_NM: f64 = 20.0;
/// How far round a field under minimums its report or forecast closes the
/// grid: a TAF is for 5 sm of the airport (FAA-H-8083-28B 27.4.1, NWSI 10-813), and
/// route options keep out to its vicinity, 10 sm (8.7 nm), twice that --
/// the planner's choice, narrower than the 25 nm a field's brief reads a
/// TAF from (TAF_REACH_NM), as closing cells that far round every low
/// field would leave no way through a front.
pub const FIELD_WX_NM: f64 = TAF_VICINITY_NM;
/// And how far round a field in MVFR the cells are marginal: the
/// planner's own figure, not a rule's -- a reporting field is some 30 nm
/// from the next in most of the country, so a marginal report colours the
/// way to it.
pub const MARGINAL_NM: f64 = 30.0;
/// 14 CFR 91.155(c) and (d): no VFR under a ceiling below 1,000 ft or in
/// under 3 sm in a surface area -- the surface-area minimums, which the
/// planner holds every route to, whatever the pilot's own (wingtip_flight::vfr).
pub const LEGAL_CEILING_FT: f64 = vfr::SURFACE_AREA_CEILING_FT;
pub const LEGAL_VISIBILITY_SM: f64 = vfr::SURFACE_AREA_VISIBILITY_SM;
/// A METAR is read for a flight leaving within this long, s; later, the
/// TAFs alone, as a report is of now.
pub const METAR_AHEAD_S: f64 = 2.0 * 3600.0;
/// SIGMETs reaching below this, ft, are a light airplane's (Class A from
/// 18,000 ft, 14 CFR 71.33).
pub const SIGMET_BELOW_FT: f64 = limits::CLASS_A_FLOOR_FT;
/// A G-AIRMET is a snapshot valid at its time, three hours apart (the
/// AWC's product, wingtip.weather's GAIRMET_SNAPSHOT_S): one valid within
/// half that gap of some time of the flight stands for it.
pub const GAIRMET_SNAPSHOT_S: f64 = 90.0 * 60.0;
/// What a restricted area, MOA, warning or alert area costs more to cross,
/// a share of a cell's minutes, for every way: their times of use are not
/// read here, so they are gone round where it costs little, not closed.
pub const SPECIAL_USE_COST: f64 = 0.5;
/// The margin kept from a prohibited area or a TFR, degrees: a mile.
pub const AIRSPACE_MARGIN_DEG: f64 = 1.0 / 60.0;
/// The airplane is taken to climb to cruise from no lower than this, ft:
/// the planner's own figure, the lowest a cross-country is flown over
/// level ground (91.119(c)'s 500 ft and the altitudes the plan picks).
pub const LOWEST_CRUISE_FT: f64 = 2500.0;
/// The G-AIRMETs that close cells -- IFR and mountains obscured, where VFR
/// is not to be had (AIM 7-1-6) -- and those that mark them marginal.
pub const GAIRMET_CLOSES: [&str; 2] = ["IFR conditions", "Mountains obscured"];
pub const GAIRMET_MARKS: [&str; 3] = ["Turbulence", "Icing", "Low-level wind shear"];

/// The highest VFR cruising altitude the airplane reaches either way:
/// 91.159's odd thousands plus 500 eastbound, even westbound, under its
/// ceiling and under 18,000 ft (Class A, 71.33) -- the lower of the two,
/// so a way works whichever way its legs go.
pub fn highest_cruise_ft(ceiling_ft: f64) -> f64 {
    let top = ceiling_ft.min(limits::VFR_HIGHEST_FT);
    // From the first of each direction's altitudes over 3,000 ft (3,500
    // eastbound, 4,500 westbound: flight's lowest_vfr_cruising_altitude),
    // up by its 2,000 ft steps (odd or even thousands plus 500) to the top.
    let highest = |course_deg: f64| {
        let mut a = flight::lowest_vfr_cruising_altitude(3000.0, course_deg);
        if a > top {
            return 0.0;
        }
        while a + 2000.0 <= top {
            a += 2000.0;
        }
        a
    };
    highest(90.0).min(highest(270.0))
}

/// Every VFR cruising altitude to the airplane's top (91.159: odd
/// thousands plus 500 eastbound, even westbound), from 3,500 ft.
pub fn cruising_altitudes(top_ft: f64) -> Vec<f64> {
    let mut out = Vec::new();
    let mut a = 3500.0;
    while a < top_ft + 1.0 {
        out.push(a);
        a += 1000.0;
    }
    out
}

/// Each cell's floor, ft, from the ground's height at its samples
/// (PER_CELL a side, rows from the south): its highest ground with
/// 91.119's 1,000 ft and the coarse read's margin; cells whose floor is
/// over `top_ft` closed.
pub fn ground(grid: &mut Grid, heights_ft: &[f64], top_ft: f64) -> Result<(), String> {
    let (rows, cols) = (grid.rows, grid.cols);
    let width = cols * PER_CELL;
    if heights_ft.len() != rows * PER_CELL * width {
        return Err(format!("route_options: \"terrain_ft\" is not {} by {} heights", rows * PER_CELL, width));
    }
    let mut over = Vec::new();
    for r in 0..rows {
        for c in 0..cols {
            let mut highest = f64::NEG_INFINITY;
            for i in 0..PER_CELL {
                let row = &heights_ft[(r * PER_CELL + i) * width + c * PER_CELL..][..PER_CELL];
                highest = row.iter().copied().fold(highest, f64::max);
            }
            let at = r * cols + c;
            grid.floor[at] = highest + TERRAIN_MARGIN_FT + COARSE_MARGIN_FT;
            if grid.floor[at] > top_ft {
                over.push(at);
            }
        }
    }
    grid.close(&over, "terrain", "High ground above the airplane's ceiling");
    Ok(())
}

/// The shores' samples out of glide of dry land (PER_CELL a side), and
/// each cell's share of them.
pub fn water(grid: &mut Grid, far: Vec<bool>) -> Result<(), String> {
    let (rows, cols) = (grid.rows, grid.cols);
    let width = cols * PER_CELL;
    if far.len() != rows * PER_CELL * width {
        return Err(format!("route_options: \"water_far\" is not {} by {} samples", rows * PER_CELL, width));
    }
    for r in 0..rows {
        for c in 0..cols {
            let mut n = 0usize;
            for i in 0..PER_CELL {
                n += far[(r * PER_CELL + i) * width + c * PER_CELL..][..PER_CELL].iter().filter(|&&b| b).count();
            }
            grid.offshore[r * cols + c] = n as f64 / (PER_CELL * PER_CELL) as f64;
        }
    }
    grid.far = Some(far);
    Ok(())
}

/// Whether a report's or a forecast's weather has a thunderstorm in it,
/// at the field or in its vicinity (TS, VCTS, TSRA, +TSGR ...).
fn storm(wx: &str) -> bool {
    wx.to_uppercase().contains("TS")
}

fn inside(grid: &Grid, lat: f64, lon: f64) -> bool {
    let (s, w, n, e) = grid.bbox();
    s <= lat && lat <= n && w <= lon && lon <= e
}

/// The fields' TAFs over the flight's time (each its worst in the window
/// and every group's weather), and their METARs for a flight leaving
/// within METAR_AHEAD_S of `now_s`: under the minimums closes the cells
/// round them, MVFR marks them, a thunderstorm closes STORM_NM round.
pub fn weather(grid: &mut Grid, tafs: &[Report], metars: &[Report], leave_s: f64, now_s: f64, ceiling_ft: f64, visibility_sm: f64) {
    let mut seen = Vec::new();
    for t in tafs {
        if !inside(grid, t.lat, t.lon) {
            continue;
        }
        seen.push(t.ident.as_str());
        if t.wx.iter().any(|w| storm(w)) {
            let at = grid.near(t.lat, t.lon, STORM_NM);
            grid.close(&at, "storm", &format!("Thunderstorms forecast at {}", t.ident));
        }
        field_weather(grid, t, ceiling_ft, visibility_sm, "forecast");
    }
    if leave_s - now_s > METAR_AHEAD_S {
        return;
    }
    for m in metars {
        if !inside(grid, m.lat, m.lon) {
            continue;
        }
        if m.wx.iter().any(|w| storm(w)) {
            let at = grid.near(m.lat, m.lon, STORM_NM);
            grid.close(&at, "storm", &format!("Thunderstorm reported at {}", m.ident));
        }
        if seen.contains(&m.ident.as_str()) {
            continue;
        }
        field_weather(grid, m, ceiling_ft, visibility_sm, "reported");
    }
}

/// Python's f"{int(x):,}": the whole number with commas.
fn thousands(x: f64) -> String {
    wingtip_core::text::grouped_int(x.trunc() as i64)
}

fn field_weather(grid: &mut Grid, r: &Report, min_ceiling_ft: f64, min_visibility_sm: f64, how: &str) {
    let low = r.ceiling_ft.is_some_and(|c| c < min_ceiling_ft) || r.visibility_sm.is_some_and(|v| v < min_visibility_sm);
    let words: Vec<String> = [
        r.ceiling_ft.map(|c| format!("ceiling {} ft", thousands(c))),
        // A layer reported with no height ("OVC///") is a ceiling not
        // known, not none (14 CFR 1.1).
        r.ceiling_unknown.then(|| "ceiling of unknown height".to_owned()),
        r.visibility_sm.map(|v| format!("visibility {} sm", g(v))),
    ]
    .into_iter()
    .flatten()
    .collect();
    let words = words.join(", ");
    if low {
        let at = grid.near(r.lat, r.lon, FIELD_WX_NM);
        grid.close(&at, "weather", &format!("{} {how} under minimums ({words})", r.ident));
        return;
    }
    // Marginal: a flight category worse than VFR (FAA-H-8083-28B 3.4.2.14, AIM 7-1-7:
    // MVFR is a ceiling of 1,000 to 3,000 ft and/or visibility 3 to 5
    // miles, inclusive; metar.rs). A ceiling of unknown height could be
    // any: marked, as a pilot is warned and never stopped by the planner,
    // not passed as VFR.
    // With no visibility the category is not settled (flight_category_of),
    // but a ceiling of 3,000 ft or under is no better than MVFR whatever
    // the visibility: the ceiling's own category, the visibility taken as
    // unlimited, is the best it can be, and marks the field.
    let category = metar::flight_category_of(r.ceiling_ft, false, r.visibility_sm)
        .or_else(|| metar::flight_category_of(r.ceiling_ft, false, Some(f64::INFINITY)));
    if r.ceiling_unknown || !matches!(category, None | Some("VFR")) {
        let at = grid.near(r.lat, r.lon, MARGINAL_NM);
        grid.mark(&at, "marginal", &format!("{} {how} marginal ({words})", r.ident));
    }
}

/// SIGMETs over the flight's time: a convective one's area and STORM_NM
/// round it closed, any other reaching under SIGMET_BELOW_FT its own area.
pub fn sigmets(grid: &mut Grid, advisories: &[Advisory], window: (f64, f64)) {
    for a in advisories {
        if a.valid_to.is_some_and(|t| t <= window.0) || a.valid_from.is_some_and(|t| t > window.1) || a.points < 3 {
            continue;
        }
        if a.altitude_low_ft.is_some_and(|low| low >= SIGMET_BELOW_FT) {
            continue;
        }
        let hazard = a.hazard.to_uppercase();
        let raw: String = a.raw.split('\n').next().unwrap_or("").chars().take(60).collect::<String>().trim().to_owned();
        if hazard.starts_with("CONVECTIVE") {
            // AIM 7-1-27's 20 nm every way: the area's longitudes scaled to
            // miles at its centre, where degrees alone gave 15 nm east and
            // west at 40 N (the aviation check, 2026-10-27).
            let k = a.area.centroid().0.to_radians().cos().max(0.05);
            let at = grid.in_area(&a.area, STORM_NM / 60.0, k);
            grid.close(&at, "storm", format!("Convective SIGMET {raw}").trim());
        } else {
            let at = grid.in_area(&a.area, 0.0, 1.0);
            let what = if hazard.is_empty() { "a hazard".to_owned() } else { hazard.to_lowercase() };
            grid.close(&at, "sigmet", format!("SIGMET for {what} {raw}").trim());
        }
    }
}

/// The G-AIRMETs valid over the flight (each a snapshot, three hours
/// apart, taken within GAIRMET_SNAPSHOT_S of it): the weather between the
/// fields that report. IFR and mountain obscuration close their areas;
/// low-level turbulence, icing reaching under the airplane's top and wind
/// shear mark theirs.
pub fn gairmets(grid: &mut Grid, advisories: &[Advisory], window: (f64, f64), top_ft: f64) {
    for a in advisories {
        let Some(valid) = a.valid else { continue };
        if valid < window.0 - GAIRMET_SNAPSHOT_S || valid > window.1 + GAIRMET_SNAPSHOT_S {
            continue;
        }
        let hazard = a.hazard.as_str();
        let closes = GAIRMET_CLOSES.contains(&hazard);
        if a.points < 3 || !(closes || GAIRMET_MARKS.contains(&hazard)) {
            continue;
        }
        if hazard == "Icing" && a.altitude_low_ft.is_some_and(|low| low >= top_ft) {
            continue;
        }
        let at = grid.in_area(&a.area, 0.0, 1.0);
        // "IFR conditions" as it is, "mountains obscured" in the line.
        let words = if hazard.chars().take(2).all(|c| c.is_uppercase()) {
            hazard.to_owned()
        } else {
            let mut cs = hazard.chars();
            cs.next().map(|f| f.to_lowercase().collect::<String>() + cs.as_str()).unwrap_or_default()
        };
        let name = format!("G-AIRMET for {words}");
        if closes {
            grid.close(&at, "weather", &name);
        } else {
            grid.mark(&at, "marginal", &name);
        }
    }
}

/// Prohibited areas (14 CFR 91.133) closed, a mile round; restricted,
/// MOA, warning and alert areas dearer.
pub fn special_use(grid: &mut Grid, areas: &[Airspace]) {
    for a in areas {
        match a.kind.as_str() {
            "P" => {
                let at = grid.in_area(&a.area, AIRSPACE_MARGIN_DEG, 1.0);
                grid.close(&at, "prohibited", &format!("Prohibited area {}", a.name));
            }
            "R" | "MOA" | "W" | "A" => {
                for i in grid.in_area(&a.area, 0.0, 1.0) {
                    grid.dear[i] = grid.dear[i].max(SPECIAL_USE_COST);
                }
            }
            _ => {}
        }
    }
}

/// The TFRs in force over the flight (14 CFR 91.137 to 91.145), the
/// planner's pick of them, closed a mile round.
pub fn tfrs(grid: &mut Grid, tfrs: &[Airspace]) {
    for t in tfrs {
        let at = grid.in_area(&t.area, AIRSPACE_MARGIN_DEG, 1.0);
        grid.close(&at, "tfr", format!("TFR {} {}", t.kind, t.name).trim());
    }
}

/// Each cell's best groundspeed, kt, out each of the eight ways (STEPS),
/// at the legal cruising altitudes over its floor -- the direction's own
/// thousands (91.159, by the magnetic course, `variation_deg` east taken
/// off the true) -- in the nearest FD station's winds (at `altitudes`, as
/// the station's `winds`). TAS where there are no winds. Rows by columns
/// by the eight ways.
pub fn groundspeeds(grid: &Grid, stations: &[Station], altitudes: &[f64], tas_kt: f64, variation_deg: f64) -> Vec<f64> {
    let (rows, cols) = (grid.rows, grid.cols);
    let mut out = vec![tas_kt; rows * cols * 8];
    if altitudes.is_empty() || stations.is_empty() {
        return out;
    }
    let wind = |s: &Station, j: usize| s.winds.get(j).copied().flatten().unwrap_or((0.0, 0.0));
    for r in 0..rows {
        let lat = grid.lats[r];
        // The course each way at this row, and its half of 91.159.
        let ways: Vec<(f64, bool)> = STEPS
            .iter()
            .map(|&(dr, dc)| {
                let course = geo::py_mod((dc as f64 * lat.to_radians().cos()).atan2(dr as f64).to_degrees(), 360.0);
                (course, flight::is_eastbound(geo::py_mod(course - variation_deg, 360.0)))
            })
            .collect();
        for c in 0..cols {
            let lon = grid.lons[c];
            // The nearest station, the first where two are as near.
            let mut best = (f64::INFINITY, 0usize);
            for (i, s) in stations.iter().enumerate() {
                let d = geo::distance_nm(lat, lon, s.lat, s.lon);
                if d < best.0 {
                    best = (d, i);
                }
            }
            let station = &stations[best.1];
            let lowest = grid.floor[r * cols + c].max(LOWEST_CRUISE_FT);
            for (k, &(course, east)) in ways.iter().enumerate() {
                let mut gs = f64::NEG_INFINITY;
                for (j, &alt) in altitudes.iter().enumerate() {
                    let odd = ((alt / 1000.0).floor() as i64).rem_euclid(2) == 1;
                    if alt < lowest || east != odd {
                        continue;
                    }
                    let (from, kt) = wind(station, j);
                    let angle = (from - course).to_radians();
                    let head = kt * angle.cos();
                    let cross = kt * angle.sin();
                    let along = (tas_kt * tas_kt - cross * cross).max(1.0).sqrt() - head;
                    gs = gs.max(along.max(1.0));
                }
                if gs.is_finite() {
                    out[(r * cols + c) * 8 + k] = gs;
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_highest_cruise_either_way_under_the_ceiling() {
        // 91.159: 13,000 ft reaches 11,500 east and 12,500 west, so 11,500.
        assert_eq!(highest_cruise_ft(13000.0), 11500.0);
        assert_eq!(highest_cruise_ft(30000.0), 16500.0);
        assert_eq!(highest_cruise_ft(4000.0), 0.0);
        assert_eq!(highest_cruise_ft(4500.0), 3500.0);
    }

    #[test]
    fn commas_as_python_writes_them() {
        assert_eq!(thousands(2500.0), "2,500");
        assert_eq!(thousands(300.0), "300");
        assert_eq!(thousands(12000.0), "12,000");
    }

    #[test]
    fn the_cruising_altitudes_to_the_top() {
        assert_eq!(cruising_altitudes(5500.0), vec![3500.0, 4500.0, 5500.0]);
        assert!(cruising_altitudes(0.0).is_empty());
    }
}
