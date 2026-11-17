use super::flight_cases::{airport, c81_kdlh, leg, nav_log_rows};
use super::*;

// --- The dry run -------------------------------------------------------------

pub(super) struct Run(Value);

impl Run {
    fn of(rows: &Value, line: Option<Value>, missed: bool) -> Run {
        Run(ask("dry_run", json!({ "rows": rows, "start_s": 1000, "line": line, "missed": missed })))
    }
    fn points(&self) -> &Vec<Value> {
        self.0["points"].as_array().unwrap()
    }
    fn along(&self, i: usize) -> f64 {
        n(&self.0["along_nm"][i])
    }
    fn last(&self) -> &Value {
        self.points().last().unwrap()
    }
    fn first_at_or_past(&self, nm: f64) -> &Value {
        let i = (0..self.points().len()).find(|&i| self.along(i) >= nm).unwrap();
        &self.points()[i]
    }
    fn at(&self, lat: f64, lon: f64) -> Option<&Value> {
        self.points().iter().find(|p| distance_nm(n(&p["lat"]), n(&p["lon"]), lat, lon) < 0.05)
    }
}

#[test]
fn the_planned_flight_flown_on_paper() {
    let rows = c81_kdlh(&[leg()]);
    let run = Run::of(&rows, None, false);
    // Leaves the field at the start, its height the field's; lands at the
    // end of the legs' time.
    let first = &run.points()[0];
    assert_eq!((n(&first["t"]), n(&first["lat"]), n(&first["alt_ft"])), (1000.0, 42.0, 800.0));
    assert!(close(n(&run.last()["t"]), 1000.0 + 36.0 * 60.0, 1e-6));
    assert!(close(n(&run.last()["lat"]), 43.0, 1e-9));
    assert_eq!(n(&run.last()["alt_ft"]), 500.0);
    // At the plan's altitude level between its top of climb and descent.
    let level: Vec<&Value> =
        (0..run.points().len()).filter(|&i| run.along(i) > 8.0 && run.along(i) < 48.0).map(|i| &run.points()[i]).collect();
    assert!(level.len() > 5);
    assert!(level.iter().all(|p| n(&p["alt_ft"]) == 5500.0));
    // At a standstill on the field at the end, where the alerts ahead take
    // it as landed.
    assert_eq!(n(&run.last()["gs_kt"]), 0.0);
    assert!(n(&run.points()[run.points().len() - 2]["gs_kt"]) > 0.0);
    // What is left and burnt: the whole 60 nm and 5 gallons.
    assert!(close(run.along(run.points().len() - 1), 60.0, 1e-9));
    assert!(close(n(run.0["fuel_gal"].as_array().unwrap().last().unwrap()), 5.0, 1e-9));
    // Each of the log's rows reached in turn.
    let row_t = run.0["row_t"].as_array().unwrap();
    assert_eq!(row_t.len(), rows.as_array().unwrap().len());
    assert_eq!(n(&row_t[0]), 1000.0);
    assert!(close(n(row_t.last().unwrap()), 1000.0 + 36.0 * 60.0, 1e-6));
}

#[test]
fn the_dry_run_flies_the_course_line_the_map_draws() {
    // A line bent east at its middle: half way along the legs, the airplane
    // is at the bend, on the line, whatever the rows' points say.
    let rows = c81_kdlh(&[leg()]);
    let run = Run::of(&rows, Some(json!([[42, -88], [42.5, -87.9], [43, -88]])), false);
    let half = run.first_at_or_past(30.0);
    assert!(close(n(&half["lat"]), 42.5, 0.005) && close(n(&half["lon"]), -87.9, 0.005), "{half}");
    assert!(close(n(&run.last()["lat"]), 43.0, 1e-9) && close(n(&run.last()["lon"]), -88.0, 1e-9));
    // Its track the line's own: north-east on the way to the bend.
    let early = n(&run.first_at_or_past(10.0)["track_deg"]);
    assert!(early > 0.0 && early < 90.0, "{early}");
}

// The leg in to the test's Duluth (43 N, 88 W) flown by an RNAV (GPS) RWY
// 27, as the planner gives it (with_procedures): from the leg's start at
// C81 out to its IAF, PLANE, south-east of the field, north to HOMUV (at
// or above 2,500), west to its FAF, CIRUS (1,900), and on to the runway;
// its missed approach west to a hold at UDTEG (3,300).
pub(super) const C81: (f64, f64) = (42.0, -88.0);
pub(super) const PLANE: (f64, f64) = (42.9, -87.8);
pub(super) const HOMUV: (f64, f64) = (43.0, -87.8);
pub(super) const CIRUS: (f64, f64) = (43.0, -87.9);
pub(super) const RUNWAY: (f64, f64) = (43.0, -88.0);
pub(super) const UDTEG: (f64, f64) = (43.0, -88.3);

pub(super) fn nm(a: (f64, f64), b: (f64, f64)) -> f64 {
    distance_nm(a.0, a.1, b.0, b.1)
}

pub(super) fn path_nm() -> f64 {
    nm(C81, PLANE) + nm(PLANE, HOMUV) + nm(HOMUV, CIRUS) + nm(CIRUS, RUNWAY)
}

pub(super) fn path_json(points: &[(f64, f64)]) -> Value {
    Value::Array(points.iter().map(|p| json!([p.0, p.1])).collect())
}

pub(super) fn procedure(ft: Value) -> Value {
    let more_nm = path_nm() - 60.0;
    let more_min = (more_nm / 100.0) * 60.0;
    json!({
        "path": path_json(&[C81, PLANE, HOMUV, CIRUS, RUNWAY]),
        "ft": ft, "nm": path_nm(), "landing": true, "final_at": 3, "map_at": 4,
        "missed": { "path": [[UDTEG.0, UDTEG.1]], "ft": 3300 }, "more_nm": more_nm, "more_min": more_min, "more_gal": (more_min / 60.0) * 8.0,
    })
}

pub(super) fn flown_leg(p: Value) -> Value {
    let more_min = n(&p["more_min"]);
    let mut l = leg();
    l["ete_min"] = json!(36.0 + more_min);
    l["fuel_gal"] = json!(5.0 + (more_min / 60.0) * 8.0);
    l["procedure"] = p;
    l
}

#[test]
fn a_leg_flown_by_its_procedures_follows_their_path_and_the_charts_altitudes() {
    let p = procedure(json!([null, null, 2500, 1900, null]));
    let more_min = n(&p["more_min"]);
    let rows = c81_kdlh(&[flown_leg(p)]);
    let run = Run::of(&rows, None, false);
    // The whole leg along their path, out to the IAF and down to the runway.
    assert!(path_nm() - 60.0 > 5.0);
    for fix in [PLANE, HOMUV, CIRUS] {
        assert!(run.at(fix.0, fix.1).is_some(), "{fix:?}");
    }
    assert!(close(n(&run.last()["lat"]), 43.0, 1e-9) && close(n(&run.last()["lon"]), -88.0, 1e-9));
    assert_eq!(n(&run.last()["alt_ft"]), 500.0);
    assert!(run.points().iter().all(|q| n(&q["lon"]) > -88.01));
    // Westbound on its final.
    let total = run.along(run.points().len() - 1);
    let final_track = n(&run.first_at_or_past(total - 3.0)["track_deg"]);
    assert!(final_track > 265.0 && final_track < 275.0, "{final_track}");
    // Climbs as planned, holds its cruise, crosses each fix at its altitude.
    let climbing = n(&run.first_at_or_past(4.0)["alt_ft"]);
    assert!(climbing > 800.0 && climbing < 5500.0);
    assert_eq!(n(&run.first_at_or_past(20.0)["alt_ft"]), 5500.0);
    assert!(close(n(&run.at(HOMUV.0, HOMUV.1).unwrap()["alt_ft"]), 2500.0, 0.5));
    assert!(close(n(&run.at(CIRUS.0, CIRUS.1).unwrap()["alt_ft"]), 1900.0, 0.5));
    // Down the last of it from the FAF, never climbing.
    let from_faf: Vec<f64> =
        (0..run.points().len()).filter(|&i| run.along(i) >= total - nm(CIRUS, RUNWAY)).map(|i| n(&run.points()[i]["alt_ft"])).collect();
    assert!(from_faf.windows(2).all(|w| w[1] <= w[0]));
    // The planner's time and fuel, its miles more in them; the tops of
    // climb and descent passed as it starts.
    assert!(close(total, path_nm(), 1e-6));
    assert!(close(n(&run.last()["t"]), 1000.0 + (36.0 + more_min) * 60.0, 1e-6));
    assert!(close(n(run.0["fuel_gal"].as_array().unwrap().last().unwrap()), 5.0 + (more_min / 60.0) * 8.0, 1e-9));
    let kinds: Vec<&str> = rows.as_array().unwrap().iter().map(|r| r["kind"].as_str().unwrap()).collect();
    assert_eq!(kinds, ["departure", "toc", "tod", "destination"]);
    let row_t: Vec<f64> = run.0["row_t"].as_array().unwrap().iter().map(n).collect();
    assert_eq!(row_t[..3], [1000.0, 1000.0, 1000.0]);
    assert!(close(row_t[3], n(&run.last()["t"]), 1e-6));
    // The route's distance laid evenly over the path (the web's runNmAt reads these bends).
    assert_eq!(norm(&run.0["bends"][3]), json!({ "route": 60.0, "run": total }));
    // Its final from CIRUS to the runway, while Go missed is there.
    assert_eq!(run.0["missable"], json!(true));
    assert!(close(n(&run.0["final"]["from"]), n(&run.at(CIRUS.0, CIRUS.1).unwrap()["t"]), 1.0));
    assert!(close(n(&run.0["final"]["to"]), n(&run.last()["t"]), 1e-6));
}

#[test]
fn the_plans_cruise_stands_where_the_chart_sets_a_fix_over_it() {
    // PLANE at 12,000 (BENKY6's at O'Hare): flown at 5,500, not climbed to.
    let rows = c81_kdlh(&[flown_leg(procedure(json!([null, 12000, 2500, 1900, null])))]);
    let run = Run::of(&rows, None, false);
    let top = run.points().iter().map(|q| q["alt_ft"].as_f64().unwrap_or(0.0)).fold(f64::MIN, f64::max);
    assert_eq!(top, 5500.0);
}

#[test]
fn going_missed_flies_on_from_the_missed_approach_point_climbing_200_ft_a_mile() {
    let rows = c81_kdlh(&[flown_leg(procedure(json!([null, null, 2500, 1900, null])))]);
    let landed = Run::of(&rows, None, false);
    let missed = Run::of(&rows, None, true);
    let out = nm(RUNWAY, UDTEG);
    // The same flight to the runway, at the same moments.
    let map_index = landed.points().len() - 1;
    let at_map = &missed.points()[map_index];
    assert!(close(n(&at_map["lat"]), 43.0, 1e-9) && close(n(&at_map["lon"]), -88.0, 1e-9));
    assert!(close(n(&at_map["alt_ft"]), 500.0, 0.5));
    assert!(close(n(&at_map["t"]), n(&landed.last()["t"]), 1e-6));
    // Then out west to UDTEG, climbing from the field's 500 at the standard
    // gradient, short of its 3,300 there; ending in the air, still flying.
    let end = missed.last();
    assert!(close(n(&end["lat"]), 43.0, 0.005) && close(n(&end["lon"]), -88.3, 0.005));
    assert!(close(n(&end["alt_ft"]), 500.0 + out * 200.0, 0.5));
    assert!(close(missed.along(missed.points().len() - 1), landed.along(map_index) + out, 1e-6));
    assert!(n(&end["gs_kt"]) > 0.0);
}

#[test]
fn going_missed_from_a_map_short_of_the_runway_climbs_from_the_height_there() {
    // A LOC's MAP a mile and a half short of the threshold (the audit of
    // 2026-10-21).
    let map = (43.0, -87.965);
    let mut p = procedure(json!([null, null, 2500, 1900, null, null]));
    p["path"] = path_json(&[C81, PLANE, HOMUV, CIRUS, map, RUNWAY]);
    p["map_at"] = json!(4);
    let rows = c81_kdlh(&[flown_leg(p)]);
    let landed = Run::of(&rows, None, false);
    assert!(close(n(&landed.last()["lat"]), 43.0, 1e-9) && close(n(&landed.last()["lon"]), -88.0, 1e-9));
    assert_eq!(n(&landed.last()["alt_ft"]), 500.0);
    assert!(n(&landed.0["final"]["to"]) < n(&landed.last()["t"]));
    let gone = Run::of(&rows, None, true);
    let i = gone.points().iter().position(|q| distance_nm(n(&q["lat"]), n(&q["lon"]), map.0, map.1) < 0.01).unwrap();
    assert!(i > 0);
    let map_ft = n(&gone.points()[i]["alt_ft"]);
    assert!(map_ft > 600.0);
    assert!(close(n(&gone.points()[i]["t"]), n(&landed.0["final"]["to"]), 5.0));
    assert!(!gone.points().iter().any(|q| distance_nm(n(&q["lat"]), n(&q["lon"]), RUNWAY.0, RUNWAY.1) < 0.05));
    assert!(gone.points()[i..].iter().all(|q| n(&q["alt_ft"]) > map_ft - 10.0));
    assert!(close(n(&gone.last()["lat"]), 43.0, 1e-9) && close(n(&gone.last()["lon"]), -88.3, 1e-9));
}

#[test]
fn a_departure_alone_lays_the_plans_heights_along_its_path() {
    let mut l = leg();
    l["procedure"] = json!({
        "path": [[42, -88], [42.1, -88.1], [42.3, -88.1], [43, -88]], "ft": [null, null, null, null], "nm": 0, "landing": false,
        "final_at": null, "map_at": null, "missed": null, "more_nm": 0, "more_min": 0, "more_gal": 0,
    });
    let run = Run::of(&c81_kdlh(&[l]), None, false);
    assert!(run.at(42.1, -88.1).is_some());
    assert!(close(n(&run.last()["lat"]), 43.0, 1e-9));
    assert_eq!(n(&run.last()["alt_ft"]), 500.0);
    let top = run.points().iter().map(|q| n(&q["alt_ft"])).fold(f64::MIN, f64::max);
    assert_eq!(top, 5500.0);
    assert_eq!(run.0["missable"], json!(false));
    assert_eq!(run.0["final"], Value::Null);
}

#[test]
fn the_dry_run_knows_each_landing() {
    // C81 to a stop 60 nm north and on 60 nm to the destination, each flight
    // 36 minutes and 5 gallons, level.
    let mut level = leg();
    level["toc"] = Value::Null;
    level["tod"] = Value::Null;
    level["climb_min"] = json!(0);
    let rows =
        nav_log_rows(&[airport("C81", 42.0, 800.0), airport("KJVL", 43.0, 800.0), airport("KDLH", 44.0, 500.0)], &[level.clone(), level]);
    let run = Run::of(&rows, None, false);
    let landings = run.0["landings"].as_array().unwrap();
    assert_eq!(landings.iter().map(|l| l["ident"].as_str().unwrap()).collect::<Vec<_>>(), ["KJVL", "KDLH"]);
    assert!(close(n(&landings[0]["t"]), 1000.0 + 36.0 * 60.0, 1e-6));
    assert!(close(n(&landings[0]["nm"]), 60.0, 1e-9));
    assert!(close(n(&landings[0]["fuel"]), 5.0, 1e-9));
    assert!(close(n(&landings[1]["t"]), 1000.0 + 72.0 * 60.0, 1e-6));
    assert!(close(n(&landings[1]["nm"]), 120.0, 1e-9));
}

#[test]
fn a_hold_before_landing_is_flown_round_its_racetrack_in_the_planners_time() {
    // Over the destination, two turns of a lap of four minutes, a racetrack
    // a few miles east of the field: eight minutes and a gallon more.
    let mut held = leg();
    held["ete_min"] = json!(44);
    held["fuel_gal"] = json!(6);
    held["hold"] = json!({
        "fix": "KDLH", "inbound_deg": 270, "right": true, "leg_min": 1, "leg_nm": null, "turns": 2, "minutes": 8, "lap_min": 4, "gal": 1,
        "entry": "direct", "path": [[43, -88], [43.02, -87.98], [43.02, -87.9], [43, -87.92], [43, -88]], "at_end": true,
    });
    let run = Run::of(&c81_kdlh(&[held]), None, false);
    assert!(close(n(&run.last()["t"]), 1000.0 + 44.0 * 60.0, 1e-6));
    assert!(close(n(run.0["fuel_gal"].as_array().unwrap().last().unwrap()), 6.0, 1e-9));
    assert!(run.points().iter().map(|q| n(&q["lon"])).fold(f64::MIN, f64::max) > -87.95);
    assert!(close(n(&run.last()["lat"]), 43.0, 1e-9) && close(n(&run.last()["lon"]), -88.0, 1e-9));
    // The field's row reached when the hold is flown, and half way round it
    // still at the hold's height.
    assert!(close(n(run.0["row_t"].as_array().unwrap().last().unwrap()), 1000.0 + 44.0 * 60.0, 1e-6));
    let mid = run.points().iter().find(|q| n(&q["t"]) >= 1000.0 + 40.0 * 60.0).unwrap();
    assert!(n(&mid["alt_ft"]) > 500.0);
}

#[test]
fn no_run_without_a_departure_or_a_leg() {
    let empty = Run::of(&json!([]), None, false);
    assert!(empty.points().is_empty());
    let no_leg = Run::of(&c81_kdlh(&[]), None, false);
    assert!(no_leg.points().is_empty());
    assert!(call("dry_run", r#"{"rows": [{"kind": "nope"}], "start_s": 0}"#).is_err());
    assert!(call("dry_run", r#"{"rows": []}"#).is_err());
}
