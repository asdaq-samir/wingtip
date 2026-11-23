//! core::geo's tests.

use super::*;

#[test]
fn a_path_meets_a_polygon_by_crossing_or_inside() {
    let square = [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0)];
    assert!(path_meets_polygon(&[(0.5, -1.0), (0.5, 2.0)], &square));
    assert!(path_meets_polygon(&[(0.2, 0.2), (0.4, 0.4)], &square));
    assert!(!path_meets_polygon(&[(2.0, 2.0), (3.0, 3.0)], &square));
}

#[test]
fn a_velocity_is_a_track_toward_where_it_goes() {
    let close = |a: f64, b: f64| (a - b).abs() < 1e-9;
    let (t, s) = velocity_track(3.0, 4.0);
    assert!(close(s, 5.0) && close(t.unwrap(), 36.869_897_645_844_02));
    assert!(close(velocity_track(-10.0, 0.0).0.unwrap(), 270.0));
    assert!(close(velocity_track(0.0, -10.0).0.unwrap(), 180.0));
    assert!(close(velocity_track(0.0, 10.0).0.unwrap(), 0.0));
    assert_eq!(velocity_track(0.0, 0.0), (None, 0.0));
}

#[test]
fn a_ring_holds_by_the_even_odd_rule() {
    let square = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)];
    assert!(ring_holds(&square, 0.5, 0.5));
    assert!(!ring_holds(&square, 1.5, 0.5));
    // A bow tie crossing itself at (0.5, 0.5): each lobe holds, as
    // the even-odd rule reads it.
    let bow = [(0.0, 0.0), (1.0, 1.0), (1.0, 0.0), (0.0, 1.0)];
    assert!(ring_holds(&bow, 0.1, 0.5) && ring_holds(&bow, 0.9, 0.5) && !ring_holds(&bow, 0.5, 0.9));
    assert!(!ring_holds(&[], 0.0, 0.0) && !ring_holds(&[(0.0, 0.0), (1.0, 1.0)], 0.5, 0.5));
}

#[test]
fn track_is_signed() {
    // Each against pyproj 3.8.0's Geod(ellps="WGS84"): the foot found
    // as the root of its right-angle condition (scipy's brentq over
    // Geod.fwd and Geod.inv), an independent route to the same point.
    let close = |got: (f64, f64), want: (f64, f64)| (got.0 - want.0).abs() < 1e-9 && (got.1 - want.1).abs() < 1e-9;
    let on = track_nm(0.0, 0.5, (0.0, 0.0), (0.0, 1.0));
    assert!(close(on, (0.0, 30.053_858_205_530_23)), "{on:?}");
    let behind = track_nm(0.1, -0.5, (0.0, 0.0), (0.0, 1.0));
    assert!(close(behind, (-5.970_533_312_582_22, -30.053_858_205_527_43)), "{behind:?}");
    let beside = track_nm(44.0, -91.0, (46.8421, -92.1936), (38.7487, -90.37));
    assert!(close(beside, (-21.210_240_980_906_825, 176.585_340_569_693_07)), "{beside:?}");
    // Baselga and Martinez-Llario's example 1 (table 4): the foot they
    // give, 51 50' 45.9212" N 5 15' 37.5426" E, is 13.382445 nm from A
    // and 12.833544 nm from P by Geod.inv; to their 1e-4" (3 mm).
    let paper = track_nm(52.0, 5.5, (52.0, 5.0), (51.4, 6.0));
    assert!((paper.0 + 12.833_544).abs() < 2e-6 && (paper.1 - 13.382_445).abs() < 2e-6, "{paper:?}");
}

#[test]
fn distances_are_wgs84_geodesics() {
    // pyproj 3.8.0's Geod(ellps="WGS84").inv over 1,852 m, as
    // wingtip.geo.distance_nm: O'Hare to Midway, Duluth to St Louis.
    let ord_mdw = distance_nm(41.9786, -87.9048, 41.7868, -87.7522);
    assert!((ord_mdw - 13.382_524_218_830_271).abs() < 1e-9, "{ord_mdw}");
    let dlh_stl = distance_nm(46.8421, -92.1936, 38.7487, -90.37);
    assert!((dlh_stl - 492.066_809_632_600_6).abs() < 1e-9, "{dlh_stl}");
    assert_eq!(distance_nm(45.0, -93.0, 45.0, -93.0), 0.0);
}

#[test]
fn bearings_and_angles_are_wgs84_geodesics() {
    // pyproj 3.8.0's Geod(ellps="WGS84").inv's azimuth, O'Hare to
    // Midway, and Duluth to St Louis.
    let b = bearing_deg(41.9786, -87.9048, 41.7868, -87.7522);
    assert!((b - 149.214_896_390_586_74).abs() < 1e-9, "{b}");
    let b = bearing_deg(46.8421, -92.1936, 38.7487, -90.37);
    assert!((b - 169.949_158_273_416_23).abs() < 1e-9, "{b}");
    assert_eq!(bearing_deg(45.0, -93.0, 45.0, -93.0), 0.0);
    assert!((bearing_deg(42.0, -88.0, 43.0, -88.0) - 0.0).abs() < 1e-12);
    assert_eq!(angle_between(358.0, 2.0), 4.0);
    assert_eq!(angle_between(10.0, 190.0), 180.0);
    assert_eq!(py_mod(-1e-20, 360.0), 360.0);
    assert_eq!(py_mod(-30.0, 360.0), 330.0);
}

#[test]
fn destination_is_the_direct_geodesic() {
    // Due north 60 nm from 45 N: pyproj 3.8.0's Geod(ellps="WGS84").fwd,
    // short of a whole degree, as a degree of latitude there is 60.006
    // nm of the ellipsoid's meridian.
    let (lat, lon) = destination(45.0, -93.0, 0.0, 60.0);
    assert!((lat - 45.999_806_133_882_48).abs() < 1e-9 && (lon + 93.0).abs() < 1e-9, "{lat} {lon}");
    assert!((distance_nm(45.0, -93.0, lat, lon) - 60.0).abs() < 1e-9);
    // Across the antimeridian the longitude comes back within 180.
    let (_, lon) = destination(0.0, 179.9, 90.0, 60.0);
    assert!((-180.0..=180.0).contains(&lon) && lon < -179.0, "{lon}");
}

#[test]
fn the_geodesic_figures_by_name() {
    let ask = |name: &str, text: &str| call(name, &json::parse(text).unwrap());
    assert_eq!(ask("distance_nm", r#"{"lat1":45,"lon1":-93,"lat2":45,"lon2":-93}"#).unwrap(), "0.0");
    let b: f64 = ask("bearing_deg", r#"{"lat1":41.9786,"lon1":-87.9048,"lat2":41.7868,"lon2":-87.7522}"#).unwrap().parse().unwrap();
    assert!((b - 149.214_896_390_586_74).abs() < 1e-9, "{b}");
    let to = ask("destination", r#"{"points":[{"lat":45,"lon":-93,"bearing_deg":0,"nm":60}]}"#).unwrap();
    assert!(to.starts_with("[{\"lat\":45.99") && to.ends_with(",\"lon\":-93.0}]"), "{to}");
    assert_eq!(ask("destination", r#"{"points":[]}"#).unwrap(), "[]");
    assert!(ask("bearing_deg", "{}").is_err());
}

#[test]
fn a_box_around_a_point_is_a_route_of_one_point() {
    // 59.7 nm is a degree of latitude at its shortest (WGS-84's, at the
    // equator), so 59.7 nm is a degree north and south; east and west a
    // degree over the cosine of the box's poleward edge, 46 N.
    let (s, w, n, e) = box_around(45.0, -93.0, 59.7);
    let east = 1.0 / 46f64.to_radians().cos();
    assert!((s - 44.0).abs() < 1e-12 && (n - 46.0).abs() < 1e-12);
    assert!((w + 93.0 + east).abs() < 1e-12 && (e + 93.0 - east).abs() < 1e-12);
    assert_eq!(box_around(-30.0, 150.0, 25.0), corridor_bbox((-30.0, 150.0), (-30.0, 150.0), 25.0));
}

#[test]
fn the_nearest_is_the_one_a_scan_of_every_geodesic_finds() {
    // Points every 0.6 degree of latitude and 1 of longitude over the lower 48, some twice (a tie: the first).
    let mut points: Vec<(f64, f64)> = (0..40).flat_map(|i| (0..60).map(move |j| (25.0 + i as f64 * 0.6, -125.0 + j as f64))).collect();
    points.push(points[100]);
    for k in 0..200 {
        let (lat, lon) = (24.0 + (k as f64 * 0.137) % 26.0, -126.0 + (k as f64 * 0.311) % 62.0);
        let mut scan = (f64::INFINITY, 0usize);
        for (i, p) in points.iter().enumerate() {
            let d = distance_nm(lat, lon, p.0, p.1);
            if d < scan.0 {
                scan = (d, i);
            }
        }
        let exact = |a: f64, b: f64| distance_nm(lat, lon, a, b);
        assert_eq!(nearest(lat, lon, points.iter().copied(), exact), Some((scan.1, scan.0)), "at {lat}, {lon}");
        let sphere = sphere_nm(lat, lon, points[scan.1].0, points[scan.1].1);
        assert!((sphere - scan.0).abs() <= SPHERE_WITHIN * scan.0 + 1e-9);
    }
    assert_eq!(nearest(40.0, -90.0, std::iter::empty(), |_, _| 0.0), None);
}

#[test]
fn the_corridors_first_cut_never_lets_go_a_point_within_the_width() {
    // Short and long legs, east, north-east and north, low and high
    // latitudes, at the corridors' widths (the PIREPs' 30 nm, the TAFs'
    // reach, the look-ahead's swath): no point the exact cross-track keeps
    // is let go, and none let go is within the width of the leg's start.
    let legs =
        [((25.0, -100.0), (25.5, -99.0)), ((44.0, -104.0), (48.5, -92.0)), ((30.0, -90.0), (47.0, -90.0)), ((40.0, -80.0), (40.0, -79.9))];
    for (a, b) in legs {
        let course = bearing_deg(a.0, a.1, b.0, b.1);
        for width in [0.5, 5.0, 10.0, 30.0] {
            for i in 0..=40 {
                for j in 0..=40 {
                    let lat = a.0.min(b.0) - 1.0 + i as f64 * ((a.0 - b.0).abs() + 2.0) / 40.0;
                    let lon = a.1.min(b.1) - 1.0 + j as f64 * ((a.1 - b.1).abs() + 2.0) / 40.0;
                    if surely_off_nm(lat, lon, a, course, width) {
                        let (cross, _) = track_from(lat, lon, a, course);
                        assert!(cross.abs() > width, "{lat},{lon} off {a:?} let go at {cross} nm, width {width}");
                        assert!(distance_nm(a.0, a.1, lat, lon) > width);
                    }
                }
            }
        }
    }
}

#[test]
fn a_longitude_is_written_near_its_reference() {
    // Shemya (174.1 E) from Adak (176.6 W): the short way, west past -180.
    assert!((lon_near(174.1136, -176.646) - -185.8864).abs() < 1e-9);
    assert!((lon_near(-176.646, 174.1136) - 183.354).abs() < 1e-9);
    // Nothing to wrap: as it is.
    assert!((lon_near(-88.07, -92.19) - -88.07).abs() < 1e-9);
}

// Adak (PADK, 51.88 N 176.65 W) and Shemya (PASY, 52.71 N 174.11 E), the
// edge-places audit's S10: either side of 180, 378 nm apart the short way.
const ADAK: (f64, f64) = (51.878, -176.646);
const SHEMYA: (f64, f64) = (52.712, 174.114);

fn in_boxes(boxes: &[(f64, f64, f64, f64)], lat: f64, lon: f64) -> bool {
    boxes.iter().any(|&(s, w, n, e)| s <= lat && lat <= n && w <= lon && lon <= e)
}

fn boxes_around(lat: f64, lon: f64, nm: f64) -> Vec<(f64, f64, f64, f64)> {
    split_box(box_around(lat, lon, nm))
}

#[test]
fn a_box_across_the_antimeridian_is_its_two_halves() {
    let boxes = corridor_boxes(ADAK, SHEMYA, 10.0);
    assert_eq!(boxes.len(), 2, "{boxes:?}");
    let (east_half, west_half) = (boxes[0], boxes[1]);
    // Shemya's side, from about 174 E to 180; Adak's, from -180 to about 176 W.
    assert!(east_half.1 > 173.0 && east_half.1 < 174.114 && east_half.3 == 180.0, "{east_half:?}");
    assert!(west_half.1 == -180.0 && west_half.3 > -176.646 && west_half.3 < -176.0, "{west_half:?}");
    assert!(in_boxes(&boxes, SHEMYA.0, SHEMYA.1) && in_boxes(&boxes, ADAK.0, ADAK.1));
    // Not the long way round: the Midwest is in neither.
    assert!(!in_boxes(&boxes, 52.0, 0.0) && !in_boxes(&boxes, 52.0, -93.0));
    // Either way round, the same two boxes.
    let back = corridor_boxes(SHEMYA, ADAK, 10.0);
    assert!(in_boxes(&back, SHEMYA.0, SHEMYA.1) && in_boxes(&back, ADAK.0, ADAK.1) && !in_boxes(&back, 52.0, 0.0));
}

#[test]
fn a_point_near_the_antimeridian_reaches_across_it() {
    // 30 nm round Shemya is under a degree of longitude at 53 N, so not
    // across; 200 nm round it is some 6 degrees, past 180 to 179.9 W.
    assert_eq!(boxes_around(SHEMYA.0, SHEMYA.1, 30.0).len(), 1);
    let wide = boxes_around(SHEMYA.0, SHEMYA.1, 200.0);
    assert_eq!(wide.len(), 2, "{wide:?}");
    assert!(in_boxes(&wide, 52.5, -179.95) && in_boxes(&wide, 52.5, 179.5));
    let near_adak = boxes_around(ADAK.0, ADAK.1, 300.0);
    assert!(in_boxes(&near_adak, 52.0, 178.5), "{near_adak:?}");
}

#[test]
fn a_box_nowhere_near_180_is_the_one_it_always_was() {
    // KMSN to KOSH: one box, to the bit.
    let (msn, osh) = ((43.1399, -89.3375), (43.9844, -88.5570));
    assert_eq!(corridor_boxes(msn, osh, 10.0), vec![corridor_bbox(msn, osh, 10.0)]);
    assert_eq!(boxes_around(msn.0, msn.1, 25.0), vec![box_around(msn.0, msn.1, 25.0)]);
    assert_eq!(box_over(&[msn, osh, (43.5, -90.0)], 5.0), Some(corridor_bbox((43.1399, -90.0), (43.9844, -88.557), 5.0)));
    assert_eq!(box_over(&[], 5.0), None);
    // A track across 180 boxed the short way: past -180, then its halves.
    let track = box_over(&[ADAK, SHEMYA], 1.0).unwrap();
    assert!(track.1 < -185.886 && track.3 < -176.0);
    assert_eq!(split_box(track).len(), 2);
    assert_eq!(split_box((50.0, -200.0, 54.0, 170.0)), vec![(50.0, -180.0, 54.0, 180.0)]);
    assert_eq!(lon_near(-88.07, -92.19), -88.07);
}
