//! The alerts ahead of the airplane: the planner's (`alerts_ahead`, from
//! the FAA data wingtip.alerts reads and passes in, the Digital Obstacle
//! File among them) and, with no network, the phone's from its packs --
//! the same rules either way. Advisory only, from a phone's GPS and the
//! FAA's published data: not a terrain awareness and warning system
//! (TSO-C151), nor a substitute for the chart, the pilot's own planning
//! (14 CFR 91.103) or looking outside. From the packs: the Class B, C and
//! D and special-use areas the track goes into in the next five minutes,
//! the TFRs as the phone last downloaded them, and the ground it comes within 500 ft of
//! in the next minute -- as the planner's /api/alerts/ahead answers it
//! (AheadAlert, the same names), with what cannot be known offline said
//! so: the obstacles (the FAA's Digital Obstacle File is not in a pack),
//! and the TFRs' age. Every figure is wingtip.alerts' own; see it for why.
//!
//! The ground is the pack's `terrain` (wingtip.cycle_pack's `_terrain`): the ground
//! grid's highest ground pooled to a 60th of a degree, plus the grid's
//! margin, so never under the planner's grid; the planner reads the zoom-12
//! tiles point by point, so the phone's ground can stand some hundreds of
//! feet higher on a ridge and alert sooner, never later.

use crate::geo::{self, destination};
use crate::json::{self, Value};
use crate::{pack::Pack, sort::StableSort, sua_tab};

/// How far ahead the airspace is looked at: the minutes it takes to find
/// the frequency, call and be answered before a Class C or D, or to be
/// cleared into a Class B or turn away. A design choice, not a rule.
pub const LOOK_AHEAD_S: f64 = 300.0;
/// How often along the look-ahead the track is tested: about 0.2 nm at
/// 120 kt, finer than any Class D surface area.
pub const AIRSPACE_STEP_S: f64 = 5.0;
/// Within this much of a volume's floor or ceiling counts as going in: a
/// phone's GPS altitude is good to some tens of feet, and an airplane
/// drifts. The figure Garmin's own airspace alerts default to; a design
/// choice, not a rule.
pub const ALTITUDE_BUFFER_FT: f64 = 200.0;
/// The ground and obstacles are looked at a minute ahead, a warning given
/// at half a minute: the caution and the warning of an EGPWS's forward
/// look, about 60 and 30 seconds before the ground (NBAA's summary of TAWS
/// and GPWS).
pub const TERRAIN_LOOK_AHEAD_S: f64 = 60.0;
pub const TERRAIN_WARNING_S: f64 = 30.0;
pub const TERRAIN_STEP_S: f64 = 2.0;
/// Borrowed from 14 CFR 91.119(c)'s 500 ft above the surface away from
/// congested areas, so the alert comes before the rule is broken: a rule
/// about how close one may operate, not a TAWS threshold (TSO-C151's
/// required terrain clearance differs, and is not read here).
pub const TERRAIN_CLEARANCE_FT: f64 = 500.0;
/// A warning: the ground or an obstacle's top within this of the
/// projected altitude, which the terrain tiles' 38 m cells and a phone's
/// altitude cannot tell from the ground itself. A design choice.
pub const WARNING_CLEARANCE_FT: f64 = 100.0;
/// Either side of the track the ground and obstacles are looked at, for a
/// track that wanders a few degrees: 0.25 nm is some 1,500 ft.
pub const SWATH_NM: f64 = 0.25;
/// 91.119's minimums hold "except when necessary for takeoff or landing":
/// within this of a field, and no higher than NEAR_FIELD_AGL_FT over it,
/// the ground is not alerted (obstacles still are). A 3-degree approach is
/// about 950 ft above the field at 3 nm.
pub const NEAR_FIELD_NM: f64 = 3.0;
pub const NEAR_FIELD_AGL_FT: f64 = 1000.0;
/// Under flying speed nothing is said: the one figure the debrief and the
/// motion crate's `underway` (glide.rs) use too.
pub use crate::figures::debrief::AIRBORNE_KT;
/// Class A from here (14 CFR 71.33): a volume with no ceiling reaches it.
use wingtip_flight::limits::CLASS_A_FLOOR_FT as CLASS_A_FT;
/// wingtip.ground_grid's RESAMPLED_MARGIN_FT, added to every cell it reads.
pub const GROUND_MARGIN_FT: f64 = 150.0;
const GROUND_NONE: i16 = i16::MIN;

fn class_need(class: char) -> Option<(&'static str, &'static str)> {
    Some(match class {
        'B' => ("warning", "An ATC clearance before entering (91.131(a)(1))."),
        'C' => ("caution", "Two-way radio contact with ATC before entering (91.130(c)(1))."),
        'D' => ("caution", "Two-way radio contact with the tower before entering (91.129(c)(1))."),
        _ => return None,
    })
}

fn special_use_need(kind: &str) -> Option<(&'static str, &'static str)> {
    Some(match kind {
        "P" => ("warning", "No flight without the using agency's permission (91.133(a))."),
        "R" => ("caution", "No flight into it while in use without the controlling agency's permission (91.133(a)); ask ATC or Flight Service whether it is (AIM 3-4-3)."),
        "MOA" => ("caution", "Military training may be under way: ask ATC or Flight Service whether it is active (AIM 3-4-5)."),
        "W" => ("caution", "Hazardous military activity may be under way (AIM 3-4-4)."),
        "A" => ("caution", "Heavy pilot training or unusual flying: keep a lookout (AIM 3-4-6)."),
        _ => return None,
    })
}

const TERRAIN_WARNING: &str = "At or near the airplane's altitude: climb or turn now.";
const TERRAIN_CAUTION: &str = "Within 500 ft of the airplane's altitude: climb or turn (91.119(c)).";

struct Track {
    times: Vec<f64>,
    along: Vec<f64>,
    lats: Vec<f64>,
    lons: Vec<f64>,
    alts: Option<Vec<f64>>,
    track_deg: f64,
}

impl Track {
    // The airplane's state, one figure an argument as wt_ahead and the
    // rule's JSON give them, and how far and how finely to look ahead.
    #[allow(clippy::too_many_arguments)]
    fn new(lat: f64, lon: f64, track_deg: f64, gs_kt: f64, alt_ft: Option<f64>, vs_fpm: f64, seconds: f64, step: f64) -> Track {
        let n = (seconds / step).round() as usize + 1;
        let times: Vec<f64> = (0..n).map(|i| i as f64 * step).collect();
        let along: Vec<f64> = times.iter().map(|t| gs_kt * t / 3600.0).collect();
        let (lats, lons) = along.iter().map(|&d| destination(lat, lon, track_deg, d)).unzip();
        let alts = alt_ft.map(|a| times.iter().map(|t| a + vs_fpm * t / 60.0).collect());
        Track { times, along, lats, lons, alts, track_deg }
    }

    fn bbox(&self, pad_nm: f64) -> [f64; 4] {
        let pad_lat = pad_nm / 60.0;
        let mean = self.lats.iter().sum::<f64>() / self.lats.len() as f64;
        let pad_lon = pad_lat / mean.to_radians().cos().max(0.2);
        let fold = |v: &[f64], f: fn(f64, f64) -> f64, s: f64| v.iter().copied().fold(s, f);
        [
            fold(&self.lons, f64::min, f64::INFINITY) - pad_lon,
            fold(&self.lats, f64::min, f64::INFINITY) - pad_lat,
            fold(&self.lons, f64::max, f64::NEG_INFINITY) + pad_lon,
            fold(&self.lats, f64::max, f64::NEG_INFINITY) + pad_lat,
        ]
    }

    /// (inside now, the first sample in it or within the buffer of it).
    fn entry(&self, holds: &dyn Fn(f64, f64) -> bool, floor: f64, ceiling: f64) -> (bool, Option<usize>) {
        let lateral: Vec<bool> = self.lats.iter().zip(&self.lons).map(|(&la, &lo)| holds(lo, la)).collect();
        match &self.alts {
            None => (lateral[0], lateral.iter().position(|&l| l)),
            Some(alts) => {
                let inside = lateral[0] && floor <= alts[0] && alts[0] <= ceiling;
                let first = (0..alts.len())
                    .find(|&i| lateral[i] && alts[i] >= floor - ALTITUDE_BUFFER_FT && alts[i] <= ceiling + ALTITUDE_BUFFER_FT);
                (inside, first)
            }
        }
    }
}

/// One alert, its fields in the planner's order and names.
#[derive(Clone, Debug, Default)]
pub struct Alert {
    pub id: String,
    pub kind: &'static str,
    pub level: &'static str,
    pub name: String,
    pub class: Option<String>,
    pub need: String,
    pub inside: bool,
    pub seconds: f64,
    pub distance_nm: f64,
    pub lat: f64,
    pub lon: f64,
    pub floor_ft: Option<f64>,
    pub ceiling_ft: Option<f64>,
    pub top_ft: Option<f64>,
    pub clearance_ft: Option<f64>,
    pub times_of_use: Option<String>,
    pub notam_id: Option<String>,
}

fn round_to(v: f64, places: i32) -> f64 {
    let k = 10f64.powi(places);
    (v * k).round() / k
}

fn at(track: &Track, i: usize) -> Alert {
    Alert {
        seconds: track.times[i],
        distance_nm: round_to(track.along[i], 1),
        lat: round_to(track.lats[i], 5),
        lon: round_to(track.lons[i], 5),
        ..Default::default()
    }
}

fn f64_at(b: &[u8], o: usize) -> Option<f64> {
    b.get(o..o + 8).map(|s| f64::from_le_bytes(s.try_into().unwrap()))
}

fn u32_at(b: &[u8], o: usize) -> Option<u32> {
    b.get(o..o + 4).map(|s| u32::from_le_bytes(s.try_into().unwrap()))
}

fn text<'a>(run: &'a [u8], r: &[u8], o: usize) -> Option<&'a str> {
    let (s, l) = (u32_at(r, o)? as usize, u32_at(r, o + 4)? as usize);
    std::str::from_utf8(run.get(s..s + l)?).ok()
}

fn meets(b: [f64; 4], box_: [f64; 4]) -> bool {
    !(b[2] < box_[0] || b[0] > box_[2] || b[3] < box_[1] || b[1] > box_[3])
}

/// The highest ground at a point from the packs' grids, feet, the grid's
/// margin added; None where no pack holds a grid there or no tile reached.
pub fn ground_ft(packs: &[Pack], lat: f64, lon: f64) -> Option<f64> {
    for p in packs {
        let Some(g) = p.section("terrain") else { continue };
        let (south, west) = (f64_at(g, 0)?, f64_at(g, 8)?);
        let (per, rows, cols) = (u32_at(g, 16)? as f64, u32_at(g, 20)? as usize, u32_at(g, 24)? as usize);
        let (r, c) = (((lat - south) * per).floor(), ((lon - west) * per).floor());
        if r < 0.0 || c < 0.0 || r as usize >= rows || c as usize >= cols {
            continue;
        }
        let o = 32 + 2 * (r as usize * cols + c as usize);
        let v = i16::from_le_bytes(g.get(o..o + 2)?.try_into().unwrap());
        return (v != GROUND_NONE).then_some(v as f64 + GROUND_MARGIN_FT);
    }
    None
}

/// A Class B, C or D volume, wherever it was read from: the phone's pack
/// or the planner's FAA shapefile (the `alerts_ahead` call's input).
struct Volume<'a> {
    class: char,
    name: String,
    floor: f64,
    ceiling: Option<f64>,
    holds: Box<dyn Fn(f64, f64) -> bool + 'a>,
}

/// The Class B, C and D the track goes into, one per named volume at its
/// first shelf entered. Not once inside: a pilot in a Class D has talked
/// to its tower, and one under a Class B shelf is below it.
fn class_alerts(track: &Track, volumes: Vec<Volume>) -> Vec<Alert> {
    let mut found: Vec<((String, char), Alert)> = Vec::new();
    let mut inside_of: Vec<(String, char)> = Vec::new();
    for v in volumes {
        let Some((level, need)) = class_need(v.class) else { continue };
        // No ceiling given: up to Class A (71.33), as wingtip.airspace_at reads it.
        let (inside, index) = track.entry(&*v.holds, v.floor, v.ceiling.unwrap_or(CLASS_A_FT));
        let key = (v.name.clone(), v.class);
        if inside {
            inside_of.push(key);
            continue;
        }
        let Some(index) = index else { continue };
        if found.iter().any(|(k, a)| *k == key && a.seconds <= track.times[index]) {
            continue;
        }
        found.retain(|(k, _)| *k != key);
        found.push((
            key,
            Alert {
                id: format!("airspace:{}:{}", v.class, v.name),
                kind: "airspace",
                level,
                name: v.name.clone(),
                need: need.to_string(),
                class: Some(v.class.to_string()),
                floor_ft: Some(v.floor),
                ceiling_ft: v.ceiling,
                ..at(track, index)
            },
        ));
    }
    found.into_iter().filter(|(k, _)| !inside_of.contains(k)).map(|(_, a)| a).collect()
}

fn classes(packs: &[Pack], track: &Track) -> Vec<Alert> {
    let box_ = track.bbox(1.0);
    let mut volumes = Vec::new();
    for p in packs {
        let (Some(layer), Some(vols), Some(names)) = (p.layer("airspace"), p.section("airspace.vol"), p.section("airspace.names")) else {
            continue;
        };
        for i in 0..layer.count {
            let Some(r) = vols.get(32 * i..32 * i + 32) else { continue };
            let class = r[0] as char;
            if class_need(class).is_none() || !meets(layer.bbox(i), box_) {
                continue;
            }
            let (Some(wkb), Some(floor), Some(ceiling), Some(name)) = (layer.wkb(i), f64_at(r, 8), f64_at(r, 16), text(names, r, 24))
            else {
                continue;
            };
            volumes.push(Volume {
                class,
                name: name.to_string(),
                floor: if r[1] == 0 { 0.0 } else { floor },
                ceiling: (!ceiling.is_nan()).then_some(ceiling),
                holds: Box::new(move |x: f64, y: f64| crate::airspace::wkb_holds(wkb, x, y).unwrap_or(false)),
            });
        }
    }
    class_alerts(track, volumes)
}

/// A floor or ceiling in feet MSL, as wingtip.alerts' `_height_msl`.
fn height_msl(value: Option<f64>, agl: bool, ground: Option<f64>, missing: f64) -> f64 {
    match value {
        None => missing,
        Some(v) if agl => match ground {
            Some(g) => v + g,
            None if missing <= 0.0 => v,
            None => missing,
        },
        Some(v) => v,
    }
}

/// A special-use area, from the pack or the planner's FAA SUA data, with
/// the ground under it (`under`) for its AGL heights: the airplane's own
/// where the area's could not be read.
struct Area<'a> {
    kind: String,
    name: String,
    heights: sua_tab::Heights,
    under: Option<f64>,
    times_of_use: Option<String>,
    holds: Box<dyn Fn(f64, f64) -> bool + 'a>,
}

/// The special-use areas the track goes into, or is in: one per name.
fn special_use_alerts(track: &Track, areas: Vec<Area>) -> Vec<Alert> {
    let mut found: Vec<Alert> = Vec::new();
    for a in areas {
        let Some((level, need)) = special_use_need(&a.kind) else { continue };
        let h = a.heights;
        let floor = height_msl(h.floor, h.floor_agl, a.under, 0.0);
        let ceiling = height_msl(h.ceiling, h.ceiling_agl, a.under, f64::INFINITY);
        let (inside, index) = track.entry(&*a.holds, floor, ceiling);
        let Some(index) = index else { continue };
        if found.iter().any(|f| f.name == a.name && f.seconds <= track.times[index]) {
            continue;
        }
        found.retain(|f| f.name != a.name);
        found.push(Alert {
            id: format!("special_use:{}", a.name),
            kind: "special_use",
            level,
            name: a.name.clone(),
            need: need.to_string(),
            inside: inside && index == 0,
            class: Some(a.kind.clone()),
            floor_ft: if h.floor_agl { Some(floor) } else { h.floor },
            ceiling_ft: if h.ceiling_agl { Some(ceiling).filter(|c| c.is_finite()) } else { h.ceiling },
            times_of_use: a.times_of_use.clone().filter(|t| !t.is_empty()),
            ..at(track, index)
        });
    }
    found
}

fn special_use(packs: &[Pack], track: &Track, ground: Option<f64>) -> Vec<Alert> {
    let box_ = track.bbox(1.0);
    let mut areas = Vec::new();
    for p in packs {
        let (Some(layer), Some(alt), Some(names), Some(rec), Some(times)) =
            (p.layer("sua"), p.section("sua.alt"), p.section("sua.names"), p.section("sua.rec"), p.section("sua.times"))
        else {
            continue;
        };
        for i in 0..layer.count {
            let (Some(a), Some(r)) = (alt.get(32 * i..32 * i + 32), rec.get(24 * i..24 * i + 24)) else { continue };
            let kind = String::from_utf8_lossy(a[..4].split(|&c| c == 0).next().unwrap_or(&[])).into_owned();
            if special_use_need(&kind).is_none() {
                continue;
            }
            let bbox = layer.bbox(i);
            if !meets(bbox, box_) {
                continue;
            }
            let (Some(wkb), Some(name)) = (layer.wkb(i), text(names, r, 16)) else { continue };
            // The FAA's codes and DESC as the pack keeps them (wingtip.sua `_area`).
            let codes = p.section("sua.json").and_then(|d| text(d, r, 8)).and_then(|t| json::parse(t).ok());
            let heights = sua_tab::heights(codes.as_ref(), f64_at(a, 8), f64_at(a, 16), [a[4], a[5]]);
            // The ground under the area for its AGL heights: the middle of
            // its box, the airplane's own where that cannot be read.
            let under = if heights.floor_agl || heights.ceiling_agl {
                ground_ft(packs, (bbox[1] + bbox[3]) / 2.0, (bbox[0] + bbox[2]) / 2.0).or(ground)
            } else {
                ground
            };
            areas.push(Area {
                kind,
                name: name.to_string(),
                heights,
                under,
                times_of_use: text(times, a, 24).map(str::to_string),
                holds: Box::new(move |x: f64, y: f64| crate::airspace::wkb_holds(wkb, x, y).unwrap_or(false)),
            });
        }
    }
    special_use_alerts(track, areas)
}

/// A TFR, as the phone kept it or the planner read it: its NOTAM, its
/// title, the rule it is issued under, its floor and ceiling in feet with
/// each one's reference, when it starts and ends (Unix seconds), its
/// polygons' rings of (lon, lat), and the ground under it for AGL heights.
struct Tfr {
    notam: String,
    title: String,
    rule: String,
    floor: Option<f64>,
    floor_agl: bool,
    ceiling: Option<f64>,
    ceiling_agl: bool,
    from: Option<i64>,
    to: Option<i64>,
    shape: Polygons,
    under: Option<f64>,
}

/// Polygons as rings of (lon, lat): each polygon its outline and holes.
type Polygons = Vec<Vec<Vec<(f64, f64)>>>;

/// Whether polygons hold a point: inside an odd number of one polygon's
/// rings (its outline and not a hole), by the even-odd rule.
fn polygons_hold(shape: &Polygons, x: f64, y: f64) -> bool {
    shape.iter().any(|rings| rings.iter().filter(|r| r.len() >= 3 && geo::ring_holds(r, x, y)).count() % 2 == 1)
}

/// The phone's kept TFRs, one a tab-separated line: its NOTAM, title,
/// rule, floor and its reference, ceiling and its reference, start and
/// end (Unix seconds, empty where not given), and its outer ring as "lon
/// lat" pairs joined by ",".
fn tfrs_of(text: &str) -> Vec<Tfr> {
    text.lines()
        .filter_map(|line| {
            let f: Vec<&str> = line.split('\t').collect();
            if f.len() != 10 {
                return None;
            }
            let num = |s: &str| s.trim().parse::<f64>().ok().filter(|v| v.is_finite());
            let ring: Vec<(f64, f64)> = f[9]
                .split(',')
                .filter_map(|p| {
                    let mut it = p.split_whitespace();
                    Some((num(it.next()?)?, num(it.next()?)?))
                })
                .collect();
            (ring.len() >= 3).then(|| Tfr {
                notam: f[0].to_string(),
                title: f[1].to_string(),
                rule: f[2].to_string(),
                floor: num(f[3]),
                floor_agl: f[4] == "AGL",
                ceiling: num(f[5]),
                ceiling_agl: f[6] == "AGL",
                from: f[7].trim().parse().ok(),
                to: f[8].trim().parse().ok(),
                shape: vec![vec![ring]],
                under: None,
            })
        })
        .collect()
}

/// The TFRs in force over the look-ahead that the track goes into, or is
/// in: entry only as the NOTAM allows (14 CFR 91.137 to 91.145, 99.7). In
/// force is from its effective to its expiry time, as its NOTAM gives
/// them (AIM 3-5-3); one with neither is taken as in force.
fn tfr_alerts(track: &Track, ground: Option<f64>, now: i64, list: &[Tfr]) -> Vec<Alert> {
    let until = now + *track.times.last().unwrap() as i64;
    let mut found = Vec::new();
    for t in list {
        if t.to.is_some_and(|e| e < now) || t.from.is_some_and(|s| s > until) {
            continue;
        }
        let under = t.under.or(ground);
        let floor = height_msl(t.floor, t.floor_agl, under, 0.0);
        let ceiling = height_msl(t.ceiling, t.ceiling_agl, under, f64::INFINITY);
        let holds = |x: f64, y: f64| polygons_hold(&t.shape, x, y);
        let (inside, index) = track.entry(&holds, floor, ceiling);
        let Some(index) = index else { continue };
        found.push(Alert {
            id: format!("tfr:{}", t.notam),
            kind: "tfr",
            level: "warning",
            name: if t.title.is_empty() { format!("TFR {}", t.notam) } else { t.title.clone() },
            need: if t.rule.is_empty() {
                format!("In force: no flight in it but as NOTAM {} allows.", t.notam)
            } else {
                format!("In force: no flight in it but as NOTAM {} allows ({}).", t.notam, t.rule)
            },
            inside: inside && index == 0,
            floor_ft: t.floor.map(|_| floor),
            ceiling_ft: Some(ceiling).filter(|c| c.is_finite()),
            notam_id: Some(t.notam.clone()),
            ..at(track, index)
        });
    }
    found
}

fn tfrs(packs: &[Pack], track: &Track, ground: Option<f64>, now: i64, text: &str) -> Vec<Alert> {
    let mut list = tfrs_of(text);
    for t in &mut list {
        // The ground at the TFR's first point, for its AGL heights.
        if t.floor_agl || t.ceiling_agl {
            let (x, y) = t.shape[0][0][0];
            t.under = ground_ft(packs, y, x);
        }
    }
    tfr_alerts(track, ground, now, &list)
}

fn clearance_level(seconds: f64, clearance: f64) -> Option<&'static str> {
    if seconds <= TERRAIN_WARNING_S && clearance < WARNING_CLEARANCE_FT {
        Some("warning")
    } else if clearance < TERRAIN_CLEARANCE_FT {
        Some("caution")
    } else {
        None
    }
}

/// The terrain look-ahead's points: the track and a line SWATH_NM either
/// side of it, three rows of (lats, lons) of the track's length.
fn swath(track: &Track) -> Vec<(Vec<f64>, Vec<f64>)> {
    let n = track.times.len();
    let mut rows = vec![(track.lats.clone(), track.lons.clone())];
    for side in [-90.0, 90.0] {
        rows.push((0..n).map(|i| destination(track.lats[i], track.lons[i], track.track_deg + side, SWATH_NM)).unzip());
    }
    rows
}

/// The ground the next minute's track comes within 500 ft of: one alert
/// where it is least. `ground(row, i)` the ground at the swath's point;
/// None where any cannot be read.
fn terrain_with(track: &Track, ground: &dyn Fn(usize, usize, f64, f64) -> Option<f64>) -> Option<Vec<Alert>> {
    let alts = track.alts.as_ref()?;
    let n = track.times.len();
    let rows = swath(track);
    let mut highest = vec![f64::NEG_INFINITY; n];
    let mut at_row = vec![0usize; n];
    for (k, (lats, lons)) in rows.iter().enumerate() {
        for i in 0..n {
            let g = ground(k, i, lats[i], lons[i])?;
            if g > highest[i] {
                highest[i] = g;
                at_row[i] = k;
            }
        }
    }
    let clearance: Vec<f64> = (0..n).map(|i| alts[i] - highest[i]).collect();
    // The worst of them: a warning before a caution, then the least clearance.
    let worst = (0..n)
        .filter_map(|i| clearance_level(track.times[i], clearance[i]).map(|l| (l, i)))
        .min_by(|a, b| (a.0 != "warning").cmp(&(b.0 != "warning")).then(clearance[a.1].partial_cmp(&clearance[b.1]).unwrap()));
    let Some((level, i)) = worst else { return Some(Vec::new()) };
    let (lats, lons) = &rows[at_row[i]];
    Some(vec![Alert {
        id: "terrain".into(),
        kind: "terrain",
        level,
        name: "Terrain".into(),
        need: if level == "warning" { TERRAIN_WARNING } else { TERRAIN_CAUTION }.into(),
        top_ft: Some(round_to(highest[i], -1)),
        clearance_ft: Some(round_to(clearance[i], -1)),
        lat: round_to(lats[i], 5),
        lon: round_to(lons[i], 5),
        ..at(track, i)
    }])
}

fn terrain(packs: &[Pack], track: &Track) -> Option<Vec<Alert>> {
    terrain_with(track, &|_, _, lat, lon| ground_ft(packs, lat, lon))
}

/// An obstacle from the FAA's Digital Obstacle File: where it is, its top
/// (feet MSL) and its TYPE column ("TOWER", "STACK").
pub struct Obstacle {
    pub lat: f64,
    pub lon: f64,
    pub amsl_ft: f64,
    pub kind: String,
}

/// The registered obstacles within the swath of the next minute's track
/// (SWATH_NM either side, ahead of the airplane and no further than the
/// track reaches) whose tops come within 500 ft of its altitude when it
/// gets there: the nearest three, by when the airplane reaches them.
fn obstacle_alerts(track: &Track, obstacles: &[Obstacle], gs_kt: f64) -> Vec<Alert> {
    let Some(alts) = track.alts.as_ref() else { return Vec::new() };
    let reach = *track.along.last().unwrap();
    if obstacles.is_empty() || reach <= 0.0 {
        return Vec::new();
    }
    let n = track.times.len();
    let (start, end) = ((track.lats[0], track.lons[0]), (track.lats[n - 1], track.lons[n - 1]));
    let mut found = Vec::new();
    for o in obstacles {
        let (cross, along) = crate::geo::track_nm(o.lat, o.lon, start, end);
        if cross.abs() > SWATH_NM || along < 0.0 || along > reach {
            continue;
        }
        let seconds = along / gs_kt * 3600.0;
        let alt_then = interp(seconds, &track.times, alts);
        let Some(level) = clearance_level(seconds, alt_then - o.amsl_ft) else { continue };
        let kind = o.kind.trim();
        found.push(Alert {
            id: format!("obstacle:{:.4},{:.4}", o.lat, o.lon),
            kind: "obstacle",
            level,
            name: if kind.is_empty() { "obstacle".into() } else { kind.to_string() },
            need: if level == "warning" { TERRAIN_WARNING } else { TERRAIN_CAUTION }.into(),
            seconds: round_to(seconds, 1),
            distance_nm: round_to(along, 1),
            lat: round_to(o.lat, 5),
            lon: round_to(o.lon, 5),
            top_ft: Some(o.amsl_ft),
            clearance_ft: Some(round_to(alt_then - o.amsl_ft, -1)),
            ..Default::default()
        });
    }
    found.stable_sort_by(|a, b| a.seconds.partial_cmp(&b.seconds).unwrap());
    found.truncate(3);
    found
}

/// numpy's interp: `x` on the line through (xs, ys), held at the ends.
fn interp(x: f64, xs: &[f64], ys: &[f64]) -> f64 {
    if x <= xs[0] {
        return ys[0];
    }
    for w in 0..xs.len() - 1 {
        if x <= xs[w + 1] {
            let f = (x - xs[w]) / (xs[w + 1] - xs[w]);
            return ys[w] + f * (ys[w + 1] - ys[w]);
        }
    }
    *ys.last().unwrap()
}

/// Whether the airplane, `distance_nm` from the nearest landing field
/// (`elevation_ft` its elevation, None where not on file), is taking off
/// or landing there: 91.119's minimums hold "except when necessary for
/// takeoff or landing", so within NEAR_FIELD_NM and no more than
/// NEAR_FIELD_AGL_FT over it the ground is not alerted.
fn near_field_given(distance_nm: f64, elevation_ft: Option<f64>, alt: f64) -> bool {
    distance_nm <= NEAR_FIELD_NM && elevation_ft.is_none_or(|e| alt <= e + NEAR_FIELD_AGL_FT)
}

/// Whether the airplane is taking off or landing at a field: within 3 nm
/// of one and no more than 1,000 ft over it (wingtip.alerts' `_near_field`),
/// from the packs' airports (NASR's airports, seaplane bases, gliderports
/// and ultralight fields; a heliport or a balloonport is no field).
fn near_field(packs: &[Pack], lat: f64, lon: f64, alt: f64) -> bool {
    let mut best: Option<(f64, Option<f64>)> = None;
    for p in packs {
        let Some(t) = p.section("airports").and_then(|b| std::str::from_utf8(b).ok()).and_then(json::table) else { continue };
        let (Some(la), Some(lo), Some(el), Some(kind)) =
            (t.col("LAT_DECIMAL"), t.col("LONG_DECIMAL"), t.col("ELEV"), t.col("SITE_TYPE_CODE"))
        else {
            continue;
        };
        for row in &t.rows {
            if !matches!(row[kind].as_str(), "A" | "C" | "G" | "U") {
                continue;
            }
            let (Ok(y), Ok(x)) = (row[la].parse::<f64>(), row[lo].parse::<f64>()) else { continue };
            let d = crate::geo::distance_nm(lat, lon, y, x);
            if best.is_none_or(|b| d < b.0) {
                best = Some((d, row[el].parse::<f64>().ok()));
            }
        }
    }
    best.is_some_and(|(d, elev)| near_field_given(d, elev, alt))
}

fn sorted(mut alerts: Vec<Alert>) -> Vec<Alert> {
    // Warnings first, then the soonest.
    alerts.stable_sort_by(|a, b| (a.level != "warning").cmp(&(b.level != "warning")).then(a.seconds.partial_cmp(&b.seconds).unwrap()));
    alerts
}

/// The alerts ahead, as the planner's {"alerts", "unavailable"} with
/// "tfrs_as_of", and "ground_ft": the packs' ground under the airplane
/// (`ground_ft`, the grid's highest in its cell plus its margin) or null,
/// which the phones' glide ring stands on (#218), JSON. `tfrs` the
/// phone's kept TFRs (one a line, as `tfrs_of` reads them) and when it downloaded
/// them; None where it has none.
#[allow(clippy::too_many_arguments)]
pub fn ahead(
    packs: &[Pack], lat: f64, lon: f64, track_deg: f64, gs_kt: f64, alt_ft: Option<f64>, vs_fpm: f64, now: i64, tfr_lines: Option<&str>,
    tfrs_at: Option<i64>,
) -> String {
    let mut alerts: Vec<Alert> = Vec::new();
    let mut unavailable: Vec<&str> = Vec::new();
    let under = ground_ft(packs, lat, lon);
    if gs_kt >= AIRBORNE_KT {
        let track = Track::new(lat, lon, track_deg, gs_kt, alt_ft, vs_fpm, LOOK_AHEAD_S, AIRSPACE_STEP_S);
        let near = Track::new(lat, lon, track_deg, gs_kt, alt_ft, vs_fpm, TERRAIN_LOOK_AHEAD_S, TERRAIN_STEP_S);
        alerts.extend(classes(packs, &track));
        alerts.extend(special_use(packs, &track, under));
        match tfr_lines {
            Some(text) => alerts.extend(tfrs(packs, &track, under, now, text)),
            None => unavailable.push("TFRs"),
        }
        match alt_ft {
            Some(alt) => {
                if !near_field(packs, lat, lon, alt) {
                    match terrain(packs, &near) {
                        Some(found) => alerts.extend(found),
                        None => unavailable.push("terrain"),
                    }
                }
                // The FAA's obstacle file is the planner's alone.
                unavailable.push("obstacles");
            }
            None => unavailable.push("terrain and obstacles, with no GPS altitude"),
        }
    }
    to_json(&sorted(alerts), &unavailable, tfrs_at, under)
}

fn to_json(alerts: &[Alert], unavailable: &[&str], tfrs_at: Option<i64>, ground: Option<f64>) -> String {
    let mut out = String::from("{\"alerts\":[");
    for (k, a) in alerts.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        out.push_str("{\"id\":");
        json::string(&mut out, &a.id);
        out.push_str(&format!(",\"kind\":\"{}\",\"level\":\"{}\",\"name\":", a.kind, a.level));
        json::string(&mut out, &a.name);
        out.push_str(",\"class\":");
        json::opt_string(&mut out, a.class.as_deref());
        out.push_str(",\"need\":");
        json::string(&mut out, &a.need);
        out.push_str(&format!(",\"inside\":{},\"seconds\":", a.inside));
        json::number(&mut out, a.seconds);
        for (name, v) in [
            ("distance_nm", Some(a.distance_nm)),
            ("lat", Some(a.lat)),
            ("lon", Some(a.lon)),
            ("floor_ft", a.floor_ft),
            ("ceiling_ft", a.ceiling_ft),
            ("top_ft", a.top_ft),
            ("clearance_ft", a.clearance_ft),
        ] {
            out.push_str(&format!(",\"{name}\":"));
            json::opt_number(&mut out, v);
        }
        out.push_str(",\"times_of_use\":");
        json::opt_string(&mut out, a.times_of_use.as_deref());
        out.push_str(",\"notam_id\":");
        json::opt_string(&mut out, a.notam_id.as_deref());
        out.push('}');
    }
    out.push_str("],\"unavailable\":[");
    for (k, u) in unavailable.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        json::string(&mut out, u);
    }
    out.push_str("],\"tfrs_as_of\":");
    match tfrs_at {
        Some(t) => out.push_str(&t.to_string()),
        None => out.push_str("null"),
    }
    out.push_str(",\"ground_ft\":");
    json::opt_number(&mut out, ground);
    out.push('}');
    out
}

// The planner's way in: the same alerts from the data it reads -- the
// FAA's Class B, C and D shapefile, its special-use airspace, tfr.faa.gov's
// TFRs, the terrain tiles and the Digital Obstacle File -- given as JSON
// (wingtip.alerts only reads them and asks). `ahead_frame` first says
// where the data is wanted -- the box round the five minutes' track for
// the airspace, the box round the minute's for the obstacles, and the
// swath's points for the ground -- and `alerts_ahead` then says what is
// ahead.

type R<T> = Result<T, String>;

fn num_of(name: &str, v: &Value, key: &str) -> R<f64> {
    v.get(key).and_then(Value::as_f64).ok_or_else(|| format!("{name}: \"{key}\" is not a number"))
}

fn opt_num_of(name: &str, v: &Value, key: &str) -> R<Option<f64>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(x) => x.as_f64().map(Some).ok_or_else(|| format!("{name}: \"{key}\" is not a number")),
    }
}

fn str_of<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

/// A list, or None where it is null or missing: what could not be read.
fn opt_list<'a>(name: &str, v: &'a Value, key: &str) -> R<Option<&'a [Value]>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(x) => x.as_array().map(Some).ok_or_else(|| format!("{name}: \"{key}\" is not a list")),
    }
}

/// `"polygons"`: [[ring, hole, ...], ...], each ring [[lon, lat], ...].
fn polygons_of(name: &str, v: &Value) -> R<Polygons> {
    let bad = || format!("{name}: \"polygons\" is not [[[[lon, lat], ...], ...], ...]");
    let list = v.get("polygons").and_then(Value::as_array).ok_or_else(bad)?;
    list.iter()
        .map(|rings| {
            rings
                .as_array()
                .ok_or_else(bad)?
                .iter()
                .map(|ring| {
                    ring.as_array()
                        .ok_or_else(bad)?
                        .iter()
                        .map(|p| match p.as_array() {
                            Some([x, y]) => Ok((x.as_f64().ok_or_else(bad)?, y.as_f64().ok_or_else(bad)?)),
                            _ => Err(bad()),
                        })
                        .collect()
                })
                .collect()
        })
        .collect()
}

struct Own {
    lat: f64,
    lon: f64,
    track_deg: f64,
    gs_kt: f64,
    alt_ft: Option<f64>,
    vs_fpm: f64,
}

fn own(name: &str, v: &Value) -> R<Own> {
    Ok(Own {
        lat: num_of(name, v, "lat")?,
        lon: num_of(name, v, "lon")?,
        track_deg: num_of(name, v, "track_deg")?,
        gs_kt: num_of(name, v, "gs_kt")?,
        alt_ft: opt_num_of(name, v, "alt_ft")?,
        vs_fpm: opt_num_of(name, v, "vs_fpm")?.unwrap_or(0.0),
    })
}

/// The rule `name` worked on `v`.
pub fn call(name: &str, v: &Value) -> R<String> {
    match name {
        // Where the data is wanted: {"box": [south, west, north, east]}
        // round the airspace look-ahead's track, 1 nm wider; "near_box"
        // round the next minute's, SWATH_NM and half a mile wider, for the
        // obstacles; and "lats" and "lons", 3 rows each, the track and
        // SWATH_NM either side TERRAIN_STEP_S apart, for the ground.
        "ahead_frame" => {
            let o = own(name, v)?;
            let track = Track::new(o.lat, o.lon, o.track_deg, o.gs_kt, o.alt_ft, o.vs_fpm, LOOK_AHEAD_S, AIRSPACE_STEP_S);
            let near = Track::new(o.lat, o.lon, o.track_deg, o.gs_kt, o.alt_ft, o.vs_fpm, TERRAIN_LOOK_AHEAD_S, TERRAIN_STEP_S);
            let rows = swath(&near);
            let mut out = String::from("{");
            for (key, b) in [("box", track.bbox(1.0)), ("near_box", near.bbox(SWATH_NM + 0.5))] {
                out.push_str(&format!("\"{key}\":["));
                // Track::bbox is [west, south, east, north].
                for (i, x) in [b[1], b[0], b[3], b[2]].iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    json::number(&mut out, *x);
                }
                out.push_str("],");
            }
            out.push_str("\"lats\":[");
            for (part, pick) in [("lats", 0usize), ("lons", 1)] {
                if part == "lons" {
                    out.push_str("],\"lons\":[");
                }
                for (k, row) in rows.iter().enumerate() {
                    if k > 0 {
                        out.push(',');
                    }
                    out.push('[');
                    let values = if pick == 0 { &row.0 } else { &row.1 };
                    for (i, x) in values.iter().enumerate() {
                        if i > 0 {
                            out.push(',');
                        }
                        json::number(&mut out, *x);
                    }
                    out.push(']');
                }
            }
            out.push_str("]}");
            Ok(out)
        }
        "alerts_ahead" => alerts_ahead(v),
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

fn alerts_ahead(v: &Value) -> R<String> {
    let name = "alerts_ahead";
    let o = own(name, v)?;
    let now = num_of(name, v, "now")? as i64;
    let ground = opt_num_of(name, v, "ground_ft")?;
    let mut alerts: Vec<Alert> = Vec::new();
    let mut unavailable: Vec<&str> = Vec::new();
    // Nothing on the ground: under flying speed (AIRBORNE_KT, the motion
    // crate's `underway`).
    if o.gs_kt < AIRBORNE_KT {
        return Ok(to_json(&[], &[], None, ground));
    }
    let track = Track::new(o.lat, o.lon, o.track_deg, o.gs_kt, o.alt_ft, o.vs_fpm, LOOK_AHEAD_S, AIRSPACE_STEP_S);
    let near = Track::new(o.lat, o.lon, o.track_deg, o.gs_kt, o.alt_ft, o.vs_fpm, TERRAIN_LOOK_AHEAD_S, TERRAIN_STEP_S);

    let mut volumes = Vec::new();
    for a in opt_list(name, v, "airspace")?.unwrap_or(&[]) {
        let shape = polygons_of(name, a)?;
        volumes.push(Volume {
            class: str_of(a, "class").chars().next().unwrap_or(' '),
            name: str_of(a, "name").to_string(),
            floor: opt_num_of(name, a, "floor_ft")?.unwrap_or(0.0),
            ceiling: opt_num_of(name, a, "ceiling_ft")?,
            holds: Box::new(move |x: f64, y: f64| polygons_hold(&shape, x, y)),
        });
    }
    alerts.extend(class_alerts(&track, volumes));

    match opt_list(name, v, "special_use")? {
        Some(list) => {
            let mut areas = Vec::new();
            for a in list {
                let shape = polygons_of(name, a)?;
                let (floor_ft, ceiling_ft) = (opt_num_of(name, a, "floor_ft")?, opt_num_of(name, a, "ceiling_ft")?);
                areas.push(Area {
                    kind: str_of(a, "type").to_string(),
                    name: str_of(a, "name").to_string(),
                    heights: sua_tab::heights(Some(a), floor_ft, ceiling_ft, [0, 0]),
                    under: opt_num_of(name, a, "ground_ft")?.or(ground),
                    times_of_use: a.get("times_of_use").and_then(Value::as_str).map(str::to_string),
                    holds: Box::new(move |x: f64, y: f64| polygons_hold(&shape, x, y)),
                });
            }
            alerts.extend(special_use_alerts(&track, areas));
        }
        None => unavailable.push("special-use airspace"),
    }

    match opt_list(name, v, "tfrs")? {
        Some(list) => {
            let mut given = Vec::new();
            for t in list {
                given.push(Tfr {
                    notam: str_of(t, "notam_id").to_string(),
                    title: str_of(t, "title").to_string(),
                    rule: str_of(t, "rule").to_string(),
                    floor: opt_num_of(name, t, "floor_ft")?,
                    floor_agl: str_of(t, "floor_ref") == "AGL",
                    ceiling: opt_num_of(name, t, "ceiling_ft")?,
                    ceiling_agl: str_of(t, "ceiling_ref") == "AGL",
                    from: opt_num_of(name, t, "effective")?.map(|s| s as i64),
                    to: opt_num_of(name, t, "expires")?.map(|s| s as i64),
                    shape: polygons_of(name, t)?,
                    under: opt_num_of(name, t, "ground_ft")?,
                });
            }
            alerts.extend(tfr_alerts(&track, ground, now, &given));
        }
        None => unavailable.push("TFRs"),
    }

    match o.alt_ft {
        Some(alt) => {
            let field = match v.get("near_field") {
                None | Some(Value::Null) => None,
                Some(f) => Some((num_of(name, f, "distance_nm")?, opt_num_of(name, f, "elevation_ft")?)),
            };
            if !field.is_some_and(|(d, e)| near_field_given(d, e, alt)) {
                let rows: Option<Vec<Vec<f64>>> = match opt_list(name, v, "swath_ground_ft")? {
                    None => None,
                    Some(rows) => Some(
                        rows.iter()
                            .map(|r| r.as_array().map(|r| r.iter().map(|x| x.as_f64().unwrap_or(f64::NAN)).collect()))
                            .collect::<Option<_>>()
                            .ok_or("alerts_ahead: \"swath_ground_ft\" is not three rows of numbers")?,
                    ),
                };
                let found = rows.and_then(|rows| {
                    terrain_with(&near, &|k, i, _, _| rows.get(k).and_then(|r| r.get(i)).copied().filter(|g| g.is_finite()))
                });
                match found {
                    Some(found) => alerts.extend(found),
                    None => unavailable.push("terrain"),
                }
            }
            match opt_list(name, v, "obstacles")? {
                Some(list) => {
                    let obstacles = list
                        .iter()
                        .map(|x| {
                            Ok(Obstacle {
                                lat: num_of(name, x, "lat")?,
                                lon: num_of(name, x, "lon")?,
                                amsl_ft: num_of(name, x, "amsl_ft")?,
                                kind: str_of(x, "type").to_string(),
                            })
                        })
                        .collect::<R<Vec<_>>>()?;
                    alerts.extend(obstacle_alerts(&near, &obstacles, o.gs_kt));
                }
                None => unavailable.push("obstacles"),
            }
        }
        // Said rather than left to read as a clear sky.
        None => unavailable.push("terrain and obstacles, with no GPS altitude"),
    }
    Ok(to_json(&sorted(alerts), &unavailable, None, ground))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_on_the_ground_and_a_tfr_ahead_in_the_air() {
        let ring = "-93.0 45.05,-92.9 45.05,-92.9 45.15,-93.0 45.15,-93.0 45.05";
        let line = format!("6/1234\tA stadium\t\t\t\t3000\tAGL\t\t\t{ring}");
        let none: [Pack; 0] = [];
        let parked = ahead(&none, 45.0, -92.95, 0.0, 10.0, Some(1000.0), 0.0, 0, Some(&line), Some(0));
        assert!(parked.starts_with("{\"alerts\":[],\"unavailable\":[]"), "{parked}");
        let flying = ahead(&none, 45.0, -92.95, 0.0, 120.0, Some(2000.0), 0.0, 0, Some(&line), Some(0));
        assert!(flying.contains("\"id\":\"tfr:6/1234\""), "{flying}");
        // No packs: no ground to read.
        assert!(flying.contains("\"terrain\""), "{flying}");
        assert!(flying.ends_with(",\"ground_ft\":null}"), "{flying}");
    }
}
