//! surface_hours held to the Chart Supplement's lines: KPWK's, KOSH's seasons, the ‡ and the days not named.

use super::*;
use crate::json;

const PWK: &str = "CLASS D SVC 0600-2200 MON-FRI, 0700-2200 SAT-SUN; OTHER TIMES CLASS E";

fn week(hours: &str, offset: i32, dst: bool, date: (u32, u32), weekday: usize) -> Vec<Option<Vec<(i32, i32)>>> {
    let s = schedule(hours, offset, dst);
    let dates: Vec<((u32, u32), usize)> =
        (-1..8).map(|k| (date_after(date, 2026, k), (weekday as i32 + k).rem_euclid(7) as usize)).collect();
    days(&s, &dates).into_iter().skip(1).collect()
}

#[test]
fn kpwk_weekdays_and_weekends_with_class_e_at_other_times() {
    // Saturday 14 Nov 2026, CST (UTC-6).
    let w = week(PWK, -360, false, (11, 14), 5);
    assert_eq!(w[0], Some(vec![(420, 1320)])); // Sat 07:00-22:00
    assert_eq!(w[2], Some(vec![(360, 1320)])); // Mon 06:00-22:00
    assert_eq!(schedule(PWK, -360, false).other, Some('E'));
    // At 12:00 in force until 22:00; at 23:00 not, from 07:00 Sunday.
    assert_eq!(now(&w, 720), Some((true, Some((1320, false)))));
    assert_eq!(now(&w, 1380), Some((false, Some((420, true)))));
    assert_eq!(now(&w, 300), Some((false, Some((420, false)))));
}

#[test]
fn utc_times_with_the_double_dagger_keep_their_local_time_all_year() {
    // 1200-0400Z‡ at UTC-6 standard: 06:00-22:00 in CST and in CDT alike.
    let hours = "CLASS D SVC 1200-0400Z++; OTHER TIMES CLASS G";
    assert_eq!(week(hours, -360, false, (1, 5), 0)[0], Some(vec![(360, 1320)]));
    assert_eq!(week(hours, -300, true, (7, 6), 0)[0], Some(vec![(360, 1320)]));
    // Without the ‡ a UTC time moves with the clock: 07:00-23:00 in CDT.
    assert_eq!(week("CLASS D SVC 1200-0400Z; OTHER TIMES CLASS G", -300, true, (7, 6), 0)[0], Some(vec![(420, 1380)]));
}

#[test]
fn seasons_pick_the_hours_of_the_date() {
    // KOSH: 16 MAR-31 OCT 0600-2200, 1 NOV-15 MAR 0600-2100.
    let osh = "CLASS D SVC 16 MAR-31 OCT 0600-2200, 1 NOV-15 MAR 0600-2100; OTHER TIMES CLASS G";
    assert_eq!(week(osh, -360, false, (10, 31), 5)[0], Some(vec![(360, 1320)]));
    assert_eq!(week(osh, -360, false, (10, 31), 5)[1], Some(vec![(360, 1260)]));
    assert_eq!(
        week("CLASS D SVC 0700-2100 OCT-MAR, 0600-2200 APR-SEP; OTHER TIMES CLASS G", -360, false, (4, 1), 2)[0],
        Some(vec![(360, 1320)])
    );
}

#[test]
fn a_span_past_midnight_is_carried_into_the_next_day() {
    let w = week("CLASS D SVC 1800-0200; OTHER TIMES CLASS G", -360, false, (11, 16), 0);
    assert_eq!(w[1], Some(vec![(0, 120), (1080, 1440)]));
    assert_eq!(now(&w, 1200), Some((true, Some((120, true)))));
}

#[test]
fn days_not_named_are_closed_and_what_cannot_be_read_is_not_known() {
    let w = week("CLASS D SVC 0700-1900 MON-FRI; OTHER TIMES CLASS G", -360, false, (11, 14), 5);
    assert_eq!(w[0], Some(vec![]));
    assert_eq!(now(&w, 720), Some((false, None))); // closed Saturday and Sunday
    for hours in [
        "CLASS D SVC 0600-2200 MON-FRI, CLSD HOL; OTHER TIMES CLASS G", "CLASS D SVC BY NOTAM; OTHER TIMES CLASS G",
        "CLASS D AIRSPACE SR-SS; OTHER TIMES CLASS G", "",
    ] {
        assert!(schedule(hours, -360, false).items.is_none(), "{hours}");
    }
    assert_eq!(schedule("CLASS D SVC BY NOTAM; OTHER TIMES CLASS G", -360, false).other, Some('G'));
}

#[test]
fn the_rule_answers_its_contract() {
    let v = json::parse(&format!(
        r#"{{"hours":"{PWK}","year":2026,"month":11,"day":14,"weekday":5,"minute":720,"utc_offset_min":-360,"dst":false}}"#
    ))
    .unwrap();
    let out = call("surface_hours", &v).unwrap();
    assert!(out.starts_with(r#"{"known":true,"other":"E","days":[{"weekday":5,"spans":[{"from":420,"to":1320}]},"#), "{out}");
    assert!(out.ends_with(r#""in_force":true,"change":{"at":1320,"next_day":false}}"#), "{out}");
}

#[test]
fn a_class_named_after_the_hours_without_a_semicolon_and_a_month_s_days() {
    let c = schedule("CLASS C SVC 0530-2300 OTHER TIMES CLASS G", -360, false);
    assert_eq!(c.other, Some('G'));
    assert!(c.items.is_some());
    let line =
        "CLASS D SVC MAR 15-APR 30 0700-1930; MAY 1-AUG 31 0700-2000; SEP 1-30 0700-1900; OCT 1-MAR 14 0700-1800; OTHER TIMES CLASS E";
    assert_eq!(week(line, -300, true, (9, 30), 2)[0], Some(vec![(420, 1140)]));
    assert_eq!(week(line, -300, true, (9, 30), 2)[1], Some(vec![(420, 1080)]));
}
