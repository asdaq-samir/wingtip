//! The sketch's layout worked by hand: a minute of latitude is a nautical
//! mile on the engine's flat frame, a minute of longitude cos(latitude) of
//! one, and a runway's length over 6,076.12 ft a nautical mile.

use super::*;

fn end(at: Option<(f64, f64)>, heading: Option<f64>) -> End {
    End { at, heading_true_deg: heading }
}

fn runway(ends: &[End], length_ft: f64, width_ft: Option<f64>) -> Runway {
    Runway { ends: ends.to_vec(), length_ft: Some(length_ft), width_ft }
}

#[test]
fn a_surveyed_runway_lies_between_its_ends() {
    // 18/36: the 18 end a hundredth of a degree north of the field, 0.6 nm.
    let r = runway(&[end(Some((43.01, -89.0)), Some(180.0)), end(Some((43.0, -89.0)), Some(0.0))], 3600.0, Some(150.0));
    let (drawn, left_out) = sketch(43.0, -89.0, &[r]);
    assert_eq!(left_out, 0);
    assert!((drawn[0].a[1] - 0.6).abs() < 1e-9 && drawn[0].a[0].abs() < 1e-12);
    assert!(drawn[0].b[0].abs() < 1e-12 && drawn[0].b[1].abs() < 1e-12);
    assert_eq!((drawn[0].width_ft, drawn[0].guessed), (150.0, false));
}

#[test]
fn an_unsurveyed_runway_is_guessed_along_its_first_ends_heading() {
    // 9/27, 6,000 ft: half of it, 0.4937 nm, each side of the field, west
    // to east, the 9 end where a landing on it starts.
    let r = runway(&[end(None, Some(90.0)), end(None, Some(270.0))], 6000.0, None);
    let (drawn, _) = sketch(43.0, -89.0, &[r]);
    let half = 6000.0 / FT_PER_NM / 2.0;
    assert!((drawn[0].a[0] + half).abs() < 1e-9 && (drawn[0].b[0] - half).abs() < 1e-9);
    assert!(drawn[0].a[1].abs() < 1e-9);
    // NASR gives it no width: the drawing's own.
    assert_eq!((drawn[0].width_ft, drawn[0].guessed), (DEFAULT_WIDTH_FT, true));
}

#[test]
fn none_is_guessed_beside_a_surveyed_one_nor_on_a_parallel() {
    let known = runway(&[end(Some((43.01, -89.0)), Some(180.0)), end(Some((43.0, -89.0)), Some(0.0))], 3600.0, None);
    let unknown = runway(&[end(None, Some(90.0)), end(None, Some(270.0))], 4000.0, None);
    let (drawn, left_out) = sketch(43.0, -89.0, &[known, unknown.clone()]);
    assert_eq!((drawn.len(), drawn[0].runway, left_out), (1, 0, 1));
    // 18L/36R and 18R/36L: one guess for the two, within a degree; 9/27 too.
    let left = runway(&[end(None, Some(180.0)), end(None, Some(0.0))], 4000.0, None);
    let right = runway(&[end(None, Some(180.5)), end(None, Some(0.5))], 4000.0, None);
    let (drawn, left_out) = sketch(43.0, -89.0, &[left, right, unknown]);
    assert_eq!(drawn.iter().map(|d| d.runway).collect::<Vec<_>>(), vec![0, 2]);
    assert_eq!(left_out, 1);
}

#[test]
fn a_helipad_or_a_runway_with_nothing_to_go_by_is_not_drawn() {
    let pad = Runway { ends: vec![end(None, None)], ..Runway::default() };
    let blind = runway(&[end(None, None), end(None, None)], 3000.0, None);
    let no_length = Runway { ends: vec![end(None, Some(90.0)), end(None, Some(270.0))], ..Runway::default() };
    let (drawn, left_out) = sketch(43.0, -89.0, &[pad, blind, no_length]);
    // The helipad has no two ends to count; the other two are left out.
    assert_eq!((drawn.len(), left_out), (0, 2));
}

#[test]
fn a_heading_a_degree_apart_is_another_line() {
    let a = runway(&[end(None, Some(180.0)), end(None, Some(0.0))], 4000.0, None);
    let b = runway(&[end(None, Some(181.0)), end(None, Some(1.0))], 4000.0, None);
    assert_eq!(sketch(43.0, -89.0, &[a, b]).0.len(), 2);
}
