//! 61.57(a)(1) and (b)(1) on both sides of their lines: the 90th day and
//! the 91st, a tailwheel to be flown against a tricycle flown, and what
//! the logbook doesn't say.

use super::*;
use crate::coach::due::{due, Standing, Status};

fn entries_of(json: &str) -> Vec<Entry> {
    let v = crate::json::parse(json).unwrap();
    entries("t", v.as_array().unwrap()).unwrap()
}

fn on(iso: &str) -> i64 {
    let (y, m, d) = crate::time::parse_date(iso).unwrap();
    days_from_civil(y, m, d)
}

const SEL: &str = r#""category":"Airplane","class":"Single-engine land""#;

/// The row the coach shows for `key` on `today`.
fn row(entries: &[Entry], flying: Option<Judged>, today: &str, key: &str) -> (Status, String) {
    let dates = Dates { flight_review_on: None, medical_expires_on: None, ipc_on: None, today, flying };
    let standing = Standing { student: false, instrument: false };
    let (rows, _) = due("t", entries, &dates, &standing, &[], on(today), 30).unwrap();
    let d = rows.into_iter().find(|d| d.key == key).unwrap_or_else(|| panic!("no {key}"));
    (d.status, d.detail)
}

#[test]
fn passengers_on_the_90th_day_after_the_third_landing_and_not_the_91st() {
    // 61.57(a)(1): "within the preceding 90 days". Three landings on
    // 13 July 2026: 90 days on is 11 October.
    let e = entries_of(&format!(r#"[{{"flownOn":"2026-07-13","dayLandings":3,{SEL},"tailwheel":false}}]"#));
    assert_eq!(passengers(&e, None, on("2026-10-11")).day_until.as_deref(), Some("2026-10-11"));
    assert_eq!(row(&e, None, "2026-10-11", "day_passengers").0, Status::DueSoon);
    assert_eq!(row(&e, None, "2026-10-12", "day_passengers").0, Status::Lapsed);
}

#[test]
fn night_passengers_on_the_90th_day_and_not_the_91st() {
    // 61.57(b)(1): three to a full stop at night within the preceding 90 days.
    let e = entries_of(&format!(r#"[{{"flownOn":"2026-07-13","dayLandings":0,"nightLandings":3,{SEL},"tailwheel":false}}]"#));
    assert_eq!(row(&e, None, "2026-10-11", "night_passengers").0, Status::DueSoon);
    assert_eq!(row(&e, None, "2026-10-12", "night_passengers").0, Status::Lapsed);
}

#[test]
fn a_tailwheel_to_be_flown_counts_only_full_stops_in_a_tailwheel() {
    // 61.57(a)(1)(ii): "if the aircraft to be flown is an airplane with a
    // tailwheel, the takeoffs and landings must have been made to a full
    // stop in an airplane with a tailwheel". The newest flight, a
    // tricycle's three, counts nothing toward it.
    let e = entries_of(&format!(
        r#"[{{"flownOn":"2026-10-01","dayLandings":3,{SEL},"tailwheel":false}},
            {{"flownOn":"2026-09-01","dayLandings":4,"fullStopLandings":2,{SEL},"tailwheel":true}}]"#
    ));
    let tw = Judged { class: "airplane/single-engine land".into(), tailwheel: Some(true) };
    let p = passengers(&e, Some(&tw), on("2026-10-11"));
    assert_eq!(p.day_until, None);
    assert_eq!(p.day_unknown, None, "every flight says its gear and full stops: lapsed, not unknown");
    let (_, detail) = row(&e, Some(tw), "2026-10-11", "day_passengers");
    assert!(detail.starts_with("Three takeoffs and three landings in a tailwheel"), "{detail}");
    // Judged in the newest flight's tricycle, the same logbook is current,
    // and the tailwheel's own line says it isn't.
    let p = passengers(&e, None, on("2026-10-11"));
    assert_eq!(p.day_until.as_deref(), Some("2026-12-30"));
    assert_eq!(p.tailwheel_until, None);
    assert_eq!(row(&e, None, "2026-10-11", "day_passengers").0, Status::Current);
}

#[test]
fn what_the_logbook_doesnt_say_is_cant_tell_never_current() {
    let e = entries_of(r#"[{"flownOn":"2026-10-01","dayLandings":3}]"#);
    let (status, detail) = row(&e, None, "2026-10-11", "day_passengers");
    assert_eq!(status, Status::Unknown);
    assert!(detail.starts_with("Can't tell"), "{detail}");
    // R7-3: the night row says it too.
    let e = entries_of(r#"[{"flownOn":"2026-10-01","dayLandings":0,"nightLandings":3}]"#);
    let (status, detail) = row(&e, None, "2026-10-11", "night_passengers");
    assert_eq!(status, Status::Unknown);
    assert!(detail.contains("61.57(b)(1)"), "{detail}");
}

#[test]
fn a_flight_not_saying_its_class_counts_toward_none() {
    // Two said SEL and one unsaid: two proven, so lapsed by what's proven,
    // and Can't tell as the unsaid one would make three.
    let e = entries_of(&format!(
        r#"[{{"flownOn":"2026-10-01","dayLandings":2,{SEL},"tailwheel":false}},
            {{"flownOn":"2026-09-30","dayLandings":1}}]"#
    ));
    let p = passengers(&e, None, on("2026-10-11"));
    assert_eq!(p.day_until, None);
    assert_eq!(p.day_unknown.as_deref(), Some("Can't tell: 1 flight in the last 90 days doesn't say the category and class (61.57(a)(1))"));
    // Another class's landings are never hoped for.
    let e = entries_of(&format!(
        r#"[{{"flownOn":"2026-10-01","dayLandings":2,{SEL},"tailwheel":false}},
            {{"flownOn":"2026-09-30","dayLandings":1,"category":"Airplane","class":"Multiengine land"}}]"#
    ));
    assert_eq!(passengers(&e, None, on("2026-10-11")).day_unknown, None);
}
