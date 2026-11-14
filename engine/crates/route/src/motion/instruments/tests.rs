//! instruments.rs's tests: the route ahead, the fuel the plan leaves,
//! the vertical speed and the glide ring.

use super::*;

fn route() -> (Vec<(f64, f64)>, Vec<Point>) {
    // Due east along 45 N, then due north: two legs of about 42 and 30 nm.
    let line = vec![(45.0, -93.0), (45.0, -92.0), (45.5, -92.0)];
    let points = line.iter().enumerate().map(|(k, &(lat, lon))| Point { name: format!("P{k}"), lat, lon }).collect();
    (line, points)
}

#[test]
fn on_the_first_leg_the_next_is_its_end() {
    let (line, points) = route();
    let legs = [Leg { distance_nm: 42.4, fuel_gal: Some(4.0) }, Leg { distance_nm: 30.0, fuel_gal: Some(3.0) }];
    let fix = Fix { lat: 45.01, lon: -92.5, track_deg: Some(95.0), speed_kt: Some(120.0) };
    let i = in_flight(fix, &line, &points, &legs, &Tanks { start_gal: Some(40.0), ..Tanks::default() }, Some(1_793_620_000.0)).unwrap();
    assert!(i.on_route);
    let next = i.next.unwrap();
    assert_eq!(next.name, "P1");
    assert!((next.distance_nm - 21.2).abs() < 0.3, "{}", next.distance_nm);
    // 21 nm at 120 kt: about 10.6 minutes.
    assert!((next.ete_min.unwrap() - next.distance_nm / 2.0).abs() < 1e-9);
    // North of an eastbound line is its left.
    assert!(i.left_of_line && (i.off_nm - 0.6).abs() < 0.05, "{}", i.off_nm);
    // A track of 095 is right of the eastbound course.
    assert!(i.track_error_deg.unwrap() > 0.0);
    let dest = i.destination.unwrap();
    assert_eq!(dest.name, "P2");
    assert!((dest.distance_nm - (next.distance_nm + 30.0)).abs() < 0.2);
    // Half the first leg burnt.
    assert!((i.burnt_gal - 2.0).abs() < 0.05, "{}", i.burnt_gal);
    assert!((dest.fuel_left_gal.unwrap() - 33.0).abs() < 0.1);
    // Minnesota's variation is a degree or two east.
    assert!(i.variation_deg.unwrap() > -5.0 && i.variation_deg.unwrap() < 5.0);
}

#[test]
fn off_the_line_and_on_the_ground_it_is_not_on_route() {
    let (line, points) = route();
    let far = Fix { lat: 45.2, lon: -92.5, track_deg: Some(90.0), speed_kt: Some(120.0) };
    assert!(!in_flight(far, &line, &points, &[], &Tanks::default(), None).unwrap().on_route);
    let parked = Fix { lat: 45.0, lon: -93.0, track_deg: None, speed_kt: Some(0.0) };
    let i = in_flight(parked, &line, &points, &[], &Tanks::default(), None).unwrap();
    assert!(!i.on_route && i.next.unwrap().ete_min.is_none() && i.track_error_deg.is_none());
    assert!(in_flight(parked, &line[..1], &points, &[], &Tanks::default(), None).is_none());
}

#[test]
fn the_vertical_speed_is_the_slope_of_ten_seconds() {
    let climbing: Vec<(f64, f64)> = (0..12).map(|t| (t as f64, 3000.0 + 8.0 * t as f64)).collect();
    assert!((vertical_speed(&climbing).unwrap() - 480.0).abs() < 1e-9);
    assert!(vertical_speed(&climbing[..2]).is_none());
    assert!(vertical_speed(&[(0.0, 1.0), (0.5, 2.0), (1.0, 3.0)]).is_none());
}

#[test]
fn the_ring_is_over_the_higher_ground() {
    let (range, ground, ring) = glide_ring(45.0, -93.0, Some(5000.0), Some(100.0), Some(1200.0), Some(900.0), Some(9.0)).unwrap();
    assert_eq!(ground, 1200.0);
    assert!((range - 3.8 * 9000.0 / wingtip_core::units::FT_PER_NM).abs() < 1e-9, "the 172S's 9 to 1, its POH figure 3-1");
    assert_eq!(ring.len(), RING_POINTS + 1);
    assert_eq!(ring[0], ring[RING_POINTS]);
    assert!((distance_nm(45.0, -93.0, ring[10].0, ring[10].1) - range).abs() < 1e-6);
    assert!(glide_ring(45.0, -93.0, Some(5000.0), Some(10.0), Some(1200.0), None, Some(9.0)).is_none());
    assert!(glide_ring(45.0, -93.0, Some(5000.0), Some(100.0), Some(1200.0), Some(900.0), None).is_none(), "no ratio, no ring");
}
