//! A logbook entry drawn from the app's own flown track, so a flight is
//! logged with no typing: the pilot sees it as a draft, with the reason
//! for every figure, and changes or confirms it (nothing is saved here).
//!
//! 14 CFR 61.51(b) is what an entry holds: the date, the total flight
//! time, where from and to, the airplane, and the conditions -- day or
//! night, actual or simulated instrument. From the track it reads:
//!
//! - the flight time (1.1: from moving "under its own power for the
//!   purpose of flight" to coming "to rest after landing"), the air time
//!   within it, and the night within it (1.1's night, flight::sun);
//! - the takeoffs and landings, each a full stop or a touch-and-go, at
//!   which field, and whether in 1.1's night and in 61.57(b)'s period
//!   (from 1 hour after sunset), which counts only full stops;
//! - the instrument approaches it flew, matched to the CIFP procedures
//!   given (route's approach::debrief::find_approaches, the debrief's own
//!   matcher), and the holds (holds.rs) -- 61.57(c)(1)'s items, which
//!   count only "under actual or simulated instrument conditions"
//!   (61.51(g)(1)), something no track shows, so they are given apart for
//!   the pilot to add (`instrument`), not put in the entry;
//! - cross-country: a landing elsewhere (61.1(b), "Cross-country time"
//!   (i)), and one more than 50 nm in a straight line from the departure
//!   ((ii), which 61.109, 61.129 and 61.65's experience and the ATP's
//!   count); the entry logs it by (ii), the stricter.
//!
//! The fields round the track (their place, NASR elevation and tower) and
//! the procedures' drawings come from the host, which finds them near the
//! places `logbook_track_places` names: the engine never fetches.
//!
//! - `logbook_track_places`: `{"places": [{"t", "lat", "lon", "kind"}],
//!   "within_nm"}` from `{"points"}` -- where the track took off, landed
//!   or came down low, to look for fields within `within_nm` of;
//! - `logbook_from_track`: the draft (entry.rs) from `{"points",
//!   "fields"?, "drawings"?, "picked"?, "aircraft"?, "aircraft_type"?,
//!   "utc_offset_min"?}`.

use wingtip_core::sort::StableSort;

pub mod answer;
pub mod entry;
pub mod ground;
pub mod holds;
pub mod trip;

use wingtip_core::json::{self, Value};
use wingtip_procedures::figures::debrief::{airborne, ground_speeds, Point, AIRBORNE_KT};
use wingtip_route::approach::Drawing;

/// A field near the track: its place, its elevation (NASR's, ft MSL)
/// where known, and whether it has a control tower (NASR APT_BASE's
/// TWR_TYPE_CODE).
#[derive(Clone, Debug, PartialEq)]
pub struct Field {
    pub ident: String,
    pub lat: f64,
    pub lon: f64,
    pub elevation_ft: Option<f64>,
    pub towered: bool,
}

type R<T> = Result<T, String>;

fn opt_num(name: &str, v: &Value, key: &str) -> R<Option<f64>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

fn num(name: &str, v: &Value, key: &str) -> R<f64> {
    opt_num(name, v, key)?.ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

fn opt_str(name: &str, v: &Value, key: &str) -> R<Option<String>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.clone())),
        Some(_) => Err(format!("{name}: \"{key}\" is not a string")),
    }
}

fn list<'a>(name: &str, v: &'a Value, key: &str) -> R<&'a [Value]> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        Some(_) => Err(format!("{name}: \"{key}\" is not a list")),
    }
}

/// The track's points in time order (`t` ms since 1970, `alt_ft` GPS
/// altitude, ft MSL, where it has one).
fn points(name: &str, v: &Value) -> R<Vec<Point>> {
    let mut out = list(name, v, "points")?
        .iter()
        .map(|p| {
            Ok(Point { t: num(name, p, "t")?, lat: num(name, p, "lat")?, lon: num(name, p, "lon")?, alt_ft: opt_num(name, p, "alt_ft")? })
        })
        .collect::<R<Vec<_>>>()?;
    out.stable_sort_by(|a, b| a.t.total_cmp(&b.t));
    Ok(out)
}

fn fields(name: &str, v: &Value) -> R<Vec<Field>> {
    list(name, v, "fields")?
        .iter()
        .map(|f| {
            Ok(Field {
                ident: opt_str(name, f, "ident")?.ok_or_else(|| format!("{name}: a field's \"ident\" is missing"))?,
                lat: num(name, f, "lat")?,
                lon: num(name, f, "lon")?,
                elevation_ft: opt_num(name, f, "elevation_ft")?,
                towered: matches!(f.get("towered"), Some(Value::Bool(true))),
            })
        })
        .collect()
}

/// How far round a place the host looks for fields: ground's FIELD_NM.
pub const PLACES_WITHIN_NM: f64 = ground::FIELD_NM;
/// A low point: the lowest of the two minutes round it, with the track
/// at least this much higher on both sides (a touch-and-go's descent and
/// climb, or a low approach's).
const LOW_DIP_FT: f64 = 200.0;
const LOW_WINDOW_MS: f64 = 60_000.0;

/// Where the track took off, landed or came down low: each flight's ends,
/// its slowings under AIRBORNE_KT, and its dips; one a nautical mile.
pub fn places(points: &[Point]) -> Vec<(usize, &'static str)> {
    let gs = ground_speeds(points);
    let mut out: Vec<(usize, &'static str)> = Vec::new();
    for (a, b) in airborne(points) {
        out.push((a, "takeoff"));
        for i in a..=b {
            let dip = points[i].alt_ft.is_some_and(|alt| {
                let side = |range: &mut dyn Iterator<Item = usize>| {
                    range
                        .take_while(|&j| (points[j].t - points[i].t).abs() <= LOW_WINDOW_MS)
                        .any(|j| points[j].alt_ft.is_some_and(|h| h >= alt + LOW_DIP_FT))
                };
                let lowest = (a..=b)
                    .filter(|&j| (points[j].t - points[i].t).abs() <= LOW_WINDOW_MS)
                    .all(|j| points[j].alt_ft.is_none_or(|h| h >= alt));
                lowest && side(&mut (a..i).rev()) && side(&mut (i + 1..=b))
            });
            if gs[i] < AIRBORNE_KT || dip {
                out.push((i, "low"));
            }
        }
        out.push((b, "landing"));
    }
    let mut kept: Vec<(usize, &'static str)> = Vec::new();
    for (i, kind) in out {
        let near = kept
            .last()
            .is_some_and(|&(k, _)| wingtip_core::geo::distance_nm(points[k].lat, points[k].lon, points[i].lat, points[i].lon) < 1.0);
        if !near || kind != "low" {
            kept.push((i, kind));
        }
    }
    kept
}

fn places_json(points: &[Point]) -> String {
    let mut out = String::from("{\"places\":[");
    for (k, (i, kind)) in places(points).into_iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        out.push_str("{\"t\":");
        json::number(&mut out, points[i].t);
        out.push_str(",\"lat\":");
        json::number(&mut out, points[i].lat);
        out.push_str(",\"lon\":");
        json::number(&mut out, points[i].lon);
        out.push_str(",\"kind\":");
        json::string(&mut out, kind);
        out.push('}');
    }
    out.push_str("],\"within_nm\":");
    json::number(&mut out, PLACES_WITHIN_NM);
    out.push('}');
    out
}

/// The rules by name, as the facade's call lists them.
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> R<String> {
    match name {
        "logbook_track_places" => Ok(places_json(&points(name, v)?)),
        "logbook_from_track" => {
            let pts = points(name, v)?;
            if pts.len() < 2 {
                return Err(format!("{name}: \"points\" needs two or more"));
            }
            let drawings = list(name, v, "drawings")?.iter().map(|d| Drawing::read(name, d)).collect::<R<Vec<_>>>()?;
            let ask = entry::Ask {
                fields: fields(name, v)?,
                drawings,
                aircraft: opt_str(name, v, "aircraft")?,
                aircraft_type: opt_str(name, v, "aircraft_type")?,
                utc_offset_min: opt_num(name, v, "utc_offset_min")?.unwrap_or(0.0),
                picked: opt_str(name, v, "picked")?,
            };
            Ok(answer::draft_json(&entry::draft(&pts, &ask)))
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}
