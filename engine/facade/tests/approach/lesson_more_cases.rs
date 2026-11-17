use super::lesson_cases::{bare, brief, by_key, kdlh};
use super::*;

#[test]
fn the_brief_says_the_airplanes_category() {
    let b = brief(json!({"drawing": kdlh(), "vso_kt": 48}));
    assert_eq!(by_key(&b, "minimums")["lines"], json!(["DA: see the plate", "Category A"]));
}

#[test]
fn the_brief_says_see_the_plate_and_makes_up_nothing() {
    let b = brief(json!({"drawing": bare()}));
    assert_eq!(by_key(&b, "frequencies")["lines"], json!(["See the plate"]));
    assert_eq!(by_key(&b, "course")["lines"], json!(["See the plate"]));
    assert_eq!(by_key(&b, "missed")["lines"], json!(["See the plate"]));
    assert_eq!(by_key(&b, "minimums")["lines"], json!(["MDA: see the plate"]));
    assert!(by_key(&b, "approach")["lines"].as_array().unwrap().contains(&json!("Vectors to final")));
    assert_eq!(by_key(&b, "fix:BBBBB")["title"], "Step-Down Fix");
    assert!(by_key(&b, "fix:AAAAA")["lines"].as_array().unwrap().contains(&json!("Descend to the MDA from here")));
    assert_eq!(by_key(&b, "map")["lines"], json!(["The runway 27 threshold (MAP)"]));
}

#[test]
fn the_brief_says_a_procedures_data_are_out_of_date() {
    let mut stale = kdlh();
    stale["stale"] = json!(true);
    assert!(brief(json!({"drawing": stale}))[0]["lines"]
        .as_array()
        .unwrap()
        .contains(&json!("Out of date: these are an older cycle's data")));
}

pub(super) fn coach(d: Value, gs: f64) -> Vec<Value> {
    ask("approach_coaching", json!({"drawing": d, "gs_kt": gs})).as_array().unwrap().clone()
}

pub(super) fn path_of(d: Value) -> Value {
    ask("approach_lesson_path", json!({"drawing": d}))
}

pub(super) fn along(path: &Value, lat: f64, lon: f64) -> f64 {
    ask("approach_along_nm", json!({"path": path, "at": {"lat": lat, "lon": lon}})).as_f64().unwrap()
}

#[test]
fn coaching_flies_the_approach_fix_by_fix() {
    let steps = coach(kdlh(), 90.0);
    let keys: Vec<&str> = steps.iter().map(|s| s["key"].as_str().unwrap()).collect();
    assert_eq!(keys, ["fix:DLH", "fix:DL", "fix:CFBSJ", "fix:PYKLA", "decision", "missed"]);
    let faf = &steps[3];
    assert_eq!(faf["title"], "Crossing PYKLA (FAF)");
    assert_eq!(faf["say"], "Descend on the 3.00° path, about 480 ft/min at 90 kt, and start the timer.");
    // PYKLA to the threshold along the line, and the time at 90 kt.
    let path = path_of(kdlh());
    let miles = along(&path, 46.842, -92.21) - along(&path, 46.84, -92.30);
    let secs = ((miles / 90.0) * 3600.0).round() as i64;
    assert_eq!(
        faf["why"],
        json!(format!(
            "The final approach starts here. {miles:.1} nm to the missed approach point: {}:{:02} at 90 kt.",
            secs / 60,
            secs % 60
        ))
    );
    assert_eq!(steps[2]["say"], "Cross CFBSJ at or above 3,300 ft and turn onto the final approach course, 093°.");
    assert_eq!(steps[4]["title"], "At the Decision Altitude");
    assert!(steps[4]["say"].as_str().unwrap().starts_with("Runway in sight? Land. Otherwise go missed: climb to 3,000 on course 093°"));
    assert_eq!(steps[5]["focus"], json!({"fix": "CHERL", "segment": "missed"}));
    assert_eq!(steps[5]["at"], json!({"lat": 47.0, "lon": -92.1}));
}

#[test]
fn coaching_gives_the_descent_rate_for_the_ground_speed_picked() {
    assert!(coach(kdlh(), 120.0)[3]["say"].as_str().unwrap().contains("about 640 ft/min at 120 kt"));
}

#[test]
fn coaching_steps_down_where_there_is_no_path() {
    let steps = coach(bare(), 90.0);
    let keys: Vec<&str> = steps.iter().map(|s| s["key"].as_str().unwrap()).collect();
    assert_eq!(keys, ["fix:AAAAA", "fix:BBBBB", "fix:CCCCC", "decision"]);
    assert_eq!(steps[0]["say"], "Descend to 1,900 at BBBBB and start the timer.");
    assert_eq!(steps[1]["say"], "Cross BBBBB at or above 1,900 ft, then descend to 1,520 at CCCCC.");
    assert_eq!(steps[2]["say"], "Cross CCCCC at or above 1,520 ft, then descend to the MDA (see the plate).");
    assert_eq!(steps[3]["title"], "At the Missed Approach Point");
    assert_eq!(steps[3]["say"], "Runway in sight? Land. Otherwise go missed: fly the missed approach the plate shows.");
}

pub(super) fn quiz(d: Value, gs: f64) -> Vec<Value> {
    ask("approach_quiz", json!({"drawing": d, "gs_kt": gs})).as_array().unwrap().clone()
}

pub(super) fn answer(q: &Value) -> Value {
    q["choices"][q["answer"].as_u64().unwrap() as usize].clone()
}

#[test]
fn the_quiz_asks_from_the_procedures_own_data() {
    let q = quiz(kdlh(), 90.0);
    let keys: Vec<&str> = q.iter().map(|q| q["key"].as_str().unwrap()).collect();
    assert_eq!(keys, ["alt:DL", "alt:CFBSJ", "alt:PYKLA", "faf", "course", "descent", "decision", "missed-fix"]);
    assert_eq!(answer(&by_key(&q, "faf")), "PYKLA");
    assert!(by_key(&q, "course")["choices"].as_array().unwrap().contains(&json!("093°")));
    assert_eq!(answer(&by_key(&q, "descent")), "480 ft/min");
    assert_eq!(answer(&by_key(&q, "missed-fix")), "CHERL");
}

#[test]
fn the_quiz_never_offers_the_answer_as_a_wrong_choice_nor_any_choice_twice() {
    for d in [kdlh(), bare()] {
        for q in quiz(d, 90.0) {
            let choices = q["choices"].as_array().unwrap();
            let mut seen = choices.clone();
            seen.dedup();
            wingtip_engine::sort::StableSort::stable_sort_by_key(&mut seen[..], |c| c.to_string());
            seen.dedup();
            assert_eq!(seen.len(), choices.len());
            assert_eq!(choices.iter().filter(|c| **c == answer(&q)).count(), 1);
            assert!((2..=4).contains(&choices.len()));
        }
    }
}

#[test]
fn the_quiz_puts_the_answer_in_the_same_place_each_time() {
    assert_eq!(quiz(kdlh(), 90.0), quiz(kdlh(), 90.0));
    // The place is FNV-1a over the key's UTF-16 units, as the web hashed
    // it: "faf" hashes to 2,969,044,746, 2 mod 4 with three wrong choices.
    assert_eq!(by_key(&quiz(kdlh(), 90.0), "faf")["answer"], json!(2));
}

#[test]
fn the_quiz_asks_nothing_it_cannot_offer_a_wrong_choice_for() {
    let mut lone = bare();
    let first = lone["fixes"][0].clone();
    lone["fixes"] = json!([first]);
    assert_eq!(quiz(lone, 90.0), Vec::<Value>::new());
}

#[test]
fn the_lessons_line_runs_transition_final_missed() {
    let path = path_of(kdlh());
    assert_eq!(path.as_array().unwrap().len(), 7);
    let leg = ask("approach_path_between", json!({"path": path, "a": {"lat": 46.84, "lon": -92.36}, "b": {"lat": 46.84, "lon": -92.30}}));
    assert_eq!(leg, json!([{"lat": 46.84, "lon": -92.36}, {"lat": 46.84, "lon": -92.33}, {"lat": 46.84, "lon": -92.30}]));
    let empty = ask("approach_path_between", json!({"path": [], "a": {"lat": 1, "lon": 1}, "b": {"lat": 2, "lon": 2}}));
    assert_eq!(empty.as_array().unwrap().len(), 2);
}

#[test]
fn the_side_view_draws_the_path_down_from_the_fafs_altitude() {
    let p = ask("approach_profile", json!({"drawing": kdlh()}));
    let idents: Vec<&str> = p["marks"].as_array().unwrap().iter().map(|m| m["ident"].as_str().unwrap()).collect();
    assert_eq!(idents, ["DLH", "DL", "CFBSJ", "PYKLA", "RW09"]);
    assert!(p["marks"][4]["ft"].is_null());
    // 318 ft a mile on 3.00°, from 3,300 at PYKLA.
    let miles = p["path"]["to"]["nm"].as_f64().unwrap() - p["path"]["from"]["nm"].as_f64().unwrap();
    assert_eq!(p["path"]["from"]["ft"], json!(3300.0));
    assert!((p["path"]["to"]["ft"].as_f64().unwrap() - (3300.0 - miles * 318.4)).abs() < 5.0);
    assert!(ask("approach_profile", json!({"drawing": bare()}))["path"].is_null());
}
