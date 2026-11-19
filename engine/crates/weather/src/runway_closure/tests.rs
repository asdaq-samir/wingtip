//! The crosses' places worked by hand from AC 150/5340-1M 5.6 and 5.7 and
//! AIM 2-3-6, on runways laid out in feet: 09/27 along the x axis, 4,000
//! ft from (0, 0) to (4000, 0), and Xs of half size 30 ft.

use super::*;

fn strip(ends: [&str; 2], a: [f64; 2], b: [f64; 2], permanent: bool, notams: &[&str]) -> Strip {
    Strip {
        ends: [ends[0].to_owned(), ends[1].to_owned()],
        a,
        b,
        width_ft: 100.0,
        permanent,
        notams: notams.iter().map(|n| (*n).to_owned()).collect(),
    }
}

const CLOSED: &str = "!ABC 11/001 ABC RWY 09/27 CLSD 2611101200-2611121432";

fn nine_27(permanent: bool, notams: &[&str]) -> Strip {
    strip(["09", "27"], [0.0, 0.0], [4000.0, 0.0], permanent, notams)
}

/// 18/36 across 09/27 at `x` feet from the 09 end, 2,000 ft long.
fn across(x: f64) -> Strip {
    strip(["18", "36"], [x, 1000.0], [x, -1000.0], false, &[])
}

#[test]
fn a_notams_closure_has_an_x_at_each_end_only() {
    // AIM 2-3-6e: "only at each end"; over the designation, 50 ft in.
    let got = marks(&[nine_27(false, &[CLOSED])], 30.0);
    assert_eq!(got[0], Marked { closed: vec![(0.0, 4000.0)], marks: vec![50.0, 3950.0] });
}

#[test]
fn a_permanent_closure_has_them_every_1000_ft_too() {
    // AC 5.6: each end and 1,000-ft intervals from it.
    let got = marks(&[nine_27(true, &[])], 30.0);
    assert_eq!(got[0].marks, vec![50.0, 1050.0, 2050.0, 3050.0, 3950.0]);
}

#[test]
fn a_permanent_closure_flanks_an_open_runway_and_never_crosses_it() {
    // 18/36, 100 ft wide, across at 1,000 ft: its sides and the X's 30 ft
    // keep 920 to 1080 clear; an X each side (AC 5.6), the 1,050 one gone.
    let got = marks(&[nine_27(true, &[]), across(1000.0)], 30.0);
    assert_eq!(got[0].marks, vec![50.0, 920.0, 1080.0, 2050.0, 3050.0, 3950.0]);
    assert_eq!(got[1], Marked::default());
}

#[test]
fn an_end_x_on_an_open_runway_moves_along_clear_of_it() {
    // 18/36 across at 60 ft: the end's X at 50 ft would sit on it.
    let got = marks(&[nine_27(false, &[CLOSED]), across(60.0)], 30.0);
    assert_eq!(got[0].marks, vec![140.0, 3950.0]);
}

#[test]
fn an_x_with_no_room_its_own_way_moves_the_other() {
    // The east 200 ft closed (3,800 to 4,000), an open runway across at
    // 3,880 keeping 3,800 to 3,960 clear: the 27 end's X, at 3,950, has no
    // room back toward 3,800 inside the part, so it goes to 3,960; the
    // inner edge's goes there too, and one X is enough where two would
    // lie on each other.
    let part = nine_27(false, &["!ABC 11/009 ABC RWY 09/27 E 200FT CLSD 2611101200-2611121432"]);
    let got = marks(&[part, across(3880.0)], 30.0);
    assert_eq!(got[0].marks, vec![3960.0]);
}

#[test]
fn an_open_runway_at_an_end_moves_its_x_and_a_closed_one_is_no_bar() {
    let open = across(3960.0);
    let closed_too = strip(["18", "36"], [50.0, 1000.0], [50.0, -1000.0], true, &[]);
    let got = marks(&[nine_27(false, &[CLOSED]), open, closed_too], 30.0);
    // 3,950 is on the open 18/36 at 3,960 (3,880 to 4,040 kept off): back
    // to 3,880. The closed one at 50 ft takes no room from it, nor it
    // from the closed one, whose Xs are its ends and 1,000-ft intervals.
    assert_eq!(got[0].marks, vec![50.0, 3880.0]);
    assert_eq!(got[2].marks, vec![50.0, 1050.0, 1950.0]);
}

#[test]
fn a_permanent_closure_crossing_two_open_runways_keeps_off_both() {
    // Across at 1,000 and 3,000 ft: Xs each side of each (AC 5.6), the
    // 1,000-ft intervals that would lie on them (1,050, 3,050) left out.
    let got = marks(&[nine_27(true, &[]), across(1000.0), across(3000.0)], 30.0);
    assert_eq!(got[0].marks, vec![50.0, 920.0, 1080.0, 2050.0, 2920.0, 3080.0, 3950.0]);
}

#[test]
fn a_part_closed_is_marked_at_its_own_ends() {
    // The east 500 ft of 09/27 is the 27 end's: 3,500 to 4,000; its inner
    // edge's X the X's own size in, its threshold's 50 ft.
    let got = marks(&[nine_27(false, &["!ABC 11/002 ABC RWY 09/27 E 500FT CLSD 2611101200-2611121432"])], 30.0);
    assert_eq!(got[0], Marked { closed: vec![(3500.0, 4000.0)], marks: vec![3530.0, 3950.0] });
    let first = marks(&[nine_27(false, &["!ABC 11/003 ABC RWY 27 FIRST 1000FT CLSD 2611101200-2611121432"])], 30.0);
    assert_eq!(first[0].closed, vec![(3000.0, 4000.0)]);
    let last = marks(&[nine_27(false, &["!ABC 11/004 ABC RWY 27 LAST 1000FT CLSD 2611101200-2611121432"])], 30.0);
    assert_eq!(last[0].closed, vec![(0.0, 1000.0)]);
}

#[test]
fn what_cannot_be_placed_or_is_no_closure_is_not_drawn() {
    // East of a north-south runway names no end; closed at times is not closed.
    let north_south =
        strip(["18", "36"], [0.0, 2000.0], [0.0, -2000.0], false, &["!ABC 11/005 ABC RWY 18/36 E 500FT CLSD 2611101200-2611121432"]);
    let at_times = nine_27(false, &["!ABC 11/006 ABC RWY 09/27 CLSD DLY 0400-1100 2611101200-2611121432"]);
    let other = nine_27(false, &["!ABC 11/007 ABC RWY 18/36 CLSD 2611101200-2611121432"]);
    for got in marks(&[north_south, at_times, other], 30.0) {
        assert_eq!(got, Marked::default());
    }
    // Closed between a taxiway and an end: no taxiway to place, so whole.
    let between = marks(&[nine_27(false, &["!ABC 11/008 ABC RWY 09/27 CLSD BTN TWY A AND RWY END 27 2611101200-2611121432"])], 30.0);
    assert_eq!(between[0].closed, vec![(0.0, 4000.0)]);
}

#[test]
fn the_answer_is_fractions_of_the_runway() {
    let v = json::parse(r#"{"mark_ft":30,"runways":[{"ends":["09","27"],"a":[0,0],"b":[4000,0],"width_ft":100,"permanent":false,"notams":["!ABC 11/001 ABC RWY 09/27 CLSD 2611101200-2611121432"]}]}"#).unwrap();
    assert_eq!(call("runway_closure_marks", &v).unwrap(), r#"{"runways":[{"closed":[[0.0,1.0]],"marks":[0.0125,0.9875]}]}"#);
    assert!(call("runway_closure_marks", &json::parse(r#"{"mark_ft":1,"runways":[{"a":[0,0]}]}"#).unwrap()).is_err());
}
