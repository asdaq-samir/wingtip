//! Instrument approaches taught and debriefed (crate::approach): every
//! case of the web's approachDebrief.test.ts and approachLesson.test.ts,
//! asked by name as each host asks. The debrief's procedures are KBUR's
//! ILS Y RWY 08 and RNAV (GPS) Z RWY 08 as the planner draws them from the
//! CIFP of 1 Oct 2026, read from the fixture the web's tests read
//! (apps/web/src/lib/fixtures/approachKbur.json).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;
use wingtip_engine::geo::{bearing_deg, destination, distance_nm};
use wingtip_engine::units::FT_PER_NM;

fn ask(name: &str, input: Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name} answered {text}: {e}"))
}

fn kbur() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/approachKbur.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn drawing(id: &str) -> Value {
    kbur()[id].clone()
}

const RW08: (f64, f64) = (34.197911, -118.369142);

type Ll = (f64, f64);

fn ll(p: &Value) -> Ll {
    (p[0].as_f64().unwrap(), p[1].as_f64().unwrap())
}

fn nm(a: Ll, b: Ll) -> f64 {
    distance_nm(a.0, a.1, b.0, b.1)
}

fn bearing(a: Ll, b: Ll) -> f64 {
    bearing_deg(a.0, a.1, b.0, b.1)
}

fn dest(a: Ll, course: f64, d: f64) -> Ll {
    destination(a.0, a.1, course, d)
}

#[derive(Default)]
struct Fly {
    off: Option<Box<dyn Fn(f64) -> f64>>,
    alt: Option<Box<dyn Fn(f64) -> f64>>,
    after: usize,
    after_alt: Option<Box<dyn Fn(f64) -> f64>>,
    after_kt: Option<Box<dyn Fn(f64) -> f64>>,
}

/// A track flown along a line of points at 120 kt, a point a second: each
/// `off(to_go)` nm right of it (left negative) and at `alt(to_go)` ft,
/// to_go the distance left to the line's end; then `after` seconds beyond
/// it on the same course, at `after_alt(s)` and `after_kt(s)`. The web
/// test's `fly`.
fn fly(line: &[Ll], o: Fly) -> Vec<Value> {
    let legs: Vec<(Ll, Ll, f64)> = line.windows(2).map(|w| (w[0], w[1], nm(w[0], w[1]))).collect();
    let total: f64 = legs.iter().map(|l| l.2).sum();
    let t0 = 1_761_836_400_000.0; // 2026-10-30T15:00:00Z
    let kt = 120.0;
    let mut points = Vec::new();
    let mut s = 0.0;
    let mut along = 0.0;
    while along <= total {
        let (mut rest, mut k) = (along, 0);
        while k < legs.len() - 1 && rest > legs[k].2 {
            rest -= legs[k].2;
            k += 1;
        }
        let (a, b, len) = legs[k];
        let course = bearing(a, b);
        let on = dest(a, course, rest.min(len));
        let to_go = total - along;
        let off = o.off.as_ref().map_or(0.0, |f| f(to_go));
        let p = if off != 0.0 { dest(on, course + if off > 0.0 { 90.0 } else { -90.0 }, off.abs()) } else { on };
        let alt = o.alt.as_ref().map(|f| f(to_go));
        points.push(json!({"t": t0 + s * 1000.0, "lat": p.0, "lon": p.1, "alt_ft": alt}));
        s += 1.0;
        along = (s * kt) / 3600.0;
    }
    let end = line[line.len() - 1];
    let course = bearing(line[line.len() - 2], end);
    let mut past = 0.0;
    for k in 1..=o.after {
        let k = k as f64;
        past += o.after_kt.as_ref().map_or(kt, |f| f(k)) / 3600.0;
        let p = dest(end, course, past);
        let alt = o.after_alt.as_ref().map(|f| f(k));
        points.push(json!({"t": t0 + (s + k - 1.0) * 1000.0, "lat": p.0, "lon": p.1, "alt_ft": alt}));
    }
    points
}

/// A procedure's way in, as a line to fly: its transition and its final,
/// from 2 nm before its first fix on the course into it.
fn way_in(d: &Value) -> Vec<Ll> {
    let mut line: Vec<Ll> = Vec::new();
    for l in d["lines"].as_array().unwrap() {
        if l["role"] == "missed" {
            continue;
        }
        for p in l["points"].as_array().unwrap().iter().map(ll) {
            if line.last().is_none_or(|&q| nm(q, p) > 0.001) {
                line.push(p);
            }
        }
    }
    let first = dest(line[0], bearing(line[1], line[0]), 2.0);
    std::iter::once(first).chain(line).collect()
}

fn final_of(d: &Value) -> Vec<Ll> {
    let mut f = d.clone();
    let lines: Vec<Value> = d["lines"].as_array().unwrap().iter().filter(|l| l["role"] != "transition").cloned().collect();
    f["lines"] = Value::Array(lines);
    way_in(&f)
}

fn length_of(line: &[Ll]) -> f64 {
    line.windows(2).map(|w| nm(w[0], w[1])).sum()
}

fn gp() -> Value {
    drawing("I08-Y")["runway_path"].clone()
}

fn glidepath_ft(nm_out: f64) -> f64 {
    let p = gp();
    let at = |k: &str| p[k].as_f64().unwrap();
    wingtip_engine::approach::debrief::glidepath_ft(
        &wingtip_engine::approach::RunwayPath { lat: at("lat"), lon: at("lon"), ft: at("ft"), deg: at("deg") },
        nm_out,
    )
}

fn gp_ft() -> f64 {
    gp()["ft"].as_f64().unwrap()
}

/// The ILS flown as charted: 3,700 to SILEX, 3,000 to the glide slope,
/// then down it to the runway.
fn on_ils() -> Box<dyn Fn(f64) -> f64> {
    Box::new(|to_go| glidepath_ft(to_go).min(if to_go > 11.0 { 3700.0 } else { 3000.0 }))
}

/// A missed approach from the runway, its climb begun `wait` s past it.
fn missed_after(wait: f64) -> Box<dyn Fn(f64) -> f64> {
    let ft = gp_ft();
    Box::new(move |s| if s <= wait { ft } else { ft + ((s - wait) * 1000.0) / 60.0 })
}

fn debrief(d: &Value, points: &[Value], minimums: Option<f64>) -> Value {
    ask("approach_debrief", json!({"drawing": d, "points": points, "minimums_ft": minimums}))
}

fn texts(d: &Value) -> Vec<String> {
    d["findings"].as_array().unwrap().iter().map(|f| f["text"].as_str().unwrap().to_owned()).collect()
}

fn findings_toned(d: &Value, tones: &[&str]) -> Vec<Value> {
    d["findings"].as_array().unwrap().iter().filter(|f| tones.contains(&f["tone"].as_str().unwrap())).cloned().collect()
}

fn find(drawings: &[Value], points: &[Value], picked: Option<&str>) -> Vec<Value> {
    ask("approach_find", json!({"drawings": drawings, "points": points, "picked": picked})).as_array().unwrap().clone()
}

fn ils_track(after: usize, wait: f64) -> Vec<Value> {
    fly(&final_of(&drawing("I08-Y")), Fly { alt: Some(on_ils()), after, after_alt: Some(missed_after(wait)), ..Default::default() })
}

fn ils_landing() -> Vec<Value> {
    fly(
        &final_of(&drawing("I08-Y")),
        Fly {
            alt: Some(on_ils()),
            after: 120,
            after_alt: Some(Box::new(|_| 727.0)),
            after_kt: Some(Box::new(|s| (120.0 - s * 3.0).max(5.0))),
            ..Default::default()
        },
    )
}

#[path = "approach/debrief_cases.rs"]
mod debrief_cases;
#[path = "approach/lesson_cases.rs"]
mod lesson_cases;
